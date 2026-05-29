// AIGC START
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

const info = {
  version: pkg.version,
  buildTime: Date.now(),
  buildId: String(Date.now()),
};

const out = path.join(__dirname, '..', 'public', 'build-info.json');
fs.writeFileSync(out, JSON.stringify(info, null, 2));
console.log('✓ build-info.json', info.version, info.buildId);
// AIGC END
