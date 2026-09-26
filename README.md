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

### 3. Configure your stops
`setup.sh` creates `config.json` from `config.example.json` – edit it (see [Configuration](#configuration)).

### 4. Start server
```bash
node server.js
```

The app runs on: **http://localhost:3030/**

### 5. Run as a service (autostart)
```bash
make service           # fills in your user, folder and node path, enables autostart
make check             # verifies every configured stop returns departures
```
Later updates: `make update` (git pull, install, restart).

## Make targets

| Target | What it does |
|--------|--------------|
| `make install` | Install dependencies, create `config.json` if missing |
| `make start` | Start the server |
| `make dev` | Start with auto-restart on file changes |
| `make check` | Test the running server for every configured stop |
| `make service` | Install + start the systemd service (Raspberry Pi) |
| `make update` | `git pull`, install, restart the service |
| `make logs` | Follow the service logs |

## Local Development (Mac/Linux)

```bash
make dev
```

Open: http://localhost:3030/

## Configuration

### config.json

The landing page (`http://<host>:3030/` without parameters) shows the stops from `config.json`.
The file is not tracked by git; if it is missing, `config.example.json` is used. Changes apply on the next page reload – no server restart needed.

```json
{
  "stops": [
    { "id": "58366", "modes": ["tram", "metro"] },
    { "id": "58382", "modes": ["tram"] }
  ],
  "count": 7,
  "theme": {
    "default": "auto",
    "nightStart": "19:00",
    "nightEnd": "07:00"
  }
}
```

| Key | Meaning |
|-----|---------|
| `stops[].id` | Entur stop ID, `58366` or `NSR:StopPlace:58366`. Find IDs at [stoppested.entur.org](https://stoppested.entur.org). |
| `stops[].modes` | Transport modes for this stop: `tram`, `metro`, `bus`, `rail`, `water`, `coach`. Empty or missing = all modes in one list. With several modes, each mode gets its own box (the rows are split between them), so frequent trams never push the metro off the screen. The boxes appear in the order of `modes`. |
| `stops[].minMinutes` | Optional walking time: hide departures leaving sooner than this. One number (`5`) or per mode (`{ "metro": 8, "tram": 5 }`). |
| `count` | Departures per stop (default 7). |
| `size` | Default text size: `normal`, `small` or `smaller` (the **Aa** button cycles through them, remembered per browser). |
| `theme.default` | `light`, `dark` or `auto` – used until someone picks a theme with the toggle (the choice is remembered per browser). |
| `theme.nightStart` / `theme.nightEnd` | In `auto` mode the display is dark between these times (default 19:00–07:00). |

### URL parameters

URL parameters override the config, so any other stop can be shown without touching the file.

| Parameter | Example | Meaning |
|-----------|---------|---------|
| `stopId`  | `58366,58382` | One or more stops (comma-separated). Per-stop modes via colons: `58366:tram:metro`. |
| `modes`   | `tram` or `tram,metro` | Modes for all stops that have none of their own. |
| `count`   | `5` | Departures per stop. |

```
http://localhost:3030/                                      # stops from config.json
http://localhost:3030/?stopId=58366                         # Jernbanetorget, all modes
http://localhost:3030/?stopId=58366,58382&modes=tram        # both stops, trams only
http://localhost:3030/?stopId=58366:metro,58382:tram        # metro at Jernbanetorget, tram at Aker brygge
```

### Theme

The button in the top right cycles through ☀️ light → 🌙 dark → 🌓 auto.

Several stops are shown side by side in landscape (≥1000px wide) and stacked in portrait.

### Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `3030` | HTTP port |
| `ET_CLIENT_NAME` | `ruter-display` | `ET-Client-Name` header sent to Entur – please set your own (`<company>-<application>`) |

## API

### GET /api/config
Returns the active configuration (`config.json`, or `config.example.json` as fallback).

### GET /api/departures
Returns departure data as JSON.

**Parameters:**
- `stopId` (optional): Stop ID from Entur, with or without `NSR:StopPlace:` prefix (defaults to the first stop in the config)
- `modes` (optional): comma-separated transport modes to include
- `minMinutes` (optional): only departures leaving in at least this many minutes

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

- 🌓 Light / dark / auto theme (dark in the evening)
- 🌍 English UI
- 📱 Responsive design
- ⚡ Real-time departure updates (30-second refresh)
- 🎨 Line badges in Ruter colours (tram blue, metro orange, bus red)
- 📍 Stops and transport modes via `config.json`, overridable per URL
- 🔶 Metro badges are square, tram badges round – distinguishable without colour

## Data Source

- **API**: Entur Journey Planner (Open Data)
- **Real-time**: Yes, live departure info
- **Update**: Every 30 seconds

---

Built with Express.js + Vanilla JavaScript
