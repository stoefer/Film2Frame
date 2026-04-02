/**
 * Preload voor het instellingen-venster.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  setAppSettings: (settings) => ipcRenderer.invoke('set-app-settings', settings),
  getStripShortcutConfig: () => ipcRenderer.invoke('get-strip-shortcut-config'),
  arrangeWindows: (opts) => ipcRenderer.invoke('arrange-windows', opts),
  autoArrangeWindowsFromGrid: (payload) => ipcRenderer.invoke('auto-arrange-windows-from-grid', payload),
  getLocale: () => ipcRenderer.invoke('get-locale'),
  getTranslations: () => ipcRenderer.invoke('get-translations'),
  setLocale: (locale) => ipcRenderer.invoke('set-locale', locale),
  notifySettingsSaved: () => ipcRenderer.send('settings-saved-from-aux-window')
});
