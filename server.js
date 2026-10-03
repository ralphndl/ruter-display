const express = require('express');
const path = require('path');
const { loadConfig, loadServerConfig } = require('./lib/config');
const { resolveProvider, publicConfig, VALID_MODES } = require('./lib/providers');
const { formatDepartures } = require('./lib/departures');
const runtimeRevision = require('./lib/runtime').revision();

// Optional for native installs; included with Chromium in the Docker image.
const puppeteerReady = import('puppeteer').catch(() => null);

const app = express();
const { port: PORT } = loadServerConfig();

app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ app: 'departino', pid: process.pid, revision: runtimeRevision });
});

app.get('/api/config', (req, res) => {
  try {
    res.json(publicConfig(loadConfig()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Invalid config: ${err.message}` });
  }
});

app.get('/api/departures', async (req, res) => {
  try {
    const config = loadConfig();
    const runtime = resolveProvider(config);
    const stopId = req.query.stopId ?? runtime.display.stops[0]?.id;
    if (stopId == null || !String(stopId).trim() || typeof stopId === 'object') {
      return res.status(400).json({ error: 'A stopId is required' });
    }
    const modes = String(req.query.modes || '').split(',').map(mode => mode.trim())
      .filter(mode => VALID_MODES.includes(mode));
    const minMinutes = Number(req.query.minMinutes) || 0;
    const result = await runtime.provider.getDepartures({
      stopId: String(stopId), modes, source: runtime.source,
    });
    res.json(formatDepartures(result, { display: runtime.display, modes, minMinutes }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fetch failed' });
  }
});

app.get('/', async (req, res) => {
  if (req.query.screenshot) {
    const puppeteer = await puppeteerReady;
    if (!puppeteer) {
      res.status(503).json({ error: 'Screenshot feature not available. Install puppeteer: npm install puppeteer' });
      return;
    }

    (async () => {
      let browser;
      try {
        // Render the normal page with the same stop parameters (or the config when none are given)
        const params = new URL(req.originalUrl, 'http://localhost').searchParams;
        for (const key of ['screenshot', 'width', 'height']) params.delete(key);
        const width = parseInt(req.query.width) || 1024;
        const height = parseInt(req.query.height) || 600;

        browser = await puppeteer.default.launch({
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.setViewport({ width, height });
        await page.emulateTimezone(resolveProvider(loadConfig()).display.timeZone);

        const url = `http://localhost:${PORT}/?${params}`;
        await page.goto(url, { waitUntil: 'networkidle0' });
        await page.waitForFunction(() => window.departinoReady === true);
        if (await page.evaluate(() => Boolean(window.departinoError))) {
          throw new Error('Display could not load configuration or departures');
        }
        // Keep attribution inside the image even when the requested board is tall.
        await page.evaluate(() => document.body.classList.add('screenshot'));
        await page.evaluate(() => document.fonts.ready);

        const screenshotData = await page.screenshot({ type: 'png' });
        res.set('Cache-Control', 'no-store').type('image/png').send(Buffer.from(screenshotData));
      } catch (err) {
        console.error('Screenshot error:', err);
        res.status(500).json({ error: 'Screenshot failed' });
      } finally {
        if (browser) await browser.close();
      }
    })();
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, error => {
  if (error) {
    console.error(error.code === 'EADDRINUSE'
      ? `Port ${PORT} is already in use. Stop the existing server before starting Departino.`
      : `Could not start Departino: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Departino running on http://localhost:${PORT}`);
});
