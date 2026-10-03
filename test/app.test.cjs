const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { Script } = require('node:vm');

const root = path.resolve(__dirname, '..');
const example = require('../config.example.json');

async function isolatedApp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'departino-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const file of ['server.js', 'package.json', 'package-lock.json', 'config.example.json', 'lib', 'public']) {
    await fs.cp(path.join(root, file), path.join(dir, file), { recursive: true });
  }
  await fs.symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  return dir;
}

test('configuration uses the example, local settings and environment overrides', async t => {
  const dir = await isolatedApp(t);
  // Evaluate in a separate context so the developer's environment stays untouched.
  const env = {};
  const module = { exports: {} };
  new Script(await fs.readFile(path.join(dir, 'lib/config.js'), 'utf8')).runInNewContext({
    require, module, __dirname: path.join(dir, 'lib'), process: { env },
  });
  const config = module.exports;
  const plain = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(config.loadConfig()), example);
  assert.deepEqual(plain(config.loadServerConfig()), { port: example.server.port });
  await fs.writeFile(path.join(dir, 'config.json'), JSON.stringify({
    ...example, server: { port: 4040 },
  }));
  assert.deepEqual(plain(config.loadServerConfig()), { port: 4040 });
  env.PORT = '5050';
  assert.deepEqual(plain(config.loadServerConfig()), { port: 5050 });
  env.PORT = '0';
  assert.throws(() => config.loadServerConfig(), /server.port/);
});

async function startServer(t, config) {
  if (!config && process.env.TEST_BASE_URL) return process.env.TEST_BASE_URL;
  const dir = await isolatedApp(t);
  if (config) await fs.writeFile(path.join(dir, 'config.json'), JSON.stringify(config));
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, [
    '--require', path.join(__dirname, 'fixtures/entur.cjs'), path.join(dir, 'server.js'),
  ], {
    cwd: dir,
    env: { ...process.env, NODE_OPTIONS: '', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let spawnError;
  child.on('error', error => { spawnError = error; });
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null || spawnError) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    try { await exited; } finally { clearTimeout(timer); }
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError || child.exitCode !== null) throw new Error(`Server failed: ${spawnError || output}`);
    try {
      if ((await fetch(`${base}/api/config`, { signal: AbortSignal.timeout(500) })).ok) return base;
    } catch { /* Server is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not become ready: ${output}`);
}

test('application smoke tests', { timeout: 90000 }, async t => {
  const base = await startServer(t);
  const get = url => fetch(`${base}${url}`, { signal: AbortSignal.timeout(30000) });

  await t.test('an occupied port fails clearly instead of reporting successful startup', async t => {
    const dir = await isolatedApp(t);
    const child = spawn(process.execPath, [path.join(dir, 'server.js')], {
      cwd: dir,
      env: { ...process.env, NODE_OPTIONS: '', PORT: new URL(base).port },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    try {
      const [code] = await once(child, 'close');
      assert.equal(code, 1);
      assert.match(stderr, /already in use/);
      assert.ok(!stdout.includes('running on'));
    } finally { clearTimeout(timer); }
  });

  await t.test('public configuration excludes server settings', async () => {
    const response = await get('/api/config');
    assert.equal(response.status, 200);
    const { stops, count, size, theme } = example.display;
    const config = await response.json();
    assert.deepEqual({ stops: config.display.stops, count: config.display.count, size: config.display.size, theme: config.display.theme }, { stops, count, size, theme });
    assert.equal(config.provider.id, 'entur');
    assert.equal(config.provider.attribution.license, 'NLOD (data.norge.no/nlod)');
    assert.equal(config.display.timeZone, 'Europe/Oslo');
    assert.equal(config.server, undefined);
    assert.equal(config.source, undefined);
  });

  await t.test('departures filter modes, cancellations, past rides and walking time', async () => {
    const response = await get('/api/departures?stopId=NSR:StopPlace:58366&modes=tram&minMinutes=10');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.stopName, 'Test stop 58366');
    assert.deepEqual(data.departures.map(d => d.diffMin), [10, 11, 20]);
    for (const departure of data.departures) {
      assert.equal(departure.transportMode, 'tram');
      assert.equal(departure.line, '12');
      assert.equal(departure.destination, 'Fixture tram');
      assert.match(departure.time, /^\d{2}:\d{2}$/);
    }
    const defaults = await (await get('/api/departures')).json();
    assert.equal(defaults.stopName, `Test stop ${example.display.stops[0].id}`);
    assert.deepEqual([...new Set(defaults.departures.map(d => d.transportMode))], ['tram', 'metro', 'bus']);
    assert.deepEqual(defaults.departures.filter(d => d.transportMode === 'tram').map(d => d.diffMin), [2, 10, 11, 20]);
  });

  await t.test('upstream errors produce a controlled response', async () => {
    const response = await get('/api/departures?stopId=0');
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Fetch failed' });
  });

  await t.test('page is served and inline JavaScript parses', async () => {
    const response = await get('/');
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Departino/);
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length);
    for (const [, source] of scripts) new Script(source);
  });

  await t.test('browser layout and screenshot attribution', { skip: process.env.TEST_BROWSER !== '1' }, async t => {
    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateTimezone('Europe/Oslo');
    const query = 'stopId=58366&modes=tram&count=4';
    for (const [width, height] of [[1024, 600], [390, 844]]) {
      await page.setViewport({ width, height });
      await page.goto(`${base}/?${query}`, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      const times = await page.$$eval('.rel-time', nodes => nodes.map(node => node.textContent.trim()));
      assert.deepEqual(times.slice(0, 2), ['2 min', '10 min']);
      assert.equal(times.length, 4);
      for (const time of times.slice(2)) assert.match(time, /^\d{2}:\d{2}$/);
      await page.evaluate(() => document.body.classList.add('screenshot'));
      assert.equal(await page.$eval('.data-attribution a:last-child', node => node.href), 'https://data.norge.no/nlod');
      await checkScreenshot(page, get, query, width, height, 'entur');
    }
    assert.deepEqual(errors, []);

    await page.setRequestInterception(true);
    let response = { display: example.display };
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/config') {
        request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
      } else request.continue();
    });
    for (const [payload, expected] of [
      [{ display: example.display }, /Restart Departino/],
      [{ error: 'Invalid test configuration' }, /Invalid test configuration/],
    ]) {
      response = payload;
      await page.goto(base, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => window.departinoReady);
      assert.match(await page.$eval('#boards', el => el.textContent), expected);
      assert.ok(await page.evaluate(() => Boolean(window.departinoError)));
    }
    assert.deepEqual(errors, []);
  });
});

async function checkScreenshot(page, get, query, width, height, label) {
  const attribution = await page.$('.data-attribution');
  const box = await attribution.boundingBox();
  assert.ok(box.width > 0 && box.height > 0 && box.y >= 0 && box.y + box.height <= height);

  const reference = Buffer.from(await page.screenshot({ type: 'png' }));
  const response = await get(`/?${query}&screenshot=1&width=${width}&height=${height}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^image\/png/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const png = Buffer.from(await response.arrayBuffer());
  if (process.env.TEST_ARTIFACT_DIR) {
    await fs.mkdir(process.env.TEST_ARTIFACT_DIR, { recursive: true });
    await fs.writeFile(path.join(process.env.TEST_ARTIFACT_DIR, `${label}-${width}x${height}.png`), png);
  }
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), width);
  assert.equal(png.readUInt32BE(20), height);
  // Check the actual endpoint image against the visible browser footer. A valid
  // PNG alone would not catch attribution being cropped out of the picture.
  const difference = await page.evaluate(async ({ actual, expected, box }) => {
    async function pixels(data) {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(Math.ceil(box.x), Math.ceil(box.y), Math.floor(box.width), Math.floor(box.height)).data;
    }
    const a = await pixels(actual), b = await pixels(expected);
    let changed = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 10) changed++;
    return changed / a.length;
  }, { actual: png.toString('base64'), expected: reference.toString('base64'), box });
  assert.ok(difference < 0.01, `Screenshot attribution differs from visible footer (${difference})`);
}

test('a different provider works without Entur IDs, colours, attribution or timezone', { timeout: 90000 }, async t => {
  const config = {
    source: { provider: 'demo', endpoint: 'https://private-endpoint.invalid', headers: { Authorization: 'private-provider-key' } },
    server: { port: 3030, privateSetting: 'private-server-value' },
    display: {
      locale: 'en-GB', timeZone: 'Asia/Tokyo', modeColors: { bus: '#112233' }, refreshSeconds: 45,
      stops: [{ id: 'demo:central', modes: ['bus', 'metro'], minMinutes: { bus: 3, metro: 0 } }],
      count: 8,
    },
  };
  const base = await startServer(t, config);
  const get = url => fetch(`${base}${url}`, { signal: AbortSignal.timeout(30000) });
  const publicSettings = await (await get('/api/config')).json();
  assert.equal(publicSettings.provider.id, 'demo');
  assert.equal(publicSettings.display.stops[0].id, 'demo:central');
  assert.equal(publicSettings.display.timeZone, 'Asia/Tokyo');
  assert.ok(!JSON.stringify(publicSettings).includes('private-'));
  assert.ok(!JSON.stringify(publicSettings).includes('Entur'));
  const data = await (await get('/api/departures?stopId=demo%3Ariverside&modes=metro&minMinutes=10')).json();
  assert.equal(data.stopName, 'Demo Riverside');
  assert.deepEqual(data.departures.map(d => d.diffMin), [10, 11, 18, 25]);
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (const d of data.departures) {
    assert.equal(d.transportMode, 'metro');
    assert.equal(d.time, formatter.format(new Date(d.departureTime)));
    assert.equal(d.color, '#156c42');
  }
  assert.equal((await get('/api/departures?stopId=unknown')).status, 500);

  await t.test('browser and PNG use the selected provider, even on a device in another zone', { skip: process.env.TEST_BROWSER !== '1' }, async t => {
    const { default: puppeteer } = await import('puppeteer');
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateTimezone('America/Los_Angeles');
    await page.evaluateOnNewDocument(() => {
      const original = window.setInterval;
      window.intervalDelays = [];
      window.setInterval = (...args) => { window.intervalDelays.push(args[1]); return original(...args); };
    });
    await page.goto(base, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.departinoReady);
    assert.equal(await page.$eval('#stop-name', el => el.textContent), 'Demo Central');
    assert.ok((await page.evaluate(() => window.intervalDelays)).includes(45000));
    assert.equal(await page.$eval('.rel-time', el => el.textContent.trim()), '5 min');
    assert.equal(await page.$eval('.line-badge', el => getComputedStyle(el).backgroundColor), 'rgb(17, 34, 51)');
    assert.deepEqual(await page.$$eval('.group-title', nodes => nodes.map(el => el.textContent)), ['Bus', 'Metro']);
    assert.equal(await page.$eval('.group:last-child .line-badge', el => getComputedStyle(el).backgroundColor), 'rgb(21, 108, 66)');
    assert.equal(await page.evaluate(() => {
      const now = new Date();
      const time = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      updateClock();
      const hour = Number(time.split(':')[0]);
      return document.getElementById('clock').textContent === time && isNight() === (hour >= 19 || hour < 7);
    }), true);

    // Repeated URL parameters must preserve namespaced IDs in both browser and PNG.
    const query = 'stopId=demo%3Acentral&stopId=demo%3Ariverside&modes=bus&count=4';
    for (const [width, height] of [[1024, 600], [390, 844]]) {
      await page.setViewport({ width, height });
      await page.goto(`${base}/?${query}`, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      assert.deepEqual(await page.$$eval('.board-name', nodes => nodes.map(el => el.textContent)), ['Demo Central', 'Demo Riverside']);
      assert.match(await page.$eval('.data-attribution', el => el.textContent), /Departino demo data/);
      assert.ok(!await page.$eval('.display-footer', el => /Entur|Ruter|NLOD/.test(el.textContent)));
      await page.evaluate(() => document.body.classList.add('screenshot'));
      await checkScreenshot(page, get, query, width, height, 'demo');
    }
    assert.deepEqual(errors, []);
  });
});
