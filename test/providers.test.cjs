const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveProvider, publicConfig } = require('../lib/providers');
const { formatDepartures } = require('../lib/departures');

test('Entur sends requests to the configured endpoint with configured headers and timeout', async () => {
  const { Script } = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  let request;
  const module = { exports: {} };
  new Script(fs.readFileSync(path.join(__dirname, '../lib/providers/entur.js'), 'utf8')).runInNewContext({
    module,
    require: name => {
      assert.equal(name, 'node-fetch');
      return async (url, options) => {
        request = { url, options };
        return { ok: true, json: async () => ({ data: { stopPlace: { name: 'Proxy stop', estimatedCalls: [] } } }) };
      };
    },
  });
  const source = {
    provider: 'entur', endpoint: 'https://custom-endpoint.invalid/graphql', timeoutMs: 4321,
    headers: { 'ET-Client-Name': 'test-departino', Authorization: 'Bearer private-token' },
  };
  const runtime = resolveProvider({ source });
  const result = await module.exports.getDepartures({ stopId: '58366', modes: ['tram'], source: runtime.source });
  assert.equal(result.stopName, 'Proxy stop');
  assert.equal(request.url, source.endpoint);
  assert.equal(request.options.timeout, 4321);
  assert.equal(request.options.headers['et-client-name'], 'test-departino');
  assert.equal(request.options.headers.authorization, 'Bearer private-token');
  assert.equal(request.options.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(request.options.body).variables, { stopId: 'NSR:StopPlace:58366', modes: ['tram'] });
});

test('a new provider module needs no registry or application changes', async t => {
  const fs = require('node:fs/promises');
  const path = require('node:path');
  const os = require('node:os');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'departino-provider-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, 'providers'));
  await fs.copyFile(path.join(__dirname, '../lib/providers.js'), path.join(dir, 'providers.js'));
  await fs.writeFile(path.join(dir, 'providers/local-network.js'), `module.exports = {
    name: 'Local network', attribution: { name: 'Example source' },
    async getDepartures({ stopId, source }) {
      return { stopName: stopId + source.options.suffix, departures: [] };
    }
  };`);
  const { resolveProvider: resolve } = require(path.join(dir, 'providers.js'));
  const runtime = resolve({ source: { provider: 'local-network', options: { suffix: ' test' } } });
  assert.equal(runtime.display.timeZone, 'UTC');
  assert.deepEqual(await runtime.provider.getDepartures({ stopId: 'network:ABC', source: runtime.source }), {
    stopName: 'network:ABC test', departures: [],
  });
});

test('central configuration selects providers and validates source and display settings', () => {
  const example = require('../config.example.json');
  const oslo = resolveProvider(example);
  assert.equal(oslo.id, 'entur');
  assert.equal(oslo.source.endpoint, example.source.endpoint);
  assert.equal(oslo.source.headers['et-client-name'], 'departino-display');
  const demo = resolveProvider({ source: { provider: 'demo' }, display: { locale: 'en-GB', modeColors: { bus: '#123456' } } });
  assert.equal(demo.display.timeZone, 'Europe/Berlin');
  assert.equal(demo.display.locale, 'en-GB');
  assert.equal(demo.display.modeColors.bus, '#123456');
  assert.equal(demo.display.modeColors.metro, '#156c42');
  assert.throws(() => resolveProvider({ source: { provider: '../config' } }), /Invalid provider/);
  assert.throws(() => resolveProvider({ source: { provider: 'nonexistent' } }), /Could not load provider/);
  assert.throws(() => resolveProvider({ ...example, display: { timeZone: 'Not/AZone' } }), RangeError);
  for (const source of [
    { ...example.source, endpoint: undefined },
    { ...example.source, endpoint: 'file:///tmp/data' },
    { ...example.source, timeoutMs: -1 },
    { ...example.source, headers: {} },
    { ...example.source, headers: { Authorization: 'secret\nvalue' } },
  ]) assert.throws(() => resolveProvider({ ...example, source }), /source\./);
  assert.throws(() => resolveProvider({ ...example, display: { refreshSeconds: 0 } }), /refreshSeconds/);
});

test('public settings preserve opaque IDs but never publish endpoints or credentials', () => {
  const config = publicConfig({
    source: { provider: 'demo', endpoint: 'https://secret.invalid', headers: { Authorization: 'secret' }, options: { apiKey: 'secret' } },
    server: { token: 'secret' },
    display: {
      stops: [{ id: 'de:09162:AB-7', modes: ['metro'], secret: 'secret' }],
      apiKey: 'secret', modeColors: { metro: '#aabbcc', bus: 'red;display:none' },
    },
  });
  assert.equal(config.display.stops[0].id, 'de:09162:AB-7');
  assert.equal(config.display.modeColors.bus, undefined);
  assert.equal(config.source, undefined);
  assert.ok(!JSON.stringify(config).includes('secret'));
  assert.ok(!JSON.stringify(config).includes('Entur'));
});

test('shared formatting handles day boundaries, offsets, filtering and sorting', () => {
  const now = Date.parse('2026-10-03T22:55:00Z');
  const row = (departureTime, extra = {}) => ({ departureTime, line: 'U2', transportMode: 'metro', ...extra });
  const result = { stopName: 'Central', departures: [
    row('2026-10-04T01:15:00+02:00'), // 20 minutes
    row('2026-10-03T23:06:00Z', { color: '#abc', textColor: '#123456' }),
    row('2026-10-03T23:05:00Z'),
    row('2026-10-03T22:57:00Z'),
    row('2026-10-03T22:50:00Z'),
    row('2026-10-03T23:07:00Z', { cancelled: true }),
    row('2026-10-03T23:08:00Z', { transportMode: 'bus' }),
  ] };
  const data = formatDepartures(result, {
    now, modes: ['metro'], minMinutes: 5,
    display: { locale: 'en-GB', timeZone: 'Asia/Tokyo' },
  });
  assert.deepEqual(data.departures.map(d => d.diffMin), [10, 11, 20]);
  assert.deepEqual(data.departures.map(d => d.time), ['08:05', '08:06', '08:15']);
  assert.equal(data.departures[1].color, '#abc');
  assert.equal(data.departures[1].textColor, '#123456');
});

test('provider timestamps must be absolute, including across daylight saving changes', () => {
  const display = { locale: 'en-GB', timeZone: 'Europe/Berlin' };
  const result = { stopName: 'Central', departures: [
    { departureTime: '2026-10-25T00:50:00Z' },
    { departureTime: '2026-10-25T01:10:00Z' },
  ] };
  const data = formatDepartures(result, { display, now: Date.parse('2026-10-25T00:45:00Z') });
  assert.deepEqual(data.departures.map(d => [d.diffMin, d.time]), [[5, '02:50'], [25, '02:10']]);
  for (const timestamp of ['2026-10-25T02:15:00', 'invalidZ']) {
    assert.throws(() => formatDepartures({ stopName: 'Central', departures: [{ departureTime: timestamp }] }, { display }), /departureTime/);
  }
});
