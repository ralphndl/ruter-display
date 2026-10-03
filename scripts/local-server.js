#!/usr/bin/env node
// macOS/Linux process management. Never trust a PID file or a port alone.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { loadServerConfig, loadConfig } = require('../lib/config');
const { resolveProvider } = require('../lib/providers');
const { revision } = require('../lib/runtime');

const root = fs.realpathSync(path.resolve(__dirname, '..'));
const entry = path.join(root, 'server.js');
const cache = path.join(root, '.cache');
const stateFile = path.join(cache, 'server.pid');
const logFile = path.join(cache, 'server.log');
const lockFile = path.join(cache, 'server.lock');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const read = file => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } };
const real = file => { try { return fs.realpathSync(file); } catch { return file; } };
const command = (name, args) => execFileSync(name, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function processes() {
  if (process.platform === 'linux') {
    return fs.readdirSync('/proc').filter(name => /^\d+$/.test(name)).flatMap(name => {
      try {
        const base = `/proc/${name}`;
        const stat = read(`${base}/stat`);
        const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        if (fields[0] === 'Z') return [];
        const uid = Number(read(`${base}/status`).match(/^Uid:\s+(\d+)/m)?.[1]);
        if (uid !== process.getuid()) return [];
        const argv = read(`${base}/cmdline`).split('\0').filter(Boolean);
        return [{ pid: Number(name), ppid: Number(fields[1]), started: fields[19], argv,
          signature: JSON.stringify(argv), base }];
      } catch { return []; }
    });
  }
  if (process.platform !== 'darwin') throw new Error('Local service commands support macOS and Linux.');
  return command('ps', ['-axo', 'pid=,ppid=,uid=,lstart=,args=']).split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/);
    if (!match || Number(match[3]) !== process.getuid()) return [];
    return [{ pid: Number(match[1]), ppid: Number(match[2]), started: match[4], signature: match[5] }];
  });
}

function isServer(info) {
  if (info.pid === process.pid) return false;
  try {
    let script;
    if (info.argv) {
      if (!/^node(js)?$/.test(path.basename(fs.readlinkSync(`${info.base}/exe`)).replace(/ \(deleted\)$/, ''))) return false;
      const args = info.argv.slice(1);
      while (['--watch', '--watch-preserve-output'].includes(args[0])) args.shift();
      // Do not mistake `node -e ...`, preload scripts or unrelated arguments for a server.
      if (args.length !== 1 || args[0].startsWith('-')) return false;
      script = args[0];
    } else {
      if (!info.signature.includes('server.js')) return false;
      if (!/^node(js)?$/.test(path.basename(command('ps', ['-p', String(info.pid), '-o', 'comm='])))) return false;
      const match = info.signature.match(/^(?:\S*\/)?node(?:js)?\s+((?:--watch(?:-preserve-output)?\s+)*)(.+)$/);
      if (!match) return false;
      script = match[2];
    }
    if (path.isAbsolute(script)) return real(script) === entry;
    const cwd = info.base ? fs.readlinkSync(`${info.base}/cwd`)
      : command('lsof', ['-a', '-p', String(info.pid), '-d', 'cwd', '-Fn']).split('\n').find(line => line.startsWith('n'))?.slice(1);
    return Boolean(cwd) && real(path.resolve(cwd, script)) === entry;
  } catch { return false; }
}

const same = (a, b) => a && b && a.pid === b.pid && a.started === b.started && a.signature === b.signature;
function current(info) { return processes().find(candidate => same(info, candidate)); }
function ownServers() { return processes().filter(isServer); }
function assertNotSupervised(servers) {
  if (servers.some(info => info.base && /(?:^|\0)INVOCATION_ID=/.test(read(`${info.base}/environ`)))) {
    throw new Error('This checkout is running under systemd. Use make unservice to stop that service.');
  }
}
function saveState(info, port) { fs.writeFileSync(stateFile, JSON.stringify({ ...info, port }) + '\n', { mode: 0o600 }); }

async function lock() {
  fs.mkdirSync(cache, { recursive: true });
  const me = processes().find(info => info.pid === process.pid);
  if (!me) throw new Error('Cannot identify the local process; no server was changed.');
  // Hard-link a complete record atomically: other commands never see a half-written lock.
  const temporary = `${lockFile}.${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify(me), { mode: 0o600 });
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        fs.linkSync(temporary, lockFile);
        return () => { if (read(lockFile) === JSON.stringify(me)) fs.unlinkSync(lockFile); };
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const record = read(lockFile);
        let owner;
        try { owner = JSON.parse(record); } catch { throw new Error('Invalid local lock. Remove .cache/server.lock after checking no start/stop command is running.'); }
        if (!current(owner) && read(lockFile) === record) {
          try { fs.unlinkSync(lockFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        } else await sleep(100);
      }
    }
    throw new Error('Another start/stop command is still running. Try again shortly.');
  } finally { fs.rmSync(temporary, { force: true }); }
}

async function stopServers() {
  const all = processes();
  const servers = all.filter(isServer);
  assertNotSupervised(servers);
  const targets = new Map(servers.map(info => [info.pid, info]));
  // Include watch children and screenshot browsers, but never the terminal/npm parent.
  let changed;
  do {
    changed = false;
    for (const info of all) if (targets.has(info.ppid) && !targets.has(info.pid)) {
      targets.set(info.pid, info); changed = true;
    }
  } while (changed);
  const ordered = [...targets.values()].sort((a, b) => {
    const depth = info => { let n = 0; while (targets.has(info.ppid)) { n++; info = targets.get(info.ppid); } return n; };
    return depth(a) - depth(b);
  });
  function signal(info, name) {
    if (current(info)) { try { process.kill(info.pid, name); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  }
  for (const info of ordered) signal(info, 'SIGTERM');
  for (let attempt = 0; attempt < 30 && ordered.some(current); attempt++) await sleep(100);
  // A hung process must not leave the port or child processes behind.
  for (const info of ordered) signal(info, 'SIGKILL');
  for (let attempt = 0; attempt < 20 && ordered.some(current); attempt++) await sleep(100);
  if (ordered.some(current) || ownServers().length) throw new Error('A project process is still running; keeping the PID record.');
  fs.rmSync(stateFile, { force: true });
  return servers.length;
}

async function healthy(port, expected) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) });
    const data = await response.json();
    return response.ok && data.app === 'departino' && data.revision === expected ? data : null;
  } catch { return null; }
}
async function available(port) {
  // A wildcard bind can coexist with a specific-address listener on macOS.
  // Check reachable loopback listeners as well as wildcard binding conflicts.
  for (const host of ['127.0.0.1', '::1']) {
    const occupied = await new Promise(resolve => {
      const socket = net.createConnection({ host, port });
      const finish = value => { socket.destroy(); resolve(value); };
      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
      socket.setTimeout(500, () => finish(false));
    });
    if (occupied) throw Object.assign(new Error('Port occupied'), { code: 'EADDRINUSE' });
  }
  for (const host of ['0.0.0.0', '::']) {
    try {
      await new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once('error', reject);
        probe.listen(port, host, () => probe.close(resolve));
      });
    } catch (error) {
      if (host === '::' && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) continue;
      throw error;
    }
  }
}

async function startServer(force) {
  const { port } = loadServerConfig();
  resolveProvider(loadConfig());
  const expected = revision();
  const servers = ownServers();
  assertNotSupervised(servers);
  const ready = await healthy(port, expected);
  if (!force && servers.length === 1 && ready?.pid === servers[0].pid) {
    saveState(servers[0], port);
    console.log(`Local server already running at http://localhost:${port} (PID ${ready.pid}).`);
    return;
  }
  await stopServers();
  try { await available(port); } catch (error) {
    if (error.code === 'EADDRINUSE') throw new Error(`Port ${port} is used by another process. It was not stopped. Choose another server.port or stop that application.`);
    throw error;
  }
  const log = fs.openSync(logFile, 'a', 0o600);
  const child = spawn(process.execPath, [entry], {
    cwd: root, env: { ...process.env, PORT: String(port) }, detached: true,
    stdio: ['ignore', log, log],
  });
  fs.closeSync(log);
  let failed;
  child.on('error', error => { failed = error; });
  child.unref();
  const deadline = Date.now() + 10000;
  for (let attempt = 0; Date.now() < deadline; attempt++) {
    if (failed || child.exitCode !== null || child.signalCode !== null) break;
    const info = ownServers().find(info => info.pid === child.pid);
    if (!info && attempt > 0) break;
    if (info) saveState(info, port);
    const health = await healthy(port, expected);
    if (info && health?.pid === child.pid) {
      console.log(`Local server started at http://localhost:${port} (PID ${child.pid}).\nLog: ${logFile}`);
      return;
    }
    await sleep(100);
  }
  await stopServers();
  throw new Error(`Server did not become ready. ${failed?.message || ''}\nCheck ${logFile}`);
}

async function main() {
  const action = process.argv[2];
  if (!['start', 'stop', 'restart', 'status'].includes(action)) throw new Error('Usage: local-server.js start|stop|restart|status');
  const unlock = await lock();
  try {
    if (action === 'stop') {
      console.log(await stopServers() ? 'Local server and its child processes stopped.' : 'Local server is not running.');
    } else if (action === 'status') {
      const servers = ownServers();
      if (!servers.length) { fs.rmSync(stateFile, { force: true }); console.log('Local server is not running.'); return; }
      const { port } = loadServerConfig();
      const health = await healthy(port, revision());
      console.log(servers.some(info => info.pid === health?.pid)
        ? `Local server running at http://localhost:${port} (PID ${health.pid}).`
        : `Project processes found (${servers.map(info => info.pid).join(', ')}), but the configured server is not current/ready. Run make restart.`);
    } else await startServer(action === 'restart');
  } finally { unlock(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
