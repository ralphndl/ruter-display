// Test-only preload. Never copied into the production image.
// Replace the backend's node-fetch dependency so no request reaches Entur.
const assert = require('node:assert/strict');
const id = require.resolve('node-fetch', { paths: [process.cwd()] });
require(id);
require.cache[id].exports = async (url, options) => {
  assert.equal(url, 'https://api.entur.io/journey-planner/v3/graphql');
  assert.equal(options.method, 'POST');
  assert.ok(options.headers['et-client-name']);
  const { variables } = JSON.parse(options.body);
  assert.match(variables.stopId, /^NSR:StopPlace:\d+$/);
  if (variables.stopId === 'NSR:StopPlace:0') {
    return { ok: true, json: async () => ({ errors: [{ message: 'Simulated upstream failure' }] }) };
  }

  const modes = variables.modes || ['tram', 'metro', 'bus'];
  const now = Date.now();
  const call = (mode, minutes, cancellation = false) => ({
    expectedDepartureTime: new Date(now + minutes * 60000).toISOString(),
    destinationDisplay: { frontText: `Fixture ${mode}` },
    serviceJourney: { journeyPattern: { line: {
      publicCode: { tram: '12', metro: '5', bus: '56B' }[mode] || '1',
      transportMode: mode,
    } } },
    realtime: true,
    cancellation,
  });
  return { ok: true, json: async () => ({ data: { stopPlace: {
    name: `Test stop ${variables.stopId.split(':').pop()}`,
    estimatedCalls: modes.flatMap(mode => [
      call(mode, -2), call(mode, 2), call(mode, 5, true),
      call(mode, 10), call(mode, 11), call(mode, 20),
    ]),
  } } }) };
};
