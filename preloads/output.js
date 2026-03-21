const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('outputPreviewApi', {
  onOutputImage: (cb) => { ipcRenderer.on('output-image', (_, p) => cb && cb(p)); }
});
