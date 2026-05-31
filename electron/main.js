const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell, Notification, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync, spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { createServer, DEFAULT_PORT } = require('../server/index');

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

async function buildServerStatus() {
  if (!fileServer) await startServer();
  const ip = fileServer.getLanIp();
  const port = fileServer.port;
  const pageUrl = `http://${ip}:${port}/1.html`;
  const qrDataUrl = await QRCode.toDataURL(pageUrl, { width: 200, margin: 1 });
  return {
    ip,
    port,
    url: `http://127.0.0.1:${port}/`,
    mobileUrl: pageUrl,
    qrDataUrl,
    saveDir: fileServer.getSaveDir(),
  };
}

ipcMain.handle('get-status', () => buildServerStatus());

function readBuildInfo() {
  try {
    return JSON.parse(fs.readFileSync(path.join(getPublicDir(), 'build-info.json'), 'utf8'));
  } catch {
    return {};
  }
}

function resolveProjectRoot() {
  const fromEnv = process.env.FILE_TRANSFER_ACCESS_ROOT;
  if (fromEnv && fs.existsSync(path.join(fromEnv, 'scripts/enable.sh'))) {
    return path.resolve(fromEnv);
  }
  const cfg = loadConfig();
  if (cfg.projectRoot && fs.existsSync(path.join(cfg.projectRoot, 'scripts/enable.sh'))) {
    return path.resolve(cfg.projectRoot);
  }
  const info = readBuildInfo();
  if (info.projectRoot && fs.existsSync(path.join(info.projectRoot, 'scripts/enable.sh'))) {
    return path.resolve(info.projectRoot);
  }
  if (isDev) {
    return path.resolve(__dirname, '..');
  }
  return null;
}

ipcMain.handle('restart-service', async () => {
  await startServer();
  const status = await buildServerStatus();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reload();
  }
  return status;
});

ipcMain.handle('run-enable', async () => {
  const root = resolveProjectRoot();
  if (!root) {
    return {
      ok: false,
      message: '未找到项目目录，请在项目根目录执行 npm run enable',
    };
  }
  const script = path.join(root, 'scripts/enable.sh');
  const child = spawn('bash', [script], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  setTimeout(() => {
    app.isQuitting = true;
    app.quit();
  }, 400);
  return { ok: true, message: '正在重新打包并启动…' };
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

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.heic'];

const OSASCRIPT_OPTS = {
  encoding: 'utf8',
  timeout: 8000,
  maxBuffer: 4 * 1024 * 1024,
};

function escapeAppleScriptPath(p) {
  return p.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function copyOk() {
  return { ok: true };
}

function copyFail(message = '拷贝失败') {
  return { ok: false, message };
}

function fileExt(full) {
  return path.extname(full).toLowerCase();
}

function isImagePath(full) {
  return IMAGE_EXTS.includes(fileExt(full));
}

function resolveExistingPaths(paths) {
  return paths
    .map((p) => path.resolve(p))
    .filter((p) => {
      try {
        return fs.existsSync(p) && fs.statSync(p).isFile();
      } catch {
        return false;
      }
    });
}

function getCopyFilesBinary() {
  const devBin = path.join(__dirname, 'native', 'copy-files');
  if (fs.existsSync(devBin)) return devBin;
  const packagedBin = path.join(process.resourcesPath, 'copy-files');
  if (fs.existsSync(packagedBin)) return packagedBin;
  return null;
}

/** Swift NSPasteboard.writeObjects — 写入 furl，访达可粘贴 */
function copyPathsViaNative(paths) {
  const bin = getCopyFilesBinary();
  if (!bin) return false;
  execFileSync(bin, paths, { timeout: 10000 });
  return true;
}

function copyPathsViaOsascript(paths) {
  if (paths.length === 1) {
    const p = escapeAppleScriptPath(paths[0]);
    execFileSync(
      'osascript',
      ['-e', `set the clipboard to (POSIX file "${p}" as alias)`],
      OSASCRIPT_OPTS,
    );
    return;
  }
  const items = paths.map((p) => `POSIX file "${escapeAppleScriptPath(p)}" as alias`).join(', ');
  execFileSync(
    'osascript',
    ['-e', `set the clipboard to {${items}}`],
    OSASCRIPT_OPTS,
  );
}

function sameFilePath(a, b) {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return path.resolve(a) === path.resolve(b);
  }
}

// AIGC START — 用 AppleScript 校验剪贴板是否已为访达可粘贴的文件
function verifyFileClipboard(paths) {
  if (process.platform !== 'darwin') return true;
  try {
    if (paths.length === 1) {
      const clip = execFileSync(
        'osascript',
        ['-e', 'try\nPOSIX path of (the clipboard as alias)\nend try'],
        { encoding: 'utf8', timeout: 3000 },
      ).trim();
      return clip && sameFilePath(clip, paths[0]);
    }
    const count = execFileSync(
      'osascript',
      ['-e', 'try\ncount of the clipboard\nend try'],
      { encoding: 'utf8', timeout: 3000 },
    ).trim();
    return parseInt(count, 10) === paths.length;
  } catch {
    return false;
  }
}

function copyPathsAsFiles(paths) {
  const resolved = resolveExistingPaths(paths);
  if (!resolved.length) return false;
  if (process.platform !== 'darwin') {
    clipboard.writeText(resolved.map((p) => pathToFileURL(p).href).join('\n'));
    return true;
  }

  try {
    copyPathsViaOsascript(resolved);
    if (verifyFileClipboard(resolved)) return true;
  } catch { /* fallback */ }

  try {
    if (getCopyFilesBinary()) {
      copyPathsViaNative(resolved);
      if (verifyFileClipboard(resolved)) return true;
    }
  } catch { /* ignore */ }

  return false;
}
// AIGC END

function copyImageBitmap(full) {
  let img = nativeImage.createFromPath(full);
  if (img.isEmpty()) {
    try {
      img = nativeImage.createFromBuffer(fs.readFileSync(full));
    } catch {
      return false;
    }
  }
  if (img.isEmpty()) return false;
  clipboard.writeImage(img);
  return true;
}

function copyImageWithSipsJpeg(full) {
  const tmp = path.join(os.tmpdir(), `kc-clip-${process.pid}-${Date.now()}.jpg`);
  try {
    execFileSync(
      'sips',
      ['-Z', '4096', '-s', 'format', 'jpeg', '-s', 'formatOptions', '88', full, '--out', tmp],
      { timeout: 60000 },
    );
    if (!fs.existsSync(tmp) || fs.statSync(tmp).size === 0) return false;
    const img = nativeImage.createFromPath(tmp);
    if (img.isEmpty()) return false;
    clipboard.writeImage(img);
    return true;
  } catch {
    return false;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

function copyImageToClipboard(full) {
  if (copyImageBitmap(full)) return copyOk();
  if (process.platform === 'darwin' && copyImageWithSipsJpeg(full)) return copyOk();
  return copyFail();
}

function copyOneFileByPath(full) {
  if (!fs.existsSync(full)) return copyFail('文件不存在');
  return copyPathsAsFiles([full]) ? copyOk() : copyFail('无法拷贝为访达文件，请重试');
}


ipcMain.handle('copy-file', (_e, name) => {
  const full = path.join(fileServer.getSaveDir(), path.basename(name));
  return copyOneFileByPath(full);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });
}

app.whenReady().then(async () => {
  const cfg = loadConfig();
  if (isDev && !cfg.projectRoot) {
    cfg.projectRoot = path.resolve(__dirname, '..');
    saveConfig(cfg);
  }
  applyLaunchAtLogin(cfg.launchAtLogin === true);

  const info = await startServer();
  const localUrl = `http://127.0.0.1:${info.port}/`;
  createWindow(localUrl);
  createTray();
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
