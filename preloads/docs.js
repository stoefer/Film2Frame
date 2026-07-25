/**
 * Preload voor het Documenten-venster.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getLocale: () => ipcRenderer.invoke('get-locale'),
  getTranslations: () => ipcRenderer.invoke('get-translations'),
  listDocs: () => ipcRenderer.invoke('list-docs'),
  getDocContent: (id) => ipcRenderer.invoke('get-doc-content', id)
});
