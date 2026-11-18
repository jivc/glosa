// Puente seguro entre la interfaz y el sistema: sólo expone estas funciones.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('glosaNative', {
  platform: process.platform,
  openProjectDialog: () => ipcRenderer.invoke('open-project-dialog'),
  readPath: (p) => ipcRenderer.invoke('read-path', p),
  openFilesDialog: (kind) => ipcRenderer.invoke('open-files-dialog', kind),
  saveProject: (args) => ipcRenderer.invoke('save-project', args),
  saveExport: (args) => ipcRenderer.invoke('save-export', args),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  recentList: () => ipcRenderer.invoke('recent-list'),
  recentRemove: (p) => ipcRenderer.invoke('recent-remove', p),
  setState: (s) => ipcRenderer.invoke('set-state', s),
  allowClose: () => ipcRenderer.invoke('allow-close'),
  recoveryWrite: (a) => ipcRenderer.invoke('recovery-write', a),
  recoveryList: () => ipcRenderer.invoke('recovery-list'),
  recoveryRead: (id) => ipcRenderer.invoke('recovery-read', id),
  recoveryClear: (id) => ipcRenderer.invoke('recovery-clear', id),
  prefsGet: () => ipcRenderer.invoke('prefs-get'),
  prefsSet: (p) => ipcRenderer.invoke('prefs-set', p),
  appInfo: () => ipcRenderer.invoke('app-info'),
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
  onMenu: (cb) => {
    const h = (_e, action) => cb(action);
    ipcRenderer.on('menu', h);
    return () => ipcRenderer.removeListener('menu', h);
  },
  onOpenFile: (cb) => {
    const h = (_e, file) => cb(file);
    ipcRenderer.on('open-file', h);
    return () => ipcRenderer.removeListener('open-file', h);
  },
});
