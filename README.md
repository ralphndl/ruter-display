# Ruter Display

Real-time departure display for Oslo tram and metro stops.

Displays the next 7 departures with:
- Line number (color-coded)
- Destination
- Departure time
- Minutes until departure
- Real-time status

## Quick Start on Raspberry Pi

### 1. Copy code
```bash
git clone <repo-url>
cd ruter-display
```

### 2. Run setup
```bash
chmod +x setup.sh
./setup.sh
```

### 3. Start server
```bash
node server.js
```

The app runs on: **http://localhost:3030?stopId=NSR:StopPlace:58305**

## Local Development (Mac/Linux)

```bash
npm install
node server.js
```

Open: http://localhost:3030?stopId=NSR:StopPlace:58305

## Configuration

### Configurable Stop ID

Use the `stopId` URL parameter to change the stop:

```
http://localhost:3030?stopId=NSR:StopPlace:58305    # Disen
http://localhost:3030?stopId=NSR:StopPlace:58195    # Storo
```

## API

### GET /api/departures
Returns departure data as JSON.

**Parameters:**
- `stopId` (optional): Stop ID from Entur (defaults to Disen)

**Response:**
```json
{
  "stopName": "Disen",
  "departures": [
    {
      "line": "12",
      "destination": "Majorstuen",
      "time": "12:04",
      "diffMin": 1,
      "realtime": true
    }
  ]
}
```

## Features

- 🌙 Dark/Light mode toggle
- 🌍 English UI
- 📱 Responsive design
- ⚡ Real-time departure updates (30-second refresh)
- 🎨 Color-coded line numbers
- 📍 Configurable stops via URL parameter

## Data Source

- **API**: Entur Journey Planner (Open Data)
- **Real-time**: Yes, live departure info
- **Update**: Every 30 seconds

---

Built with Express.js + Vanilla JavaScript
