const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const hasMake = spawnSync('make', ['--version']).status === 0;

async function installer(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'departino-service-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let checkout = path.join(dir, 'project with space %');
  const bin = path.join(dir, 'bin');
  await fs.mkdir(path.join(checkout, 'scripts'), { recursive: true });
  checkout = await fs.realpath(checkout);
  await fs.mkdir(bin);
  const root = path.resolve(__dirname, '..');
  await fs.copyFile(path.join(root, 'scripts/systemd-service.sh'), path.join(checkout, 'scripts/systemd-service.sh'));
  await fs.copyFile(path.join(root, 'Makefile'), path.join(checkout, 'Makefile'));
  // Fail if local cleanup runs while this checkout still has a supervised server.
  await fs.writeFile(path.join(checkout, 'scripts/local-server.js'), `
    const fs = require('node:fs');
    const state = JSON.parse(fs.readFileSync(process.env.SYSTEMD_TEST_STATE));
    if (Object.values(state.units).some(unit => unit.active && unit.directory === process.cwd())) process.exit(1);
    state.commands.push(['local-stop']);
    fs.writeFileSync(process.env.SYSTEMD_TEST_STATE, JSON.stringify(state));
  `);
  await fs.writeFile(path.join(bin, 'npm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await fs.writeFile(path.join(checkout, 'config.json'), '{"personal":"unchanged"}');
  const mock = await fs.readFile(path.join(__dirname, 'fixtures/systemd-command.cjs'), 'utf8');
  for (const name of ['sudo', 'systemctl']) {
    await fs.writeFile(path.join(bin, name), '#!/usr/bin/env node\n' + mock, { mode: 0o755 });
  }
  const state = path.join(dir, 'state.json');
  await fs.writeFile(state, JSON.stringify({ units: {}, commands: [] }));
  return {
    checkout,
    read: async () => JSON.parse(await fs.readFile(state, 'utf8')),
    seed: units => fs.writeFile(state, JSON.stringify({ units, commands: [] })),
    service: () => spawnSync('make', ['service'], {
      cwd: checkout, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', PATH: `${bin}:${process.env.PATH}`, SYSTEMD_TEST_STATE: state },
    }),
    run: action => spawnSync('sh', [path.join(checkout, 'scripts/systemd-service.sh'), action], {
      cwd: checkout, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', PATH: `${bin}:${process.env.PATH}`, SYSTEMD_TEST_STATE: state },
    }),
  };
}

test('fresh installation, uninstall guard and repeated removal use Departino', async t => {
  const fixture = await installer(t);
  assert.equal(fixture.run('check-uninstalled').status, 0);
  assert.equal(fixture.run('install').status, 0);
  assert.equal(fixture.run('check-uninstalled').status, 1);
  const state = await fixture.read();
  assert.equal(state.units['departino.service'].active, true);
  assert.ok(state.units['departino.service'].content.includes(`WorkingDirectory="${fixture.checkout.replace(/%/g, '%%')}"`));
  assert.equal(await fs.readFile(path.join(fixture.checkout, 'config.json'), 'utf8'), '{"personal":"unchanged"}');
  assert.equal(fixture.run('install').status, 0);
  assert.equal(fixture.run('uninstall').status, 0);
  assert.deepEqual((await fixture.read()).units, {});
  assert.equal(fixture.run('uninstall').status, 0);
  assert.equal(fixture.run('check-uninstalled').status, 0);
});

test('make service stops supervised instances before local cleanup, including the old service name', { skip: !hasMake }, async t => {
  const fixture = await installer(t);
  await fixture.seed({
    'departino.service': { active: true, directory: fixture.checkout },
    'ruter-display.service': { active: true, enabled: true, directory: fixture.checkout },
  });
  const result = fixture.service();
  assert.equal(result.status, 0, result.stderr);
  const state = await fixture.read();
  assert.equal(state.units['departino.service'].active, true);
  assert.equal(state.units['ruter-display.service'].active, false);
  assert.equal(state.units['ruter-display.service'].enabled, false);
  assert.ok(state.commands.findIndex(c => c[0] === 'local-stop') > state.commands.findIndex(c => c[1] === 'stop'));
  assert.equal(fixture.service().status, 0);
});

test('make service leaves an old service from another checkout untouched', { skip: !hasMake }, async t => {
  const fixture = await installer(t);
  await fixture.seed({ 'ruter-display.service': { active: true, enabled: true, directory: '/another/checkout' } });
  const result = fixture.service();
  assert.equal(result.status, 0, result.stderr);
  const state = await fixture.read();
  assert.equal(state.units['ruter-display.service'].active, true);
  assert.equal(state.units['ruter-display.service'].enabled, true);
});
