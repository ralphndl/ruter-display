# Disen Display

Echtzeit-Abfahrtsanzeige für die Trikk-Station Disen in Oslo.

Zeigt die nächsten 7 Abfahrten mit:
- Liniennummer (farbcodiert)
- Ziel
- Abfahrtszeit
- Minuten bis Abfahrt
- Echtzeit-Status

## Schnellstart auf Raspberry Pi

### 1. Code kopieren
```bash
scp -r disen-display pi@raspberry.local:~/
```

### 2. SSH auf Raspberry
```bash
ssh pi@raspberry.local
cd disen-display
chmod +x setup.sh
./setup.sh
```

### 3. Fertig!
Die App läuft jetzt auf: **http://raspberry.local:3030**

Beim Booten startet sie automatisch (via PM2).

## Lokale Entwicklung (Mac/Linux)

```bash
npm install
node server.js
```

Öffne: http://localhost:3030

## PM2 Befehle auf Raspberry

```bash
pm2 list                    # Status anzeigen
pm2 logs disen-display      # Live Logs
pm2 stop disen-display      # App stoppen
pm2 restart disen-display   # Neustart
pm2 delete disen-display    # App entfernen
```

## Konfiguration

**Station ändern** (server.js, Zeile 8-9):
```javascript
const STOP_ID = 'NSR:StopPlace:58305';  // Disen
```

Andere Stationen findest du via Entur API.

## API

### GET /api/departures
Gibt Abfahrtsdaten als JSON zurück.

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

## Datensource

- **API**: Entur Journey Planner (Open Data)
- **Echtzeit**: Ja, Echtzeit-Fahrtinfo
- **Update**: Alle 30 Sekunden

---

Gebaut mit Express.js + Vanilla JavaScript
