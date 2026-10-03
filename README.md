# Departino

**Your next ride, at a glance.**

A self-hosted, extensible public transport departure board for your wall, tablet
or browser. Live departures, clear line colours and a layout made for a quick
glance on the way out. Refreshed every 30 seconds by default.

Built with **Oslo as the working example**, using Entur open data. The display is
independent of the data source: add a provider for your own transport network
without changing the frontend. An offline demo is included as a runnable template.
See [adding a provider](docs/providers.md). Munich and other networks still need
their own integration; Entur is the live provider included today.

**Independent project. The Oslo/Entur integration is not affiliated with or
endorsed by Ruter or Entur.**

- Separate groups for each transport mode, across one or more stops.
- Countdown up to 10 minutes; departure clock time after that.
- Walking-time filters, adjustable text size and light / dark / automatic themes.
- Provider-specific timezones, line colours and source attribution, including PNGs.

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

`make start` waits until the server is ready, reuses a current running instance
and replaces an outdated one after code changes. Use `make restart` to force a
restart, or `make status` to check it. Concurrent start/stop commands are serialized.
For development, `make dev` restarts automatically when code changes.

| Commands | Purpose |
|---|---|
| `make install` / `make uninstall` | Install or remove dependencies; keep your configuration. |
| `make start` / `make stop` | Start or stop the local server. Log: `.cache/server.log`. |
| `make restart` / `make status` | Restart the local server, or check whether it is ready. |
| `make service` / `make unservice` | Enable or remove systemd autostart. |
| `make dev` / `make check` | Run with auto-reload, or check your stops' departures. |
| `make update` / `make logs` | Update the systemd installation, or follow its logs. |

Run `make` for help. `make stop` also finds manual `node server.js` and Node watch
processes from this checkout, even without a PID file, and stops their children.
Unrelated processes and other checkouts are left alone. For a full
systemd uninstall, run `make unservice` before `make uninstall`. `make service`
generates the systemd unit directly on your Pi with the correct user and paths,
then restarts it. No separate service file needs editing; your settings stay in
`config.json`.

## Make it yours

Everything is configured in **one local `config.json`**. Start with
[config.example.json](config.example.json), which shows the complete Oslo/Entur
setup, and adjust these three sections:

| Section | What goes here |
|---|---|
| `server` | HTTP `port` for native installations. |
| `source` | Data-provider adapter, API `endpoint`, request `headers` and `timeoutMs`. |
| `display` | Stops and modes, walking time, row count, size, refresh interval, timezone, locale, theme and colours. |

For example, the data source is configured directly in that file:

```json
"source": {
  "provider": "entur",
  "endpoint": "https://api.entur.io/journey-planner/v3/graphql",
  "headers": { "ET-Client-Name": "departino-display" },
  "timeoutMs": 10000
}
```

`source.provider` selects the API format; `source.endpoint` is the URL it calls.
Change the URL, headers and display settings without editing application code.
An API with a different format needs a matching [provider adapter](docs/providers.md).
Endpoint settings and credentials stay on the server and are not sent to the browser.

In `display.stops`, use IDs from your chosen source (for Entur:
[the stop register](https://stoppested.entur.org)). Each stop accepts `modes` and
`minMinutes`, either one walking time or per mode: `{ "metro": 8, "tram": 5 }`.
Supported modes are `tram`, `metro`, `bus`, `rail`, `water` and `coach`.
`display.count` sets rows per stop, split across its modes. `display.size` accepts
`normal`, `small` or `smaller`. `display.refreshSeconds` controls polling.
`display.locale` formats times; UI labels currently remain English.

Your local file is ignored by Git, excluded from the Docker image and preserved
during installs and updates. Copy that **same file** to the project directory on
your Pi before running `make service`. No `.env` or additional per-provider config
is needed. The offline [demo config](examples/config.demo.json) uses the same format.

For native installs, reload the page after config edits; restart after changing
the port. For Docker, recreate the container after config edits as described above.
Docker fixes its internal port to 3030; its published host port is set through
Compose (`PORT=4040 docker compose up -d` for an override).
The size/theme buttons remember per-browser choices and override the file defaults.

URL parameters can override stops and count for an individual screen:
`/?stopId=58366&modes=tram,metro&count=6`. Repeat `stopId` for more stops.

## Just the picture

The screenshot endpoint returns a fresh PNG of the board:

```text
http://<server-ip>:3030/?screenshot=1&width=1024&height=600
```

Add the same `stopId`, `modes` and `count` parameters to customize the view. Set your
picture display to fetch the URL again periodically, for example every 30–60
seconds: the PNG itself does not refresh. Screenshots use the configured theme
and text size, with the clock set to the configured provider/display timezone.
Source attribution stays visible in the PNG. If your board is too tall, increase
`height`, reduce `count` or choose a smaller text size to fit all departures.

Screenshot support is included in Docker. Native `make install` skips the browser
dependencies; install them with `npm install --include=optional` and restart.
Linux ARM setups need a compatible system Chromium rather than Puppeteer's
Chrome download; see [Puppeteer's setup notes](https://pptr.dev/troubleshooting)
and `PUPPETEER_EXECUTABLE_PATH` in its
[configuration options](https://pptr.dev/api/puppeteer.configuration).

## Checks

Run `npm test` for offline configuration and API checks. Tests use example settings
and simulated departures; your personal `config.json` stays untouched.

[GitHub Actions](.github/workflows/ci.yml) runs on pull requests and pushes to `main`.
It also builds Docker, checks container health and renders desktop and mobile PNGs
with visible source attribution. Tests cover both Entur and the independent demo
provider. Screenshots and container logs are saved as build
artifacts for seven days. Images are not published automatically.

## Data and licences

The included Entur integration uses data made available by [Entur AS](https://entur.no/) under the
[Norwegian Licence for Open Government Data (NLOD)](https://data.norge.no/nlod).
Departino filters and formats the data and calculates countdowns from
departure times. See [Entur's terms of service](https://developer.entur.no/terms-of-service).

The application code is licensed under [MIT](LICENSE). Each provider's data keeps
its own licence; provider attribution is shown in the display and screenshots.
Entur data keeps its NLOD licence. Fira Sans keeps its [SIL Open Font License](public/fonts/OFL.txt).
Transport pictograms are drawn for this project. No official Ruter or Entur
company logos or Ruter's proprietary typeface are bundled.

---

Express + vanilla JavaScript. Locally hosted Fira Sans
([font license](public/fonts/OFL.txt)).
