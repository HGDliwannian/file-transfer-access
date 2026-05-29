const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell, Notification, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const { createServer, DEFAULT_PORT } = require('../server/index');
const {
  readCurrentBuildInfo,
  checkForUpdate,
  applyUpdate,
} = require('./update');

const isDev = !app.isPackaged || process.argv.includes('--dev');
let mainWindow = null;
let tray = null;
let fileServer = null;
let windowStateBeforeHide = { maximized: false, fullScreen: false, bounds: null };

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(cfg, null, 2));
}

const SAVE_FOLDER_NAME = '快速互传';

function defaultSaveDir() {
  return path.join(app.getPath('downloads'), SAVE_FOLDER_NAME);
}

function legacySaveDirs() {
  return [
    path.join(app.getPath('documents'), '快传接收'),
    app.getPath('downloads'),
  ];
}

function resolveSaveDir(cfg) {
  const def = defaultSaveDir();
  if (!cfg.saveDir || legacySaveDirs().includes(cfg.saveDir)) {
    return def;
  }
  return cfg.saveDir;
}

function getPublicDir() {
  return path.join(__dirname, '..', 'public');
}

function applyLaunchAtLogin(enabled) {
  if (!['darwin', 'win32', 'linux'].includes(process.platform)) return;
  if (!enabled) {
    app.setLoginItemSettings({ openAtLogin: false, name: '快传' });
    return;
  }
  const opts = {
    openAtLogin: true,
    openAsHidden: true,
    name: '快传',
  };
  if (app.isPackaged) {
    app.setLoginItemSettings(opts);
  } else {
    app.setLoginItemSettings({
      ...opts,
      path: process.execPath,
      args: [path.resolve(__dirname, '..')],
    });
  }
}

function notifyUpdateAvailable(result) {
  if (!result?.available) return;
  if (Notification.isSupported()) {
    new Notification({
      title: '快传有新版本',
      body: `v${result.latest.version} 已就绪，点击应用内「立即升级」`,
    }).show();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-available', result);
  }
}

function runUpdateCheck(silent = true) {
  const result = checkForUpdate();
  if (result.available) {
    const cfg = loadConfig();
    if (cfg.dismissedBuildId === result.latest.buildId) return result;
    notifyUpdateAvailable(result);
  } else if (!silent && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-check-result', result);
  }
  return result;
}

function notifyNewFile(file) {
  if (Notification.isSupported()) {
    new Notification({
      title: '收到新文件',
      body: file.originalName || file.name,
    }).show();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('file-uploaded', file);
  }
}

async function startServer() {
  const cfg = loadConfig();
  const saveDir = resolveSaveDir(cfg);
  if (cfg.saveDir !== saveDir) {
    cfg.saveDir = saveDir;
    saveConfig(cfg);
  }
  fs.mkdirSync(saveDir, { recursive: true });

  if (fileServer) {
    await fileServer.stop();
  }

  fileServer = createServer({
    saveDir,
    publicDir: getPublicDir(),
    port: cfg.port || DEFAULT_PORT,
    onUpload: notifyNewFile,
    getUpdateCheck: checkForUpdate,
  });

  const info = await fileServer.start();
  return { ...info, saveDir };
}

function createWindow(serverUrl) {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 360,
    minHeight: 480,
    title: '快传',
    backgroundColor: '#1e1e1e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadURL(serverUrl);
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      hideMainWindow();
    }
  });
}

function forceHideWindow(win) {
  win.hide();
  if (!win.isVisible()) return;

  if (!windowStateBeforeHide.bounds) {
    windowStateBeforeHide.bounds = win.getBounds();
  }
  const bounds = win.getBounds();
  win.setBounds({ x: -32000, y: -32000, width: bounds.width, height: bounds.height }, false);
  win.hide();
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const win = mainWindow;
  windowStateBeforeHide = {
    maximized: win.isMaximized(),
    fullScreen: win.isFullScreen(),
    bounds: null,
  };

  if (process.platform === 'darwin' && windowStateBeforeHide.fullScreen) {
    win.setOpacity(0);
    win.setFullScreen(false);
    win.once('leave-full-screen', () => {
      forceHideWindow(win);
      if (!win.isDestroyed()) win.setOpacity(1);
    });
    return;
  }

  if (process.platform === 'darwin' && windowStateBeforeHide.maximized) {
    win.setOpacity(0);
    win.setBounds(win.getNormalBounds(), false);
    forceHideWindow(win);
    win.setOpacity(1);
    return;
  }

  forceHideWindow(win);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const { maximized, fullScreen, bounds } = windowStateBeforeHide;
  mainWindow.show();

  if (process.platform === 'darwin') {
    if (fullScreen) {
      mainWindow.setFullScreen(true);
    } else if (maximized) {
      mainWindow.maximize();
    } else if (bounds) {
      mainWindow.setBounds(bounds, false);
    }
  } else if (bounds) {
    mainWindow.setBounds(bounds, false);
  }

  windowStateBeforeHide.bounds = null;
  mainWindow.focus();
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray.png');
  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon.isEmpty() ? nativeImage.createFromDataURL(TRAY_ICON_DATA) : icon);
  tray.setToolTip('快传 - 局域网文件互传');
  updateTrayMenu();
  tray.on('double-click', () => {
    showMainWindow();
  });
}

function updateTrayMenu() {
  const cfg = loadConfig();
  const launchEnabled = cfg.launchAtLogin === true;
  const menu = Menu.buildFromTemplate([
    { label: '打开主窗口', click: () => showMainWindow() },
    { label: '打开共享文件夹', click: () => shell.openPath(fileServer?.getSaveDir() || defaultSaveDir()) },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: launchEnabled,
      click: (item) => {
        const cfg = loadConfig();
        cfg.launchAtLogin = item.checked;
        saveConfig(cfg);
        applyLaunchAtLogin(item.checked);
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray?.setContextMenu(menu);
}

const TRAY_ICON_DATA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIklEQVQ4T2NkYGD4z0ABYBw1gGE0DBhGQ8NgGA0DBhGQ8AAA0Q8BfqQh6QAAAABJRU5ErkJggg==';

ipcMain.handle('get-status', async () => {
  if (!fileServer) await startServer();
  const ip = fileServer.getLanIp();
  const port = fileServer.port;
  const pageUrl = `http://${ip}:${port}/mobile.html`;
  const qrDataUrl = await QRCode.toDataURL(pageUrl, { width: 200, margin: 1 });
  return {
    ip,
    port,
    url: `http://127.0.0.1:${port}/`,
    mobileUrl: pageUrl,
    qrDataUrl,
    saveDir: fileServer.getSaveDir(),
  };
});

ipcMain.handle('get-settings', () => {
  const cfg = loadConfig();
  return { launchAtLogin: cfg.launchAtLogin === true };
});

ipcMain.handle('set-launch-at-login', (_e, enabled) => {
  const cfg = loadConfig();
  cfg.launchAtLogin = !!enabled;
  saveConfig(cfg);
  applyLaunchAtLogin(cfg.launchAtLogin);
  updateTrayMenu();
  return cfg.launchAtLogin;
});

ipcMain.handle('choose-save-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: fileServer?.getSaveDir() || defaultSaveDir(),
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const dir = result.filePaths[0];
  const cfg = loadConfig();
  cfg.saveDir = dir;
  saveConfig(cfg);
  fileServer?.setSaveDir(dir);
  return dir;
});

ipcMain.handle('open-save-dir', () => {
  const dir = fileServer?.getSaveDir() || defaultSaveDir();
  shell.openPath(dir);
  return dir;
});

ipcMain.handle('open-file', (_e, name) => {
  const full = path.join(fileServer.getSaveDir(), path.basename(name));
  shell.openPath(full);
});

ipcMain.handle('reveal-file', (_e, name) => {
  const full = path.join(fileServer.getSaveDir(), path.basename(name));
  shell.showItemInFolder(full);
});

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.heic'];
const TEXT_EXTS = ['.txt', '.md', '.json', '.csv', '.log', '.xml', '.html', '.css', '.js', '.ts', '.py', '.sh', '.yaml', '.yml'];

const OSASCRIPT_OPTS = {
  encoding: 'utf8',
  timeout: 20000,
  maxBuffer: 20 * 1024 * 1024,
};

const COPY_JPEG_SCRIPT = `on run argv
  set pf to POSIX file (item 1 of argv)
  set the clipboard to (read pf as JPEG picture)
end run`;

const COPY_PNG_SCRIPT = `on run argv
  set pf to POSIX file (item 1 of argv)
  set the clipboard to (read pf as «class PNGf»)
end run`;

function sleepMs(ms) {
  if (ms <= 0) return;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* 等待剪贴板写入完成 */
  }
}

function escapeAppleScriptPath(p) {
  return p.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildNSFilenamesBuffer(paths) {
  const escapeXml = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const items = paths.map((p) => `<string>${escapeXml(p)}</string>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><array>${items}</array></plist>`;
  const tmp = path.join(os.tmpdir(), `kc-fn-${process.pid}-${Date.now()}.plist`);
  const bin = `${tmp}.bin`;
  try {
    fs.writeFileSync(tmp, xml, 'utf8');
    execFileSync('plutil', ['-convert', 'binary1', '-o', bin, tmp], { timeout: 5000 });
    return fs.readFileSync(bin);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    try { fs.unlinkSync(bin); } catch { /* ignore */ }
  }
}

function copyOk() {
  return { ok: true };
}

function copyFail(message = '复制失败') {
  return { ok: false, message };
}

function verifyImageClipboard() {
  try {
    const img = clipboard.readImage();
    if (img && !img.isEmpty()) return true;
  } catch {
    /* ignore */
  }

  if (process.platform !== 'darwin') return false;

  try {
    const r = execFileSync(
      'osascript',
      ['-e', `try
  the clipboard as JPEG picture
  return "1"
on error
  try
    the clipboard as «class PNGf»
    return "1"
  on error
    return "0"
  end try
end try`],
      { encoding: 'utf8', timeout: 5000 },
    ).trim();
    return r === '1';
  } catch {
    return false;
  }
}

function verifyTextClipboard(expected) {
  try {
    return clipboard.readText() === expected;
  } catch {
    return false;
  }
}

function verifyDarwinFilesClipboard(paths) {
  try {
    const formats = clipboard.availableFormats();
    if (formats.some((f) => /filename|file-url|furl/i.test(f))) return true;
    const uri = clipboard.read('text/uri-list') || '';
    return paths.every((p) => uri.includes(pathToFileURL(p).href));
  } catch {
    return false;
  }
}

function focusAppForClipboard() {
  try {
    app.focus({ steal: true });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  } catch {
    /* ignore */
  }
}

function fileExt(full) {
  return path.extname(full).toLowerCase();
}

function isImagePath(full) {
  return IMAGE_EXTS.includes(fileExt(full));
}

function runOsascript(script, argv) {
  execFileSync('osascript', ['-e', script, ...argv], OSASCRIPT_OPTS);
}

function copyDarwinFilesViaElectron(paths) {
  const uriList = `${paths.map((p) => pathToFileURL(p).href).join('\r\n')}\r\n`;
  clipboard.writeBuffer('text/uri-list', Buffer.from(uriList, 'utf8'));
  clipboard.writeBuffer('NSFilenamesPboardType', buildNSFilenamesBuffer(paths));
  for (const p of paths) {
    clipboard.writeBuffer('public.file-url', Buffer.from(pathToFileURL(p).href, 'utf8'));
  }
}

function copyDarwinFilesViaFinder(paths) {
  if (paths.length === 1) {
    const p = escapeAppleScriptPath(paths[0]);
    execFileSync(
      'osascript',
      ['-e', `tell application "Finder" to set the clipboard to (POSIX file "${p}" as alias)`],
      OSASCRIPT_OPTS,
    );
    return;
  }
  const items = paths.map((p) => `POSIX file "${escapeAppleScriptPath(p)}" as alias`).join(', ');
  execFileSync(
    'osascript',
    ['-e', `tell application "Finder" to set the clipboard to {${items}}`],
    OSASCRIPT_OPTS,
  );
}

function copyDarwinFilesToClipboard(paths) {
  focusAppForClipboard();
  try {
    copyDarwinFilesViaElectron(paths);
    if (verifyDarwinFilesClipboard(paths)) return;
  } catch {
    /* 尝试 Finder 备用方案 */
  }
  copyDarwinFilesViaFinder(paths);
}

/** 大图 PNG 等先经 sips 转 JPEG，再写入剪贴板，微信/Cursor 才能粘贴为图片 */
function copyImageForChatPaste(full) {
  const tmp = path.join(os.tmpdir(), `kuai-chuan-clip-${process.pid}-${Date.now()}.jpg`);
  try {
    execFileSync(
      'sips',
      ['-Z', '4096', '-s', 'format', 'jpeg', '-s', 'formatOptions', '88', full, '--out', tmp],
      { timeout: 120000 },
    );
    if (!fs.existsSync(tmp) || fs.statSync(tmp).size === 0) return false;
    runOsascript(COPY_JPEG_SCRIPT, [tmp]);
    const img = nativeImage.createFromPath(tmp);
    if (!img.isEmpty()) clipboard.writeImage(img);
    sleepMs(80);
    return verifyImageClipboard();
  } catch {
    return false;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function copyImageAsPngForChatPaste(full) {
  const tmp = path.join(os.tmpdir(), `kuai-chuan-clip-png-${process.pid}-${Date.now()}.png`);
  try {
    execFileSync('sips', ['-Z', '4096', '-s', 'format', 'png', full, '--out', tmp], { timeout: 120000 });
    if (!fs.existsSync(tmp) || fs.statSync(tmp).size === 0) return false;
    runOsascript(COPY_PNG_SCRIPT, [tmp]);
    const img = nativeImage.createFromPath(tmp);
    if (!img.isEmpty()) clipboard.writeImage(img);
    sleepMs(80);
    return verifyImageClipboard();
  } catch {
    return false;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function writeImageNative(full) {
  let img = nativeImage.createFromPath(full);
  if (img.isEmpty()) img = nativeImage.createFromBuffer(fs.readFileSync(full));
  if (img.isEmpty()) return false;
  clipboard.writeImage(img);
  sleepMs(80);
  return verifyImageClipboard();
}

function copyImageToClipboard(full) {
  focusAppForClipboard();

  if (process.platform === 'darwin') {
    const attempts = [
      () => copyImageForChatPaste(full),
      () => writeImageNative(full),
      () => copyImageAsPngForChatPaste(full),
    ];
    for (const attempt of attempts) {
      try {
        if (attempt()) return copyOk();
      } catch {
        /* 尝试下一种写入方式 */
      }
    }
    return copyFail();
  }

  return writeImageNative(full) ? copyOk() : copyFail();
}

function copyDarwinFilesWithVerify(paths) {
  try {
    copyDarwinFilesToClipboard(paths);
    sleepMs(80);
    if (verifyDarwinFilesClipboard(paths)) return true;
    copyDarwinFilesToClipboard(paths);
    sleepMs(120);
    return verifyDarwinFilesClipboard(paths);
  } catch {
    return false;
  }
}

function copyTextFileToClipboard(full) {
  const text = fs.readFileSync(full, 'utf8');
  clipboard.writeText(text);
  sleepMs(50);
  return verifyTextClipboard(text);
}

function copyOneFileByPath(full) {
  if (!fs.existsSync(full)) return copyFail('文件不存在');

  if (isImagePath(full)) return copyImageToClipboard(full);

  if (TEXT_EXTS.includes(fileExt(full))) {
    try {
      return copyTextFileToClipboard(full) ? copyOk() : copyFail();
    } catch {
      return copyFail();
    }
  }

  if (process.platform === 'darwin') {
    try {
      return copyDarwinFilesWithVerify([full]) ? copyOk() : copyFail();
    } catch (err) {
      return copyFail(err.message || '复制失败');
    }
  }

  clipboard.writeText(full);
  sleepMs(50);
  return verifyTextClipboard(full) ? copyOk() : copyFail();
}

function copyManyFilesByPaths(paths) {
  const imagePaths = paths.filter(isImagePath);

  if (process.platform === 'darwin' && imagePaths.length > 0) {
    return copyImageToClipboard(imagePaths[0]);
  }

  if (process.platform === 'darwin') {
    try {
      return copyDarwinFilesWithVerify(paths) ? copyOk() : copyFail();
    } catch (err) {
      return copyFail(err.message || '批量复制失败');
    }
  }

  const text = paths.join('\n');
  clipboard.writeText(text);
  sleepMs(50);
  return verifyTextClipboard(text) ? copyOk() : copyFail();
}

ipcMain.handle('copy-file', (_e, name) => {
  const full = path.join(fileServer.getSaveDir(), path.basename(name));
  return copyOneFileByPath(full);
});

ipcMain.handle('copy-files', (_e, names) => {
  if (!Array.isArray(names) || !names.length) {
    return { ok: false, message: '请先选择文件' };
  }

  const paths = names
    .map((name) => path.join(fileServer.getSaveDir(), path.basename(name)))
    .filter((full) => fs.existsSync(full));

  if (!paths.length) return { ok: false, message: '文件不存在' };
  if (paths.length === 1) return copyOneFileByPath(paths[0]);

  return copyManyFilesByPaths(paths);
});

ipcMain.handle('get-version-info', () => {
  const current = readCurrentBuildInfo();
  const check = checkForUpdate();
  return {
    current,
    update: check,
    isPackaged: app.isPackaged,
  };
});

ipcMain.handle('check-update', (_e, silent = false) => runUpdateCheck(silent));

ipcMain.handle('dismiss-update', (_e, buildId) => {
  const cfg = loadConfig();
  cfg.dismissedBuildId = buildId;
  saveConfig(cfg);
  return true;
});

ipcMain.handle('apply-update', async () => applyUpdate(mainWindow));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
    runUpdateCheck(true);
  });
}

app.whenReady().then(async () => {
  const cfg = loadConfig();
  applyLaunchAtLogin(cfg.launchAtLogin === true);

  const info = await startServer();
  const localUrl = `http://127.0.0.1:${info.port}/`;
  createWindow(localUrl);
  createTray();

  if (app.isPackaged) {
    setTimeout(() => runUpdateCheck(true), 1500);
    setInterval(() => runUpdateCheck(true), 60 * 1000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  app.isQuitting = true;
  if (fileServer) await fileServer.stop();
});

app.on('activate', () => {
  showMainWindow();
});
