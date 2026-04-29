/**
 * AutoClassJoiner - Cloud Server
 * Express server + Cron scheduler for Render deployment.
 */

const express = require('express');
const cron = require('node-cron');
const path = require('path');
const AutoClassBot = require('./bot');
const TelegramNotifier = require('./notify');
dotenv = require('dotenv');
dotenv.config();

console.log('Environment Variables:', {
  REG_NUMBER: process.env.REG_NUMBER ? '****' : null,
  PASSWORD: process.env.PASSWORD ? '****' : null,
  PORT: process.env.PORT || '3000',
  RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL || null,
});

const app = express();
const bot = new AutoClassBot();
const PORT = process.env.PORT || 3000; // Debug: log all env vars on startup

// Credentials from environment variables (or set via dashboard)
let credentials = {
  regNumber: process.env.REG_NUMBER,
  password: process.env.PASSWORD,
};

let cronJob = null;
let botEnabled = true;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== API Routes ==========

// Dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get bot status
app.get('/api/status', (req, res) => {
  const status = bot.getStatus();
  res.json({
    ...status,
    botEnabled,
    hasCredentials: !!(credentials.regNumber && credentials.password),
    regNumber: credentials.regNumber,
    cronRunning: cronJob !== null,
    telegramEnabled: bot.notifier.enabled,
    telegramHistory: bot.notifier.history,
  });
});

// Update credentials
app.post('/api/credentials', (req, res) => {
  const { regNumber, password } = req.body;

  if (!regNumber || !password) {
    return res.status(400).json({ error: 'Both registration number and password are required.' });
  }

  credentials.regNumber = regNumber;
  credentials.password = password;

  bot.log(`Credentials updated for ${regNumber.substring(0, 4)}****`);

  // Restart cron if enabled
  if (botEnabled) {
    startCronJob();
  }

  res.json({ success: true, message: 'Credentials saved.' });
});

// Toggle bot on/off
app.post('/api/toggle', (req, res) => {
  botEnabled = !botEnabled;

  if (botEnabled) {
    startCronJob();
    bot.log('Bot ENABLED.');
  } else {
    stopCronJob();
    bot.log('Bot DISABLED.');
  }

  res.json({ success: true, enabled: botEnabled });
});

// Manually trigger a check
app.post('/api/trigger', async (req, res) => {
  if (!credentials.regNumber || !credentials.password) {
    return res.status(400).json({ error: 'No credentials set.' });
  }

  bot.log('Manual check triggered from dashboard.');
  const result = await bot.checkAndJoin(credentials.regNumber, credentials.password);
  res.json(result);
});

// Get timetable
app.get('/api/schedule', (req, res) => {
  res.json({ timetable: bot.timetable });
});

// Get latest screenshot (base64 JSON — used as fallback)
app.get('/api/screenshot', async (req, res) => {
  const screenshot = await bot.takeScreenshot();
  if (screenshot) {
    res.json({ image: screenshot, url: bot.getCurrentUrl() });
  } else {
    res.json({ image: null, url: null, message: 'No browser session active' });
  }
});

// ── Telegram Notification Routes ────────────────────────────────────────────

// Get Telegram config status
app.get('/api/telegram/status', (req, res) => {
  res.json({
    enabled: bot.notifier.enabled,
    hasToken: !!bot.notifier.botToken,
    hasChatId: !!bot.notifier.chatId,
  });
});

// Configure Telegram tokens
app.post('/api/telegram/configure', (req, res) => {
  const { botToken, chatId } = req.body;
  if (!botToken || !chatId) {
    return res.status(400).json({ error: 'Both botToken and chatId are required.' });
  }
  bot.notifier.configure(botToken, chatId);
  bot.log(`Telegram notifications configured (chat: ${chatId}).`);
  res.json({ success: true, enabled: bot.notifier.enabled });
});

// Send a test notification
app.post('/api/telegram/test', async (req, res) => {
  if (!bot.notifier.enabled) {
    return res.status(400).json({ error: 'Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.' });
  }
  const success = await bot.notifier.test();
  res.json({ success, message: success ? 'Test notification sent!' : 'Failed to send. Check token/chatId.' });
});

// ── MJPEG Live Stream ──────────────────────────────────────────────────────
// Streams Puppeteer screenshots as a continuous MJPEG feed (~1.5 fps).
// The browser uses a plain <img src="/api/stream"> — no JS, no WebSocket.
const STREAM_FPS_MS = 1000; // ms between frames (~1.0 fps) for stability
const activeStreamClients = new Set();

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=mjpegframe',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Connection': 'keep-alive',
    'Transfer-Encoding': 'chunked',
    'X-Accel-Buffering': 'no', // Disable Nginx/proxy buffering
  });

  let alive = true;
  activeStreamClients.add(res);
  bot.log(`MJPEG stream client connected (${activeStreamClients.size} active).`, 'info');

  // Write a placeholder frame immediately so the browser shows something
  const writePlaceholder = () => {
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">` +
      `<rect width="1280" height="720" fill="#1a1a1a"/>` +
      `<text x="50%" y="50%" fill="#555" font-family="monospace" font-size="22" ` +
      `text-anchor="middle" dominant-baseline="middle">No browser session active</text></svg>`
    );
    writeFrame(svg, 'image/svg+xml');
  };

  const writeFrame = (buffer, mime = 'image/jpeg') => {
    if (!alive || res.destroyed) return false;
    try {
      // Use standard MJPEG frame structure with trailing newlines
      res.write(`--mjpegframe\r\nContent-Type: ${mime}\r\nContent-Length: ${buffer.length}\r\n\r\n`);
      res.write(buffer);
      res.write('\r\n\r\n');
      return true;
    } catch {
      return false;
    }
  };

  writePlaceholder();

  const streamLoop = async () => {
    while (alive && !res.destroyed) {
      try {
        if (bot.page && !bot.page.isClosed()) {
          const buf = await bot.page.screenshot({ type: 'jpeg', quality: 60 });
          if (!writeFrame(buf)) break;
        } else {
          writePlaceholder();
        }
      } catch {
        writePlaceholder();
      }
      // Wait for next frame
      await new Promise(r => setTimeout(r, STREAM_FPS_MS));
    }
    cleanup();
  };

  const cleanup = () => {
    alive = false;
    activeStreamClients.delete(res);
    try { res.end(); } catch {}
    bot.log(`MJPEG stream client disconnected (${activeStreamClients.size} remaining).`, 'info');
  };

  req.on('close', () => { alive = false; });
  req.on('error', () => { alive = false; });

  streamLoop();
});

// How many clients are currently streaming
app.get('/api/stream/status', (req, res) => {
  res.json({ clients: activeStreamClients.size });
});

// Health check for Render / Monitor services
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/ping', (req, res) => {
  res.json({ status: 'active', message: 'pong' });
});

// ========== Cron Scheduler ==========

function startCronJob() {
  stopCronJob();

  if (!credentials.regNumber || !credentials.password) {
    bot.log('Cannot start cron — no credentials set.', 'warn');
    return;
  }

  // Run every 2 minutes only on Tue, Thu, Sat between 6 PM and 11 PM
  cronJob = cron.schedule('*/2 18-22 * * 2,4,6', async () => {
    bot.log('⏰ Scheduled check triggered.');
    await bot.checkAndJoin(credentials.regNumber, credentials.password);
  }, {
    timezone: 'Asia/Kolkata'
  });

  bot.log('Cron job started — checking every 2 min on Tue, Thu, Sat (6 PM - 11 PM).');
}

function stopCronJob() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    bot.log('Cron job stopped.');
  }
}

// ========== Self-Ping (Keep Alive on Render Free Tier) ==========

function startSelfPing() {
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL;

  if (RENDER_URL) {
    setInterval(async () => {
      try {
        const url = RENDER_URL.startsWith('http') ? RENDER_URL : `https://${RENDER_URL}`;
        await fetch(`${url}/health`);
      } catch {}
    }, 14 * 60 * 1000); // Every 14 minutes

    bot.log('Self-ping enabled to prevent Render spin-down.');
  } else {
    bot.log('Running locally — self-ping not needed.', 'info');
  }
}

// ========== Start Server ==========

app.listen(PORT, () => {
  console.log(`\n🚀 AutoClassJoiner Cloud Bot running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}\n`);

  bot.log(`Server started on port ${PORT}`);

  // Start cron if credentials are available
  if (credentials.regNumber && credentials.password) {
    startCronJob();
  } else {
    bot.log('No credentials in env vars. Set them via the dashboard or env: REG_NUMBER, PASSWORD');
  }

  // Send Telegram startup notification
  bot.notifier.botStarted();

  // Start self-ping for Render
  startSelfPing();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  bot.log('Shutting down...');
  stopCronJob();
  await bot.closeBrowser();
  process.exit(0);
});

process.on('SIGINT', async () => {
  bot.log('Shutting down (SIGINT)...');
  stopCronJob();
  await bot.closeBrowser();
  process.exit(0);
});