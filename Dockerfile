FROM node:22-bookworm-slim

# Use Debian's Chromium on both amd64 and arm64 instead of downloading Chrome.
ENV NODE_ENV=production \
    TZ=UTC \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --include=optional \
    && node --input-type=module -e "await import('puppeteer')" \
    && npm cache clean --force

COPY server.js config.example.json LICENSE ./
COPY lib ./lib
COPY public ./public
COPY scripts/check.js ./scripts/check.js

USER node
EXPOSE 3030
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "const {port}=require('./lib/config').loadServerConfig(); fetch('http://127.0.0.1:'+port+'/api/config', {signal: AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
