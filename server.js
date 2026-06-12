const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = 3030;

// Disen Trikk – NSR:StopPlace:58305
const STOP_ID = 'NSR:StopPlace:58305';
const ENTUR_URL = 'https://api.entur.io/journey-planner/v3/graphql';

const QUERY = `
{
  stopPlace(id: "${STOP_ID}") {
    name
    estimatedCalls(timeRange: 72000, numberOfDepartures: 10) {
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

app.get('/api/departures', async (req, res) => {
  try {
    const response = await fetch(ENTUR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ET-Client-Name': 'disen-display-homepi',
      },
      body: JSON.stringify({ query: QUERY }),
    });
    const data = await response.json();
    const calls = data?.data?.stopPlace?.estimatedCalls ?? [];
    const stopName = data?.data?.stopPlace?.name ?? 'Disen';

    const departures = calls
      .filter(c => !c.cancellation)
      .map(c => {
        const t = new Date(c.expectedDepartureTime);
        const now = new Date();
        const diffMin = Math.round((t - now) / 60000);
        return {
          line: c.serviceJourney?.journeyPattern?.line?.publicCode ?? '?',
          destination: c.destinationDisplay?.frontText ?? '',
          time: t.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' }),
          diffMin,
          realtime: c.realtime,
        };
      });

    res.json({ stopName, departures });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fetch failed' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log(`Disen display running on http://localhost:${PORT}`));
