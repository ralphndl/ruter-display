const { VALID_MODES, isColor } = require('./providers');

// Every provider returns absolute timestamps. The shared display logic owns
// countdowns, timezone formatting, walking-time/mode filters and ordering.
function formatDepartures(result, { display, modes = [], minMinutes = 0, now = Date.now() }) {
  if (!result || typeof result.stopName !== 'string' || !Array.isArray(result.departures)) {
    throw new Error('Provider must return { stopName, departures: [] }');
  }
  const formatter = new Intl.DateTimeFormat(display.locale, {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: display.timeZone,
  });
  const departures = result.departures.filter(d => !d.cancelled).map(d => {
    // Reject local/ambiguous timestamps; each provider must include UTC or an offset.
    if (typeof d.departureTime !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/i.test(d.departureTime)) {
      throw new Error('Provider departureTime must be ISO 8601 with a timezone offset');
    }
    const timestamp = Date.parse(d.departureTime);
    if (!Number.isFinite(timestamp)) throw new Error('Invalid provider departureTime');
    return {
      line: String(d.line ?? '?'), destination: String(d.destination ?? ''),
      departureTime: new Date(timestamp).toISOString(), time: formatter.format(timestamp),
      diffMin: Math.round((timestamp - now) / 60000), realtime: Boolean(d.realtime),
      transportMode: VALID_MODES.includes(d.transportMode) ? d.transportMode : 'unknown',
      ...(isColor(d.color) ? { color: d.color } : {}),
      ...(isColor(d.textColor) ? { textColor: d.textColor } : {}),
    };
  }).filter(d => d.diffMin >= Math.max(0, minMinutes) && (!modes.length || modes.includes(d.transportMode)))
    .sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  return { stopName: result.stopName, departures };
}

module.exports = { formatDepartures };
