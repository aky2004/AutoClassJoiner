/**
 * AutoClassJoiner - Cloud Bot (Puppeteer)
 * Headless browser automation for login, timetable scraping, and class joining.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const { execSync } = require('child_process');
const TelegramNotifier = require('./notify');

const LOGIN_URL = 'https://myclass.lpu.in';
const BASE_URL = 'https://lovelyprofessionaluniversity.codetantra.com';
const TIMETABLE_URL = `${BASE_URL}/secure/tla/m.jsp`;

class AutoClassBot {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.logs = [];
    this.lastCheck = null;
    this.lastJoined = null;
    this.timetable = [];
    this.status = 'idle';
    this.latestScreenshot = null;
    this.latestScreenshotUrl = null;
    this.activeClassEndTime = null;
    this.notifier = new TelegramNotifier();
  }

  getLaunchOptions() {
    const configuredPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    const candidatePaths = [
      configuredPath,
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome-stable'
    ].filter(Boolean);

    const executablePath = candidatePaths.find((p) => fs.existsSync(p));
    const isDocker = process.env.NODE_ENV === 'production';
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--ignore-certificate-errors'
    ];
    // Only use single-process mode inside Docker (breaks multi-tab locally)
    if (isDocker) {
      args.push('--single-process', '--no-zygote');
    }
    const launchOptions = {
      headless: 'new',
      ignoreHTTPSErrors: true,
      args,
      defaultViewport: { width: 1280, height: 720 }
    };

    if (executablePath) {
      launchOptions.executablePath = executablePath;
      this.log(`Launching headless browser with executable: ${executablePath}`);
    } else {
      this.log('No system browser path found. Falling back to Puppeteer managed Chrome.', 'warn');
    }

    return launchOptions;
  }

  installManagedChrome() {
    const cacheDir = process.env.PUPPETEER_CACHE_DIR || '/tmp/puppeteer';
    process.env.PUPPETEER_CACHE_DIR = cacheDir;

    this.log(`Installing Puppeteer managed Chrome at runtime (cache: ${cacheDir})...`, 'warn');
    execSync('npx puppeteer browsers install chrome@147.0.7727.116', {
      stdio: 'pipe',
      env: {
        ...process.env,
        PUPPETEER_CACHE_DIR: cacheDir
      }
    });
    this.log('Managed Chrome installation completed. Retrying browser launch.');
  }

  log(message, level = 'info') {
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const entry = { timestamp, level, message };
    this.logs.push(entry);
    // Keep only last 100 logs
    if (this.logs.length > 100) this.logs.shift();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);

    // Silently capture frame on every log activity
    if (this.page && !this.page.isClosed()) {
      this.page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 75 })
        .then(b64 => {
          this.latestScreenshot = b64;
          this.latestScreenshotUrl = this.page.url();
        })
        .catch(() => {}); // ignore concurrent screenshot errors
    }
  }

  async launchBrowser() {
    if (this.browser) {
      try {
        // Check if browser is still connected
        await this.browser.version();
        return;
      } catch {
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
      }
    }

    let launchOptions = this.getLaunchOptions();

    try {
      this.browser = await puppeteer.launch(launchOptions);
    } catch (error) {
      if (String(error.message || '').includes('Could not find Chrome')) {
        this.installManagedChrome();
        launchOptions = this.getLaunchOptions();
        this.browser = await puppeteer.launch(launchOptions);
      } else {
        throw error;
      }
    }

    this.page = await this.browser.newPage();

    // Set a realistic user agent
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    this.log('Browser launched successfully.');

    // Listen for new pages/tabs opened by the site (e.g. BBB redirect)
    this.browser.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        this.log('New browser tab detected — switching to it.', 'info');
        try {
          const newPage = await target.page();
          if (newPage) {
            this.page = newPage;
            await this.page.setUserAgent(
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            );
          }
        } catch (e) {
          this.log(`Could not switch to new tab: ${e.message}`, 'warn');
        }
      }
    });
  }

  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {
        this.log(`Error closing browser: ${e.message}`, 'warn');
      }
      this.browser = null;
      this.page = null;
      this.isLoggedIn = false;
    }
  }

  /**
   * Login to myclass.lpu.in
   */
  async login(regNumber, password) {
    if (!regNumber || !password) {
      this.log('No credentials provided.', 'error');
      return false;
    }

    try {
      await this.launchBrowser();
      this.status = 'logging_in';
      this.log(`Logging in as ${regNumber}...`);

      await this.page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for the login form
      await this.page.waitForSelector('input[aria-label="user name"], input[placeholder="Username"]', { timeout: 10000 });

      // Fill username
      const usernameSelector = await this.page.$('input[aria-label="user name"]') ||
                                await this.page.$('input[placeholder="Username"]') ||
                                await this.page.$('input[name="i"]');

      // Fill password
      const passwordSelector = await this.page.$('#pwd-field') ||
                                await this.page.$('input[aria-label="password"]') ||
                                await this.page.$('input[placeholder="Password"]') ||
                                await this.page.$('input[name="p"]');

      if (!usernameSelector || !passwordSelector) {
        this.log('Could not find login form fields.', 'error');
        this.status = 'error';
        return false;
      }

      // Clear and type credentials
      await usernameSelector.click({ clickCount: 3 });
      await usernameSelector.type(regNumber, { delay: 50 });

      await passwordSelector.click({ clickCount: 3 });
      await passwordSelector.type(password, { delay: 50 });

      // Click login button
      const loginBtn = await this.page.$('button[name="ghost-round full-width"]') ||
                        await this.page.$('button.ghost-round');

      if (!loginBtn) {
        // Try finding by text content
        const buttons = await this.page.$$('button');
        for (const btn of buttons) {
          const text = await this.page.evaluate(el => el.textContent.trim().toLowerCase(), btn);
          if (text === 'login') {
            await btn.click();
            break;
          }
        }
      } else {
        await loginBtn.click();
      }

      this.log('Login form submitted. Waiting for redirect...');

      // Wait for navigation (login redirect)
      await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});

      // Check if login was successful
      const currentUrl = this.page.url();

      if (currentUrl.includes('error=invalid') || currentUrl.includes('error=')) {
        this.log('Login failed — invalid credentials.', 'error');
        this.status = 'login_failed';
        this.isLoggedIn = false;
        this.notifier.loginFailed(regNumber);
        return false;
      }

      if (currentUrl.includes('codetantra.com') || currentUrl.includes('/secure/')) {
        this.log('Login successful!');
        this.status = 'logged_in';
        this.isLoggedIn = true;
        return true;
      }

      // Sometimes the page redirects through multiple pages
      await this.delay(3000);
      const finalUrl = this.page.url();

      if (finalUrl.includes('codetantra.com')) {
        this.log('Login successful (after redirect)!');
        this.status = 'logged_in';
        this.isLoggedIn = true;
        return true;
      }

      this.log(`Login status unclear. Current URL: ${finalUrl}`, 'warn');
      this.status = 'unknown';
      return false;

    } catch (error) {
      this.log(`Login error: ${error.message}`, 'error');
      this.status = 'error';
      return false;
    }
  }

  /**
   * Check the timetable and join any active class
   */
  async checkAndJoin(regNumber, password) {
    try {
      this.lastCheck = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      
      // Skip timetable check if we are currently in an active class
      if (this.status === 'joined' && this.activeClassEndTime) {
        const timeExpired = Date.now() >= this.activeClassEndTime;
        // isClassStillActive returns: true (active), false (ended), null (crash/unknown)
        // We only skip if it returns exactly true — both false and null resume monitoring
        const stillActive = await this.isClassStillActive();
        const pageEnded = stillActive !== true;

        if (timeExpired || pageEnded) {
          const reason = timeExpired ? 'scheduled time expired'
            : stillActive === false ? 'class ended on page'
            : 'browser crashed or unresponsive';
          this.log(`Class over (${reason}). Resuming monitoring.`);
          this.notifier.classEnded(this.lastJoined?.name || 'Unknown Class');
          this.status = 'idle';
          this.activeClassEndTime = null;
          // Reset browser state if it crashed
          if (stillActive === null) {
            this.isLoggedIn = false;
            this.browser = null;
            this.page = null;
          }
          // Don't return — fall through to check for new classes
        } else {
          this.log(`Currently in class "${this.lastJoined?.name || 'Live'}". Class still active on page.`);
          await this.takeScreenshot();
          return { joined: true, className: this.lastJoined?.name, skipped: true };
        }
      }

      this.status = 'checking';

      // Ensure we're logged in
      if (!this.isLoggedIn) {
        const loggedIn = await this.login(regNumber, password);
        if (!loggedIn) {
          this.log('Cannot check classes — not logged in.', 'error');
          return { joined: false, error: 'Login failed' };
        }
      }

      this.log('Navigating to timetable...');
      await this.page.goto(TIMETABLE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

      // Check if we got redirected to login (session expired)
      const currentUrl = this.page.url();
      if (currentUrl.includes('myclass.lpu.in') || currentUrl.includes('login')) {
        this.log('Session expired. Re-logging in...', 'warn');
        this.notifier.sessionExpired();
        this.isLoggedIn = false;
        const loggedIn = await this.login(regNumber, password);
        if (!loggedIn) return { joined: false, error: 'Re-login failed' };
        await this.page.goto(TIMETABLE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
      }

      // Wait for the calendar to render
      await this.delay(2000);

      // Try to switch to list view
      await this.switchToListView();
      await this.delay(1500);

      // Scrape classes
      const classes = await this.scrapeClasses();
      this.timetable = classes;

      if (classes.length === 0) {
        this.log('No classes found on the timetable.');
        this.status = 'no_classes';
        return { joined: false, classes: [] };
      }

      this.log(`Found ${classes.length} class(es).`);

      // Post-process classes to mathematically ensure 'ongoing' status using time strings
      const nowMs = Date.now();
      classes.forEach(c => {
        if (c.time && c.status !== 'ongoing') {
           const timeMatch = c.time.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|a\.m\.|p\.m\.)?)/ig);
           if (timeMatch && timeMatch.length >= 2) {
              const startTimestamp = this.parseSingleTime(timeMatch[0]);
              const endTimestamp = this.parseSingleTime(timeMatch[1]);
              if (startTimestamp && endTimestamp) {
                 // Active from 5 minutes before scheduled start time, up to the end time
                 if (nowMs >= (startTimestamp - 5 * 60000) && nowMs < endTimestamp) {
                    this.log(`Time-based verify: overriding ${c.name} as ongoing based on schedule (${c.time}).`);
                    c.status = 'ongoing';
                 }
              }
           }
        }
      });

      // Find ongoing class
      const ongoingClass = classes.find(c => c.status === 'ongoing');

      if (ongoingClass) {
        this.log(`🎓 Ongoing class found: "${ongoingClass.name}"`);

        // If meetingId wasn't found in the list view, try clicking to extract it
        if (!ongoingClass.meetingId) {
          this.log('meetingId missing — attempting to extract via click...');
          const classIndex = classes.indexOf(ongoingClass);
          const extractedId = await this.clickAndExtractMeetingId(classIndex);
          if (extractedId) {
            ongoingClass.meetingId = extractedId;
            // Page may have navigated — go back to timetable if needed
            if (!this.page.url().includes('m.jsp')) {
              await this.page.goto(TIMETABLE_URL, { waitUntil: 'networkidle2', timeout: 20000 });
            }
          }
        }

        if (!ongoingClass.meetingId) {
          this.log('Could not extract meetingId — cannot join class.', 'warn');
          this.status = 'error';
          return { joined: false, error: 'meetingId not found for ongoing class' };
        }

        this.log(`Joining "${ongoingClass.name}" with meetingId: ${ongoingClass.meetingId}`);
        const joinResult = await this.joinClass(ongoingClass);
        
        if (joinResult === 'TOO_EARLY') {
          this.log(`Teacher hasn't started "${ongoingClass.name}" yet. Waiting for next run (approx 2 mins).`);
          this.notifier.classTooEarly(ongoingClass.name);
          this.status = 'waiting';
          return { joined: false, status: 'too_early' };
        }

        if (joinResult === true) {
          this.lastJoined = {
            name: ongoingClass.name,
            time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
          };
          this.status = 'joined';

          // 🔔 Notify via Telegram
          this.notifier.classJoined(ongoingClass.name, ongoingClass.time);

          // Determine end time to pause checks
          this.activeClassEndTime = this.parseEndTime(ongoingClass.time);
          if (!this.activeClassEndTime) {
            this.activeClassEndTime = Date.now() + 60 * 60 * 1000;
          }

          return { joined: true, className: ongoingClass.name };
        } else {
          this.log('joinClass failed or class already ended.', 'warn');
          this.status = 'error';
          return { joined: false, error: 'Join attempt failed' };
        }
      } else {
        this.log('No ongoing class at the moment.');
        const upcoming = classes.find(c => c.status === 'upcoming');
        this.status = upcoming ? 'waiting' : 'no_active_class';
        return { joined: false, classes, nextClass: upcoming || null };
      }

      return { joined: false, classes };

    } catch (error) {
      this.log(`Check error: ${error.message}`, 'error');
      this.status = 'error';
      // If browser crashed, reset state
      if (error.message.includes('Target closed') || error.message.includes('Session closed')) {
        this.notifier.disconnected(error.message);
        this.isLoggedIn = false;
        this.browser = null;
        this.page = null;
      }
      return { joined: false, error: error.message };
    }
  }

  /**
   * Switch the FullCalendar to list view
   */
  async switchToListView() {
    try {
      const switched = await this.page.evaluate(() => {
        const btn = document.querySelector('.fc-listView-button') ||
                    document.querySelector('.fc-listWeek-button') ||
                    document.querySelector('button[title="list view"]');
        if (btn && !btn.classList.contains('fc-state-active') && !btn.classList.contains('fc-button-active')) {
          btn.click();
          return true;
        }
        return false;
      });

      if (switched) {
        this.log('Switched to list view.');
        await this.delay(1000);
      }
    } catch (e) {
      this.log(`Could not switch to list view: ${e.message}`, 'warn');
    }
  }

  /**
   * Scrape class data from the timetable page
   */
  async scrapeClasses() {
    try {
      return await this.page.evaluate(() => {
        const classes = [];

        // Helper: extract meetingId from any URL-like string
        const extractId = (str) => {
          if (!str) return '';
          const m = str.match(/[?&]m=([a-f0-9-]+)/i);
          return m ? m[1] : '';
        };

        // Method 1: List view rows
        const listItems = document.querySelectorAll('tr.fc-list-item, tr.fc-list-event');

        if (listItems.length > 0) {
          listItems.forEach(row => {
            const timeCell = row.querySelector('td.fc-list-item-time, td.fc-list-event-time');
            const titleCell = row.querySelector('td.fc-list-item-title, td.fc-list-event-title');
            const markerCell = row.querySelector('td.fc-list-item-marker, td.fc-list-event-dot-cell');

            if (!titleCell) return;

            const link = titleCell.querySelector('a');
            const time = timeCell ? timeCell.textContent.trim() : '';
            const name = link ? link.textContent.trim() : titleCell.textContent.trim();

            // Try all possible meetingId sources
            let meetingId = '';
            if (link) {
              meetingId = extractId(link.href) ||
                          extractId(link.getAttribute('onclick') || '') ||
                          link.getAttribute('data-meeting') || '';
            }
            // Also scan the whole row for any hidden href/onclick with meeting info
            if (!meetingId) {
              const anyLink = row.querySelector('[href*="mi.jsp"],[href*="jnr.jsp"],[onclick*="mi.jsp"],[onclick*="jnr.jsp"]');
              if (anyLink) {
                meetingId = extractId(anyLink.href || '') || extractId(anyLink.getAttribute('onclick') || '');
              }
            }
            // Data attributes on the row itself
            if (!meetingId) {
              meetingId = row.getAttribute('data-id') || row.getAttribute('data-event-id') || '';
            }

            // Determine status by marker color
            let status = 'unknown';
            const marker = markerCell
              ? (markerCell.querySelector('.fc-event-dot, .fc-list-event-dot') || markerCell.querySelector('span'))
              : null;

            if (marker) {
              const style = getComputedStyle(marker);
              const bgColor = style.backgroundColor || marker.style.backgroundColor || '';
              const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
              if (match) {
                const [, r, g, b] = match.map(Number);
                if (g > 100 && g > r * 1.5 && g > b * 1.5) status = 'ongoing';
                else if (Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && r > 80 && r < 200) status = 'ended';
                else status = 'upcoming';
              }
            }

            // Store the click-element reference via index for later clicking
            row._rowIndex = row.rowIndex;
            classes.push({ name, time, meetingId, status, _rowSelector: `tr.fc-list-item:nth-child(${classes.length + 1}), tr.fc-list-event:nth-child(${classes.length + 1})` });
          });
        }

        // Method 2: Any mi.jsp or jnr.jsp links anywhere on page
        document.querySelectorAll('a[href*="mi.jsp"], a[href*="jnr.jsp"]').forEach(link => {
          const meetingId = extractId(link.href);
          if (!meetingId) return;
          const existing = classes.find(c => c.meetingId === meetingId);
          if (!existing) {
            classes.push({
              name: link.textContent.trim() || 'Live Class',
              time: '',
              meetingId,
              status: link.href.includes('jnr.jsp') ? 'ongoing' : 'unknown'
            });
          } else if (link.href.includes('jnr.jsp')) {
            existing.status = 'ongoing';
          }
        });

        return classes;
      });
    } catch (e) {
      this.log(`scrapeClasses error: ${e.message}`, 'warn');
      return [];
    }
  }

  /**
   * Click a class event on the timetable to open its detail popup,
   * then extract the meetingId from "Join" or "mi.jsp" links inside it.
   */
  async clickAndExtractMeetingId(classIndex) {
    try {
      this.log(`Clicking class row to extract meetingId (index ${classIndex})...`);

      // Click the title cell of the target row
      const clicked = await this.page.evaluate((idx) => {
        const rows = Array.from(document.querySelectorAll('tr.fc-list-item, tr.fc-list-event'));
        if (!rows[idx]) return false;
        const titleCell = rows[idx].querySelector('td.fc-list-item-title a, td.fc-list-event-title a');
        if (titleCell) { titleCell.click(); return true; }
        rows[idx].click();
        return true;
      }, classIndex);

      if (!clicked) return null;

      // Wait for a popup/modal or navigation with meeting link
      await this.delay(2000);

      // Look for any join link in the now-visible popup or page
      const meetingId = await this.page.evaluate(() => {
        const extractId = (str) => {
          if (!str) return '';
          const m = str.match(/[?&]m=([a-f0-9-]+)/i);
          return m ? m[1] : '';
        };
        // Check popup overlays first
        const popupSelectors = [
          '.fc-popover a', '.modal a', '.popup a',
          '[class*="popover"] a', '[class*="modal"] a', '[class*="dialog"] a'
        ];
        for (const sel of popupSelectors) {
          for (const a of document.querySelectorAll(sel)) {
            const id = extractId(a.href);
            if (id) return id;
          }
        }
        // Fall back to any mi.jsp/jnr.jsp on the whole page
        for (const a of document.querySelectorAll('a[href*="mi.jsp"], a[href*="jnr.jsp"]')) {
          const id = extractId(a.href);
          if (id) return id;
        }
        return null;
      });

      if (meetingId) {
        this.log(`Extracted meetingId from click: ${meetingId}`);
        return meetingId;
      }

      // If a navigation happened, check the new URL
      const newUrl = this.page.url();
      const urlId = (newUrl.match(/[?&]m=([a-f0-9-]+)/i) || [])[1];
      if (urlId) {
        this.log(`Extracted meetingId from URL after click: ${urlId}`);
        return urlId;
      }

      return null;
    } catch (e) {
      this.log(`clickAndExtractMeetingId error: ${e.message}`, 'warn');
      return null;
    }
  }

  /**
   * Join a class by navigating to the join URL
   */
  async joinClass(classInfo) {
    try {
      const joinUrl = `${BASE_URL}/secure/tla/jnr.jsp?m=${classInfo.meetingId}`;
      this.log(`Navigating to join URL: ${joinUrl}`);

      // Set a longer timeout (60s) — especially for LPU redirects to BBB
      try {
        await this.page.goto(joinUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      } catch (e) {
        this.log(`Navigation reached timeout (60s), but proceeding to check for join status: ${e.message}`, 'warn');
      }
      await this.delay(5000); // Wait a bit longer for it to settle

      // After redirect, switch to the most recently active page/tab
      await this.recoverActivePage();

      // Check if join was successful
      let pageContentLower = '';
      try {
        const pageContent = await this.page.evaluate(() => document.body.innerText);
        pageContentLower = pageContent.toLowerCase();
      } catch (e) {
        this.log(`Could not read page content to check status: ${e.message}`, 'warn');
      }

      if (pageContentLower.includes('too late') || pageContentLower.includes('already ended')) {
        this.log('Class has already ended (Too late).', 'warn');
        return false;
      }

      if (pageContentLower.includes('too early') || pageContentLower.includes('not yet open') || pageContentLower.includes('cannot join meeting')) {
        this.log('Teacher hasn\'t started the meeting yet (Too early).');
        return 'TOO_EARLY';
      }

      // Select "Listen only" — retry up to 4 times with 3s gap
      // BBB may render the modal slowly or inside an iframe
      this.log('Looking for "Listen Only" audio button...');
      let listenOnlyClicked = false;

      for (let attempt = 1; attempt <= 4 && !listenOnlyClicked; attempt++) {
        this.log(`Listen Only check — attempt ${attempt}/4`);

        // Helper: try clicking in a given frame's document
        const tryClickInFrame = async (frame) => {
          try {
            return await frame.evaluate(() => {
              // All selectors BBB uses for the "Listen only" button
              const selectors = [
                'button[data-test="listenOnlyBtn"]',
                'button[aria-label="Listen only"]',
                'button[aria-label="listen only"]',
                'button[title="Listen only"]',
              ];
              for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) { el.click(); return `selector:${sel}`; }
              }
              // Broad text / aria-label scan
              const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
              const btn = btns.find(b => {
                const label = (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '').toLowerCase();
                return label.includes('listen only') || label.includes('listen-only');
              });
              if (btn) { btn.click(); return `text:${btn.textContent.trim().slice(0, 30)}`; }
              return null;
            });
          } catch { return null; }
        };

        // Try the main frame first
        const mainResult = await tryClickInFrame(this.page.mainFrame());
        if (mainResult) {
          this.log(`✅ Clicked "Listen Only" in main frame (${mainResult}).`);
          listenOnlyClicked = true;
          break;
        }

        // Try all child iframes (BBB loads inside an iframe)
        for (const frame of this.page.frames()) {
          try {
            if (frame === this.page.mainFrame()) continue;
            if (frame.isDetached && frame.isDetached()) continue;
            const frameResult = await tryClickInFrame(frame);
            if (frameResult) {
              this.log(`✅ Clicked "Listen Only" in iframe (${frameResult}).`);
              listenOnlyClicked = true;
              break;
            }
          } catch (err) {
            // safely ignore detached frame errors
          }
        }

        if (!listenOnlyClicked && attempt < 4) {
          this.log(`Listen Only button not found yet — waiting 3s before retry...`);
          await this.delay(3000);
        }
      }

      if (!listenOnlyClicked) {
        this.log('Audio prompt not detected after 4 attempts; assuming direct join or non-BBB meeting.', 'info');
      }

      await this.delay(1500);
      this.log(`✅ Successfully joined class: "${classInfo.name}"`);
      return true;

    } catch (error) {
      this.log(`Error joining class: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Recover the active page — if the current this.page is closed or detached,
   * find the latest open tab and switch to it.
   */
  async recoverActivePage() {
    try {
      if (!this.browser) return;
      const pages = await this.browser.pages();
      if (pages.length === 0) return;

      // Check if current page is still alive
      let currentAlive = false;
      if (this.page) {
        try {
          await this.page.title(); // simple check
          currentAlive = !this.page.isClosed();
        } catch {
          currentAlive = false;
        }
      }

      if (!currentAlive) {
        // Switch to the last (most recent) open page
        const newPage = pages[pages.length - 1];
        if (newPage && newPage !== this.page) {
          this.page = newPage;
          this.log(`Recovered active page: ${this.page.url()}`, 'info');
        }
      }
    } catch (e) {
      this.log(`recoverActivePage error: ${e.message}`, 'warn');
    }
  }

  /**
   * Check if the current class/meeting is still active on the browser page.
   * Returns true if active, false if ended, null if unable to determine.
   *
   * Checks: BBB "meeting ended" messages, page URL no longer pointing to
   * a meeting, browser page closed/crashed, and common end-of-class indicators.
   */
  async isClassStillActive() {
    try {
      // No browser or page → class can't be active
      if (!this.browser || !this.page) return false;

      // Recover the latest active tab
      await this.recoverActivePage();

      // Page closed or crashed
      if (this.page.isClosed()) {
        this.log('Page is closed — class no longer active.', 'info');
        return false;
      }

      // Check the URL — if we're back on codetantra timetable or login, class ended
      const url = this.page.url();
      if (url.includes('m.jsp') || url.includes('myclass.lpu.in') || url === 'about:blank') {
        this.log(`Page URL (${url}) indicates class is no longer active.`, 'info');
        return false;
      }

      // Read the page body text and look for end-of-class signals
      let bodyText = '';
      try {
        // Check main frame first
        bodyText = await this.page.evaluate(() => document.body?.innerText || '');
      } catch {
        // Page may have navigated or crashed
        this.log('Could not read page content — assuming class ended.', 'warn');
        return false;
      }

      const lower = bodyText.toLowerCase();

      // BBB / meeting end indicators
      const endSignals = [
        'the meeting has ended',
        'this meeting has ended',
        'meeting has been ended',
        'you have been logged out',
        'session has ended',
        'conference has ended',
        'you left the meeting',
        'disconnected from the meeting',
        'the session is over',
        'meeting was ended',
        'this conference was ended',
        'too late',
        'already ended',
      ];

      for (const signal of endSignals) {
        if (lower.includes(signal)) {
          this.log(`End signal detected on page: "${signal}"`, 'info');
          return false;
        }
      }

      // Also check iframes (BBB often renders inside an iframe)
      for (const frame of this.page.frames()) {
        try {
          if (frame === this.page.mainFrame()) continue;
          if (frame.isDetached && frame.isDetached()) continue;
          const frameText = await frame.evaluate(() => document.body?.innerText || '');
          const frameLower = frameText.toLowerCase();
          for (const signal of endSignals) {
            if (frameLower.includes(signal)) {
              this.log(`End signal detected in iframe: "${signal}"`, 'info');
              return false;
            }
          }
        } catch {
          // Ignore detached frame errors
        }
      }

      // No end signals found — class appears to still be active
      return true;

    } catch (e) {
      this.log(`isClassStillActive error: ${e.message}`, 'warn');
      // On error, return null (unable to determine)
      return null;
    }
  }

  /**
   * Take a screenshot of the current page
   */
  async takeScreenshot() {
    // Try to recover active page first
    await this.recoverActivePage();

    // If the browser is open, fetch a fresh one
    if (this.page && !this.page.isClosed()) {
      try {
        const b64 = await this.page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 80 });
        this.latestScreenshot = b64;
        this.latestScreenshotUrl = this.page.url();
      } catch (e) {
        // ignore fast navigation errors
      }
    }
    return this.latestScreenshot;
  }

  /**
   * Get the current page URL
   */
  getCurrentUrl() {
    try {
      if (this.page && !this.page.isClosed()) {
        this.latestScreenshotUrl = this.page.url();
      }
    } catch {}
    return this.latestScreenshotUrl;
  }

  /**
   * Get current status for the dashboard
   */
  getStatus() {
    return {
      status: this.status,
      isLoggedIn: this.isLoggedIn,
      lastCheck: this.lastCheck,
      lastJoined: this.lastJoined,
      timetable: this.timetable,
      logs: this.logs.slice(-30),  // Last 30 logs
      uptime: process.uptime(),
      currentUrl: this.getCurrentUrl(),
      screenshotAvailable: !!(this.latestScreenshot)
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Force leave the current meeting (if any), hard-close the browser (logout),
   * reset all state, then start completely fresh — login + check + join.
   *
   * Called by the "Force Check Now" button on the dashboard.
   * Handles the case where the bot believes it is in a class but the user
   * has actually been disconnected from BigBlueButton.
   */
  async forceLeaveAndRejoin(regNumber, password) {
    this.log('🔄 Force reset: leaving meeting and restarting from scratch.', 'warn');

    // Step 1 — If currently in a meeting, navigate away to leave it
    if (this.page && !this.page.isClosed()) {
      try {
        this.log('Navigating away from current page to leave meeting...');
        await this.page.goto('about:blank', { timeout: 6000 }).catch(() => {});
        await this.delay(800);
      } catch (e) {
        this.log(`Could not navigate away cleanly: ${e.message}`, 'warn');
      }
    }

    // Step 2 — Close the browser entirely (equivalent to full logout)
    this.log('Closing browser (full logout)...');
    await this.closeBrowser();

    // Step 3 — Reset all runtime state
    this.status = 'idle';
    this.isLoggedIn = false;
    this.activeClassEndTime = null;
    this.lastJoined = null;
    this.timetable = [];
    this.latestScreenshot = null;
    this.latestScreenshotUrl = null;

    // Notify via Telegram
    this.notifier.disconnected('Force reset by user via dashboard');

    // Step 4 — Brief pause, then start fresh
    await this.delay(2000);
    this.log('Starting fresh — logging in and checking for classes...');
    return await this.checkAndJoin(regNumber, password);
  }

  /**
   * Parse a single time string like "09:00 PM" into an absolute Unix timestamp (ms)
   * relative to today's schedule in IST.
   */
  parseSingleTime(timeStr) {
    if (!timeStr) return null;
    try {
      const match = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM|a\.m\.|p\.m\.)?/i);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const ampm = match[3] ? match[3].toUpperCase().replace(/\./g, '') : null;
        
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        if (!ampm && hours < 8) hours += 12; // Infer PM for small hours if AM/PM missing

        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric', day: 'numeric'
        });
        const [month, day, year] = formatter.format(now).split('/');
        
        // Convert to absolute UTC ms. IST is UTC+05:30.
        const targetUtc = Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), hours, minutes, 0);
        return targetUtc - (330 * 60000);
      }
    } catch(e) {}
    return null;
  }

  /**
   * Parse the end time of a class to know when to resume checking
   */
  parseEndTime(timeStr) {
    if (!timeStr) return null;
    try {
      const parts = timeStr.split(/[-]|to/i).map(s => s.trim());
      if (parts.length >= 2) {
        const endTime = this.parseSingleTime(parts[1]);
        if (endTime) return endTime;
      }
    } catch (e) {}
    return null;
  }
}

module.exports = AutoClassBot;