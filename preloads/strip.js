const { contextBridge, ipcRenderer } = require('electron');

function invokeStripApi(method, args) {
  return ipcRenderer.invoke('strip-api-invoke', {
    method,
    args: Array.isArray(args) ? args : []
  });
}

contextBridge.exposeInMainWorld('stripApi', {
  onStripUpdate: (cb) => { ipcRenderer.on('strip-update', (_, p) => cb && cb(p)); },
  requestStripRefresh: () => { ipcRenderer.send('request-strip-refresh'); },
  requestPickScanFolderFromStrip: () => ipcRenderer.invoke('strip-preview-request-pick-scan-folder'),
  sendGridOffsetDelta: (deltaX, deltaY, tool) => {
    ipcRenderer.send('from-frame-grid-offset', {
      deltaX: Number(deltaX) || 0,
      deltaY: Number(deltaY) || 0,
      tool: tool || 'hand'
    });
  },
  setGridOffsetAbsolute: (gridOffsetX, gridOffsetY, gridOffsetYBottom) => {
    ipcRenderer.send('set-grid-offset-absolute', {
      gridOffsetX: Number(gridOffsetX) || 0,
      gridOffsetY: Number(gridOffsetY) || 0,
      gridOffsetYBottom: Number.isFinite(Number(gridOffsetYBottom)) ? Number(gridOffsetYBottom) : 0
    });
  },
  applyWidthNarrow: () => { ipcRenderer.send('strip-apply-width-narrow'); },
  applyWidthWiden: () => { ipcRenderer.send('strip-apply-width-widen'); },
  /** edge: 'left' | 'right', delta: display-pixels (+ = smaller grid from that side) */
  applyWidthEdge: (edge, delta) => {
    ipcRenderer.send('strip-adjust-width-edge', {
      edge: edge === 'right' ? 'right' : 'left',
      delta: Number(delta) || 0
    });
  },
  applyHeightEdge: (edge, delta) => {
    ipcRenderer.send('strip-adjust-height-edge', {
      edge: edge === 'bottom' ? 'bottom' : 'top',
      delta: Number(delta) || 0
    });
  },
  applyVerticalPush: () => { ipcRenderer.send('strip-apply-vertical-push'); },
  applyVerticalStretch: () => { ipcRenderer.send('strip-apply-vertical-stretch'); },
  applyGridFrameSizePx: (frameWidthPx, frameHeightPx, pixelSpace) =>
    invokeStripApi('applyGridFrameSizePx', [frameWidthPx, frameHeightPx, pixelSpace]),
  jumpTo: (position) => ipcRenderer.invoke('frame-preview-jump-to', position),
  setActiveFrameByNumber: (frameNumber) => ipcRenderer.invoke('set-active-frame', frameNumber),
  setWindowSize: (w, h) => ipcRenderer.invoke('set-frame-window-size', w, h),
  resetGridToDefault: () => ipcRenderer.invoke('reset-grid-to-default'),
  sendStatus: (percent, operation) => ipcRenderer.send('strip-preview-status', { percent, operation }),
  /** true = Shift+Samendruk (max. naar beneden), false = Shift+Uitrek (max. omhoog); rigide pan, gelijke celhoogte. */
  applyVerticalRigidPanBoundary: (towardCompress) => {
    ipcRenderer.send('strip-vertical-rigid-pan-boundary', { towardCompress: !!towardCompress });
  },
  /**
   * Verticale Duw-stap (preview-px). Optioneel tweede arg: 'compress' = Omlaag ▼, 'stretch' = Omhoog ▲
   * (dan is delta het stapbedrag, altijd positief). Legacy: alleen getekende delta zoals vroeger.
   */
  applyVerticalFixedBottomStep: (delta, duwKind) => {
    const d = Number(delta) || 0;
    const payload = { delta: d };
    if (duwKind === 'compress' || duwKind === 'stretch') payload.duwKind = duwKind;
    ipcRenderer.send('strip-vertical-fixed-bottom-step', payload);
  },
  setVerticalAnchor: (mode, customK) => {
    ipcRenderer.send('strip-vertical-anchor', {
      mode: typeof mode === 'string' ? mode : undefined,
      customK: customK != null ? Number(customK) : undefined
    });
  },
  setPanelLinkVerticalAnchor: (link) => {
    ipcRenderer.send('strip-panel-link-vertical-anchor', { link: !!link });
  },
  setFixResolutionLocked: (locked) => invokeStripApi('setFixResolutionLocked', [!!locked]),
  setAutoRasterAssistMode: (mode) => invokeStripApi('setAutoRasterAssistMode', [mode]),
  setAutoRasterAssistXRef: (ref) => invokeStripApi('setAutoRasterAssistXRef', [ref]),
  setAutoRasterAssistYRef: (ref) => invokeStripApi('setAutoRasterAssistYRef', [ref]),
  setAutoRasterAssistPreset: (preset) => invokeStripApi('setAutoRasterAssistPreset', [preset]),
  suggestAssistPreset: () => invokeStripApi('suggestAssistPreset', []),
  setAutoRasterAssistExtraLeftPx: (px) => invokeStripApi('setAutoRasterAssistExtraLeftPx', [px]),
  setAutoRasterAssistExtraRightPx: (px) => invokeStripApi('setAutoRasterAssistExtraRightPx', [px]),
  setAutoRasterAssistExtraTopPx: (px) => invokeStripApi('setAutoRasterAssistExtraTopPx', [px]),
  setAutoRasterAssistExtraBottomPx: (px) => invokeStripApi('setAutoRasterAssistExtraBottomPx', [px]),
  setAutoRasterCenterBeforeDetect: (enabled) => invokeStripApi('setAutoRasterCenterBeforeDetect', [!!enabled]),
  setAutoRasterDetectOnScanNav: (enabled) => invokeStripApi('setAutoRasterDetectOnScanNav', [!!enabled]),
  setAutoRasterLeftWhiteMinMarginPx: (px) => invokeStripApi('setAutoRasterLeftWhiteMinMarginPx', [px]),
  setAutoRasterDarkLineLeftBiasPx: (px) => invokeStripApi('setAutoRasterDarkLineLeftBiasPx', [px]),
  setAutoRasterDarkLineStrongScale: (v) => invokeStripApi('setAutoRasterDarkLineStrongScale', [v]),
  setAutoRasterDarkLineStrongScaleAuto: (enabled) => invokeStripApi('setAutoRasterDarkLineStrongScaleAuto', [!!enabled]),
  setAutoRasterDarkBottomBiasPx: (px) => invokeStripApi('setAutoRasterDarkBottomBiasPx', [px]),
  setAutoRasterDarkLineThickness: (v) => invokeStripApi('setAutoRasterDarkLineThickness', [v]),
  setAutoRasterDarkLineSearchRangePx: (px) => invokeStripApi('setAutoRasterDarkLineSearchRangePx', [px]),
  setAutoRasterTriangleSensitivity: (v) => invokeStripApi('setAutoRasterTriangleSensitivity', [v]),
  centerGridManual: () => invokeStripApi('centerGridManual', []),
  autoDetectFrameBounds: () => invokeStripApi('autoDetectFrameBounds', []),
  setAutoAdvanceAfterAlign: (enabled) => invokeStripApi('setAutoAdvanceAfterAlign', [!!enabled]),
  stopAutoAdvanceAfterAlign: (statusMsg) => invokeStripApi('stopAutoAdvanceAfterAlign', [statusMsg]),
  navigateProjectScan: (request) => {
    if (request && typeof request === 'object') {
      const dir = request.direction === 'next' ? 'next' : 'prev';
      ipcRenderer.send('strip-navigate-scan', {
        direction: dir,
        // Vorige schrijft nooit weg, ook als exportCurrent per ongeluk true is.
        exportCurrent: dir === 'next' && !!request.exportCurrent,
        fromAutoAdvance: !!request.fromAutoAdvance
      });
      return;
    }
    ipcRenderer.send('strip-navigate-scan', {
      direction: request === 'next' ? 'next' : 'prev',
      exportCurrent: false
    });
  },
  getLocale: () => ipcRenderer.invoke('get-locale'),
  getTranslations: () => ipcRenderer.invoke('get-translations'),
  /** Spring naar scanlint op positie 1..n (zelfde als vorige/volgende: eerst project opslaan). */
  gotoProjectScan: (request) => {
    if (request && typeof request === 'object') {
      ipcRenderer.send('strip-navigate-scan', {
        index: Number(request.index),
        exportCurrent: !!request.exportCurrent,
        fromAutoAdvance: !!request.fromAutoAdvance
      });
      return;
    }
    ipcRenderer.send('strip-navigate-scan', { index: Number(request), exportCurrent: false });
  },
  saveMacroFile: (payload) => ipcRenderer.invoke('save-macro-file', payload),
  openMacroFile: () => ipcRenderer.invoke('open-macro-file'),
  stripRotate90: () => { ipcRenderer.send('strip-rotate-90'); },
  getStripShortcuts: () => ipcRenderer.invoke('get-strip-shortcuts'),
  onStripShortcutsUpdated: (cb) => {
    ipcRenderer.on('strip-shortcuts-updated', (_, payload) => cb && cb(payload));
  },
  onStripPreviewDisplayPrefs: (cb) => {
    ipcRenderer.on('strip-preview-display-prefs', (_, payload) => cb && cb(payload));
  },
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  onStripLocaleChanged: (cb) => {
    ipcRenderer.on('strip-locale-changed', () => cb && cb());
  },
  stripSetFlip: (flipHorizontal, flipVertical) => {
    ipcRenderer.send('strip-set-flip', {
      flipHorizontal: !!flipHorizontal,
      flipVertical: !!flipVertical
    });
  }
});
