/**
 * Preload voor het hoofdvenster – alleen wat de renderer nodig heeft.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectScanFile: () => ipcRenderer.invoke('select-scan-file'),
  selectFolder: (opts) => ipcRenderer.invoke('select-folder', opts),
  getFileUrl: (p) => ipcRenderer.invoke('get-file-url', p),
  saveMacroFile: (payload) => ipcRenderer.invoke('save-macro-file', payload),
  openMacroFile: () => ipcRenderer.invoke('open-macro-file'),
  importBatchRangeListFile: () => ipcRenderer.invoke('import-batch-range-list-file'),
  openBatchRangeListInNotepad: () => ipcRenderer.invoke('open-batch-range-list-in-notepad'),
  reimportBatchRangeListFromNotepad: () => ipcRenderer.invoke('reimport-batch-range-list-from-notepad'),
  openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'),
  openDocsWindow: () => ipcRenderer.invoke('open-docs-window'),
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
  confirmExportOverwrite: (payload) => ipcRenderer.invoke('confirm-export-overwrite', payload),
  getNextFrameNumber: (opts) => ipcRenderer.invoke('get-next-frame-number', opts),
  writeFramePng: (folder, baseName, index, dataUrl, fileName) =>
    ipcRenderer.invoke('write-frame-png', { folder, baseName, index, dataUrl, fileName }),
  writeFrame: (folder, baseName, index, dataUrl, ext, fileName) =>
    ipcRenderer.invoke('write-frame', { folder, baseName, index, dataUrl, ext, fileName }),
  writeFrameBuffer: (folder, fileName, buffer, ext) =>
    ipcRenderer.invoke('write-frame-buffer', { folder, fileName, buffer, ext }),
  exportFilesExist: (folder, fileNames) => ipcRenderer.invoke('export-files-exist', { folder, fileNames }),
  openStripPreview: () => ipcRenderer.invoke('open-strip-preview'),
  closeStripPreview: () => ipcRenderer.invoke('close-strip-preview'),
  isStripPreviewOpen: () => ipcRenderer.invoke('is-strip-preview-open'),
  sendOutputPreviewImage: () => {},
  /** Hoofdvenster → floating RASTER SETUP / align-preview. */
  sendStripUpdate: (payload) => ipcRenderer.send('send-strip-update', payload),
  getEulaStatus: () => ipcRenderer.invoke('get-eula-status'),
  getEulaText: () => ipcRenderer.invoke('get-eula-text'),
  acceptEula: () => ipcRenderer.invoke('accept-eula'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  setAppSettings: (settings) => ipcRenderer.invoke('set-app-settings', settings),
  getStripShortcutConfig: () => ipcRenderer.invoke('get-strip-shortcut-config'),
  arrangeWindows: (opts) => ipcRenderer.invoke('arrange-windows', opts),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getLocale: () => ipcRenderer.invoke('get-locale'),
  setLocale: (locale) => ipcRenderer.invoke('set-locale', locale),
  getTranslations: () => ipcRenderer.invoke('get-translations'),
  getStripShortcuts: () => ipcRenderer.invoke('get-strip-shortcuts'),
  onStripShortcutsUpdated: (cb) => {
    ipcRenderer.on('strip-shortcuts-updated', (_, payload) => {
      if (typeof cb === 'function') cb(payload);
    });
  },
  onStripLocaleChanged: (cb) => {
    ipcRenderer.on('strip-locale-changed', () => {
      if (typeof cb === 'function') cb();
    });
  },
  onRequestQuitSave: (cb) => {
    ipcRenderer.on('request-quit-save', () => {
      if (typeof cb === 'function') cb();
    });
  },
  sendQuitSaveComplete: () => {
    ipcRenderer.send('quit-save-complete');
  },
  onAppSettingsSynced: (cb) => {
    ipcRenderer.on('app-settings-synced', () => {
      if (typeof cb === 'function') cb();
    });
  },
  onStripPreviewClosed: (cb) => { ipcRenderer.on('strip-preview-closed', () => cb && cb()); },
  onStripPreviewReady: (cb) => { ipcRenderer.on('strip-preview-ready', () => cb && cb()); },
  onPickScanFolderFromStrip: (cb) => {
    ipcRenderer.on('pick-scan-folder-from-strip', () => cb && cb());
  },
  onFrameGridOffsetUpdate: (cb) => {
    ipcRenderer.on('frame-grid-offset-update', (_, payload) => cb && cb(payload));
  },
  onSetGridOffsetAbsolute: (cb) => {
    ipcRenderer.on('set-grid-offset-absolute', (_, payload) => cb && cb(payload));
  },
  onFramePreviewJump: (cb) => {
    ipcRenderer.on('frame-preview-jump', (_, position) => cb && cb(position));
  },
  onSetActiveFrame: (cb) => {
    ipcRenderer.on('set-active-frame', (_, frameNumber) => cb && cb(frameNumber));
  },
  onResetGrid: (cb) => { ipcRenderer.on('do-reset-grid', () => cb && cb()); },
  onStatusFromStrip: (cb) => {
    ipcRenderer.on('status-from-strip', (_, d) => cb && cb(d));
  },
  onStripApplyWidthNarrow: (cb) => { ipcRenderer.on('strip-apply-width-narrow', () => cb && cb()); },
  onStripApplyWidthWiden: (cb) => { ipcRenderer.on('strip-apply-width-widen', () => cb && cb()); },
  onStripAdjustWidthEdge: (cb) => {
    ipcRenderer.on('strip-adjust-width-edge', (_, payload) => cb && cb(payload));
  },
  onStripAdjustHeightEdge: (cb) => {
    ipcRenderer.on('strip-adjust-height-edge', (_, payload) => cb && cb(payload));
  },
  onStripApplyVerticalPush: (cb) => { ipcRenderer.on('strip-apply-vertical-push', () => cb && cb()); },
  onStripApplyVerticalStretch: (cb) => { ipcRenderer.on('strip-apply-vertical-stretch', () => cb && cb()); },
  onStripVerticalRigidPanBoundary: (cb) => {
    ipcRenderer.on('strip-vertical-rigid-pan-boundary', (_, p) => cb && cb(p));
  },
  onStripVerticalFixedBottomStep: (cb) => {
    ipcRenderer.on('strip-vertical-fixed-bottom-step', (_, payload) => cb && cb(payload));
  },
  onStripVerticalAnchor: (cb) => {
    ipcRenderer.on('strip-vertical-anchor', (_, payload) => cb && cb(payload));
  },
  onStripPanelLinkVerticalAnchor: (cb) => {
    ipcRenderer.on('strip-panel-link-vertical-anchor', (_, p) => cb && cb(p));
  },
  onStripNavigateScan: (cb) => {
    ipcRenderer.on('strip-navigate-scan', (_, payload) => cb && cb(payload));
  },
  onStripRotate90: (cb) => { ipcRenderer.on('strip-rotate-90', () => cb && cb()); },
  onStripSetFlip: (cb) => { ipcRenderer.on('strip-set-flip', (_, p) => cb && cb(p)); },
  /** Prestatie-timing: schrijf een regel naar het perf-logbestand (userData/perf-timing.log). */
  appendPerfLog: (line) => ipcRenderer.send('perf-log-append', line),
  getPerfLogPath: () => ipcRenderer.invoke('perf-log-path')
});
