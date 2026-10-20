const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('zhijian', {
  isDesktop: true,
  platform: process.platform,
  ready: () => ipcRenderer.invoke('app:renderer-ready'),
  openFiles: () => ipcRenderer.invoke('file:open-dialog'),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  saveFile: (filePath, content) =>
    ipcRenderer.invoke('file:save', { filePath, content }),
  saveFileAs: (defaultName, content) =>
    ipcRenderer.invoke('file:save-as', { defaultName, content }),
  reveal: (filePath) => ipcRenderer.invoke('file:reveal', filePath),
  openDefaultApps: () => ipcRenderer.invoke('app:open-default-apps'),
  saveFileSync: (filePath, content) =>
    ipcRenderer.sendSync('file:save-sync', { filePath, content }),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  onOpenFiles: (callback) => {
    const handler = (_event, files) => callback(files);
    ipcRenderer.on('file:open', handler);
    return () => ipcRenderer.removeListener('file:open', handler);
  },
});
