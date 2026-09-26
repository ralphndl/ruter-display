// Smoke test for a running server: loads the config and fetches departures for every stop.
// Usage: node scripts/check.js [baseUrl]   (default http://localhost:$PORT or :3030)

const base = process.argv[2] || `http://localhost:${process.env.PORT || 3030}`;

(async () => {
  let config;
  try {
    config = await (await fetch(`${base}/api/config`)).json();
  } catch (err) {
    console.error(`✗ Server not reachable on ${base} (${err.cause?.code || err.message})`);
    process.exit(1);
  }
  if (config.error) {
    console.error(`✗ ${config.error}`);
    process.exit(1);
  }

  let failed = false;
  for (const stop of config.stops || []) {
    const q = new URLSearchParams({ stopId: stop.id, modes: (stop.modes || []).join(',') });
    if (typeof stop.minMinutes === "number") q.set("minMinutes", stop.minMinutes);
    const data = await (await fetch(`${base}/api/departures?${q}`)).json();
    const ok = !data.error && data.departures.length > 0;
    failed ||= !ok;
    const modes = stop.modes?.length ? ` [${stop.modes.join(', ')}]` : '';
    console.log(`${ok ? '✓' : '✗'} ${data.stopName || stop.id}${modes}: ${data.error || `${data.departures.length} departures`}`);
  }
  process.exit(failed ? 1 : 0);
})();
