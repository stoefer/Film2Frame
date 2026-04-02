/**
 * Preload voor het Frame Pixel Editor-venster.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pixelEditorApi', {
  getLocale: () => ipcRenderer.invoke('get-locale'),
  getTranslations: () => ipcRenderer.invoke('get-translations'),
  pixelEditorPull: () => ipcRenderer.invoke('pixel-editor-pull'),
  pixelEditorPushOverlay: (dataUrl) => ipcRenderer.invoke('pixel-editor-push-overlay', { dataUrl }),
  pixelEditorMainAction: (action, payload) => ipcRenderer.invoke('pixel-editor-main-action', { action, payload }),
  selectFolder: (opts) => ipcRenderer.invoke('select-folder', opts),
  selectPixelEditorOutputFolder: () => ipcRenderer.invoke('select-pixel-editor-output-folder'),
  listFolderImages: (path) => ipcRenderer.invoke('list-folder-images', path),
  getFileUrl: (p) => ipcRenderer.invoke('get-file-url', p),
  writeFrame: (folder, baseName, index, dataUrl, ext) =>
    ipcRenderer.invoke('write-frame', { folder, baseName, index, dataUrl, ext }),
  writeFramePng: (folder, baseName, index, dataUrl) =>
    ipcRenderer.invoke('write-frame-png', { folder, baseName, index, dataUrl }),
  onPixelEditorRefreshFromMain: (cb) => {
    const handler = () => cb && cb();
    ipcRenderer.on('pixel-editor-refresh-from-main', handler);
    return () => ipcRenderer.removeListener('pixel-editor-refresh-from-main', handler);
  },
  onStripLocaleChanged: (cb) => {
    const handler = () => cb && cb();
    ipcRenderer.on('strip-locale-changed', handler);
    return () => ipcRenderer.removeListener('strip-locale-changed', handler);
  }
});
