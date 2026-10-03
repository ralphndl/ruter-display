// Runnable provider template: no credentials, network or real timetable needed.
// Copy this file to <your-provider>.js and replace getDepartures with your API mapping.
module.exports = {
  name: 'Demo',
  defaults: { timeZone: 'Europe/Berlin', locale: 'de-DE', modeColors: { bus: '#5b3fa3', metro: '#156c42' } },
  attribution: { name: 'Departino demo data' },
  notice: 'Simulated departures for demonstration. Not a live timetable.',
  async getDepartures({ stopId }) {
    const names = { 'demo:central': 'Demo Central', 'demo:riverside': 'Demo Riverside' };
    if (!Object.hasOwn(names, stopId)) throw new Error(`Unknown demo stop: ${stopId}`);
    const now = Date.now();
    return {
      stopName: names[stopId],
      departures: [2, 5, 10, 11, 18, 25].flatMap(minutes => ['bus', 'metro'].map(mode => ({
        line: mode === 'bus' ? 'B7' : 'U2',
        destination: mode === 'bus' ? 'Demo Park' : 'Demo Airport',
        departureTime: new Date(now + minutes * 60000).toISOString(),
        transportMode: mode, realtime: false, cancelled: false,
        // Optional per-line colours override the provider's mode colours.
        ...(mode === 'metro' ? { color: '#156c42', textColor: '#ffffff' } : {}),
      }))),
    };
  },
};
