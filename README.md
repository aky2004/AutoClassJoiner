<div align="center">
  <img src="https://img.shields.io/badge/Puppeteer-40B5A4?style=for-the-badge&logo=puppeteer&logoColor=white" />
  <img src="https://img.shields.io/badge/Express.js-404D59?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Telegram_Bot-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" />
  <img src="https://img.shields.io/badge/Automation-FF6B6B?style=for-the-badge" />

  <h1>🤖 AutoClassJoiner Cloud</h1>
  <p><em>"Somewhere, a cron job is doing your job."</em></p>
</div>

<br />

> **⚠️ Disclaimer:** This project was built strictly for **educational and learning purposes**. It serves as a practical demonstration of how developers can utilize headless browser automation, web scraping, and cloud scheduling to solve repetitive, mundane problems. Please use responsibly and ensure compliance with your institution's acceptable use policies.

---

## 💡 The Motivation: Why Build This?

As developers, our core philosophy is simple: **If you do a task more than three times, automate it.**

Joining online classes requires logging in, navigating complex portals, bypassing pop-ups, checking schedules, and clicking join buttons at the exact right moment. This project was born from the desire to learn how to orchestrate a fully autonomous bot that handles this entire lifecycle without any human intervention.

It demonstrates advanced concepts like:
- **Headless Browser Orchestration** (Puppeteer)
- **Live UI Observation** (Streaming a remote browser via MJPEG)
- **Event-Driven Notifications** (Integrating with Telegram's API)
- **Cron Scheduling** (Running lifecycle scripts reliably on the cloud)

## ✨ Features

- **🧠 Fully Autonomous:** Automatically authenticates, checks the daily timetable, and joins ongoing/upcoming meetings.
- **👁️ Live Dashboard:** Features a stunning "Glassmorphism" dark-mode UI with a real-time MJPEG live stream of the headless browser's viewport.
- **📲 Telegram Alerts:** Get instant push notifications on your phone when a class is joined, when the bot crashes, or when a session ends.
- **🛡️ Crash Resilience:** Built-in mechanisms to detect browser crashes, session timeouts, and stale pages, capable of restarting itself gracefully.
- **☁️ Cloud Ready:** Designed out-of-the-box to be deployed on platforms like Render, Railway, or Heroku.

## 🛠️ Tech Stack

* **Core Engine:** Node.js, Puppeteer (Chromium)
* **Backend:** Express.js, node-cron
* **Frontend:** Vanilla HTML/CSS/JS (Zero dependencies, lightweight)
* **Integrations:** Telegram Bot API (via native `fetch`)

---

## ⚙️ How It Works (Under the Hood)

1. **The Scheduler:** A `node-cron` job runs every 2 minutes.
2. **The Evaluator:** Puppeteer spins up a headless Chrome instance, logs into the student portal, and parses the DOM to extract the day's timetable.
3. **The Execution:** If an `Ongoing` tag is detected, the bot intercepts the navigation, bypasses pop-ups, and clicks the join link.
4. **The Observer:** While active, the Express server continuously captures screenshots from Puppeteer, streaming them as an MJPEG feed to the web dashboard.
5. **The Reporter:** Upon any state change (Joined, Ended, Failed), the `TelegramNotifier` dispatches an HTTP payload to the Telegram API.

---

## 🚀 Quick Start (Local Setup)

Want to see the magic on your local machine? 

1. **Clone the repository & install dependencies:**
   ```bash
   git clone https://github.com/yourusername/AutoClassJoiner.git
   cd AutoClassJoiner
   npm install
   ```

2. **Configure Environment Variables:**
   Create a `.env` file in the root directory:
   ```env
   REG_NUMBER=your_registration_number
   PASSWORD=your_password
   TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
   TELEGRAM_CHAT_ID=your_telegram_chat_id
   PORT=3000
   ```

3. **Fire it up:**
   ```bash
   npm start
   ```

4. **View the Dashboard:** Open `http://localhost:3000` in your browser.


<div align="center">
  <p>Developed with ❤️ by <b>Aman Yadav</b></p>
  <p><i>Automating the boring stuff so you can focus on what matters.</i></p>
</div>
