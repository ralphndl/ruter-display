const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn, execFile } = require('node:child_process');
const { once } = require('node:events');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = path.resolve(__dirname, '..');

async function fixture(t, { child = false, stubborn = false } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'departino local-'));
  const listener = http.createServer((req, res) => res.end('foreign server'));
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  for (const name of ['lib', 'public', 'package.json', 'package-lock.json']) {
    await fs.cp(path.join(root, name), path.join(dir, name), { recursive: true });
  }
  await fs.mkdir(path.join(dir, 'scripts'));
  await fs.mkdir(path.join(dir, '.cache'));
  await fs.copyFile(path.join(root, 'scripts/local-server.js'), path.join(dir, 'scripts/local-server.js'));
  await fs.writeFile(path.join(dir, 'config.json'), JSON.stringify({ server: { port }, source: { provider: 'demo' } }));
  await fs.writeFile(path.join(dir, 'server.js'), `
    const http = require('node:http');
    const fs = require('node:fs');
    const { spawn } = require('node:child_process');
    const port = require('./lib/config').loadServerConfig().port;
    const revision = require('./lib/runtime').revision();
    ${stubborn ? "process.on('SIGTERM', () => {});" : ''}
    ${child ? `const child = spawn(process.execPath, ['-e', "${stubborn ? "process.on('SIGTERM', () => {});" : ''}setInterval(() => {}, 1000)"], { stdio: 'ignore' });
      fs.writeFileSync('.cache/test-child.pid', String(child.pid));` : ''}
    http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ app: 'departino', pid: process.pid, revision }));
    }).listen(port);
  `);
  const env = { ...process.env, PORT: String(port), NODE_OPTIONS: '' };
  const run = async action => {
    try { return { code: 0, ...await exec(process.execPath, ['scripts/local-server.js', action], { cwd: dir, env, timeout: 25000 }) }; }
    catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
  };
  const health = async () => {
    try { return await (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(300) })).json(); }
    catch { return null; }
  };
  const ready = async () => {
    for (let i = 0; i < 100; i++) { const result = await health(); if (result) return result; await delay(50); }
    throw new Error('Fixture did not start');
  };
  t.after(async () => {
    await run('stop');
    if (listener.listening) await new Promise(resolve => listener.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  });
  return { dir, port, env, run, health, ready, listener };
}

test('local lifecycle serializes starts, recovers state and replaces outdated code', { timeout: 40000 }, async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.dir, '.cache/server.pid'), '99999999');
  await fs.writeFile(path.join(f.dir, '.cache/server.lock'), JSON.stringify({ pid: 99999999, started: 'old', signature: 'old' }));
  const starts = await Promise.all([f.run('start'), f.run('start')]);
  for (const result of starts) assert.equal(result.code, 0, result.stderr);
  const first = await f.ready();
  await fs.rm(path.join(f.dir, '.cache/server.pid'));
  assert.equal((await f.run('start')).code, 0);
  assert.equal((await f.ready()).pid, first.pid);
  assert.match((await f.run('status')).stdout, /running at/);
  await fs.appendFile(path.join(f.dir, 'server.js'), '\n// changed backend\n');
  assert.equal((await f.run('start')).code, 0);
  assert.notEqual((await f.ready()).pid, first.pid);
  assert.equal((await f.run('stop')).code, 0);
  assert.equal(await f.health(), null);
  assert.equal((await f.run('stop')).code, 0);
  await assert.rejects(fs.stat(path.join(f.dir, '.cache/server.pid')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(f.dir, '.cache/server.lock')), { code: 'ENOENT' });
});

test('stop finds manual relative starts and watch processes without a PID file', { timeout: 40000 }, async t => {
  const f = await fixture(t);
  for (const args of [['server.js'], ['--watch', 'server.js']]) {
    const child = spawn(process.execPath, args, { cwd: f.dir, env: f.env, stdio: 'ignore' });
    const exited = once(child, 'exit');
    await f.ready();
    const result = await f.run('stop');
    assert.equal(result.code, 0, result.stderr);
    await exited;
    await delay(250);
    assert.equal(await f.health(), null);
  }
});

test('foreign port owners and unrelated PIDs are never killed', { timeout: 30000 }, async t => {
  const f = await fixture(t);
  f.listener.listen(f.port, '127.0.0.1');
  await once(f.listener, 'listening');
  await fs.writeFile(path.join(f.dir, '.cache/server.pid'), String(process.pid));
  const result = await f.run('start');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /another process/);
  assert.equal((await f.run('stop')).code, 0);
  assert.equal(await (await fetch(`http://127.0.0.1:${f.port}`)).text(), 'foreign server');
});

test('stop removes hung server processes and their children', { timeout: 30000 }, async t => {
  const f = await fixture(t, { child: true, stubborn: true });
  const started = await f.run('start');
  assert.equal(started.code, 0, started.stderr);
  const result = await f.run('stop');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await f.health(), null);
  const childPid = Number(await fs.readFile(path.join(f.dir, '.cache/test-child.pid'), 'utf8'));
  // Linux can briefly retain an already-dead orphan as a zombie until init reaps it.
  try {
    process.kill(childPid, 0);
    if (process.platform === 'linux') assert.match(await fs.readFile(`/proc/${childPid}/stat`, 'utf8'), /\) Z /);
    else {
      const result = await exec('ps', ['-p', String(childPid), '-o', 'stat=']);
      assert.match(result.stdout.trim(), /^Z/);
    }
  } catch (error) {
    if (error.code !== 'ESRCH' && error.code !== 'ENOENT' && !(error.code === 1 && error.cmd?.startsWith('ps '))) throw error;
  }
});
