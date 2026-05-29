// AIGC START
const { app, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function getPublicDir() {
  return path.join(__dirname, '..', 'public');
}

function readCurrentBuildInfo() {
  try {
    const raw = fs.readFileSync(path.join(getPublicDir(), 'build-info.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      version: app.getVersion(),
      buildTime: 0,
      buildId: 'dev',
    };
  }
}

function getLatestReleasePath() {
  return path.join(app.getPath('userData'), 'latest-release.json');
}

function readLatestRelease() {
  const p = getLatestReleasePath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function normalizePath(p) {
  return path.resolve(p).replace(/\/$/, '');
}

function isRunningBundle(bundlePath) {
  if (!bundlePath) return false;
  const exe = normalizePath(process.execPath);
  const bundle = normalizePath(bundlePath);
  return exe.startsWith(bundle + path.sep) || exe === bundle;
}

function checkForUpdate() {
  const current = readCurrentBuildInfo();
  const latest = readLatestRelease();

  if (!latest || !latest.appBundlePath) {
    return {
      available: false,
      current,
      latest: null,
      reason: 'no_release',
    };
  }

  if (!fs.existsSync(latest.appBundlePath)) {
    return {
      available: false,
      current,
      latest,
      reason: 'bundle_missing',
    };
  }

  if (isRunningBundle(latest.appBundlePath)) {
    return {
      available: false,
      current,
      latest,
      reason: 'already_latest',
    };
  }

  const newer =
    Number(latest.buildTime) > Number(current.buildTime) ||
    String(latest.buildId) !== String(current.buildId);

  return {
    available: newer,
    current,
    latest,
    reason: newer ? 'new_build' : 'same_build',
  };
}

async function applyUpdate(mainWindow) {
  const { available, latest } = checkForUpdate();
  if (!available || !latest?.appBundlePath) {
    return { ok: false, message: '当前已是最新版本' };
  }

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: '升级快传',
    message: `发现新版本 v${latest.version}`,
    detail: `将退出当前应用并打开最新构建。\n\n${latest.appBundlePath}`,
    buttons: ['立即升级', '取消'],
    defaultId: 0,
    cancelId: 1,
  });

  if (response !== 0) return { ok: false, message: '已取消' };

  const bundle = latest.appBundlePath;
  if (process.platform === 'darwin') {
    spawn('open', ['-a', bundle], { detached: true, stdio: 'ignore' }).unref();
  } else {
    shell.openPath(bundle);
  }

  app.isQuitting = true;
  app.quit();
  return { ok: true, message: '正在启动新版本…' };
}

module.exports = {
  readCurrentBuildInfo,
  readLatestRelease,
  checkForUpdate,
  applyUpdate,
};
// AIGC END
