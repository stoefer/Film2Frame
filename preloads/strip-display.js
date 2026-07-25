/**
 * Preload voor zwevend strip-display (alleen beeld + raster, geen bediening).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stripDisplayApi', {
  onStripUpdate: (cb) => {
    ipcRenderer.on('strip-update', (_, p) => {
      if (typeof cb === 'function') cb(p);
    });
  },
  requestStripRefresh: () => {
    ipcRenderer.send('request-strip-refresh');
  },
  getLocale: () => ipcRenderer.invoke('get-locale'),
  getTranslations: () => ipcRenderer.invoke('get-translations')
});
