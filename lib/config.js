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
  // Compose fixes the container port; all normal settings live in config.json.
  const port = Number(process.env.PORT || (config.port ?? 3030));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('server.port must be an integer between 1 and 65535');
  }
  return { port };
}

module.exports = { loadConfig, loadServerConfig };
