const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

let puppeteer = null;
(async () => {
  try {
    puppeteer = await import('puppeteer');
  } catch (err) {
    // Puppeteer not available
  }
})();

const app = express();
const PORT = process.env.PORT || 3030;

// Personal config.json (not in git), falls back to the shipped example
const CONFIG_FILES = ['config.json', 'config.example.json'].map(f => path.join(__dirname, f));
// Entur asks every client to identify itself: "<company>-<application>"
const CLIENT_NAME = process.env.ET_CLIENT_NAME || 'ruter-display';
const STOP_PREFIX = 'NSR:StopPlace:';
const ENTUR_URL = 'https://api.entur.io/journey-planner/v3/graphql';

const VALID_MODES = ['tram', 'metro', 'bus', 'rail', 'water', 'coach'];

// Accepts both "58366" and "NSR:StopPlace:58366"
const buildStopId = (stop) => (stop.startsWith(STOP_PREFIX) ? stop : `${STOP_PREFIX}${stop}`);

// Read on every request, so edits to config.json apply without a restart
function loadConfig() {
  const file = CONFIG_FILES.find(f => fs.existsSync(f));
  return file ? JSON.parse(fs.readFileSync(file, 'utf8')) : { stops: [] };
}

// Parses "tram,metro" into a list of valid Entur transport modes (empty = all)
const parseModes = (modes) =>
  (modes || '').split(',').map(m => m.trim()).filter(m => VALID_MODES.includes(m));

const QUERY = `
query ($stopId: String!, $modes: [TransportMode]) {
  stopPlace(id: $stopId) {
    name
    estimatedCalls(timeRange: 72000, numberOfDepartures: 20, whiteListedModes: $modes) {
      expectedArrivalTime
      expectedDepartureTime
      destinationDisplay { frontText }
      serviceJourney {
        journeyPattern {
          line { publicCode transportMode }
        }
      }
      realtime
      cancellation
    }
  }
}`;

app.get('/api/config', (req, res) => {
  try {
    res.json(loadConfig());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Invalid config: ${err.message}` });
  }
});

app.get('/api/departures', async (req, res) => {
  try {
    const stopId = buildStopId(req.query.stopId || String(loadConfig().stops?.[0]?.id ?? ''));
    const modes = parseModes(req.query.modes);
    // Hide departures you can't reach anyway (walking time to the stop)
    const minMinutes = Number(req.query.minMinutes) || 0;

    const response = await fetch(ENTUR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ET-Client-Name': CLIENT_NAME,
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { stopId, modes: modes.length ? modes : null },
      }),
    });
    const data = await response.json();
    if (data.errors) throw new Error(JSON.stringify(data.errors));
    const calls = data?.data?.stopPlace?.estimatedCalls ?? [];
    const stopName = data?.data?.stopPlace?.name ?? stopId;

    const departures = calls
      .filter(c => !c.cancellation)
      .map(c => {
        const t = new Date(c.expectedDepartureTime);
        const now = new Date();
        const diffMin = Math.round((t - now) / 60000);
        return {
          line: c.serviceJourney?.journeyPattern?.line?.publicCode ?? '?',
          destination: c.destinationDisplay?.frontText ?? '',
          time: t.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }),
          diffMin,
          realtime: c.realtime,
          transportMode: c.serviceJourney?.journeyPattern?.line?.transportMode ?? 'unknown',
        };
      })
      .filter(d => d.diffMin >= minMinutes);

    res.json({ stopName, departures });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fetch failed' });
  }
});

app.get('/', (req, res) => {
  if (req.query.screenshot) {
    if (!puppeteer) {
      res.status(503).json({ error: 'Screenshot feature not available. Install puppeteer: npm install puppeteer' });
      return;
    }

    (async () => {
      let browser;
      try {
        // Render the normal page with the same stop parameters (or the config when none are given)
        const { screenshot, width: _w, height: _h, ...pageQuery } = req.query;
        const params = new URLSearchParams(pageQuery);
        const width = parseInt(req.query.width) || 1024;
        const height = parseInt(req.query.height) || 600;

        browser = await puppeteer.default.launch({
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.setViewport({ width, height });

        const url = `http://localhost:${PORT}/?${params}`;
        await page.goto(url, { waitUntil: 'networkidle2' });

        const screenshotData = await page.screenshot({ type: 'png' });
        res.type('image/png').send(screenshotData);
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

app.listen(PORT, () => console.log(`Ruter Display running on http://localhost:${PORT}`));
