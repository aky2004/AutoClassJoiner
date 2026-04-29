<div align="center">

```
                                                                  █████╗ ██╗   ██╗████████╗ ██████╗      
                                                                 ██╔══██╗██║   ██║╚══██╔══╝██╔═══██╗     
                                                                 ███████║██║   ██║   ██║   ██║   ██║     
                                                                 ██╔══██║██║   ██║   ██║   ██║   ██║     
                                                                 ██║  ██║╚██████╔╝   ██║   ╚██████╔╝     
                                                                 ╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝      
                                                                           CLASS JOINER
```

![Node](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![Puppeteer](https://img.shields.io/badge/Puppeteer-40B5A4?style=flat-square&logo=puppeteer&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-000000?style=flat-square&logo=express&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram_Bot-2CA5E0?style=flat-square&logo=telegram&logoColor=white)
![Render](https://img.shields.io/badge/Render-46E3B7?style=flat-square&logo=render&logoColor=white)

**Headless browser automation that joins your online classes so you don't have to.**

</div>

---

> **Disclaimer:** This project was built strictly for educational and learning purposes. It demonstrates headless browser automation, web scraping, and cloud scheduling. Please use responsibly and ensure compliance with your institution's acceptable use policies.

---

## Overview

AutoClassJoiner is a fully autonomous bot that handles the entire class-joining lifecycle — logging in, parsing the timetable, detecting ongoing sessions, and clicking join — without any human intervention. A live dashboard streams the headless browser viewport in real time, and Telegram notifications keep you informed of every state change.

---

## Features

| Feature | Description |
|---|---|
| Fully Autonomous | Authenticates, checks daily timetable, and joins ongoing or upcoming meetings automatically |
| Live Dashboard | Glassmorphism dark-mode UI with real-time MJPEG stream of the browser viewport |
| Telegram Alerts | Instant push notifications on class join, crash, or session end |
| Crash Resilient | Detects browser crashes, session timeouts, and stale pages — restarts gracefully |
| Cloud Ready | Designed for deployment on Render, Railway, or any Node-compatible cloud platform |

---

## Tech Stack

- **Core Engine** — Node.js, Puppeteer (Chromium)
- **Backend** — Express.js, node-cron
- **Frontend** — Vanilla HTML, CSS, JavaScript (zero dependencies)
- **Notifications** — Telegram Bot API via native `fetch`

---

## How It Works

**01 — Scheduler**
A `node-cron` job triggers the check cycle every 2 minutes.

**02 — Evaluator**
Puppeteer spins up a headless Chrome instance, logs into the student portal, and parses the DOM to extract the day's timetable.

**03 — Execution**
If an `Ongoing` tag is detected, the bot intercepts the navigation, bypasses pop-ups, and clicks the join link.

**04 — Observer**
While active, the Express server continuously captures screenshots from Puppeteer and streams them as an MJPEG feed to the web dashboard.

**05 — Reporter**
On any state change — Joined, Ended, or Failed — `TelegramNotifier` dispatches an HTTP payload to the Telegram API.

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/AutoClassJoiner.git
cd AutoClassJoiner
npm install
```

### 2. Configure environment variables

Create a `.env` file in the root directory:

```env
REG_NUMBER=your_registration_number
PASSWORD=your_password
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHAT_ID=your_telegram_chat_id
PORT=3000
```

### 3. Run locally

```bash
npm start
```

Open `http://localhost:3000` to view the live dashboard.

---

## Deploying to Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com) and create a New Web Service
3. Connect your repository and use the following settings:

| Setting | Value |
|---|---|
| Environment | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |

4. Add these environment variables in the Render dashboard:

```
PUPPETEER_CACHE_DIR   = /opt/render/project/.render/puppeteer
REG_NUMBER            = your_registration_number
PASSWORD              = your_password
TELEGRAM_BOT_TOKEN    = your_bot_token
TELEGRAM_CHAT_ID      = your_chat_id
NODE_ENV              = production
```

---

## Project Structure

```
AutoClassJoiner/
├── public/
│   ├── index.html       # Live dashboard UI
│   └── style.css        # Dashboard styles
├── bot.js               # Core automation logic
├── server.js            # Express server + API routes
├── notify.js            # Telegram notification handler
├── render.yaml          # Render deployment config
├── Dockerfile           # Docker configuration
├── .env                 # Environment variables (never commit this)
└── package.json
```

---

## License

```
Copyright (c) 2026 Aman Yadav. All Rights Reserved.

Viewing of this source code is permitted.
Copying, modification, distribution, or use of this code
in whole or in part, without explicit written permission
from the author is strictly prohibited.
```

---

<div align="center">
Developed by <b>Aman Kumar Yadav</b> — automating the boring stuff.
</div>
