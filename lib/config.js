const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// Read again on each request so display settings apply after a page reload.
function loadConfig() {
  const local = path.join(root, 'config.json');
  const file = fs.existsSync(local) ? local : path.join(root, 'config.example.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadServerConfig() {
  const config = loadConfig().server || {};
  // Keep environment overrides compatible with existing launch commands.
  const port = Number(process.env.PORT || (config.port ?? 3030));
  const clientName = process.env.ET_CLIENT_NAME || (config.clientName ?? 'oslo-departures');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('server.port must be an integer between 1 and 65535');
  }
  if (typeof clientName !== 'string' || !/^[\x20-\x7e]+$/.test(clientName) || !clientName.trim()) {
    throw new Error('server.clientName must be a non-empty ASCII string');
  }
  return { port, clientName };
}

module.exports = { loadConfig, loadServerConfig };
