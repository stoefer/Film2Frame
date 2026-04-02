/**
 * Preload voor het hoofdvenster – alleen wat de renderer nodig heeft.
 */
const { contextBridge, ipcRenderer } = require('electron');

let videoExportProgressHandler = null;

contextBridge.exposeInMainWorld('api', {
  selectScanFile: () => ipcRenderer.invoke('select-scan-file'),
  selectFolder: (opts) => ipcRenderer.invoke('select-folder', opts),
  getFileUrl: (p) => ipcRenderer.invoke('get-file-url', p),
  openStripPreview: () => ipcRenderer.invoke('open-strip-preview'),
  closeStripPreview: () => ipcRenderer.invoke('close-strip-preview'),
  openAlignPreview: () => ipcRenderer.invoke('open-align-preview'),
  closeAlignPreview: () => ipcRenderer.invoke('close-align-preview'),
  sendStripUpdate: (payload) => ipcRenderer.send('send-strip-update', payload),
  createProject: (payload) => ipcRenderer.invoke('create-project', payload),
  openProject: () => ipcRenderer.invoke('open-project'),
  openProjectFile: () => ipcRenderer.invoke('open-project-file'),
  openProjectByPath: (path) => ipcRenderer.invoke('open-project-by-path', path),
  getSuggestedProjectFolder: (name) => ipcRenderer.invoke('get-suggested-project-folder', name),
  getLastProjectPath: () => ipcRenderer.invoke('get-last-project-path'),
  saveProject: (payload) => ipcRenderer.invoke('save-project', payload),
  deleteProject: (projectFolderPath) => ipcRenderer.invoke('delete-project', projectFolderPath),
  listFolderImages: (path) => ipcRenderer.invoke('list-folder-images', path),
  countFolderImages: (path) => ipcRenderer.invoke('count-folder-images', path),
  getScanInfos: (folderPath, onProgress) => {
    let handler = null;
    if (typeof onProgress === 'function') {
      handler = (_, d) => onProgress(d);
      ipcRenderer.on('scan-infos-progress', handler);
    }
    return ipcRenderer.invoke('get-scan-infos', folderPath).finally(() => {
      if (handler) ipcRenderer.removeListener('scan-infos-progress', handler);
    });
  },
  cancelScanInfos: () => {
    ipcRenderer.send('cancel-scan-infos');
  },
  selectExportFolder: () => ipcRenderer.invoke('select-export-folder'),
  selectPixelEditorOutputFolder: () => ipcRenderer.invoke('select-pixel-editor-output-folder'),
  selectVideoOutputFile: (formatId) => ipcRenderer.invoke('select-video-output-file', formatId),
  getTempVideoFolder: () => ipcRenderer.invoke('get-temp-video-folder'),
  createVideoFromFrames: (opts) => ipcRenderer.invoke('create-video-from-frames', opts),
  createVideoFromFolder: (opts) => ipcRenderer.invoke('create-video-from-folder', opts),
  checkFfmpegAvailable: () => ipcRenderer.invoke('check-ffmpeg-available'),
  prepareVideoExport: () => ipcRenderer.invoke('prepare-video-export'),
  cancelVideoExport: () => ipcRenderer.invoke('cancel-video-export'),
  removeTempVideoFolder: (folderPath) => ipcRenderer.invoke('remove-temp-video-folder', folderPath),
  onVideoExportProgress: (cb) => {
    if (videoExportProgressHandler) {
      ipcRenderer.removeListener('video-export-progress', videoExportProgressHandler);
      videoExportProgressHandler = null;
    }
    if (typeof cb !== 'function') return;
    videoExportProgressHandler = (_ev, d) => cb(d);
    ipcRenderer.on('video-export-progress', videoExportProgressHandler);
  },
  clearVideoExportProgressListener: () => {
    if (videoExportProgressHandler) {
      ipcRenderer.removeListener('video-export-progress', videoExportProgressHandler);
      videoExportProgressHandler = null;
    }
  },
  getNextFrameNumber: (opts) => ipcRenderer.invoke('get-next-frame-number', opts),
  writeFramePng: (folder, baseName, index, dataUrl) => ipcRenderer.invoke('write-frame-png', { folder, baseName, index, dataUrl }),
  writeFrame: (folder, baseName, index, dataUrl, ext) => ipcRenderer.invoke('write-frame', { folder, baseName, index, dataUrl, ext }),
  openOutputPreview: () => ipcRenderer.invoke('open-output-preview'),
  closeOutputPreview: () => ipcRenderer.invoke('close-output-preview'),
  sendOutputPreviewImage: (dataUrl) => ipcRenderer.invoke('send-output-preview-image', dataUrl),
  onStripPreviewClosed: (cb) => { ipcRenderer.on('strip-preview-closed', () => cb && cb()); },
  onStripPreviewReady: (cb) => { ipcRenderer.on('strip-preview-ready', () => cb && cb()); },
  onAlignPreviewReady: (cb) => { ipcRenderer.on('align-preview-ready', () => cb && cb()); },
  onOutputPreviewClosed: (cb) => { ipcRenderer.on('output-preview-closed', () => cb && cb()); },
  onFrameGridOffsetUpdate: (cb) => { ipcRenderer.on('frame-grid-offset-update', (_, payload) => cb && cb(payload)); },
  onSetGridOffsetAbsolute: (cb) => { ipcRenderer.on('set-grid-offset-absolute', (_, payload) => cb && cb(payload)); },
  onFramePreviewJump: (cb) => { ipcRenderer.on('frame-preview-jump', (_, position) => cb && cb(position)); },
  onSetActiveFrame: (cb) => { ipcRenderer.on('set-active-frame', (_, frameNumber) => cb && cb(frameNumber)); },
  onResetGrid: (cb) => { ipcRenderer.on('do-reset-grid', () => cb && cb()); },
  onStatusFromStrip: (cb) => { ipcRenderer.on('status-from-strip', (_, d) => cb && cb(d)); },
  onStripApplyWidthNarrow: (cb) => { ipcRenderer.on('strip-apply-width-narrow', () => cb && cb()); },
  onStripApplyWidthWiden: (cb) => { ipcRenderer.on('strip-apply-width-widen', () => cb && cb()); },
  onStripAdjustWidthEdge: (cb) => { ipcRenderer.on('strip-adjust-width-edge', (_, payload) => cb && cb(payload)); },
  onStripAdjustHeightEdge: (cb) => { ipcRenderer.on('strip-adjust-height-edge', (_, payload) => cb && cb(payload)); },
  onStripApplyVerticalPush: (cb) => { ipcRenderer.on('strip-apply-vertical-push', () => cb && cb()); },
  onStripApplyVerticalStretch: (cb) => { ipcRenderer.on('strip-apply-vertical-stretch', () => cb && cb()); },
  onStripVerticalRigidPanBoundary: (cb) => { ipcRenderer.on('strip-vertical-rigid-pan-boundary', (_, p) => cb && cb(p)); },
  onStripVerticalFixedBottomStep: (cb) => { ipcRenderer.on('strip-vertical-fixed-bottom-step', (_, payload) => cb && cb(payload)); },
  onStripVerticalAnchor: (cb) => { ipcRenderer.on('strip-vertical-anchor', (_, payload) => cb && cb(payload)); },
  onStripPanelLinkVerticalAnchor: (cb) => { ipcRenderer.on('strip-panel-link-vertical-anchor', (_, p) => cb && cb(p)); },
  onStripNavigateScan: (cb) => { ipcRenderer.on('strip-navigate-scan', (_, payload) => cb && cb(payload)); },
  onStripPresetDoSave: (cb) => { ipcRenderer.on('strip-preset-do-save', (_, name) => cb && cb(name)); },
  onStripPresetDoLoad: (cb) => { ipcRenderer.on('strip-preset-do-load', (_, id) => cb && cb(id)); },
  onStripPresetDoDelete: (cb) => { ipcRenderer.on('strip-preset-do-delete', (_, id) => cb && cb(id)); },
  notifyStripPresetsUpdated: () => ipcRenderer.send('notify-strip-presets-updated'),
  presetsList: () => ipcRenderer.invoke('presets-list'),
  presetSave: (name, data) => ipcRenderer.invoke('preset-save', name, data),
  presetLoad: (id) => ipcRenderer.invoke('preset-load', id),
  presetDelete: (id) => ipcRenderer.invoke('preset-delete', id),
  gridPresetsList: () => ipcRenderer.invoke('grid-presets-list'),
  gridPresetSave: (name, grid) => ipcRenderer.invoke('grid-preset-save', name, grid),
  gridPresetLoad: (id) => ipcRenderer.invoke('grid-preset-load', id),
  gridPresetDelete: (id) => ipcRenderer.invoke('grid-preset-delete', id),
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  setAppSettings: (settings) => ipcRenderer.invoke('set-app-settings', settings),
  getStripShortcutConfig: () => ipcRenderer.invoke('get-strip-shortcut-config'),
  arrangeWindows: (opts) => ipcRenderer.invoke('arrange-windows', opts),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getLocale: () => ipcRenderer.invoke('get-locale'),
  setLocale: (locale) => ipcRenderer.invoke('set-locale', locale),
  getTranslations: () => ipcRenderer.invoke('get-translations'),
  onStripRotate90: (cb) => { ipcRenderer.on('strip-rotate-90', () => cb && cb()); },
  onStripSetFlip: (cb) => { ipcRenderer.on('strip-set-flip', (_, p) => cb && cb(p)); },
  onRequestQuitSave: (cb) => {
    ipcRenderer.on('request-quit-save', () => {
      if (typeof cb === 'function') cb();
    });
  },
  sendQuitSaveComplete: () => {
    ipcRenderer.send('quit-save-complete');
  },
  openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'),
  openPixelEditorWindow: () => ipcRenderer.invoke('open-pixel-editor'),
  closePixelEditorWindow: () => ipcRenderer.invoke('close-pixel-editor'),
  focusPixelEditorWindow: () => ipcRenderer.invoke('focus-pixel-editor'),
  notifyPixelEditorRemoteRefresh: () => ipcRenderer.send('notify-pixel-editor-remote-refresh'),
  onPixelEditorWindowReady: (cb) => {
    ipcRenderer.on('pixel-editor-window-ready', () => cb && cb());
  },
  onPixelEditorWindowClosed: (cb) => {
    ipcRenderer.on('pixel-editor-window-closed', () => cb && cb());
  },
  onAppSettingsSynced: (cb) => {
    ipcRenderer.on('app-settings-synced', () => {
      if (typeof cb === 'function') cb();
    });
  }
});
