# Ruter Display

Real-time departure display for Oslo tram and metro stops – one or more stops side by side, e.g. on a wall-mounted tablet.

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

The app runs on: **http://localhost:3030/?stopId=58366,58382&modes=tram**

### 4. Run as a service (autostart)
```bash
# adjust User / WorkingDirectory in the file first if needed
sudo cp ruter-display.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ruter-display
```

## Local Development (Mac/Linux)

```bash
npm install
node server.js
```

Open: http://localhost:3030/?stopId=58366,58382&modes=tram

## Configuration

### URL parameters

| Parameter | Example | Meaning |
|-----------|---------|---------|
| `stopId`  | `58366,58382` | One or more stops (comma-separated). `58366` and `NSR:StopPlace:58366` both work. Find IDs at [stoppested.entur.org](https://stoppested.entur.org). |
| `modes`   | `tram` or `tram,metro` | Only show these transport modes (tram, metro, bus, rail, water, coach). Default: all. |
| `count`   | `5` | Departures per stop (default 7). |

```
http://localhost:3030/?stopId=58366                        # Jernbanetorget, all modes
http://localhost:3030/?stopId=58366,58382&modes=tram       # Jernbanetorget + Aker brygge, trams only
```

Several stops are shown side by side in landscape (≥1000px wide) and stacked in portrait.

### Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `3030` | HTTP port |
| `DEFAULT_STOP_ID` | `58366` | Stop used by the API when no `stopId` is given |
| `ET_CLIENT_NAME` | `ruter-display` | `ET-Client-Name` header sent to Entur – please set your own (`<company>-<application>`) |

## API

### GET /api/departures
Returns departure data as JSON.

**Parameters:**
- `stopId` (optional): Stop ID from Entur, with or without `NSR:StopPlace:` prefix (defaults to `DEFAULT_STOP_ID`, Jernbanetorget if unset)
- `modes` (optional): comma-separated transport modes to include

**Response:**
```json
{
  "stopName": "Jernbanetorget",
  "departures": [
    {
      "line": "12",
      "destination": "Majorstuen",
      "time": "12:04",
      "diffMin": 1,
      "realtime": true,
      "transportMode": "tram"
    }
  ]
}
```

## Features

- 🌙 Dark/Light mode toggle
- 🌍 English UI
- 📱 Responsive design
- ⚡ Real-time departure updates (30-second refresh)
- 🎨 Line badges in Ruter colours (tram blue, metro orange, bus red)
- 📍 Multiple stops and transport-mode filter via URL parameters

## Data Source

- **API**: Entur Journey Planner (Open Data)
- **Real-time**: Yes, live departure info
- **Update**: Every 30 seconds

---

Built with Express.js + Vanilla JavaScript
