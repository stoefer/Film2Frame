const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('stripApi', {
  onStripUpdate: (cb) => { ipcRenderer.on('strip-update', (_, p) => cb && cb(p)); },
  requestStripRefresh: () => { ipcRenderer.send('request-strip-refresh'); },
  sendGridOffsetDelta: (deltaX, deltaY, tool) => { ipcRenderer.send('from-frame-grid-offset', { deltaX: Number(deltaX) || 0, deltaY: Number(deltaY) || 0, tool: tool || 'hand' }); },
  setGridOffsetAbsolute: (gridOffsetX, gridOffsetY, gridOffsetYBottom) => { ipcRenderer.send('set-grid-offset-absolute', { gridOffsetX: Number(gridOffsetX) || 0, gridOffsetY: Number(gridOffsetY) || 0, gridOffsetYBottom: Number.isFinite(Number(gridOffsetYBottom)) ? Number(gridOffsetYBottom) : 0 }); },
  applyWidthNarrow: () => { ipcRenderer.send('strip-apply-width-narrow'); },
  applyWidthWiden: () => { ipcRenderer.send('strip-apply-width-widen'); },
  /** edge: 'left' | 'right', delta: display-pixels (+ = smaller grid from that side) */
  applyWidthEdge: (edge, delta) => { ipcRenderer.send('strip-adjust-width-edge', { edge: edge === 'right' ? 'right' : 'left', delta: Number(delta) || 0 }); },
  applyHeightEdge: (edge, delta) => { ipcRenderer.send('strip-adjust-height-edge', { edge: edge === 'bottom' ? 'bottom' : 'top', delta: Number(delta) || 0 }); },
  applyVerticalPush: () => { ipcRenderer.send('strip-apply-vertical-push'); },
  applyVerticalStretch: () => { ipcRenderer.send('strip-apply-vertical-stretch'); },
  jumpTo: (position) => ipcRenderer.invoke('frame-preview-jump-to', position),
  setActiveFrameByNumber: (frameNumber) => ipcRenderer.invoke('set-active-frame', frameNumber),
  setWindowSize: (w, h) => ipcRenderer.invoke('set-frame-window-size', w, h),
  resetGridToDefault: () => ipcRenderer.invoke('reset-grid-to-default'),
  sendStatus: (percent, operation) => ipcRenderer.send('strip-preview-status', { percent, operation }),
  /** true = Shift+Samendruk (max. naar beneden), false = Shift+Uitrek (max. omhoog); rigide pan, gelijke celhoogte. */
  applyVerticalRigidPanBoundary: (towardCompress) => {
    ipcRenderer.send('strip-vertical-rigid-pan-boundary', { towardCompress: !!towardCompress });
  },
  /** delta preview-px: rigide verticale pan (zelfde als Hand ▲▼), geen celhoogte-wijziging */
  applyVerticalFixedBottomStep: (delta) => { ipcRenderer.send('strip-vertical-fixed-bottom-step', { delta: Number(delta) || 0 }); },
  setVerticalAnchor: (mode, customK) => {
    ipcRenderer.send('strip-vertical-anchor', {
      mode: typeof mode === 'string' ? mode : 'bottomFixed',
      customK: customK != null ? Number(customK) : undefined
    });
  },
  setPanelLinkVerticalAnchor: (link) => {
    ipcRenderer.send('strip-panel-link-vertical-anchor', { link: !!link });
  },
  navigateProjectScan: (direction) => { ipcRenderer.send('strip-navigate-scan', { direction: direction === 'next' ? 'next' : 'prev' }); },
  /** Spring naar scanlint op positie 1..n (zelfde als vorige/volgende: eerst project opslaan). */
  gotoProjectScan: (index) => { ipcRenderer.send('strip-navigate-scan', { index: Number(index) }); },
  presetsList: () => ipcRenderer.invoke('presets-list'),
  stripPresetSave: (name) => ipcRenderer.send('strip-preset-save', typeof name === 'string' ? name : ''),
  stripPresetLoad: (id) => ipcRenderer.send('strip-preset-load', id),
  stripPresetDelete: (id) => ipcRenderer.send('strip-preset-delete', id),
  onPresetsUpdated: (cb) => { ipcRenderer.on('presets-updated', () => cb && cb()); }
});
