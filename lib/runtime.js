const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Computed at server startup, so a new frontend cannot hide an old backend.
function revision(root = path.resolve(__dirname, '..')) {
  const hash = crypto.createHash('sha256');
  function add(relative) {
    const file = path.join(root, relative);
    if (fs.statSync(file).isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) add(path.join(relative, name));
    } else hash.update(relative).update(fs.readFileSync(file));
  }
  for (const file of ['server.js', 'lib', 'public/index.html', 'package.json', 'package-lock.json']) add(file);
  return hash.digest('hex');
}

module.exports = { revision };
