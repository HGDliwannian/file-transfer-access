// AIGC START
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP_NAME = '快传';
const OUT_DIR = path.join(ROOT, 'dist', 'mac-arm64');
const TARGET_APP = path.join(OUT_DIR, `${APP_NAME}.app`);
const STALE_APP = path.join(OUT_DIR, 'Electron.app');

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function readDisplayName(appPath) {
  try {
    const plist = fs.readFileSync(path.join(appPath, 'Contents', 'Info.plist'), 'utf8');
    const m = plist.match(/<key>CFBundleDisplayName<\/key>\s*<string>([^<]+)<\/string>/);
    return m?.[1] || '';
  } catch {
    return '';
  }
}

if (!fs.existsSync(OUT_DIR)) {
  console.log('跳过 finalize：未找到', OUT_DIR);
  process.exit(0);
}

// 若只有 Electron.app 且显示名为「快传」，重命名为 快传.app
if (!fs.existsSync(TARGET_APP) && fs.existsSync(STALE_APP)) {
  const name = readDisplayName(STALE_APP);
  if (name === APP_NAME) {
    fs.renameSync(STALE_APP, TARGET_APP);
    console.log('✓ 已重命名 Electron.app → 快传.app');
  }
}

// 删除残留的 Electron.app（正确产物应为 快传.app）
if (fs.existsSync(STALE_APP)) {
  rmrf(STALE_APP);
  console.log('✓ 已删除残留 Electron.app');
}

// 删除其它非目标 .app
for (const entry of fs.readdirSync(OUT_DIR)) {
  if (!entry.endsWith('.app') || entry === `${APP_NAME}.app`) continue;
  const full = path.join(OUT_DIR, entry);
  rmrf(full);
  console.log('✓ 已删除多余应用', entry);
}

if (!fs.existsSync(TARGET_APP)) {
  console.error('✗ 打包结果异常：未找到 快传.app');
  process.exit(1);
}

console.log('✓ 最终产物：', TARGET_APP);
// AIGC END
