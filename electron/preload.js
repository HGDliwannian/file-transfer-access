const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('snapdrop', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('set-launch-at-login', enabled),
  chooseSaveDir: () => ipcRenderer.invoke('choose-save-dir'),
  openSaveDir: () => ipcRenderer.invoke('open-save-dir'),
  openFile: (name) => ipcRenderer.invoke('open-file', name),
  revealFile: (name) => ipcRenderer.invoke('reveal-file', name),
  copyFile: (name) => ipcRenderer.invoke('copy-file', name),
  onFileUploaded: (cb) => {
    const handler = (_e, file) => cb(file);
    ipcRenderer.on('file-uploaded', handler);
    return () => ipcRenderer.removeListener('file-uploaded', handler);
  },
  getVersionInfo: () => ipcRenderer.invoke('get-version-info'),
  checkUpdate: (silent) => ipcRenderer.invoke('check-update', silent),
  dismissUpdate: (buildId) => ipcRenderer.invoke('dismiss-update', buildId),
  applyUpdate: () => ipcRenderer.invoke('apply-update'),
  onUpdateAvailable: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
});
