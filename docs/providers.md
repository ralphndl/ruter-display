# Add your transport network

Departino separates the display from the timetable API. A **provider** translates
one API format into a small shared format. Its endpoint and request settings live
in the same `config.json` as the display settings. The core handles mode groups,
walking-time filters, sorting, countdowns, clock times, themes and screenshots.

One installation selects one provider. You can display multiple stops and modes
from that provider. Combining providers in one board is not currently supported.

## Try the contract without an API

Copy [examples/config.demo.json](../examples/config.demo.json) to your local
`config.json` (save your current settings first), then start Departino as usual.
The `demo` provider generates clearly labelled fictional departures. It uses
non-numeric stop IDs, another timezone and different line colours.

The shipped live integration is [entur.js](../lib/providers/entur.js), developed
using Oslo as the reference setup. Munich and other networks need their own API
adapter; changing a stop ID alone does not connect a different data source.

## Create an adapter

1. Copy [lib/providers/demo.js](../lib/providers/demo.js) to
   `lib/providers/my-network.js`.
2. Replace `getDepartures` with your API request and field mapping. Set the
   provider's name, defaults, attribution and notice.
3. Select it in `config.json`:

   ```json
   {
     "source": {
       "provider": "my-network",
       "endpoint": "https://your-api.example/departures",
       "headers": { "Authorization": "Bearer your-local-key" },
       "timeoutMs": 10000
     },
     "display": {
       "timeZone": "Europe/Berlin",
       "locale": "de-DE",
       "stops": [{ "id": "your-api-stop-id", "modes": ["bus", "metro"] }],
       "count": 7
     }
   }
   ```

4. Restart the native server, or rebuild with `docker compose up -d --build`.
   Run `make check` against your configured stops.

No registry, server or frontend edits are needed. Provider IDs must start with a
lowercase letter and contain only lowercase letters, digits and hyphens. Provider
code runs on the server and must be trusted. Put credentials in the ignored local
`config.json`, never in the adapter or an example file. `source` and
`server` are not returned by `/api/config`.

## Module contract

Export a CommonJS object with these fields:

| Field | Purpose |
|---|---|
| `name` | Public data-provider name. |
| `defaults.timeZone` | IANA timezone, such as `Europe/Berlin`; fallback `UTC`. |
| `defaults.locale` | Locale for time formatting, such as `de-DE`; fallback `en-GB`. UI labels currently remain English. |
| `defaults.modeColors` | Optional map of modes to `#RGB` or `#RRGGBB` colours. |
| `attribution` | Required `name`; optional `url`, `license`, `licenseUrl`. Visible in the browser and PNG. Use the wording required by your data source. |
| `notice` | Public notice, such as independence from the operator or demo status. Rendered as plain text. |
| `requiresEndpoint` | Set `true` for an HTTP API adapter. The core validates `source.endpoint`. |
| `requiredHeaders` | Optional list of header names the config must supply, such as `ET-Client-Name`. |
| `getDepartures({ stopId, modes, source })` | Async function returning the shared result below. Use `source.endpoint`, `source.headers` and `source.timeoutMs` for the request. |

`display` in the user's config overrides provider defaults. The same timezone is
used for the header clock, departure times, automatic night mode, update time and
screenshots, regardless of the server or tablet's timezone.

`stopId` is an opaque string: keep letters, colons and namespaces intact. `modes`
is an array of requested canonical modes, or `[]` for all. Map your API's terms to
`tram`, `metro`, `bus`, `rail`, `water`, `coach`, or `unknown`. You may send mode
filters upstream, but the core also filters the returned data.

```js
return {
  stopName: 'Central Station',
  departures: [{
    line: 'U2',
    destination: 'Airport',
    departureTime: '2026-10-03T14:35:00+02:00',
    transportMode: 'metro',
    realtime: true,
    cancelled: false,
    color: '#156c42',       // optional per-line background
    textColor: '#ffffff',   // optional per-line foreground
  }],
};
```

Return absolute ISO 8601 timestamps with `Z` or an explicit offset, never a local
clock string or a precomputed countdown. Use the expected time when available,
otherwise the scheduled time. Set `realtime` accordingly. The core removes
cancelled and past departures, applies walking time, sorts chronologically and
formats the result. The display shows minutes through 10 minutes, then clock time.

Line colours override mode colours; white is the default badge text colour, so
provide `textColor` for light backgrounds. Provider text is escaped and colours
are restricted to hex values. Only HTTP(S) attribution links are made clickable.

Return `departures: []` for a valid stop without departures. Throw an error for
failed API calls, unknown stops or unusable data. Use a bounded request timeout
(configured through `source.timeoutMs`) and check HTTP and API-level errors. Keep
credentials out of error messages and logs. The display keeps its last successful
departures when an update fails; screenshot requests fail rather than return an
apparently valid image of an error page.

## Verify your integration

Add offline API fixtures and contract tests under `test/`, following the existing
Entur and demo tests. `npm test` verifies the shared behaviour without live APIs.
The Docker CI also checks provider switching, opaque IDs, clock zones, colours,
and source attribution in actual desktop and mobile PNGs. New provider files are
automatically included in the Docker image and JavaScript syntax checks.

## Request configuration

Read request settings from the supplied `source`, not hardcoded URLs, environment
variables or a second config file. Header names are normalized to lowercase. Use
`source.options` only if your adapter needs extra settings beyond the URL, headers
and timeout; those also remain private to the server.

The Entur adapter posts its GraphQL query to `source.endpoint`, sends the configured
headers (including `ET-Client-Name`), and honours `source.timeoutMs`. You can point
it at an Entur-compatible proxy simply by editing the URL in `config.json`.
Changing only the URL does not translate a different API format.

Entur accepts numeric IDs and full `NSR:StopPlace:…` IDs. For URL overrides use:
`?stopId=NSR%3AStopPlace%3A58366&modes=tram,metro`. Repeat `stopId` for more stops;
comma-separated IDs are also accepted. IDs containing commas must be configured
in `display.stops` instead of the URL shorthand.
