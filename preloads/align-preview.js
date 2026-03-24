const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('alignPreviewApi', {
  onAlignPreviewUpdate: (cb) => {
    ipcRenderer.on('align-preview-update', (_, p) => cb && cb(p));
  },
  requestAlignPreviewRefresh: () => {
    ipcRenderer.send('request-align-preview-refresh');
  },
  setActiveFrameByNumber: (frameNumber) => ipcRenderer.invoke('set-active-frame', frameNumber),
  getLocale: () => ipcRenderer.invoke('get-locale'),
  getTranslations: () => ipcRenderer.invoke('get-translations')
});
