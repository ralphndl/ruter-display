# Oslo Departures

**Your next ride, right by the door.**

A departure board for public transport in Oslo, including Ruter services. Live tram,
metro and bus departures, clear line colours and a layout made for a quick glance
on the way out. Powered by Entur open data, refreshed every 30 seconds.

**Independent project. Not affiliated with or endorsed by Ruter or Entur.**

- Separate groups for each transport mode, across one or more stops.
- Countdown up to 10 minutes; departure clock time after that.
- Walking-time filters, adjustable text size and light / dark / automatic themes.

## Pick your screen

- **Pi + tablet:** run the server on a Raspberry Pi and open its address on any
  tablet in the same network. The tablet only needs a browser.
- **All in one:** run the server and a full-screen browser on the same Pi or
  computer, with a monitor attached.
- **Docker:** run it on a Docker-capable NAS, home server or computer. Connect
  your screen through the browser as usual.
- **Picture display:** use the PNG endpoint with a dashboard, e-paper setup or
  picture display that can periodically fetch an image URL.

The practical setup here: a **Samsung Galaxy Tab 9 in a wall mount**. Motion
detection can wake the screen when someone approaches. Arrange that through your
preferred tablet or home-automation setup; screen activation is separate from
this app.

## Start with Docker

Requires Docker with Compose. The image includes Chromium for screenshots and
can be built for `amd64` and `arm64`, including 64-bit Raspberry Pi OS.

```sh
test -f config.json || cp config.example.json config.json
# Edit config.json to choose your stops
docker compose up -d --build
```

Open **http://localhost:3030**, or **http://<server-ip>:3030** from your tablet.

```sh
docker compose logs -f                     # Follow logs
docker compose down                        # Stop and remove the container
git pull --ff-only && docker compose up -d --build  # Update
```

Your `config.json` is mounted read-only and stays on the host. After editing it,
run `docker compose up -d --force-recreate` to pick up the saved file reliably.
Docker uses port `3030` inside the container; for another host port, use
`PORT=4040 docker compose up -d`. Use the same override on subsequent `up` commands.

## Or run it directly

Requires **Node.js 22.12+**, npm and make on the server.

```sh
make install          # Install dependencies and create config.json if missing
# Edit config.json to choose your stops
make start            # Start in the background
```

Open **http://localhost:3030** on that device, or **http://<server-ip>:3030** from
another screen. Use your configured port if different. For Raspberry Pi / Linux
autostart, run `make service`.

| Commands | Purpose |
|---|---|
| `make install` / `make uninstall` | Install or remove dependencies; keep your configuration. |
| `make start` / `make stop` | Start or stop the local server. Log: `.cache/server.log`. |
| `make service` / `make unservice` | Enable or remove systemd autostart. |
| `make dev` / `make check` | Run with auto-reload, or check your stops' departures. |
| `make update` / `make logs` | Update the systemd installation, or follow its logs. |

Run `make` for help. `make stop` controls the local background server. For a full
systemd uninstall, run `make unservice` before `make uninstall`. The `.service`
file is a template; `make service` fills in your machine's paths automatically.
Existing `ruter-display` service and Compose identifiers are retained for
compatibility with earlier installations; the application is now Oslo Departures.

## Make it yours

Edit **`config.json`** using [config.example.json](config.example.json) as a guide.
Your local file is ignored by Git, excluded from the Docker image and preserved
during installs and updates. No `.env` is needed.

| Setting | What it does |
|---|---|
| `stops` | Stop IDs and modes: `tram`, `metro`, `bus`, `rail`, `water`, `coach`. Multiple modes get separate groups. |
| `stops[].minMinutes` | Walking time: hide departures you cannot reach. Use `5`, or per mode: `{ "metro": 8, "tram": 5, "bus": 5 }`. |
| `count` / `size` | Departures per stop, split across groups; text size `normal`, `small` or `smaller`. |
| `theme` | Default `light`, `dark` or `auto`, with `nightStart` and `nightEnd`. The buttons remember your browser's choice. |
| `server` | Entur `clientName` (your `<company>-<application>` identifier) and native HTTP `port`. Compose controls the Docker port. |

Find IDs in [Entur's stop register](https://stoppested.entur.org). For native
installs, reload the page after display changes and restart after server changes.
Existing `PORT` and `ET_CLIENT_NAME` environment variables override the matching
settings.

URL parameters let each screen show a different view without editing the file:
`/?stopId=58366:tram:metro&count=6`.

## Just the picture

The screenshot endpoint returns a fresh PNG of the board:

```text
http://<server-ip>:3030/?screenshot=1&width=1024&height=600
```

Add the same `stopId`, `modes` and `count` parameters to customize the view. Set your
picture display to fetch the URL again periodically, for example every 30–60
seconds: the PNG itself does not refresh. Screenshots use the configured theme
and text size, with the clock set to Oslo time.
Source attribution stays visible in the PNG. If your board is too tall, increase
`height`, reduce `count` or choose a smaller text size to fit all departures.

Screenshot support is included in Docker. Native `make install` skips the browser
dependencies; install them with `npm install --include=optional` and restart.
Linux ARM setups need a compatible system Chromium rather than Puppeteer's
Chrome download; see [Puppeteer's setup notes](https://pptr.dev/troubleshooting)
and `PUPPETEER_EXECUTABLE_PATH` in its
[configuration options](https://pptr.dev/api/puppeteer.configuration).

## Data and licences

Contains data made available by [Entur AS](https://entur.no/) under the
[Norwegian Licence for Open Government Data (NLOD)](https://data.norge.no/nlod).
Oslo Departures filters and formats the data and calculates countdowns from
departure times. See [Entur's terms of service](https://developer.entur.no/terms-of-service).

The application code is licensed under [MIT](LICENSE). The transport data keeps
its NLOD licence; Fira Sans keeps its [SIL Open Font License](public/fonts/OFL.txt).
Transport pictograms are drawn for this project. No official Ruter or Entur
company logos or Ruter's proprietary typeface are bundled.

---

Express + vanilla JavaScript. Locally hosted Fira Sans
([font license](public/fonts/OFL.txt)).
