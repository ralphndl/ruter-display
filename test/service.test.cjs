const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

async function installer(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'departino-service-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const checkout = path.join(dir, 'project with space %');
  const bin = path.join(dir, 'bin');
  await fs.mkdir(path.join(checkout, 'scripts'), { recursive: true });
  await fs.mkdir(bin);
  const root = path.resolve(__dirname, '..');
  await fs.copyFile(path.join(root, 'scripts/systemd-service.sh'), path.join(checkout, 'scripts/systemd-service.sh'));
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
    run: action => spawnSync('sh', [path.join(checkout, 'scripts/systemd-service.sh'), action], {
      encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', PATH: `${bin}:${process.env.PATH}`, SYSTEMD_TEST_STATE: state },
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
