const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('osdApi', {
  getBuildVersion: () => ipcRenderer.invoke('get-build-version'),
  selectImages: () => ipcRenderer.invoke('select-images'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  selectAudacityExecutable: () => ipcRenderer.invoke('select-audacity-executable'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  openInAudacity: (opts) => ipcRenderer.invoke('open-in-audacity', opts),
  buildExportPath: (opts) => ipcRenderer.invoke('build-export-path', opts),
  writeAudioToOutputFolder: (opts) => ipcRenderer.invoke('write-audio-to-output-folder', opts),
  writeOutputFolderProbe: (opts) => ipcRenderer.invoke('write-output-folder-probe', opts),
  listFolderImages: (folderPath) => ipcRenderer.invoke('list-folder-images', folderPath),
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  saveAudioDialog: (opts) => ipcRenderer.invoke('save-audio-dialog', opts),
  writeWavFile: (filePath, buffer) => ipcRenderer.invoke('write-wav-file', filePath, buffer),
  writeAudioExport: (opts) => ipcRenderer.invoke('write-audio-export', opts),
  ffmpegAvailable: () => ipcRenderer.invoke('ffmpeg-available'),
  writeTextFile: (filePath, text) => ipcRenderer.invoke('write-text-file', filePath, text),
  readTextFile: (filePath) => ipcRenderer.invoke('read-text-file', filePath),
  fileToUrl: (filePath) => ipcRenderer.invoke('file-to-url', filePath),
  loadSession: () => ipcRenderer.invoke('load-session'),
  saveSession: (payload) => ipcRenderer.invoke('save-session', payload),
  loadTemplates: () => ipcRenderer.invoke('load-templates'),
  saveTemplates: (list) => ipcRenderer.invoke('save-templates', list)
});
