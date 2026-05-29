// AIGC START
const fs = require('fs');
const path = require('path');
const os = require('os');
const pkg = require('../package.json');

const ROOT = path.join(__dirname, '..');
const APP_NAME = '快传';
const APP_PATH = path.join(ROOT, 'dist', 'mac-arm64', `${APP_NAME}.app`);
const BUILD_INFO_PATH = path.join(ROOT, 'public', 'build-info.json');

if (!fs.existsSync(APP_PATH)) {
  console.error('✗ 未找到', APP_PATH);
  process.exit(1);
}

let buildInfo = { version: pkg.version, buildTime: Date.now(), buildId: String(Date.now()) };
if (fs.existsSync(BUILD_INFO_PATH)) {
  buildInfo = JSON.parse(fs.readFileSync(BUILD_INFO_PATH, 'utf8'));
}

const userDataDir = path.join(os.homedir(), 'Library', 'Application Support', pkg.name);
fs.mkdirSync(userDataDir, { recursive: true });

const release = {
  version: buildInfo.version,
  buildTime: buildInfo.buildTime,
  buildId: buildInfo.buildId,
  appBundlePath: APP_PATH,
  publishedAt: new Date().toISOString(),
};

const releasePath = path.join(userDataDir, 'latest-release.json');
fs.writeFileSync(releasePath, JSON.stringify(release, null, 2));
console.log('✓ latest-release.json →', releasePath);
console.log('  版本', release.version, '| buildId', release.buildId);
// AIGC END
