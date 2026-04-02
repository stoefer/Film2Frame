const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('outputPreviewApi', {
  onOutputImage: (cb) => { ipcRenderer.on('output-image', (_, p) => cb && cb(p)); },
  getLocale: () => ipcRenderer.invoke('get-locale'),
  getTranslations: () => ipcRenderer.invoke('get-translations'),
  onLocaleChanged: (cb) => {
    ipcRenderer.on('strip-locale-changed', () => cb && cb());
  }
});
