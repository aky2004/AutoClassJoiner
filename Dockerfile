FROM node:20-slim

# Install Chromium and timezone dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-freefont-ttf \
    tzdata \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Timezone to IST
ENV TZ="Asia/Kolkata"

# Configure Puppeteer behavior/caching in Render
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_CACHE_DIR=/tmp/puppeteer

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Also install Puppeteer's managed Chrome to avoid runtime missing-browser errors
RUN npx puppeteer browsers install chrome@147.0.7727.116

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Start the bot
CMD ["node", "server.js"]