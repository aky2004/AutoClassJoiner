// /**
//  * Telegram Notification Service for AutoClassJoiner
//  * 
//  * Uses the Telegram Bot API (via native fetch — no extra dependencies).
//  * 
//  * Setup:
//  *   1. Message @BotFather on Telegram → /newbot → copy the token
//  *   2. Message your new bot, then visit:
//  *      https://api.telegram.org/bot<TOKEN>/getUpdates
//  *      to find your chat_id
//  *   3. Add to .env:
//  *      TELEGRAM_BOT_TOKEN=your_token_here
//  *      TELEGRAM_CHAT_ID=your_chat_id_here
//  */

// class TelegramNotifier {
//   constructor() {
//     this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
//     this.chatId = process.env.TELEGRAM_CHAT_ID || '';
//     this.enabled = !!(this.botToken && this.chatId);
//     this.lastNotification = {};  // Debounce: { eventKey: timestamp }
//     this.DEBOUNCE_MS = 60_000;   // Don't repeat same notification within 1 minute
//     this.history = [];           // Keep track of sent messages
//   }

//   /**
//    * Reload config (e.g. after user sets tokens via dashboard)
//    */
//   configure(botToken, chatId) {
//     this.botToken = botToken || this.botToken;
//     this.chatId = chatId || this.chatId;
//     this.enabled = !!(this.botToken && this.chatId);
//   }

//   /**
//    * Check if the same event was sent recently (debounce)
//    */
//   _isDuplicate(eventKey) {
//     const now = Date.now();
//     if (this.lastNotification[eventKey] && (now - this.lastNotification[eventKey]) < this.DEBOUNCE_MS) {
//       return true;
//     }
//     this.lastNotification[eventKey] = now;
//     return false;
//   }

//   /**
//    * Send a raw message via Telegram Bot API
//    */
//   async send(text) {
//     if (!this.enabled) return false;

//     try {
//       const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
//       const res = await fetch(url, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           chat_id: this.chatId,
//           text,
//           parse_mode: 'HTML',
//           disable_web_page_preview: true,
//         }),
//       });

//       if (!res.ok) {
//         const err = await res.text();
//         console.error(`[Telegram] Send failed: ${res.status} — ${err}`);
//         return false;
//       }

//       const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
//       // Strip HTML tags for frontend display
//       const plainText = text.replace(/<[^>]*>?/gm, '');
//       this.history.unshift({ time: ist, message: plainText });
//       if (this.history.length > 10) this.history.pop();

//       return true;
//     } catch (err) {
//       console.error(`[Telegram] Network error: ${err.message}`);
//       return false;
//     }
//   }

//   // ───────── Event-specific notifications ─────────

//   /**
//    * 🎓 Class joined successfully
//    */
//   async classJoined(className, time) {
//     const key = `joined:${className}`;
//     if (this._isDuplicate(key)) return;

//     const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
//     await this.send(
//       `✅ <b>Class Joined</b>\n\n` +
//       `📚 <b>${className}</b>\n` +
//       `🕐 ${time || 'N/A'}\n` +
//       `⏱ Joined at: ${ist}\n\n` +
//       `<i>AutoClassJoiner is attending for you.</i>`
//     );
//   }

//   /**
//    * 🔌 Bot disconnected / browser crashed
//    */
//   async disconnected(reason) {
//     const key = 'disconnected';
//     if (this._isDuplicate(key)) return;

//     const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
//     await this.send(
//       `🔴 <b>Bot Disconnected</b>\n\n` +
//       `⚠️ Reason: ${reason || 'Unknown'}\n` +
//       `🕐 ${ist}\n\n` +
//       `<i>The bot will attempt to reconnect automatically.</i>`
//     );
//   }

//   /**
//    * 🏁 Class ended / scheduled time over
//    */
//   async classEnded(className) {
//     const key = `ended:${className}`;
//     if (this._isDuplicate(key)) return;

//     const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
//     await this.send(
//       `🏁 <b>Class Ended</b>\n\n` +
//       `📚 <b>${className}</b>\n` +
//       `🕐 ${ist}\n\n` +
//       `<i>Resuming monitoring for next class.</i>`
//     );
//   }

//   /**
//    * ❌ Login failed
//    */
//   async loginFailed(regNumber) {
//     const key = 'login_failed';
//     if (this._isDuplicate(key)) return;

//     const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
//     await this.send(
//       `❌ <b>Login Failed</b>\n\n` +
//       `👤 Reg: ${regNumber || 'N/A'}\n` +
//       `🕐 ${ist}\n\n` +
//       `<i>Please check your credentials.</i>`
//     );
//   }

//   /**
//    * ⏳ Class found but too early (teacher hasn't started)
//    */
//   async classTooEarly(className) {
//     const key = `early:${className}`;
//     if (this._isDuplicate(key)) return;

//     const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
//     await this.send(
//       `⏳ <b>Class Not Started Yet</b>\n\n` +
//       `📚 <b>${className}</b>\n` +
//       `🕐 ${ist}\n\n` +
//       `<i>Teacher hasn't started the meeting. Will retry in ~2 min.</i>`
//     );
//   }

//   /**
//    * 🚀 Bot started
//    */
//   async botStarted() {
//     const key = 'started';
//     if (this._isDuplicate(key)) return;

//     const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
//     await this.send(
//       `🚀 <b>AutoClassJoiner Online</b>\n\n` +
//       `🕐 ${ist}\n` +
//       `⚙️ Cron: every 2 min\n\n` +
//       `<i>Monitoring your classes.</i>`
//     );
//   }

//   /**
//    * 🔄 Session expired and re-login happened
//    */
//   async sessionExpired() {
//     const key = 'session_expired';
//     if (this._isDuplicate(key)) return;

//     const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
//     await this.send(
//       `🔄 <b>Session Expired</b>\n\n` +
//       `🕐 ${ist}\n\n` +
//       `<i>Re-logging in automatically...</i>`
//     );
//   }

//   /**
//    * Test notification to verify setup
//    */
//   async test() {
//     const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
//     return await this.send(
//       `🔔 <b>Test Notification</b>\n\n` +
//       `Your Telegram notifications are working!\n` +
//       `🕐 ${ist}\n\n` +
//       `<i>AutoClassJoiner</i>`
//     );
//   }
// }

// module.exports = TelegramNotifier;



/**
 * Telegram Notification Service — AutoClassJoiner
 *
 * Setup:
 *   1. @BotFather → /newbot → copy token
 *   2. Message your bot, then:
 *      https://api.telegram.org/bot<TOKEN>/getUpdates  →  grab chat_id
 *   3. .env:
 *      TELEGRAM_BOT_TOKEN=...
 *      TELEGRAM_CHAT_ID=...
 */

class TelegramNotifier {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId   = process.env.TELEGRAM_CHAT_ID   || '';
    this.enabled  = !!(this.botToken && this.chatId);
    this.lastNotification = {};
    this.DEBOUNCE_MS      = 60_000;
    this.history          = [];
  }

  configure(botToken, chatId) {
    this.botToken = botToken || this.botToken;
    this.chatId   = chatId   || this.chatId;
    this.enabled  = !!(this.botToken && this.chatId);
  }

  _isDuplicate(key) {
    const now = Date.now();
    if (this.lastNotification[key] && (now - this.lastNotification[key]) < this.DEBOUNCE_MS) return true;
    this.lastNotification[key] = now;
    return false;
  }

  _ist() {
    return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  }

  async send(text) {
    if (!this.enabled) return false;
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id:                  this.chatId,
          text,
          parse_mode:               'HTML',
          disable_web_page_preview: true,
        }),
      });

      if (!res.ok) {
        console.error(`[Telegram] ${res.status} — ${await res.text()}`);
        return false;
      }

      const plain = text.replace(/<[^>]*>?/gm, '');
      this.history.unshift({ time: this._ist(), message: plain });
      if (this.history.length > 10) this.history.pop();
      return true;
    } catch (err) {
      console.error(`[Telegram] ${err.message}`);
      return false;
    }
  }

  // ── events ──────────────────────────────────────────

  async botStarted() {
    if (this._isDuplicate('started')) return;
    await this.send(
      `<b>online</b> · ${this._ist()}\n` +
      `<code>cron: every 2 min</code>`
    );
  }

  async classJoined(className, time) {
    if (this._isDuplicate(`joined:${className}`)) return;
    await this.send(
      `<b>joined</b> · ${className}\n` +
      `<code>${time || 'N/A'} → ${this._ist()}</code>`
    );
  }

  async classEnded(className) {
    if (this._isDuplicate(`ended:${className}`)) return;
    await this.send(
      `<b>ended</b> · ${className}\n` +
      `<code>${this._ist()}</code>`
    );
  }

  async classTooEarly(className) {
    if (this._isDuplicate(`early:${className}`)) return;
    await this.send(
      `<b>not started</b> · ${className}\n` +
      `<code>retrying in ~2 min</code>`
    );
  }

  async sessionExpired() {
    if (this._isDuplicate('session_expired')) return;
    await this.send(
      `<b>session expired</b> · ${this._ist()}\n` +
      `<code>re-login triggered</code>`
    );
  }

  async loginFailed(regNumber) {
    if (this._isDuplicate('login_failed')) return;
    await this.send(
      `<b>login failed</b> · ${regNumber || 'N/A'}\n` +
      `<code>${this._ist()} · check credentials</code>`
    );
  }

  async disconnected(reason) {
    if (this._isDuplicate('disconnected')) return;
    await this.send(
      `<b>disconnected</b> · ${reason || 'unknown'}\n` +
      `<code>${this._ist()} · reconnecting</code>`
    );
  }

  async test() {
    return await this.send(
      `<b>test</b> · notifications working\n` +
      `<code>${this._ist()}</code>`
    );
  }
}

module.exports = TelegramNotifier;