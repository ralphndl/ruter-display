// Fake privileged commands for installer tests. Never touches host services/files.
const fs = require('node:fs');
const path = require('node:path');
const statePath = process.env.SYSTEMD_TEST_STATE;
if (!statePath) throw new Error('This fixture requires SYSTEMD_TEST_STATE');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
let command = path.basename(process.argv[1]);
let args = process.argv.slice(2);
if (command === 'sudo') [command, ...args] = args;
state.commands.push([command, ...args]);
let status = 0;
const unit = args.at(-1);
if (command === 'install') {
  if (args[0] !== '-m' || args[1] !== '644' || args[3] !== '/etc/systemd/system/departino.service') {
    throw new Error('Unexpected install arguments');
  }
  state.units['departino.service'] = {
    ...state.units['departino.service'], content: fs.readFileSync(args[2], 'utf8'),
  };
} else if (command === 'rm') {
  if (args[0] !== '-f' || !/^\/etc\/systemd\/system\/departino\.service$/.test(args[1])) {
    throw new Error('Unexpected removal');
  }
  delete state.units[path.basename(args[1])];
} else if (command === 'systemctl') {
  const value = state.units[unit];
  switch (args[0]) {
    case 'cat': status = value ? 0 : 1; break;
    case 'daemon-reload': break;
    case 'enable': if (value) value.enabled = true; else status = 1; break;
    case 'disable':
      if (value) { value.enabled = false; if (args.includes('--now')) value.active = false; }
      else status = 1;
      break;
    case 'restart':
      if (!value) status = 1;
      else value.active = true;
      break;
    default: throw new Error('Unexpected systemctl command');
  }
} else throw new Error(`Unexpected command: ${command}`);
fs.writeFileSync(statePath, JSON.stringify(state));
process.exit(status);
