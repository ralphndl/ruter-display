const path = require('node:path');
const { validateHeaderName, validateHeaderValue } = require('node:http');

const VALID_MODES = ['tram', 'metro', 'bus', 'rail', 'water', 'coach'];
const isColor = value => typeof value === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value);

function resolveProvider(config) {
  const id = config.source?.provider;
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('Invalid provider ID');
  let provider;
  try { provider = require(path.join(__dirname, 'providers', `${id}.js`)); }
  catch (error) { throw new Error(`Could not load provider "${id}"`, { cause: error }); }
  if (typeof provider.getDepartures !== 'function' || !provider.name || !provider.attribution?.name) {
    throw new Error(`Provider "${id}" must export name, attribution.name and getDepartures`);
  }
  const source = { ...config.source, timeoutMs: config.source.timeoutMs ?? 10000, headers: config.source.headers ?? {} };
  if (provider.requiresEndpoint || source.endpoint !== undefined) {
    let url;
    try { url = new URL(source.endpoint); } catch { throw new Error('source.endpoint must be an absolute HTTP(S) URL'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('source.endpoint must use HTTP(S)');
  }
  if (!Number.isInteger(source.timeoutMs) || source.timeoutMs < 1 || source.timeoutMs > 60000) {
    throw new Error('source.timeoutMs must be an integer between 1 and 60000');
  }
  if (!source.headers || typeof source.headers !== 'object' || Array.isArray(source.headers)) {
    throw new Error('source.headers must be an object');
  }
  // Normalize names so custom headers override defaults regardless of casing.
  source.headers = Object.fromEntries(Object.entries(source.headers).map(([name, value]) => {
    try {
      if (typeof value !== 'string') throw new Error();
      validateHeaderName(name);
      validateHeaderValue(name, value);
    } catch { throw new Error('source.headers contains an invalid HTTP header'); }
    return [name.toLowerCase(), value];
  }));
  for (const header of provider.requiredHeaders || []) {
    if (!source.headers[header.toLowerCase()]?.trim()) throw new Error(`source.headers requires ${header}`);
  }
  const settings = config.display || {};
  const display = {
    stops: (settings.stops || []).map(({ id, modes, minMinutes }) => ({ id, modes, minMinutes })),
    count: settings.count ?? 7, size: settings.size ?? 'normal', theme: settings.theme ?? {},
    refreshSeconds: settings.refreshSeconds ?? 30,
    timeZone: settings.timeZone ?? provider.defaults?.timeZone ?? 'UTC',
    locale: settings.locale ?? provider.defaults?.locale ?? 'en-GB',
    modeColors: { ...provider.defaults?.modeColors, ...settings.modeColors },
  };
  if (!Number.isInteger(display.refreshSeconds) || display.refreshSeconds < 5 || display.refreshSeconds > 3600) {
    throw new Error('display.refreshSeconds must be an integer between 5 and 3600');
  }
  // Fail clearly rather than silently using the machine's timezone.
  new Intl.DateTimeFormat(display.locale, { timeZone: display.timeZone }).format();
  display.modeColors = Object.fromEntries(Object.entries(display.modeColors)
    .filter(([mode, color]) => VALID_MODES.includes(mode) && isColor(color)));
  return { id, provider, source, display };
}

function publicConfig(config, runtime = resolveProvider(config)) {
  const { id, provider, display } = runtime;
  const { name, url, license, licenseUrl } = provider.attribution;
  return {
    display,
    provider: {
      id, name: provider.name, notice: provider.notice || 'Independent departure board.',
      attribution: { name, url, license, licenseUrl },
    },
  };
}

module.exports = { resolveProvider, publicConfig, VALID_MODES, isColor };
