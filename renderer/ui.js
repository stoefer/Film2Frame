/**
 * UI-binding – koppelt DOM aan state en preview. Enige module die getElementById gebruikt.
 */
import { getState, setStrip, setRotation90, setFineRotation, setNumFrames, setActiveFrameIndex, setZoomFrames, setFramePreviewVisibleFrames, setStripPreviewMaxDim, setExportFolderPath, setExportBaseName, setExportPauseSeconds, setGridOffset, setGridOffsetXMargins, setGridOffsetYOnly, setGridOffsetYBottom, setDirty, setFlipHorizontal, setFlipVertical, setTimecodeFps, setFilmFormat, setFilmPolarity, setTiltPivot, setOutputFormat, setJpgQuality, setScanDpi, setArrowStepPx, setArrowStepShiftPx, setPreserveGridOnScanNav, setAutoAdvanceAfterAlign as setAutoAdvanceAfterAlignState, setAutoRasterAssistMode as setAutoRasterAssistModeState, setAutoRasterAssistXRef as setAutoRasterAssistXRefState, setAutoRasterAssistYRef as setAutoRasterAssistYRefState, setAutoRasterAssistPreset as setAutoRasterAssistPresetState, setAutoRasterAssistExtraLeftPx as setAutoRasterAssistExtraLeftPxState, setAutoRasterAssistExtraRightPx as setAutoRasterAssistExtraRightPxState, setAutoRasterAssistExtraTopPx as setAutoRasterAssistExtraTopPxState, setAutoRasterAssistExtraBottomPx as setAutoRasterAssistExtraBottomPxState, setAutoRasterCenterBeforeDetect as setAutoRasterCenterBeforeDetectState, setAutoRasterDetectOnScanNav as setAutoRasterDetectOnScanNavState, setAutoRasterLeftWhiteMinMarginPx as setAutoRasterLeftWhiteMinMarginPxState, setAutoRasterDarkLineLeftBiasPx as setAutoRasterDarkLineLeftBiasPxState, setAutoRasterDarkLineStrongScale as setAutoRasterDarkLineStrongScaleState, setAutoRasterDarkLineStrongScaleAuto as setAutoRasterDarkLineStrongScaleAutoState, setAutoRasterDarkBottomBiasPx as setAutoRasterDarkBottomBiasPxState, setAutoRasterDarkLineThickness as setAutoRasterDarkLineThicknessState, setAutoRasterDarkLineSearchRangePx as setAutoRasterDarkLineSearchRangePxState, setAutoRasterTriangleSensitivity as setAutoRasterTriangleSensitivityState, getLintStateSnapshot, getGridGeometrySnapshot, applyGridGeometrySnapshot, setLintStateForPath, updateProjectScanInfos, updateProjectScanFolder, applyLintState, setGridVerticalAnchorMode, setGridVerticalPivotCustomK, setGridSplitLowerPanCanvas, setGridPanelLinkVerticalAnchor, setFixResolutionLocked, resetGridToDefault as resetGridStateToDefault, getLintStateForPath, applyAutoOrientationFromNaturalSize } from './state.js';
import { loadImage, getStripCanvas, getStripCanvasDimensions, getStripCanvasPairForExport, releaseStripCanvasPair, invalidateStripCanvasCache, disposeCanvas, getExportStripDimensions } from './strip-loader.js';
import {
  getFrameDimensions,
  getEffectiveGridOffsetX,
  getDefaultGridOffsetX,
  cropFrameAtIndexForExport,
  getFrameCropRectInStripPx,
  clampGridMarginsCanvas,
  clampGridVerticalMarginsCanvas,
  getEffectiveGridMargins,
  applyRigidVerticalPanStepCanvas,
  applyBottomAnchoredVerticalPanStepCanvas,
  rigidVerticalPanToBoundaryCanvas,
  bottomAnchoredVerticalPanToBoundaryCanvas,
  panVerticalMarginsPreserveHeightOnStrip,
  getMinGridOffsetYCanvas,
  getMinGridOffsetYBottomCanvas,
  usesSplitLowerVerticalPan,
  panelUsesVerticalAnchorLink,
  resolveVerticalPivotKFromState,
  applySplitLowerPanStepCanvas,
  splitLowerPanToBoundaryCanvas,
  clampGridSplitLowerPanCanvas,
  ensurePivotFrozenLowerCellHeight,
  getLadderRowsCanvas,
  getGridRect
} from './grid.js';
import { refreshPreviews, refreshPreviewsGridOnly, getScaledDimensions, getScaledDimensionsFromSize, buildGridPayload } from './preview.js';
import { perfLog, perfStart, isPerfEnabled, setPerfEnabled } from './perf.js';
import { hasProject, getProjectMeta, getProjectPath, isDirty, createProject, openProject, openProjectFromFile, openProjectByPath, saveProject, deleteProject, closeCurrentProject, applySavedLintState, pickResumeLintPath, persistCurrentLintStateInProject, cancelPendingProjectSave } from './project.js';
import { getFromCache, prefetch, clearCache } from './strip-cache.js';

import { updateStatus } from './status.js';
import { getScanInfosWithProgressOverlay } from './scan-folder-overlay.js';
import { t, init as initI18n, setLocale as setI18nLocale, applyToDOM, getLocale } from './i18n.js';
import {
  MIN_FRAMES,
  MAX_FRAMES,
  ZOOM_MIN,
  ZOOM_MAX,
  GRID_OFFSET_PRESETS,
  STRIP_PREVIEW_MAX_DIM_OPTIONS,
  DEFAULT_STRIP_PREVIEW_MAX_DIM,
  DEFAULT_FRAMES_PER_STRIP
} from './constants.js';

/** Geeft Chromium tijd om te tekenen en IPC af te handelen (voorkomt vastlopende UI en strip-preview “bezig”). */
function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Voorkomt gestapelde export/navigatie die RAM tot OS-freeze opbouwen. */
let exportScanBusy = false;
let stripNavigateBusy = false;
let exportScanBatchRanges = [];
let exportScanBatchSelectedIndex = -1;
let exportScanBatchEditIndex = -1;
let exportScanBatchInsertMode = 'append';
let cachedProjectScanPaths = [];
let exportScanBatchAutoMerge = true;
let exportScanBatchWrapNav = false;
let exportBatchDisablePreview = false;
let exportScanBatchRangeRefs = {};
let exportBatchResumeState = null;
let transientStatusTimer = null;
let transientStatusToken = 0;
let autoRangeReferencePersistTimer = null;
let autoRangeReferenceSignatures = {};
const exportBatchRunState = {
  running: false,
  paused: false,
  stopRequested: false,
  mode: null // 'all-scans' | 'range-list'
};

const ids = {
  projectInfo: 'project-info',
  projectDirty: 'project-dirty',
  locale: 'f2f-locale',
  buildVersion: 'f2f-build-version',
  projectFirstStep: 'project-first-step',
  projectStats: 'project-stats',
  projectActionsSummary: 'project-actions-summary',
  stripSummaryLine: 'strip-summary-line',
  overviewRasterQuick: 'f2f-overview-raster-quick',
  overviewScanIndex: 'f2f-overview-scan-index',
  overviewScanDimensions: 'f2f-overview-scan-dimensions',
  overviewScanDpi: 'f2f-overview-scan-dpi',
  overviewFilmFormat: 'f2f-overview-film-format',
  overviewFrameExport: 'f2f-overview-frame-export',
  overviewResetGrid: 'f2f-overview-reset-grid',
  overviewOffsetX: 'f2f-overview-offset-x',
  overviewOffsetY: 'f2f-overview-offset-y',
  overviewRotate90: 'f2f-overview-rotate90',
  overviewFlipH: 'f2f-overview-flip-h',
  overviewFlipV: 'f2f-overview-flip-v',
  overviewZoomMode: 'f2f-overview-zoom-mode',
  statScanCount: 'f2f-stat-scan-count',
  statFramesPerScan: 'f2f-stat-frames-per-scan',
  statTotalFrames: 'f2f-stat-total-frames',
  statTimecode: 'f2f-stat-timecode',
  timecodeFps: 'f2f-timecode-fps',
  lintPanel: 'lint-panel',
  newProjectForm: 'new-project-form',
  showNewProjectForm: 'f2f-show-new-project-form',
  pickProjectFolder: 'f2f-pick-project-folder',
  projectFolderPath: 'f2f-project-folder-path',
  projectName: 'f2f-project-name',
  pickLocation: 'f2f-pick-location',
  locationPath: 'f2f-location-path',
  projectFrames: 'f2f-project-frames',
  scanCount: 'f2f-scan-count',
  scanCountManual: 'f2f-scan-count-manual',
  scanCountUseCurrent: 'f2f-scan-count-use-current',
  refreshScanCount: 'f2f-refresh-scan-count',
  scanOrientWrap: 'f2f-scan-orient-wrap',
  scanOrientSummary: 'f2f-scan-orient-summary',
  scanList: 'f2f-scan-list',
  createProject: 'f2f-create-project',
  cancelNewProject: 'f2f-cancel-new-project',
  refreshScanList: 'f2f-refresh-scan-list',
  newProject: 'f2f-new-project',
  openProject: 'f2f-open-project',
  openProjectFile: 'f2f-open-project-file',
  suggestProjectFolder: 'f2f-suggest-project-folder',
  saveProject: 'f2f-save-project',
  deleteProject: 'f2f-delete-project',
  closeProject: 'f2f-close-project',
  filename: 'f2f-filename',
  fineRotation: 'f2f-fine-rotation',
  fineRotationValue: 'f2f-fine-value',
  fineMinusCoarse: 'f2f-fine-minus-coarse',
  fineMinusFine: 'f2f-fine-minus-fine',
  finePlusFine: 'f2f-fine-plus-fine',
  finePlusCoarse: 'f2f-fine-plus-coarse',
  numFrames: 'f2f-num-frames',
  workflowSingleFrame: 'f2f-workflow-single-frame',
  workflowStarterFilm: 'f2f-workflow-starter-film',
  workflowApplyStarter: 'f2f-workflow-apply-starter',
  activeFrame: 'f2f-active-frame',
  frameOf: 'f2f-frame-of',
  prevFrame: 'f2f-prev-frame',
  nextFrame: 'f2f-next-frame',
  zoom: 'f2f-zoom',
  zoomValue: 'f2f-zoom-value',
  preset16mmDouble: 'f2f-preset-16mm-double',
  preset16mmSingle: 'f2f-preset-16mm-single',
  presetSuper16: 'f2f-preset-super16',
  gridMmWidth: 'f2f-grid-mm-width',
  gridMmHeight: 'f2f-grid-mm-height',
  gridMmFrames: 'f2f-grid-mm-frames',
  gridPxPerMm: 'f2f-grid-px-per-mm',
  applyGridFromMm: 'f2f-apply-grid-from-mm',
  gridRefPxWidth: 'f2f-grid-ref-px-width',
  gridRefPxHeight: 'f2f-grid-ref-px-height',
  gridRefPxFrames: 'f2f-grid-ref-px-frames',
  applyGridFromPx: 'f2f-apply-grid-from-px',
  captureGridRefPx: 'f2f-capture-grid-ref-px',
  gridPresetName: 'f2f-grid-preset-name',
  gridPresetList: 'f2f-grid-preset-list',
  gridPresetSave: 'f2f-grid-preset-save',
  gridPresetLoad: 'f2f-grid-preset-load',
  gridPresetDelete: 'f2f-grid-preset-delete',
  stripPreviewRes: 'f2f-strip-preview-res',
  pickExportFolder: 'f2f-pick-export-folder',
  exportFolderPath: 'f2f-export-folder-path',
  exportBaseName: 'f2f-export-base-name',
  exportPause: 'f2f-export-pause',
  exportScanFrom: 'f2f-export-scan-from',
  exportScanTo: 'f2f-export-scan-to',
  exportScanCount: 'f2f-export-scan-count',
  exportBatchRange: 'f2f-export-batch-range',
  exportBatchRangeAdd: 'f2f-export-batch-range-add',
  exportBatchRangeList: 'f2f-export-batch-range-list',
  exportBatchRangeEdit: 'f2f-export-batch-range-edit',
  exportBatchRangeInsertAbove: 'f2f-export-batch-range-insert-above',
  exportBatchRangeInsertBelow: 'f2f-export-batch-range-insert-below',
  exportBatchRangeRemove: 'f2f-export-batch-range-remove',
  exportBatchRangeClear: 'f2f-export-batch-range-clear',
  exportBatchRangeRun: 'f2f-export-batch-range-run',
  exportBatchRangePrev: 'f2f-export-batch-range-prev',
  exportBatchRangeNext: 'f2f-export-batch-range-next',
  exportBatchRangeImport: 'f2f-export-batch-range-import',
  exportBatchRangeOpenNotepad: 'f2f-export-batch-range-open-notepad',
  exportBatchRangeReimport: 'f2f-export-batch-range-reimport',
  exportBatchRangeMode: 'f2f-export-batch-range-mode',
  exportBatchRangeSummary: 'f2f-export-batch-range-summary',
  exportBatchAutoMerge: 'f2f-export-batch-auto-merge',
  exportBatchWrapNav: 'f2f-export-batch-wrap-nav',
  exportBatchDisablePreview: 'f2f-export-batch-disable-preview',
  exportBatchPause: 'f2f-export-batch-pause',
  exportBatchStop: 'f2f-export-batch-stop',
  exportBatchResume: 'f2f-export-batch-resume',
  exportBatchResumeHint: 'f2f-export-batch-resume-hint',
  exportCurrent: 'f2f-export-current',
  exportBatch: 'f2f-export-batch',
  frameGeneratorProgressWrap: 'f2f-frame-generator-progress-wrap',
  frameGeneratorProgressBarhost: 'f2f-frame-generator-progress-barhost',
  frameGeneratorProgressBar: 'f2f-frame-generator-progress-bar',
  frameGeneratorProgressPct: 'f2f-frame-generator-progress-pct',
  frameGeneratorProgressLabel: 'f2f-frame-generator-progress-label',
  avidemuxOpenFolder: 'f2f-avidemux-open-folder',
  avidemuxLaunch: 'f2f-avidemux-launch',
  avidemuxPickExe: 'f2f-avidemux-pick-exe',
  avidemuxPathDisplay: 'f2f-avidemux-path',
  prevScan: 'f2f-prev-scan',
  nextScan: 'f2f-next-scan',
  goToScan: 'f2f-go-to-scan',
  loadLint: 'f2f-load-lint',
  openStrip: 'f2f-open-strip',
  inlineStripPanel: 'f2f-inline-strip-panel',
  inlineStripFrame: 'f2f-inline-strip-frame',
  openAlignPreview: 'f2f-open-align-preview',
  openOutputPreview: 'f2f-open-output-preview',
  closeStrip: 'f2f-close-strip',
  filmFormat: 'f2f-film-format',
  polarityPos: 'f2f-polarity-pos',
  polarityNeg: 'f2f-polarity-neg',
  tiltPivot: 'f2f-tilt-pivot',
  outputFormat: 'f2f-output-format',
  jpgQuality: 'f2f-jpg-quality',
  jpgQualityWrap: 'f2f-jpg-quality-wrap',
  projectStarten: 'f2f-project-starten',
  exportOutputRes: 'f2f-export-output-res',
  openSettings: 'f2f-open-settings',
  openDocs: 'f2f-open-docs',
  buildVersion: 'f2f-build-version',
  aboutBtn: 'f2f-about-btn',
  aboutOverlay: 'f2f-about-overlay',
  aboutVersion: 'f2f-about-version',
  aboutClose: 'f2f-about-close',
  eulaOverlay: 'f2f-eula-overlay',
  eulaText: 'f2f-eula-text',
  eulaCheckbox: 'f2f-eula-checkbox',
  eulaAccept: 'f2f-eula-accept',
  eulaDecline: 'f2f-eula-decline',
  eulaLocale: 'f2f-eula-locale'
};

function el(id) { return document.getElementById(id); }

const inlineStripUpdateListeners = new Set();
const inlineStripShortcutListeners = new Set();
const inlineStripLocaleListeners = new Set();
const inlineStripZoomModeListeners = new Set();
let inlineStripLastPayload = null;
let inlineStripLastZoomMode = 'fit-height';
/* Langere debounce: bij grote projecten (duizenden scans) kost project.json wegschrijven seconden.
 * Door pas na een pauze op te slaan, blokkeert snel navigeren (Vorige/Volgende/bereik) niet meer. */
const AUTO_SAVE_DEBOUNCE_MS = 4000;
let autoSaveTimer = null;
let autoSaveInFlight = false;
let autoSaveQueued = false;

function emitInlineStripUpdate(payload) {
  inlineStripLastPayload = payload || null;
  inlineStripUpdateListeners.forEach((cb) => {
    try { cb && cb(payload); } catch (_) {}
  });
}

function emitInlineStripShortcuts(payload) {
  inlineStripShortcutListeners.forEach((cb) => {
    try { cb && cb(payload); } catch (_) {}
  });
}

function emitInlineStripLocaleChanged() {
  inlineStripLocaleListeners.forEach((cb) => {
    try { cb && cb(); } catch (_) {}
  });
}

function emitInlineStripZoomMode(mode) {
  const next = mode === 'fit-width' || mode === 'fit-height' || mode === 'fit-frame' ? mode : 'fit-height';
  inlineStripLastZoomMode = next;
  inlineStripZoomModeListeners.forEach((cb) => {
    try { cb && cb(next); } catch (_) {}
  });
}

function queueAutoSave() {
  if (!hasProject() || !isDirty()) return;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    void runAutoSaveNow();
  }, AUTO_SAVE_DEBOUNCE_MS);
}

/** Voer een uitgestelde autosave nu meteen uit (bij projectwissel, sluiten, afsluiten). */
async function flushAutoSaveNow() {
  if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
  if (!hasProject() || !isDirty()) return;
  try {
    persistCurrentLintStateInProject();
    await saveProject();
  } catch (_) {}
}

async function runAutoSaveNow() {
  if (!hasProject() || !isDirty()) return;
  if (autoSaveInFlight) {
    autoSaveQueued = true;
    return;
  }
  autoSaveInFlight = true;
  try {
    persistCurrentLintStateInProject();
    const result = await saveProject();
    if (result?.ok) {
      updateProjectUI();
    } else if (result?.error) {
      console.warn('[autosave] save failed:', result.error);
    }
  } catch (err) {
    console.warn('[autosave] save failed:', err?.message || err);
  } finally {
    autoSaveInFlight = false;
    if (autoSaveQueued) {
      autoSaveQueued = false;
      queueAutoSave();
    }
  }
}

function setupInlineStripBridge() {
  window.__f2fInlineStripPushUpdate = emitInlineStripUpdate;
  window.__f2fOnRasterPreviewRefreshed = () => {
    queueAutoPersistCurrentRangeReference();
  };
  window.__f2fInvokeStripApi = (method, args) => {
    const api = window.__f2fEmbeddedStripApi;
    if (!api || typeof method !== 'string') return null;
    const fn = api[method];
    if (typeof fn !== 'function') return null;
    try {
      return fn.apply(api, Array.isArray(args) ? args : []);
    } catch (_) {
      return null;
    }
  };
  window.__f2fEmbeddedStripApi = {
    onStripUpdate: (cb) => {
      if (typeof cb !== 'function') return;
      inlineStripUpdateListeners.add(cb);
      if (inlineStripLastPayload) {
        try { cb(inlineStripLastPayload); } catch (_) {}
      }
    },
    requestStripRefresh: () => {
      refreshPreviews();
    },
    requestPickScanFolderFromStrip: () => onPickScanFolderFromStrip(),
    sendGridOffsetDelta: (deltaX, deltaY, tool) => {
      onFrameGridOffsetFromPreview({ deltaX: Number(deltaX) || 0, deltaY: Number(deltaY) || 0, tool: tool || 'hand' });
    },
    setGridOffsetAbsolute: (gridOffsetX, gridOffsetY, gridOffsetYBottom) => {
      onSetGridOffsetAbsolute({
        gridOffsetX: Number(gridOffsetX) || 0,
        gridOffsetY: Number(gridOffsetY) || 0,
        gridOffsetYBottom: Number.isFinite(Number(gridOffsetYBottom)) ? Number(gridOffsetYBottom) : 0
      });
    },
    applyWidthNarrow: () => onWidthNarrow(),
    applyWidthWiden: () => onWidthWiden(),
    applyWidthEdge: (edge, delta) => onStripAdjustWidthEdge({ edge: edge === 'right' ? 'right' : 'left', delta: Number(delta) || 0 }),
    applyHeightEdge: (edge, delta) => onStripAdjustHeightEdge({ edge: edge === 'bottom' ? 'bottom' : 'top', delta: Number(delta) || 0 }),
    applyGridFrameSizePx: (frameWidthPx, frameHeightPx, pixelSpace) =>
      onStripApplyFrameSizePx({ frameWidthPx, frameHeightPx, pixelSpace }),
    applyVerticalPush: () => onVerticalPush(),
    applyVerticalStretch: () => onVerticalStretch(),
    jumpTo: (position) => onFramePreviewJump(position),
    setActiveFrameByNumber: (frameNumber) => Promise.resolve(onSetActiveFrameFromPreview(frameNumber)),
    setWindowSize: () => Promise.resolve(),
    resetGridToDefault: () => Promise.resolve(resetGridToDefault()),
    sendStatus: (percent, operation) => updateStatus(percent, operation),
    applyVerticalRigidPanBoundary: (towardCompress) => onStripVerticalRigidPanBoundaryFromPreview(!!towardCompress),
    applyVerticalFixedBottomStep: (delta, duwKind) => onStripVerticalFixedBottomStep({ delta: Number(delta) || 0, duwKind }),
    setVerticalAnchor: (mode, customK) => onStripVerticalAnchorFromPreview({ mode, customK }),
    setPanelLinkVerticalAnchor: (link) => {
      const next = !!link;
      if (next === (getState().gridPanelLinkVerticalAnchor !== false)) return;
      setGridPanelLinkVerticalAnchor(next);
      syncGridSplitLowerPanClamp();
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setFixResolutionLocked: (locked) => {
      const next = !!locked;
      if (next === (getState().fixResolutionLocked === true)) return;
      setFixResolutionLocked(next);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterAssistMode: (mode) => {
      const cur = getState().autoRasterAssistMode === 'strong' ? 'strong' : (getState().autoRasterAssistMode === 'soft' ? 'soft' : 'off');
      const next = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
      const resolved = next === 'soft' || next === 'strong' ? next : 'off';
      if (resolved === cur) return;
      setAutoRasterAssistModeState(resolved);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterAssistXRef: (ref) => {
      const cur = getState().autoRasterAssistXRef === 'left' ? 'left' : 'right';
      const resolved = typeof ref === 'string' && ref.trim().toLowerCase() === 'left' ? 'left' : 'right';
      if (resolved === cur) return;
      setAutoRasterAssistXRefState(resolved);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterAssistYRef: (ref) => {
      const cur = getState().autoRasterAssistYRef === 'top' || getState().autoRasterAssistYRef === 'bottom'
        ? getState().autoRasterAssistYRef
        : 'both';
      const raw = typeof ref === 'string' ? ref.trim().toLowerCase() : '';
      const resolved = raw === 'top' || raw === 'bottom' ? raw : 'both';
      if (resolved === cur) return;
      setAutoRasterAssistYRefState(resolved);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterAssistPreset: (preset) => {
      const cur = getAssistPreset();
      const raw = typeof preset === 'string' ? preset.trim().toLowerCase() : '';
      const resolved =
        raw === 'standard' || raw === 'bottom-soft' || raw === 'difficult-edge' || raw === 'bottom-v2' || raw === 'black-line' || raw === 'black-line-left' || raw === 'sprocket-left' || raw === 'sprocket-right' || raw === 'left-white' || raw === 'right-white'
          ? raw
          : 'bottom-v1';
      if (resolved === cur) return;
      setAutoRasterAssistPresetState(resolved);
      applyAssistPresetDefaultRefs(resolved);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    /** Analyseer huidige strip en kies de best passende assist-preset (geen detectie). */
    suggestAssistPreset: () => {
      const result = analyzeBestAssistPreset();
      if (!result || !result.ok || !result.preset) return result || { ok: false, preset: null };
      const changed = result.preset !== getAssistPreset();
      if (changed) setAutoRasterAssistPresetState(result.preset);
      const xBefore = getAssistXRef();
      const yBefore = getAssistYRef();
      applyAssistPresetDefaultRefs(result.preset);
      const refsChanged = getAssistXRef() !== xBefore || getAssistYRef() !== yBefore;
      let assistMode = getAssistMode();
      let modeChanged = false;
      if (assistMode === 'off') {
        setAutoRasterAssistModeState('soft');
        assistMode = 'soft';
        modeChanged = true;
      }
      if (changed || modeChanged || refsChanged) {
        setDirty();
        updateUI();
        requestAnimationFrame(() => refreshPreviewsGridOnly());
      }
      return { ...result, assistMode, changed, modeChanged };
    },
    setAutoRasterAssistExtraLeftPx: (px) => {
      const cur = Math.max(0, Math.min(400, Math.round(Number(getState().autoRasterAssistExtraLeftPx) || 0)));
      const next = Math.max(0, Math.min(400, Math.round(Number(px) || 0)));
      if (next === cur) return;
      setAutoRasterAssistExtraLeftPxState(next);
      applyAssistExtraShiftXDelta(next - cur);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterAssistExtraRightPx: (px) => {
      const cur = Math.max(0, Math.min(400, Math.round(Number(getState().autoRasterAssistExtraRightPx) || 0)));
      const next = Math.max(0, Math.min(400, Math.round(Number(px) || 0)));
      if (next === cur) return;
      setAutoRasterAssistExtraRightPxState(next);
      // Extra R = naar links → tegengesteld aan Extra L
      applyAssistExtraShiftXDelta(-(next - cur));
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterAssistExtraTopPx: (px) => {
      const cur = Math.max(0, Math.min(400, Math.round(Number(getState().autoRasterAssistExtraTopPx) || 0)));
      const next = Math.max(0, Math.min(400, Math.round(Number(px) || 0)));
      if (next === cur) return;
      setAutoRasterAssistExtraTopPxState(next);
      applyAssistExtraShiftYDelta(next - cur);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterAssistExtraBottomPx: (px) => {
      const cur = Math.max(0, Math.min(400, Math.round(Number(getState().autoRasterAssistExtraBottomPx) || 0)));
      const next = Math.max(0, Math.min(400, Math.round(Number(px) || 0)));
      if (next === cur) return;
      setAutoRasterAssistExtraBottomPxState(next);
      // Extra B = omhoog → tegengesteld aan Extra T
      applyAssistExtraShiftYDelta(-(next - cur));
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterCenterBeforeDetect: (enabled) => {
      const cur = getState().autoRasterCenterBeforeDetect === true;
      const next = !!enabled;
      if (next === cur) return;
      setAutoRasterCenterBeforeDetectState(next);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterDetectOnScanNav: (enabled) => {
      const cur = getState().autoRasterDetectOnScanNav === true;
      const next = !!enabled;
      if (next === cur) return;
      setAutoRasterDetectOnScanNavState(next);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterLeftWhiteMinMarginPx: (px) => {
      const cur = Math.max(0, Math.min(24, Math.round(Number(getState().autoRasterLeftWhiteMinMarginPx) || 0)));
      const next = Math.max(0, Math.min(24, Math.round(Number(px) || 0)));
      if (next === cur) return;
      setAutoRasterLeftWhiteMinMarginPxState(next);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterDarkLineLeftBiasPx: (px) => {
      const cur = Math.max(0, Math.min(6, Math.round(Number(getState().autoRasterDarkLineLeftBiasPx) || 0)));
      const next = Math.max(0, Math.min(6, Math.round(Number(px) || 0)));
      if (next === cur) return;
      setAutoRasterDarkLineLeftBiasPxState(next);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterDarkLineStrongScale: (v) => {
      const cur = Math.max(1, Math.min(48, Math.round(Number(getState().autoRasterDarkLineStrongScale) || 0)));
      const next = Math.max(1, Math.min(48, Math.round(Number(v) || 0)));
      if (next === cur) return;
      setAutoRasterDarkLineStrongScaleState(next);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterDarkLineStrongScaleAuto: (enabled) => {
      const cur = getState().autoRasterDarkLineStrongScaleAuto === true;
      const next = !!enabled;
      if (next === cur) return;
      setAutoRasterDarkLineStrongScaleAutoState(next);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterDarkBottomBiasPx: (px) => {
      const cur = Math.max(-24, Math.min(24, Math.round(Number(getState().autoRasterDarkBottomBiasPx) || 0)));
      const next = Math.max(-24, Math.min(24, Math.round(Number(px) || 0)));
      if (next === cur) return;
      setAutoRasterDarkBottomBiasPxState(next);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterDarkLineThickness: (v) => {
      const cur = getAssistDarkLineThickness();
      const next = Math.max(1, Math.min(10, Math.round(Number(v) || 5)));
      if (next === cur) return;
      setAutoRasterDarkLineThicknessState(next);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterDarkLineSearchRangePx: (px) => {
      const cur = getAssistDarkLineSearchRangePx();
      const next = Math.max(20, Math.min(300, Math.round(Number(px) || 160)));
      if (next === cur) return;
      setAutoRasterDarkLineSearchRangePxState(next);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    setAutoRasterTriangleSensitivity: (v) => {
      const cur = getAssistTriangleSensitivity();
      const next = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
      if (next === cur) return;
      setAutoRasterTriangleSensitivityState(next);
      setDirty();
      updateUI();
      requestAnimationFrame(() => refreshPreviewsGridOnly());
    },
    centerGridManual: () => onCenterGridFromPreview(),
    autoDetectFrameBounds: () => onAutoDetectFrameBoundsFromPreview(),
    setAutoAdvanceAfterAlign: (enabled) => {
      const next = !!enabled;
      if (getState().autoAdvanceAfterAlign === next) return;
      if (!next) {
        autoAdvanceScheduleToken += 1;
        setAutoAdvanceAfterAlignState(next);
        updateUI();
        refreshPreviewsGridOnly();
        return;
      }
      setAutoAdvanceAfterAlignState(next);
      updateUI();
      refreshPreviewsGridOnly();
      // Bij inschakelen: huidige scan valideren; bij fout stil Auto uitzetten (geen foutmelding)
      if (shouldAutoDetectAfterScanNav()) {
        let detectRes = null;
        try {
          detectRes = onAutoDetectFrameBoundsFromPreview({ fromScanNav: true });
        } catch (_) {
          detectRes = null;
        }
        if (detectRes && typeof detectRes === 'object' && detectRes.badScan) {
          // Niet stil Auto uitzetten: gebruiker wil door; zwakke detectie houdt vorig raster.
          updateStatus(0, t('status.autoAdvanceDetectWeak'));
        }
      }
    },
    stopAutoAdvanceAfterAlign: (statusMsg) => {
      stopAutoAdvanceAfterAlign(statusMsg || t('status.autoAdvanceStopped'));
    },
    navigateProjectScan: (request) => {
      if (request && typeof request === 'object') return onStripNavigateScan(request);
      return onStripNavigateScan({ direction: request });
    },
    gotoProjectScan: (request) => {
      if (request && typeof request === 'object') return onStripNavigateScan(request);
      return onStripNavigateScan({ index: request });
    },
    goToPreviousBatchRange: () => onGoToPreviousBatchRange(),
    goToNextBatchRange: () => onGoToNextBatchRange(),
    gotoBatchRange: (request) => {
      const idx = request && typeof request === 'object' ? request.index : request;
      return onGoToBatchRangeByNumber(idx);
    },
    getBatchRangeContext: () => getBatchRangeContextForCurrentFrame(),
    setCurrentFrameAsBatchRangeReference: () => setCurrentFrameAsRangeReference(),
    getLocale: () => window.api?.getLocale?.(),
    getTranslations: () => window.api?.getTranslations?.(),
    saveMacroFile: (payload) => window.api?.saveMacroFile?.(payload),
    openMacroFile: () => window.api?.openMacroFile?.(),
    stripRotate90: () => onRotate90(),
    getStripShortcuts: () => window.api?.getStripShortcuts?.() || Promise.resolve({ order: [], bindings: {} }),
    onStripShortcutsUpdated: (cb) => {
      if (typeof cb !== 'function') return;
      inlineStripShortcutListeners.add(cb);
    },
    onStripLocaleChanged: (cb) => {
      if (typeof cb !== 'function') return;
      inlineStripLocaleListeners.add(cb);
    },
    onZoomModeRequest: (cb) => {
      if (typeof cb !== 'function') return;
      inlineStripZoomModeListeners.add(cb);
      try { cb(inlineStripLastZoomMode); } catch (_) {}
    },
    setZoomMode: (mode) => {
      emitInlineStripZoomMode(mode);
    },
    stripSetFlip: (flipHorizontal, flipVertical) => {
      setFlipHorizontal(!!flipHorizontal);
      setFlipVertical(!!flipVertical);
      setDirty();
      updateUI();
      refreshPreviews();
    }
  };
}

function initInlineStripFrame() {
  const frame = el(ids.inlineStripFrame);
  if (!frame) return;
  if (!frame.getAttribute('src')) {
    frame.setAttribute('src', 'windows/strip-preview.html');
  }
}

/** Zet totaal aantal frames om naar tijdcode HH:MM:SS:FF. */
function framesToTimecode(totalFrames, fps) {
  if (!Number.isFinite(totalFrames) || totalFrames < 0 || !Number.isFinite(fps) || fps < 1) return '00:00:00:00';
  const f = Math.floor(Number(totalFrames));
  const fpsInt = Math.max(1, Math.round(Number(fps)));
  const ff = f % fpsInt;
  const totalSeconds = Math.floor(f / fpsInt);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

function updateStatsDisplay() {
  const statsWrap = el(ids.projectStats);
  const meta = getProjectMeta();
  const scanCountEl = el(ids.statScanCount);
  const framesPerScanEl = el(ids.statFramesPerScan);
  const totalFramesEl = el(ids.statTotalFrames);
  const timecodeEl = el(ids.statTimecode);
  const fpsEl = el(ids.timecodeFps);
  if (!hasProject() || !meta) {
    if (scanCountEl) scanCountEl.textContent = '—';
    if (framesPerScanEl) framesPerScanEl.textContent = '—';
    if (totalFramesEl) totalFramesEl.textContent = '—';
    if (timecodeEl) timecodeEl.textContent = '00:00:00:00';
    return;
  }
  const scanCount = Array.isArray(meta.scanInfos) && meta.scanInfos.length ? meta.scanInfos.length : (Number(meta.numberOfScans) || 0);
  const liveFrames = Number(getState().numFrames);
  const projectFrames = Number(meta.framesPerLint);
  const framesPerScan = Number.isFinite(liveFrames) && liveFrames > 0
    ? Math.round(liveFrames)
    : (Number.isFinite(projectFrames) && projectFrames > 0 ? Math.round(projectFrames) : 0);
  const totalFrames = scanCount * framesPerScan;
  const fps = Math.max(12, Math.min(30, getState().timecodeFps || 24));
  if (scanCountEl) scanCountEl.textContent = String(scanCount);
  if (framesPerScanEl) framesPerScanEl.textContent = String(framesPerScan);
  if (totalFramesEl) totalFramesEl.textContent = String(totalFrames);
  if (timecodeEl) timecodeEl.textContent = framesToTimecode(totalFrames, fps);
  if (fpsEl && fpsEl.value !== String(fps)) fpsEl.value = String(fps);
}

function updatePanelSummaryLines() {
  const projectSummaryEl = el(ids.projectActionsSummary);
  const stripSummaryEl = el(ids.stripSummaryLine);
  const s = getState();
  const meta = getProjectMeta();
  const hasProj = hasProject() && !!meta;

  if (projectSummaryEl) {
    if (!hasProj) {
      projectSummaryEl.textContent = t('project.summaryNoProject');
    } else {
      const scanCount =
        Array.isArray(meta.scanInfos) && meta.scanInfos.length
          ? meta.scanInfos.length
          : (Number(meta.numberOfScans) || 0);
      const name = meta.name || 'Project';
      const dirtyText = isDirty() ? t('project.summaryUnsavedShort') : t('project.summarySavedShort');
      projectSummaryEl.textContent = `${name} • ${scanCount} ${t('project.summaryScansUnit')} • ${dirtyText}`;
    }
  }

  if (stripSummaryEl) {
    if (!hasProj) {
      stripSummaryEl.textContent = t('strip.summaryNoProject');
    } else if (!s.path) {
      stripSummaryEl.textContent = t('strip.summaryNoScan');
    } else {
      const fileName = String(s.path).replace(/^.*[/\\]/, '');
      const active = Math.max(1, Math.min(Math.max(1, s.numFrames || 1), (s.activeFrameIndex || 0) + 1));
      const total = Math.max(1, s.numFrames || 1);
      const res = Math.max(512, Number(s.stripPreviewMaxDim) || DEFAULT_STRIP_PREVIEW_MAX_DIM);
      stripSummaryEl.textContent = t('strip.summaryLoaded', {
        name: fileName,
        active,
        total,
        res
      });
    }
  }
}

function getOverviewFilmFormatLabel(s) {
  const formatKeyMap = {
    '16mm-double': 'strip.filmFormat16mmDouble',
    '16mm-single': 'strip.filmFormat16mmSingle',
    super16: 'strip.filmFormatSuper16',
    '8mm': 'strip.filmFormat8mm',
    super8: 'strip.filmFormatSuper8',
    '9.5mm': 'strip.filmFormat9_5mm',
    '35mm': 'strip.filmFormat35mm'
  };
  const fk = formatKeyMap[s.filmFormat];
  const fmtLabel = fk ? t(fk) : (s.filmFormat ? String(s.filmFormat) : '—');
  if (!s.filmFormat) return '—';
  const pol = s.filmPolarity === 'negatief' ? t('strip.polarityNegative') : t('strip.polarityPositive');
  return `${fmtLabel}, ${pol}`;
}

function getOverviewExportCropLabel() {
  const s = getState();
  const preview = getStripCanvas();
  const exportDims = getExportStripDimensions();
  if (!preview || preview.width < 1 || preview.height < 1 || !exportDims) return '—';
  const n = Math.max(1, s.numFrames || 1);
  const activeIndex = Math.max(0, Math.min(n - 1, s.activeFrameIndex || 0));
  const r = getFrameCropRectInStripPx(preview, activeIndex);
  if (!r) return '—';
  const kx = exportDims.width / preview.width;
  const ky = exportDims.height / preview.height;
  if (!(kx > 0) || !(ky > 0)) return '—';
  const w = Math.max(1, Math.round(r.w * kx));
  const h = Math.max(1, Math.round(r.h * ky));
  return `${w} × ${h} px`;
}

function updateOverviewRasterQuickPanel() {
  const wrap = el(ids.overviewRasterQuick);
  if (!wrap) return;
  const s = getState();
  const meta = getProjectMeta();
  const hasProj = hasProject() && !!meta;
  wrap.classList.toggle('hidden', !hasProj);
  if (!hasProj) return;

  const scanIndexEl = el(ids.overviewScanIndex);
  const scanDimEl = el(ids.overviewScanDimensions);
  const scanDpiEl = el(ids.overviewScanDpi);
  const filmEl = el(ids.overviewFilmFormat);
  const frameExportEl = el(ids.overviewFrameExport);
  const oxEl = el(ids.overviewOffsetX);
  const oyEl = el(ids.overviewOffsetY);
  const flipHEl = el(ids.overviewFlipH);
  const flipVEl = el(ids.overviewFlipV);
  const zoomEl = el(ids.overviewZoomMode);

  let idx = null;
  let total = null;
  if (Array.isArray(meta.scanInfos) && meta.scanInfos.length) {
    total = meta.scanInfos.length;
    const si = s.path ? meta.scanInfos.findIndex((inf) => inf.path === s.path) : -1;
    if (si >= 0) idx = si + 1;
  }
  if (scanIndexEl) {
    scanIndexEl.textContent =
      Number.isFinite(idx) && idx >= 1
        ? (Number.isFinite(total) && total >= 1 ? `${idx} / ${total}` : String(idx))
        : '—';
  }
  if (scanDimEl) {
    const nw = Number(s.naturalWidth);
    const nh = Number(s.naturalHeight);
    scanDimEl.textContent = nw > 0 && nh > 0 ? `${Math.round(nw)} × ${Math.round(nh)} px` : '—';
  }
  if (scanDpiEl) {
    const dpi = Number(s.scanDpi);
    scanDpiEl.textContent = dpi > 0 ? `${Math.round(dpi)} DPI` : '—';
  }
  if (filmEl) filmEl.textContent = getOverviewFilmFormatLabel(s);
  if (frameExportEl) frameExportEl.textContent = getOverviewExportCropLabel();
  if (oxEl && document.activeElement !== oxEl) oxEl.value = String(Math.round(Number(s.gridOffsetX) || 0));
  if (oyEl && document.activeElement !== oyEl) oyEl.value = String(Math.round(Number(s.gridOffsetY) || 0));
  if (flipHEl && document.activeElement !== flipHEl) flipHEl.checked = !!s.flipHorizontal;
  if (flipVEl && document.activeElement !== flipVEl) flipVEl.checked = !!s.flipVertical;
  if (zoomEl && document.activeElement !== zoomEl) {
    const cur = String(zoomEl.value || '');
    const next = inlineStripLastZoomMode || 'fit-height';
    if (cur !== next) zoomEl.value = next;
  }
}

function updateProjectUI() {
  const firstStep = el(ids.projectFirstStep);
  const lintPanel = el(ids.lintPanel);
  const projectStatsWrap = el(ids.projectStats);
  const projectInfo = el(ids.projectInfo);
  const projectDirty = el(ids.projectDirty);
  const refreshScanListBtn = el(ids.refreshScanList);
  if (hasProject()) {
    if (refreshScanListBtn) refreshScanListBtn.classList.remove('hidden');
    const deleteProjectBtn = el(ids.deleteProject);
    if (deleteProjectBtn) deleteProjectBtn.classList.remove('hidden');
    const closeProjectBtn = el(ids.closeProject);
    if (closeProjectBtn) closeProjectBtn.classList.remove('hidden');
    if (projectStatsWrap) projectStatsWrap.classList.remove('hidden');
    updateStatsDisplay();
    const meta = getProjectMeta();
    const name = meta?.name || 'Project';
    const pathShort = getProjectPath() ? getProjectPath().replace(/^.*[/\\]/, '') : '';
    let infoText = `Project: ${name} (${pathShort})`;
    const infos = meta?.scanInfos;
    if (Array.isArray(infos) && infos.length) {
      const v = infos.filter(s => s.orientation === 'vertical').length;
      const h = infos.filter(s => s.orientation === 'horizontal').length;
      infoText += ` — ${infos.length} scans: ${v} V, ${h} H`;
    }
    if (projectInfo) projectInfo.textContent = infoText;
    if (projectDirty) {
      projectDirty.classList.toggle('hidden', !isDirty());
      projectDirty.textContent = ' ' + t('project.unsavedSuffix');
    }
    if (firstStep) firstStep.classList.add('hidden');
    if (lintPanel) lintPanel.classList.remove('hidden');
  } else {
    if (projectInfo) projectInfo.textContent = t('project.noProjectOpen');
    if (projectDirty) projectDirty.classList.add('hidden');
    if (refreshScanListBtn) refreshScanListBtn.classList.add('hidden');
    const deleteProjectBtn = el(ids.deleteProject);
    if (deleteProjectBtn) deleteProjectBtn.classList.add('hidden');
    const closeProjectBtn = el(ids.closeProject);
    if (closeProjectBtn) closeProjectBtn.classList.add('hidden');
    if (projectStatsWrap) projectStatsWrap.classList.add('hidden');
    if (firstStep) firstStep.classList.remove('hidden');
    if (lintPanel) lintPanel.classList.add('hidden');
  }
  updateOverviewRasterQuickPanel();
  updatePanelSummaryLines();
  queueAutoSave();
}

function updateUI() {
  const s = getState();
  const n = Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, s.numFrames));
  if (el(ids.filename)) el(ids.filename).textContent = s.path ? s.path.replace(/^.*[/\\]/, '') : '—';
  if (el(ids.numFrames)) el(ids.numFrames).value = String(n);
  if (el(ids.gridMmFrames)) el(ids.gridMmFrames).value = String(n);
  if (el(ids.activeFrame)) {
    el(ids.activeFrame).value = String(s.activeFrameIndex + 1);
    el(ids.activeFrame).max = String(n);
  }
  if (el(ids.frameOf)) el(ids.frameOf).textContent = '/ ' + n;
  if (el(ids.zoomValue)) el(ids.zoomValue).textContent = s.zoomFrames.toFixed(1);
  const frFine = Math.round(s.fineRotationDeg * 1000) / 1000;
  if (el(ids.fineRotationValue) && document.activeElement !== el(ids.fineRotationValue)) {
    el(ids.fineRotationValue).value = frFine.toFixed(3);
  }
  if (el(ids.fineRotation) && document.activeElement !== el(ids.fineRotation)) {
    el(ids.fineRotation).value = String(Math.round(frFine * 1000));
  }
  if (el(ids.zoom)) {
    const v = 1 + ((ZOOM_MAX - s.zoomFrames) / (ZOOM_MAX - ZOOM_MIN)) * 99;
    el(ids.zoom).value = String(Math.round(Math.max(1, Math.min(100, v))));
  }
  const stripResEl = el(ids.stripPreviewRes);
  if (stripResEl) {
    const val = Number(s.stripPreviewMaxDim) || DEFAULT_STRIP_PREVIEW_MAX_DIM;
    const closest = STRIP_PREVIEW_MAX_DIM_OPTIONS.includes(val)
      ? val
      : STRIP_PREVIEW_MAX_DIM_OPTIONS.reduce((a, b) => Math.abs(a - val) <= Math.abs(b - val) ? a : b);
    stripResEl.value = String(closest);
  }
  if (el(ids.exportFolderPath)) el(ids.exportFolderPath).textContent = s.exportFolderPath ? (s.exportFolderPath.length > 50 ? '...' + s.exportFolderPath.slice(-47) : s.exportFolderPath) : '—';
  if (el(ids.exportBaseName)) el(ids.exportBaseName).value = s.exportBaseName || 'frame';
  const isJpgOut = s.outputFormat === 'jpg' || s.outputFormat === 'jpeg';
  if (el(ids.outputFormat) && document.activeElement !== el(ids.outputFormat)) {
    el(ids.outputFormat).value = isJpgOut ? 'jpg' : 'png';
  }
  if (el(ids.jpgQuality) && document.activeElement !== el(ids.jpgQuality)) {
    el(ids.jpgQuality).value = String(Math.max(1, Math.min(100, Math.round(Number(s.jpgQuality) || 92))));
  }
  if (el(ids.jpgQualityWrap)) el(ids.jpgQualityWrap).hidden = !isJpgOut;
  const scanCountEl = el(ids.exportScanCount);
  const totalScans = getProjectScanCountEstimate();
  const totalFrames = getProjectTotalFrameCountEstimate();
  if (scanCountEl) {
    scanCountEl.textContent = hasProject() && totalScans > 0 ? t('frameGenerator.scansInProject', { total: totalScans }) : t('frameGenerator.scanCountPlaceholder');
  }
  const fromEl = el(ids.exportScanFrom);
  const toEl = el(ids.exportScanTo);
  if (fromEl && totalFrames > 0) fromEl.max = String(totalFrames);
  if (toEl && totalFrames > 0) toEl.max = String(totalFrames);
  const hasSelection = exportScanBatchSelectedIndex >= 0 && exportScanBatchSelectedIndex < exportScanBatchRanges.length;
  const hasRanges = exportScanBatchRanges.length > 0;
  const editBtn = el(ids.exportBatchRangeEdit);
  const removeBtn = el(ids.exportBatchRangeRemove);
  const insertAboveBtn = el(ids.exportBatchRangeInsertAbove);
  const insertBelowBtn = el(ids.exportBatchRangeInsertBelow);
  const clearBtn = el(ids.exportBatchRangeClear);
  const runBtn = el(ids.exportBatchRangeRun);
  const importBtn = el(ids.exportBatchRangeImport);
  const openNotepadBtn = el(ids.exportBatchRangeOpenNotepad);
  const reimportBtn = el(ids.exportBatchRangeReimport);
  const prevBtn = el(ids.exportBatchRangePrev);
  const nextBtn = el(ids.exportBatchRangeNext);
  const autoMergeEl = el(ids.exportBatchAutoMerge);
  const wrapNavEl = el(ids.exportBatchWrapNav);
  const disablePreviewEl = el(ids.exportBatchDisablePreview);
  const pauseBtn = el(ids.exportBatchPause);
  const stopBtn = el(ids.exportBatchStop);
  const resumeBtn = el(ids.exportBatchResume);
  const resumeHintEl = el(ids.exportBatchResumeHint);
  const canWrapRangeNav = exportScanBatchWrapNav === true && exportScanBatchRanges.length > 1;
  if (editBtn) editBtn.disabled = !hasSelection;
  if (removeBtn) removeBtn.disabled = !hasSelection;
  if (insertAboveBtn) insertAboveBtn.disabled = false;
  if (insertBelowBtn) insertBelowBtn.disabled = false;
  if (clearBtn) clearBtn.disabled = !hasRanges;
  if (runBtn) runBtn.disabled = !hasRanges;
  if (importBtn) importBtn.disabled = false;
  if (openNotepadBtn) openNotepadBtn.disabled = false;
  if (reimportBtn) reimportBtn.disabled = false;
  if (prevBtn) prevBtn.disabled = !hasRanges || (!canWrapRangeNav && exportScanBatchSelectedIndex <= 0);
  if (nextBtn) nextBtn.disabled = !hasRanges || (!canWrapRangeNav && hasSelection && exportScanBatchSelectedIndex >= exportScanBatchRanges.length - 1);
  if (autoMergeEl) autoMergeEl.checked = exportScanBatchAutoMerge !== false;
  if (wrapNavEl) wrapNavEl.checked = exportScanBatchWrapNav === true;
  if (disablePreviewEl) disablePreviewEl.checked = exportBatchDisablePreview === true;
  if (pauseBtn) {
    pauseBtn.disabled = !exportBatchRunState.running;
    pauseBtn.textContent = exportBatchRunState.paused
      ? t('frameGenerator.batchResumeButton')
      : t('frameGenerator.batchPauseButton');
  }
  if (stopBtn) stopBtn.disabled = !exportBatchRunState.running;
  if (resumeBtn) resumeBtn.disabled = exportBatchRunState.running || !normalizeExportBatchResumeState(exportBatchResumeState);
  if (resumeHintEl) resumeHintEl.textContent = getExportBatchResumeHintText();
  syncScanCountInputMode();
  const tiltPivotEl = el(ids.tiltPivot);
  if (tiltPivotEl && tiltPivotEl.value !== s.tiltPivot) tiltPivotEl.value = s.tiltPivot || 'center';
  updateProjectUI();
  renderExportScanBatchRangeList();
}

function normalizeExportScanBatchRanges(raw, maxScanCount = Number.POSITIVE_INFINITY) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const max = Number.isFinite(maxScanCount) && maxScanCount > 0 ? Math.floor(maxScanCount) : Number.POSITIVE_INFINITY;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const fromRaw = Math.floor(Number(item.from));
    const toRaw = Math.floor(Number(item.to));
    if (!Number.isFinite(fromRaw) || !Number.isFinite(toRaw)) continue;
    let from = Math.max(1, fromRaw);
    let to = Math.max(1, toRaw);
    if (Number.isFinite(max)) {
      from = Math.min(max, from);
      to = Math.min(max, to);
    }
    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    out.push({ from, to });
  }
  return out;
}

function getExportScanBatchRangeKey(range) {
  if (!range || typeof range !== 'object') return '';
  const from = Math.max(1, Math.floor(Number(range.from) || 0));
  const to = Math.max(1, Math.floor(Number(range.to) || 0));
  if (!Number.isFinite(from) || !Number.isFinite(to)) return '';
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return `${lo}-${hi}`;
}

function normalizeExportScanBatchRangeRefs(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (!/^\d+-\d+$/.test(String(key))) continue;
    if (!entry || typeof entry !== 'object') continue;
    if (!entry.snapshot || typeof entry.snapshot !== 'object') continue;
    out[key] = {
      snapshot: entry.snapshot,
      savedAt: Number.isFinite(Number(entry.savedAt)) ? Number(entry.savedAt) : Date.now(),
      scanPath: typeof entry.scanPath === 'string' ? entry.scanPath : '',
      activeFrameIndex: Number.isFinite(Number(entry.activeFrameIndex)) ? Math.max(0, Math.floor(Number(entry.activeFrameIndex))) : 0
    };
  }
  return out;
}

function pruneExportScanBatchRangeRefsToCurrentRanges() {
  const allowed = new Set(exportScanBatchRanges.map((r) => getExportScanBatchRangeKey(r)).filter(Boolean));
  const next = {};
  for (const [key, entry] of Object.entries(exportScanBatchRangeRefs || {})) {
    if (allowed.has(key) && entry && typeof entry === 'object') next[key] = entry;
  }
  exportScanBatchRangeRefs = next;
}

function sortAndMergeExportScanBatchRanges(ranges) {
  const rows = Array.isArray(ranges) ? ranges.map((r) => ({ from: r.from, to: r.to })) : [];
  rows.sort((a, b) => (a.from - b.from) || (a.to - b.to));
  if (!rows.length) return [];
  const merged = [rows[0]];
  for (let i = 1; i < rows.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = rows[i];
    if (cur.from <= prev.to) {
      prev.to = Math.max(prev.to, cur.to);
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

function getProjectScanCountEstimate() {
  const meta = getProjectMeta();
  const count = (Array.isArray(meta?.scanInfos) && meta.scanInfos.length)
    ? meta.scanInfos.length
    : (Number(meta?.numberOfScans) || 0);
  return Math.max(0, Math.floor(count));
}

function getDefaultFramesPerScanEstimate() {
  const meta = getProjectMeta();
  const projectFrames = Math.floor(Number(meta?.framesPerLint));
  if (Number.isFinite(projectFrames) && projectFrames > 0) return projectFrames;
  const liveFrames = Math.floor(Number(getState().numFrames));
  if (Number.isFinite(liveFrames) && liveFrames > 0) return liveFrames;
  return 1;
}

function getScanFrameCountByPath(scanPath) {
  if (!scanPath) return getDefaultFramesPerScanEstimate();
  const lint = getLintStateForPath(scanPath);
  const savedFrames = Math.floor(Number(lint?.numFrames));
  if (Number.isFinite(savedFrames) && savedFrames > 0) return savedFrames;
  return getDefaultFramesPerScanEstimate();
}

/**
 * O(1) opzoektabel pad → opgeslagen aantal frames, uit lintStates. Voorkomt O(n²) bij duizenden scans
 * (voorheen deed elke scan een lineaire lintStates.find → ~22M vergelijkingen bij 4740 scans ≈ 3 s,
 * en dat per preview-refresh). Nu is de globale frame-map O(n).
 */
function buildScanFramesByPathLookup() {
  const m = new Map();
  const lintStates = getState().lintStates || [];
  for (let i = 0; i < lintStates.length; i++) {
    const ls = lintStates[i];
    if (ls && ls.path) {
      const nf = Math.floor(Number(ls.numFrames));
      if (Number.isFinite(nf) && nf > 0) m.set(ls.path, nf);
    }
  }
  return m;
}

function getProjectTotalFrameCountEstimate() {
  const meta = getProjectMeta();
  const paths = Array.isArray(meta?.scanInfos) ? meta.scanInfos.map((s) => s.path).filter(Boolean) : [];
  if (paths.length) {
    const framesByPath = buildScanFramesByPathLookup();
    const def = getDefaultFramesPerScanEstimate();
    let total = 0;
    for (let i = 0; i < paths.length; i++) total += Math.max(1, framesByPath.get(paths[i]) || def);
    return Math.max(0, total);
  }
  return getProjectScanCountEstimate() * getDefaultFramesPerScanEstimate();
}

function buildGlobalFrameMap(paths) {
  const framesByPath = buildScanFramesByPathLookup();
  const def = getDefaultFramesPerScanEstimate();
  const rows = [];
  let cursor = 1;
  for (let i = 0; i < paths.length; i++) {
    const scanPath = paths[i];
    const count = Math.max(1, framesByPath.get(scanPath) || def);
    const start = cursor;
    const end = start + count - 1;
    rows.push({ scanPath, scanIndex: i, count, start, end });
    cursor = end + 1;
  }
  return { rows, totalFrames: Math.max(0, cursor - 1) };
}

function resolveGlobalFramePosition(frameNo, rows) {
  const target = Math.max(1, Math.floor(Number(frameNo) || 1));
  for (const row of rows) {
    if (target >= row.start && target <= row.end) {
      return {
        scanPath: row.scanPath,
        scanIndex: row.scanIndex,
        frameInScan: (target - row.start) + 1
      };
    }
  }
  return null;
}

function resolveCurrentGlobalFrameContext() {
  const meta = getProjectMeta();
  const s = getState();
  if (!s?.path) return null;
  const pathsFromMeta = Array.isArray(meta?.scanInfos) ? meta.scanInfos.map((row) => row.path).filter(Boolean) : [];
  const paths = pathsFromMeta.length ? pathsFromMeta : (Array.isArray(cachedProjectScanPaths) ? cachedProjectScanPaths : []);
  if (!paths.length) return null;
  const map = buildGlobalFrameMap(paths);
  const currentPathKey = normPathKey(s.path);
  if (!currentPathKey) return null;
  const row = map.rows.find((entry) => normPathKey(entry.scanPath) === currentPathKey);
  if (!row) return null;
  const frameInScan = Math.max(1, Math.min(row.count, Math.floor(Number(s.activeFrameIndex) || 0) + 1));
  return {
    globalFrameNumber: row.start + frameInScan - 1,
    totalFrames: map.totalFrames,
    scanPath: row.scanPath,
    frameInScan
  };
}

function findBatchRangeIndexForGlobalFrame(globalFrameNumber) {
  const target = Math.floor(Number(globalFrameNumber) || 0);
  if (!Number.isFinite(target) || target < 1) return -1;
  for (let i = 0; i < exportScanBatchRanges.length; i++) {
    const range = exportScanBatchRanges[i];
    if (!range) continue;
    if (target >= range.from && target <= range.to) return i;
  }
  return -1;
}

function getBatchRangeContextForCurrentFrame() {
  const frameCtx = resolveCurrentGlobalFrameContext();
  if (!frameCtx) {
    return {
      globalFrameNumber: null,
      totalProjectFrames: getProjectTotalFrameCountEstimate(),
      rangeIndex: -1,
      rangeCount: exportScanBatchRanges.length,
      range: null
    };
  }
  const rangeIndex = findBatchRangeIndexForGlobalFrame(frameCtx.globalFrameNumber);
  const range = rangeIndex >= 0 ? exportScanBatchRanges[rangeIndex] : null;
  return {
    globalFrameNumber: frameCtx.globalFrameNumber,
    totalProjectFrames: frameCtx.totalFrames,
    rangeIndex,
    rangeCount: exportScanBatchRanges.length,
    range: range ? { from: range.from, to: range.to } : null
  };
}

function queueAutoPersistCurrentRangeReference() {
  if (exportBatchRunState.running) return;
  if (autoRangeReferencePersistTimer) clearTimeout(autoRangeReferencePersistTimer);
  autoRangeReferencePersistTimer = setTimeout(() => {
    autoRangeReferencePersistTimer = null;
    const ctx = getBatchRangeContextForCurrentFrame();
    if (!ctx || ctx.rangeIndex < 0 || !ctx.range) return;
    const snapshot = getLintStateSnapshot();
    if (!snapshot || typeof snapshot !== 'object') return;
    const key = getExportScanBatchRangeKey(ctx.range);
    if (!key) return;
    let signature = '';
    try {
      signature = JSON.stringify(snapshot);
    } catch (_) {
      signature = '';
    }
    if (!signature || autoRangeReferenceSignatures[key] === signature) return;
    persistCurrentRangeReferenceSnapshot(ctx.rangeIndex);
    autoRangeReferenceSignatures[key] = signature;
    renderExportScanBatchRangeList();
  }, 120);
}

function setExportRangeInputs(from, to) {
  const fromEl = el(ids.exportScanFrom);
  const toEl = el(ids.exportScanTo);
  const nextFrom = Math.max(1, Math.floor(Number(from) || 1));
  const nextTo = Math.max(1, Math.floor(Number(to) || 1));
  if (fromEl) fromEl.value = String(nextFrom);
  if (toEl) toEl.value = String(nextTo);
  persistExportRangeDraftInputs();
}

function setExportBatchInsertMode(mode) {
  const valid = mode === 'edit' || mode === 'insert-above' || mode === 'insert-below' ? mode : 'append';
  exportScanBatchInsertMode = valid;
  const modeEl = el(ids.exportBatchRangeMode);
  if (!modeEl) return;
  if (valid === 'edit') {
    modeEl.textContent = t('frameGenerator.batchRangeModeEdit');
  } else if (valid === 'insert-above') {
    modeEl.textContent = t('frameGenerator.batchRangeModeInsertAbove');
  } else if (valid === 'insert-below') {
    modeEl.textContent = t('frameGenerator.batchRangeModeInsertBelow');
  } else {
    modeEl.textContent = t('frameGenerator.batchRangeModeIdle');
  }
}

function persistExportScanBatchRanges() {
  if (!window.api?.setAppSettings) return;
  pruneExportScanBatchRangeRefsToCurrentRanges();
  const payload = {
    exportScanBatchRanges: exportScanBatchRanges.map((r) => ({ from: r.from, to: r.to })),
    exportScanBatchAutoMerge: exportScanBatchAutoMerge !== false,
    exportScanBatchWrapNav: exportScanBatchWrapNav === true,
    exportBatchDisablePreview: exportBatchDisablePreview === true,
    exportScanBatchRangeRefs: exportScanBatchRangeRefs
  };
  window.api.setAppSettings(payload).catch(() => {});
}

function persistCurrentRangeReferenceSnapshot(index = exportScanBatchSelectedIndex) {
  if (index < 0 || index >= exportScanBatchRanges.length) return;
  const range = exportScanBatchRanges[index];
  const key = getExportScanBatchRangeKey(range);
  if (!key) return;
  const s = getState();
  if (!s.path) return;
  const snapshot = getLintStateSnapshot();
  if (!snapshot) return;
  exportScanBatchRangeRefs[key] = {
    snapshot,
    savedAt: Date.now(),
    scanPath: s.path,
    activeFrameIndex: Math.max(0, Math.floor(Number(s.activeFrameIndex) || 0)),
    globalFrameNumber: (() => {
      const ctx = resolveCurrentGlobalFrameContext();
      return Number.isFinite(Number(ctx?.globalFrameNumber)) ? Number(ctx.globalFrameNumber) : null;
    })()
  };
  persistExportScanBatchRanges();
}

function applyRangeReferenceSnapshotForRange(range, _targetScanPath = '') {
  const key = getExportScanBatchRangeKey(range);
  if (!key) return false;
  const ref = exportScanBatchRangeRefs && exportScanBatchRangeRefs[key];
  if (!ref || !ref.snapshot || typeof ref.snapshot !== 'object') return false;
  applyLintState(ref.snapshot);
  return true;
}

function getRangeReferenceSnapshotForRange(range, _targetScanPath = '') {
  const key = getExportScanBatchRangeKey(range);
  if (!key) return null;
  const ref = exportScanBatchRangeRefs && exportScanBatchRangeRefs[key];
  if (!ref || !ref.snapshot || typeof ref.snapshot !== 'object') return null;
  return ref.snapshot;
}

function setCurrentFrameAsRangeReference() {
  if (!exportScanBatchRanges.length) return { ok: false, reason: 'empty' };
  const ctx = getBatchRangeContextForCurrentFrame();
  if (!ctx || ctx.rangeIndex < 0 || !ctx.range) return { ok: false, reason: 'no-range' };
  exportScanBatchSelectedIndex = ctx.rangeIndex;
  persistCurrentRangeReferenceSnapshot(ctx.rangeIndex);
  const key = getExportScanBatchRangeKey(ctx.range);
  if (key) {
    const snap = getLintStateSnapshot();
    if (snap && typeof snap === 'object') {
      try {
        autoRangeReferenceSignatures[key] = JSON.stringify(snap);
      } catch (_) {}
    }
  }
  renderExportScanBatchRangeList();
  showTransientStatusMessage(
    t('frameGenerator.batchRangeRefSetFromFrame', {
      from: ctx.range.from,
      to: ctx.range.to
    }),
    2000
  );
  return { ok: true, rangeIndex: ctx.rangeIndex, range: ctx.range };
}
function normalizeExportBatchResumeState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const mode = raw.mode === 'all-scans' || raw.mode === 'range-list' ? raw.mode : '';
  if (!mode) return null;
  const out = { mode };
  if (mode === 'all-scans') {
    const scanIndex = Math.max(0, Math.floor(Number(raw.scanIndex) || 0));
    const frameIndex = Math.max(1, Math.floor(Number(raw.frameIndex) || 1));
    out.scanIndex = scanIndex;
    out.frameIndex = frameIndex;
    if (typeof raw.scanPath === 'string' && raw.scanPath) out.scanPath = raw.scanPath;
  } else {
    const rangeIndex = Math.max(0, Math.floor(Number(raw.rangeIndex) || 0));
    const nextGlobalFrame = Math.max(1, Math.floor(Number(raw.nextGlobalFrame) || 1));
    out.rangeIndex = rangeIndex;
    out.nextGlobalFrame = nextGlobalFrame;
  }
  out.savedAt = Date.now();
  return out;
}

function persistExportBatchResumeState(state) {
  exportBatchResumeState = normalizeExportBatchResumeState(state);
  if (!window.api?.setAppSettings) return;
  window.api
    .setAppSettings({ exportBatchResumeState: exportBatchResumeState || null })
    .catch(() => {});
}

function getNormalizedOverlayGridRefPxValues() {
  const widthRaw = Number(el(ids.gridRefPxWidth)?.value);
  const heightRaw = Number(el(ids.gridRefPxHeight)?.value);
  const framesRaw = parseInt(el(ids.gridRefPxFrames)?.value, 10);
  return {
    width: Math.max(1, Math.min(20000, Number.isFinite(widthRaw) ? Math.round(widthRaw) : 103)),
    height: Math.max(1, Math.min(20000, Number.isFinite(heightRaw) ? Math.round(heightRaw) : 75)),
    frames: Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, Number.isFinite(framesRaw) ? Math.round(framesRaw) : 30))
  };
}

function persistOverlayGridRefPxValues() {
  if (!window.api?.setAppSettings) return;
  const v = getNormalizedOverlayGridRefPxValues();
  window.api
    .setAppSettings({
      overlayGridRefPxWidth: v.width,
      overlayGridRefPxHeight: v.height,
      overlayGridRefPxFrames: v.frames
    })
    .catch(() => {});
}

function persistExportRangeDraftInputs() {
  if (!window.api?.setAppSettings) return;
  const fromVal = Math.max(1, Math.floor(Number(el(ids.exportScanFrom)?.value) || 1));
  const toVal = Math.max(1, Math.floor(Number(el(ids.exportScanTo)?.value) || 1));
  window.api
    .setAppSettings({
      exportScanRangeDraftFrom: fromVal,
      exportScanRangeDraftTo: toVal
    })
    .catch(() => {});
}

function clearExportBatchResumeState() {
  exportBatchResumeState = null;
  if (!window.api?.setAppSettings) return;
  window.api.setAppSettings({ exportBatchResumeState: null }).catch(() => {});
}

function getExportBatchResumeHintText() {
  const state = normalizeExportBatchResumeState(exportBatchResumeState);
  if (!state) return t('frameGenerator.batchResumeHintNone');
  if (state.mode === 'all-scans') {
    return t('frameGenerator.batchResumeHintAllScans', {
      scan: Math.max(1, state.scanIndex + 1),
      frame: Math.max(1, state.frameIndex)
    });
  }
  return t('frameGenerator.batchResumeHintRangeList', {
    range: Math.max(1, state.rangeIndex + 1),
    frame: Math.max(1, state.nextGlobalFrame)
  });
}

function setExportBatchRunState(patch) {
  if (!patch || typeof patch !== 'object') return;
  if (patch.running !== undefined) exportBatchRunState.running = !!patch.running;
  if (patch.paused !== undefined) exportBatchRunState.paused = !!patch.paused;
  if (patch.stopRequested !== undefined) exportBatchRunState.stopRequested = !!patch.stopRequested;
  if (patch.mode !== undefined) exportBatchRunState.mode = patch.mode || null;
}

function beginBatchRun(mode) {
  if (exportBatchRunState.running) return false;
  setExportBatchRunState({ running: true, paused: false, stopRequested: false, mode });
  updateUI();
  return true;
}

function endBatchRun() {
  setExportBatchRunState({ running: false, paused: false, stopRequested: false, mode: null });
  updateUI();
}

function requestStopBatchRun() {
  if (!exportBatchRunState.running) return;
  setExportBatchRunState({ stopRequested: true, paused: false });
  updateStatus(0, t('frameGenerator.batchStopRequested'));
  updateUI();
}

function togglePauseBatchRun() {
  if (!exportBatchRunState.running) return;
  setExportBatchRunState({ paused: !exportBatchRunState.paused });
  updateUI();
}

async function waitForBatchRunGate(checkpointFactory, progressMessage) {
  while (exportBatchRunState.paused && !exportBatchRunState.stopRequested) {
    setFrameGeneratorProgress({
      visible: true,
      pct: Number(el(ids.frameGeneratorProgressPct)?.textContent?.replace('%', '')) || 0,
      message: progressMessage || t('frameGenerator.batchPausedStatus')
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  if (exportBatchRunState.stopRequested) {
    if (typeof checkpointFactory === 'function') {
      const checkpoint = checkpointFactory();
      if (checkpoint) persistExportBatchResumeState(checkpoint);
    }
    return true;
  }
  return false;
}

function getSelectedGlobalFramesCount(ranges) {
  const normalized = normalizeExportScanBatchRanges(ranges, Number.POSITIVE_INFINITY);
  const merged = sortAndMergeExportScanBatchRanges(normalized);
  let total = 0;
  for (const r of merged) {
    total += Math.max(0, (r.to - r.from + 1));
  }
  return total;
}

function renderExportScanBatchRangeList() {
  const listEl = el(ids.exportBatchRangeList);
  const summaryEl = el(ids.exportBatchRangeSummary);
  if (!listEl) return;
  if (exportScanBatchSelectedIndex >= exportScanBatchRanges.length) {
    exportScanBatchSelectedIndex = exportScanBatchRanges.length - 1;
  }
  if (exportScanBatchSelectedIndex < -1) exportScanBatchSelectedIndex = -1;
  listEl.innerHTML = '';
  if (!exportScanBatchRanges.length) {
    listEl.textContent = t('frameGenerator.batchRangeListEmpty');
    if (summaryEl) {
      summaryEl.textContent = t('frameGenerator.batchRangeSummary', { selected: 0, total: getProjectTotalFrameCountEstimate() });
    }
    setExportBatchInsertMode(exportScanBatchEditIndex >= 0 ? 'edit' : exportScanBatchInsertMode);
    return;
  }
  const frag = document.createDocumentFragment();
  for (let i = 0; i < exportScanBatchRanges.length; i++) {
    const item = exportScanBatchRanges[i];
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `export-range-list-item${i === exportScanBatchSelectedIndex ? ' active' : ''}`;
    row.addEventListener('click', (event) => {
      void onBatchRangeRowClick(i, item, event);
    });
    const label = document.createElement('span');
    label.className = 'export-range-list-item-label';
    label.textContent = t('frameGenerator.batchRangeItem', {
      index: i + 1,
      from: item.from,
      to: item.to
    });
    const hint = document.createElement('span');
    hint.className = 'export-range-list-item-jump';
    hint.textContent = t('frameGenerator.batchJumpHint');
    const refBadge = document.createElement('span');
    const rangeKey = getExportScanBatchRangeKey(item);
    const hasRef = !!(rangeKey && exportScanBatchRangeRefs && exportScanBatchRangeRefs[rangeKey]);
    refBadge.className = `export-range-ref-badge ${hasRef ? 'export-range-ref-badge--saved' : 'export-range-ref-badge--missing'}`;
    refBadge.textContent = hasRef
      ? t('frameGenerator.batchRangeRefSaved')
      : t('frameGenerator.batchRangeRefMissing');
    if (!hasRef) {
      refBadge.title = t('frameGenerator.batchRangeRefMissingTooltip');
      refBadge.setAttribute('aria-label', t('frameGenerator.batchRangeRefMissingTooltip'));
    }
    row.appendChild(label);
    row.appendChild(hint);
    row.appendChild(refBadge);
    frag.appendChild(row);
  }
  listEl.appendChild(frag);
  if (summaryEl) {
    summaryEl.textContent = t('frameGenerator.batchRangeSummary', {
      selected: getSelectedGlobalFramesCount(exportScanBatchRanges),
      total: getProjectTotalFrameCountEstimate()
    });
  }
  setExportBatchInsertMode(exportScanBatchEditIndex >= 0 ? 'edit' : exportScanBatchInsertMode);
}

async function onBatchRangeRowClick(index, range, event) {
  if (index < 0 || index >= exportScanBatchRanges.length) return;
  const missingBadgeClicked = !!event?.target?.closest?.('.export-range-ref-badge--missing');
  if (exportScanBatchSelectedIndex !== index) {
    persistCurrentRangeReferenceSnapshot(exportScanBatchSelectedIndex);
  }
  exportScanBatchSelectedIndex = index;
  renderExportScanBatchRangeList();
  if (!missingBadgeClicked) return;
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  const jumped = await jumpToRangeStartScan(range);
  if (jumped) {
    showTransientStatusMessage(
      t('frameGenerator.batchRangeOpenedForCalibration', {
        from: Math.max(1, Math.floor(Number(range?.from) || 1)),
        to: Math.max(1, Math.floor(Number(range?.to) || 1))
      })
    );
  }
}

/** Geordende lijst scanpaden van het project (RASTER SETUP / scanlint) — niet de pixel-editor-bronmap. */
async function getProjectScanPaths() {
  const meta = getProjectMeta();
  if (!meta) return [];
  if (Array.isArray(meta.scanInfos) && meta.scanInfos.length) {
    cachedProjectScanPaths = meta.scanInfos.map(s => s.path).filter(Boolean);
    return cachedProjectScanPaths;
  }
  const location = meta.location;
  if (!location || !window.api?.listFolderImages) return [];
  const listed = await window.api.listFolderImages(location);
  cachedProjectScanPaths = Array.isArray(listed) ? listed.filter(Boolean) : [];
  return cachedProjectScanPaths;
}

/** Na succesvol laden: project.json bijwerken (lintStates + huidige scan) zodat rasterwijzigingen niet verloren gaan. */
async function persistProjectAfterLintLoad() {
  if (!hasProject()) return;
  /* Eén gedeeld, ruim gedebounced opslagmechanisme (autosave). Geen dubbele/synchrone save meer per
   * scanwissel; snel navigeren blijft vlot, opslaan gebeurt pas na een korte pauze (of bij sluiten/afsluiten). */
  queueAutoSave();
}

/**
 * Na project-scanwissel met behoud van raster: offsets passend maken op het nieuwe strip-canvas
 * (zelfde marge-instellingen, minimale correctie als het lint andere afmetingen heeft).
 */
function clampCurrentGridToStrip() {
  const canvas = getStripCanvas();
  if (!canvas) return;
  const { frameWidth, frameHeight } = getFrameDimensions(canvas);
  if (frameWidth < 1 || frameHeight < 1) return;
  const s = getState();
  const n = Math.max(1, s.numFrames);
  if (s.gridOffsetXAsymmetric) {
    let left = Number(s.gridOffsetXLeft);
    let right = Number(s.gridOffsetXRight);
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      const ox = getEffectiveGridOffsetX(frameWidth);
      left = ox;
      right = ox;
    }
    const c = clampGridMarginsCanvas(frameWidth, left, right);
    setGridOffsetXMargins(c.left, c.right);
  } else {
    const ox = clampGridOffsetX(frameWidth, getEffectiveGridOffsetX(frameWidth));
    setGridOffset(ox, s.gridOffsetY);
  }
  const s2 = getState();
  const cv = clampGridVerticalMarginsCanvas(
    frameHeight,
    n,
    Number(s2.gridOffsetY) || 0,
    Number(s2.gridOffsetYBottom) || 0
  );
  setGridOffsetYOnly(cv.top);
  setGridOffsetYBottom(cv.bottom);
}

/** Opties voor loadScanByPath bij Vorige/Volgende/Ga naar — volgt instelling preserveGridOnScanNav. */
function scanNavigationGridOptions() {
  return { preserveGrid: getState().preserveGridOnScanNav !== false };
}

/**
 * Frame-aantal voor auto-oriëntatie bij setStrip: snapshot > projectmeta > state
 * (anders is state.numFrames bij setStrip nog van de vorige scan).
 */
function resolveAutoOrientNumFrames(lintPath) {
  const saved = lintPath ? getLintStateForPath(lintPath) : null;
  if (saved && saved.numFrames != null) {
    const v = parseInt(String(saved.numFrames), 10);
    if (Number.isFinite(v)) return Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, v));
  }
  const meta = getProjectMeta();
  if (meta && meta.framesPerLint != null) {
    const v = parseInt(String(meta.framesPerLint), 10);
    if (Number.isFinite(v)) return Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, v));
  }
  return Math.max(1, getState().numFrames || 1);
}

/**
 * Na setStrip: preset + opgeslagen lint-state. Bij 1 frame: oriëntatie op pixels; zonder snapshot: fijne rotatie 0.
 */
async function applyProjectLintStateAfterLoad(lintPath) {
  const hadSavedLint = !!getLintStateForPath(lintPath);
  await applySavedLintState(lintPath);
  const nAfter = Math.max(1, getState().numFrames || 1);
  if (nAfter === 1) {
    applyAutoOrientationFromNaturalSize(1);
    if (!hadSavedLint) setFineRotation(0);
  } else if (!hadSavedLint) {
    applyAutoOrientationFromNaturalSize();
    setFineRotation(0);
  }
}

/**
 * Slaat huidige lint-state op (bij wissel) en laadt de scan op het gegeven pad. Gebruikt strip-cache (vorige/volgende).
 * @param {{ preserveGrid?: boolean, skipPersistAfterLoad?: boolean }} [opts] — skipPersistAfterLoad: geen saveProject aan het eind (batch).
 */
async function loadScanByPath(lintPath, opts = {}) {
  if (!isPerfEnabled()) return loadScanByPathImpl(lintPath, opts);
  const t = performance.now();
  try {
    return await loadScanByPathImpl(lintPath, opts);
  } finally {
    perfLog('loadScanByPath TOTAL', performance.now() - t, pathBasename(lintPath || ''));
  }
}

async function loadScanByPathImpl(lintPath, opts = {}) {
  if (!lintPath || !window.api?.getFileUrl) return false;
  const s = getState();
  const preserveGrid = opts.preserveGrid === true;
  const stickyAssist = preserveGrid
    ? {
        mode: s.autoRasterAssistMode,
        xRef: s.autoRasterAssistXRef,
        yRef: s.autoRasterAssistYRef,
        preset: s.autoRasterAssistPreset,
        extraLeftPx: s.autoRasterAssistExtraLeftPx,
        extraRightPx: s.autoRasterAssistExtraRightPx,
        extraTopPx: s.autoRasterAssistExtraTopPx,
        extraBottomPx: s.autoRasterAssistExtraBottomPx,
        centerBeforeDetect: s.autoRasterCenterBeforeDetect,
        detectOnScanNav: s.autoRasterDetectOnScanNav,
        leftWhiteMinMarginPx: s.autoRasterLeftWhiteMinMarginPx,
        darkLineLeftBiasPx: s.autoRasterDarkLineLeftBiasPx,
        darkLineStrongScale: s.autoRasterDarkLineStrongScale,
        darkLineStrongScaleAuto: s.autoRasterDarkLineStrongScaleAuto,
        darkBottomBiasPx: s.autoRasterDarkBottomBiasPx,
        darkLineThickness: s.autoRasterDarkLineThickness,
        darkLineSearchRangePx: s.autoRasterDarkLineSearchRangePx,
        triangleSensitivity: s.autoRasterTriangleSensitivity
      }
    : null;
  if (hasProject() && s.path) {
    const snapshot = getLintStateSnapshot();
    if (snapshot) setLintStateForPath(s.path, snapshot);
  }

  const paths = hasProject() ? await getProjectScanPaths() : [];
  const idx = paths.length ? Math.max(0, paths.indexOf(lintPath)) : 0;

  const stripOpts = preserveGrid ? { preserveLintGrid: true } : {};
  if (!preserveGrid) {
    stripOpts.autoOrientNumFrames = resolveAutoOrientNumFrames(lintPath);
  }

  let img = getFromCache(lintPath);
  if (!img) {
    updateStatus(60, t('status.scanLoading'));
    try {
      const fileUrl = await window.api.getFileUrl(lintPath);
      img = await loadImage(lintPath, fileUrl);
    } finally {
      updateStatus(0, t('status.operationEmpty'));
    }
  }
  if (!img) {
    alert(t('errors.loadScanFailed'));
    return false;
  }

  setStrip(lintPath, img, stripOpts);
  if (hasProject() && !preserveGrid) {
    await applyProjectLintStateAfterLoad(lintPath);
  }
  if (preserveGrid) {
    /*
     * Raster behouden = huidige geometrie meenemen naar de volgende scan.
     * Opgeslagen lintState van het doellint mag rotatie/flip/e.d. zetten, maar mag de
     * actuele breedte/positie niet overschrijven (anders springt bv. 3809 → oude 3309).
     */
    const preservedGrid = getGridGeometrySnapshot();
    const savedTarget = lintPath ? getLintStateForPath(lintPath) : null;
    if (savedTarget) {
      applyLintState(savedTarget);
      applyGridGeometrySnapshot(preservedGrid);
    }
    // Bij scan-navigatie: assist/preset niet per scan laten terugveren.
    if (stickyAssist) {
      setAutoRasterAssistModeState(stickyAssist.mode);
      setAutoRasterAssistXRefState(stickyAssist.xRef);
      setAutoRasterAssistYRefState(stickyAssist.yRef);
      setAutoRasterAssistPresetState(stickyAssist.preset);
      setAutoRasterAssistExtraLeftPxState(stickyAssist.extraLeftPx);
      setAutoRasterAssistExtraRightPxState(stickyAssist.extraRightPx);
      setAutoRasterAssistExtraTopPxState(stickyAssist.extraTopPx);
      setAutoRasterAssistExtraBottomPxState(stickyAssist.extraBottomPx);
      setAutoRasterCenterBeforeDetectState(stickyAssist.centerBeforeDetect);
      setAutoRasterDetectOnScanNavState(!!stickyAssist.detectOnScanNav);
      setAutoRasterLeftWhiteMinMarginPxState(stickyAssist.leftWhiteMinMarginPx);
      setAutoRasterDarkLineLeftBiasPxState(stickyAssist.darkLineLeftBiasPx);
      setAutoRasterDarkLineStrongScaleState(stickyAssist.darkLineStrongScale);
      setAutoRasterDarkLineStrongScaleAutoState(stickyAssist.darkLineStrongScaleAuto);
      setAutoRasterDarkBottomBiasPxState(stickyAssist.darkBottomBiasPx);
      if (stickyAssist.darkLineThickness != null) {
        setAutoRasterDarkLineThicknessState(stickyAssist.darkLineThickness);
      }
      if (stickyAssist.darkLineSearchRangePx != null) {
        setAutoRasterDarkLineSearchRangePxState(stickyAssist.darkLineSearchRangePx);
      }
      if (stickyAssist.triangleSensitivity != null) {
        setAutoRasterTriangleSensitivityState(stickyAssist.triangleSensitivity);
      }
    }
    clampCurrentGridToStrip();
    syncGridSplitLowerPanClamp();
    setDirty();
  }
  updateUI();
  if (!opts.skipPreviewRefresh) {
    refreshPreviews();
  }
  if (paths.length) prefetch(paths, idx, lintPath, (p) => window.api.getFileUrl(p), getState);
  if (!opts.skipPersistAfterLoad) {
    await persistProjectAfterLintLoad();
  }
  // Auto-detect na scanwissel: perforatie-presets altijd; andere presets alleen met optie aan.
  if (preserveGrid && shouldAutoDetectAfterScanNav()) {
    assistSampleCache = null;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    let detectRes = null;
    try {
      // Scanwissel: absolute tip-snap (grote onderlinge verschuivingen mogen niet door maxShift blijven hangen).
      detectRes = onAutoDetectFrameBoundsFromPreview({ fromScanNav: true });
    } catch (_) {
      detectRes = null;
    }
    const badScan = detectRes && typeof detectRes === 'object' && detectRes.badScan === true;
    // Detectie-fout: Auto niet stil stoppen — raster van vorige scan houden en wél door exporteren.
    if (badScan || (opts.triggerAutoAdvance && detectRes == null)) {
      if (opts.triggerAutoAdvance && getState().autoAdvanceAfterAlign) {
        updateStatus(0, t('status.autoAdvanceDetectWeak'));
        scheduleAutoAdvanceAfterAlign();
      } else {
        autoAdvanceScheduleToken += 1;
      }
    } else if (opts.triggerAutoAdvance) {
      scheduleAutoAdvanceAfterAlign();
    } else {
      autoAdvanceScheduleToken += 1;
    }
  } else if (opts.triggerAutoAdvance) {
    // Geen auto-detectie op deze navigatie: Auto mag wel door
    scheduleAutoAdvanceAfterAlign();
  }
  return true;
}

/** Perforatie wit (L/R): na scanwissel opnieuw ankeren (breedte blijft gelijk). */
function shouldAutoDetectSprocketAfterScanNav() {
  const p = getAssistPreset();
  return p === 'sprocket-left' || p === 'sprocket-right';
}

/** Detecteer grenzen na Vorige/Volgende/Ga naar (perforatie of optie). */
function shouldAutoDetectAfterScanNav() {
  if (getState().autoRasterDetectOnScanNav === true) return true;
  return shouldAutoDetectSprocketAfterScanNav();
}

/** Annuleert geplande auto-Volgende (uitvinken / stop). */
let autoAdvanceScheduleToken = 0;

function scheduleAutoAdvanceAfterAlign() {
  if (!getState().autoAdvanceAfterAlign) return;
  const token = ++autoAdvanceScheduleToken;
  setTimeout(() => {
    if (token !== autoAdvanceScheduleToken) return;
    void continueAutoAdvanceAfterAlign();
  }, 140);
}

async function continueAutoAdvanceAfterAlign() {
  if (!getState().autoAdvanceAfterAlign) return;
  const paths = await getProjectScanPaths();
  if (!paths.length) {
    stopAutoAdvanceAfterAlign(t('status.autoAdvanceStopped'));
    return;
  }
  const current = getState().path;
  const idx = current ? paths.indexOf(current) : -1;
  if (idx < 0) {
    stopAutoAdvanceAfterAlign(t('status.autoAdvanceStopped'));
    return;
  }
  // Laatste scan: nog exporteren, daarna stoppen (niet wrappen).
  if (idx >= paths.length - 1) {
    let exportResult = null;
    try {
      exportResult = await onExportCurrentScan({ silent: true, suppressPreview: true, fromAutoAdvance: true });
    } catch (_) {
      exportResult = { ok: false, error: t('frameExport.singleFailed') };
    }
    if (!exportResult || exportResult.ok !== true || exportResult.skipped || !(exportResult.written > 0)) {
      stopAutoAdvanceAfterAlign(t('status.autoAdvanceExportFailed'));
      if (exportResult?.error) alert(exportResult.error);
      return;
    }
    try {
      await saveProject();
    } catch (_) {}
    stopAutoAdvanceAfterAlign(t('status.autoAdvanceDone'));
    return;
  }
  updateStatus(40, t('status.autoAdvanceNext', { current: idx + 1, total: paths.length }));
  await onStripNavigateScan({ direction: 'next', exportCurrent: true, fromAutoAdvance: true });
}

/**
 * @param {string|null|undefined} statusMsg
 * @param {{ silent?: boolean }} [opts]
 */
function stopAutoAdvanceAfterAlign(statusMsg, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  autoAdvanceScheduleToken += 1;
  if (getState().autoAdvanceAfterAlign) {
    setAutoAdvanceAfterAlignState(false);
    updateUI();
    refreshPreviewsGridOnly();
  }
  if (!o.silent && statusMsg) updateStatus(0, statusMsg);
}

/**
 * Controleer of perforatie-driehoek + raster binnen veilige scan-/framegrenzen vallen.
 * @returns {{ ok: true }|{ ok: false, message: string }}
 */
function triangleIncompleteAtScanEdge(a, stripHeight, frameWidth) {
  if (!a) return null;
  const y = Number(a.y);
  if (!Number.isFinite(y)) return null;
  const measuredHalf = Number(a.halfH);
  const expectHalf = Math.max(
    Number.isFinite(measuredHalf) && measuredHalf > 2 ? measuredHalf : 0,
    Math.round(frameWidth * 0.02),
    18
  );
  // Tip te dicht bij boven-/onderrand → driehoek is (deels) buiten het scangebied
  if (y < expectHalf * 0.72) return 'Y';
  if ((stripHeight - y) < expectHalf * 0.72) return 'Y';
  const clipTop = Math.max(0, expectHalf - y);
  const clipBot = Math.max(0, (y + expectHalf) - stripHeight);
  if (clipTop > expectHalf * 0.28 || clipBot > expectHalf * 0.28) return 'Y';

  const tipX = Number(a.tipX);
  const leftX = Number(a.leftX);
  // Tip te dicht tegen de linker scankant → horizontaal afgesneden
  if (Number.isFinite(tipX) && tipX < frameWidth * 0.035) return 'X';
  if (Number.isFinite(leftX) && Number.isFinite(tipX)) {
    const depth = tipX - leftX;
    if (depth > 0 && depth < frameWidth * 0.04) return 'X';
  }
  return null;
}

/** True als er in de linker perforatieband een wit-run op de boven- of onderrand zit. */
function sprocketWhiteTouchesStripEdge(sample, frameWidth, atTop) {
  if (!sample || !sample.data || sample.width < 8 || sample.height < 8) return false;
  // Los van Driehoek % (99 maakt edge-detectie anders blind)
  const whiteThr = Math.min(175, getTriangleWhiteThreshold());
  const x0 = Math.max(0, Math.round((frameWidth * 0.008) / sample.kx));
  const x1 = Math.min(sample.width - 1, Math.round((frameWidth * 0.22) / sample.kx));
  if (x1 <= x0 + 2) return false;
  const rows = atTop
    ? [0, 1, 2, 3, Math.min(4, sample.height - 1)]
    : [
      sample.height - 1,
      Math.max(0, sample.height - 2),
      Math.max(0, sample.height - 3),
      Math.max(0, sample.height - 4),
      Math.max(0, sample.height - 5)
    ];
  // Smalle driehoek-tip: kijk naar langste aaneengesloten wit-run, niet % van hele band
  const minRun = Math.max(3, Math.round((frameWidth * 0.005) / sample.kx));
  let bestRun = 0;
  let edgeWhiteCols = 0;
  for (let ri = 0; ri < rows.length; ri++) {
    const y = rows[ri];
    let run = 0;
    for (let x = x0; x <= x1; x++) {
      const L = luminanceAt(sample.data, sample.width, x, y);
      if (L >= whiteThr) {
        run += 1;
        if (run > bestRun) bestRun = run;
        if (ri === 0) edgeWhiteCols += 1;
      } else {
        run = 0;
      }
    }
  }
  if (bestRun < minRun && edgeWhiteCols < minRun) return false;

  // Bevestig: iets naar binnen ook wit in dezelfde X-zone (geen losse randpixel)
  const inwardY = atTop
    ? Math.min(sample.height - 1, Math.max(3, Math.round((frameWidth * 0.01) / sample.ky)))
    : Math.max(0, sample.height - 1 - Math.max(3, Math.round((frameWidth * 0.01) / sample.ky)));
  let inwardRun = 0;
  let run = 0;
  for (let x = x0; x <= x1; x++) {
    if (luminanceAt(sample.data, sample.width, x, inwardY) >= whiteThr) {
      run += 1;
      if (run > inwardRun) inwardRun = run;
    } else {
      run = 0;
    }
  }
  return inwardRun >= Math.max(2, Math.floor(minRun * 0.6));
}

/**
 * Full-res randcheck: downscaled assist-sample mist smalle afgekapte tips.
 * Leest alleen een paar rijen × linkerband van het echte strip-canvas.
 */
function sprocketWhiteTouchesStripEdgeFullRes(stripCanvas, atTop) {
  if (!stripCanvas || stripCanvas.width < 32 || stripCanvas.height < 32) return false;
  let ctx;
  try {
    ctx = stripCanvas.getContext('2d', { willReadFrequently: true });
  } catch (_) {
    ctx = null;
  }
  if (!ctx) return false;
  const w = stripCanvas.width;
  const h = stripCanvas.height;
  const x0 = Math.max(0, Math.round(w * 0.008));
  const x1 = Math.min(w - 1, Math.round(w * 0.2));
  const bandW = x1 - x0 + 1;
  if (bandW < 8) return false;
  const rowCount = Math.min(8, Math.max(4, Math.round(h * 0.002)));
  const y0 = atTop ? 0 : Math.max(0, h - rowCount);
  let img;
  try {
    img = ctx.getImageData(x0, y0, bandW, rowCount);
  } catch (_) {
    return false;
  }
  const data = img.data;
  const whiteThr = 168;
  const minRun = Math.max(8, Math.round(w * 0.003));
  let bestRun = 0;
  for (let row = 0; row < rowCount; row++) {
    let run = 0;
    for (let x = 0; x < bandW; x++) {
      const i = (row * bandW + x) * 4;
      const L = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      if (L >= whiteThr) {
        run += 1;
        if (run > bestRun) bestRun = run;
      } else {
        run = 0;
      }
    }
  }
  if (bestRun < minRun) return false;

  // Bevestiging iets naar binnen (voorkomt losse sensor-ruis op de eerste rij)
  const inwardY = atTop
    ? Math.min(h - 1, Math.max(rowCount, Math.round(w * 0.012)))
    : Math.max(0, h - 1 - Math.max(rowCount, Math.round(w * 0.012)));
  let inward;
  try {
    inward = ctx.getImageData(x0, inwardY, bandW, 1);
  } catch (_) {
    return true; // edge wit was al sterk genoeg
  }
  let inwardRun = 0;
  let run = 0;
  const id = inward.data;
  for (let x = 0; x < bandW; x++) {
    const i = x * 4;
    const L = id[i] * 0.2126 + id[i + 1] * 0.7152 + id[i + 2] * 0.0722;
    if (L >= whiteThr) {
      run += 1;
      if (run > inwardRun) inwardRun = run;
    } else {
      run = 0;
    }
  }
  return inwardRun >= Math.max(5, Math.floor(minRun * 0.45));
}

function evaluateSprocketScanHealth(ctx) {
  const frameWidth = Math.max(1, Math.round(Number(ctx.frameWidth) || 0));
  const stripHeight = Math.max(1, Math.round(Number(ctx.stripHeight) || 0));
  const left = Math.round(Number(ctx.left) || 0);
  const right = Math.round(Number(ctx.right) || 0);
  const top = Math.round(Number(ctx.top) || 0);
  const bottom = Math.round(Number(ctx.bottom) || 0);
  const sprocketRight = !!ctx.sprocketRight;
  const anchors = Array.isArray(ctx.anchors) ? ctx.anchors : [];
  const facingGaps = ctx.facingGaps || {};
  const pair = ctx.pair || {};
  const tipEdge = Number(ctx.tipEdge);
  const sample = ctx.sample || null;
  const stripCanvas = ctx.stripCanvas || null;
  const fromScanNav = ctx.fromScanNav === true;
  const gridW = Math.max(1, frameWidth - left - right);
  const gridH = Math.max(1, stripHeight - top - bottom);
  const marginX = Math.max(12, Math.round(frameWidth * 0.015));
  const marginY = Math.max(12, Math.round(stripHeight * 0.015));
  const fail = (key) => ({ ok: false, message: t(key) });

  if (anchors.length < 1) return fail('status.autoAdvanceBadScanNoTriangle');

  // Ankers die we voor uitlijning gebruiken + alle ankers dicht bij de scanrand
  const edgeCheckList = [];
  const pushA = (a) => {
    if (a && edgeCheckList.indexOf(a) < 0) edgeCheckList.push(a);
  };
  for (let i = 0; i < anchors.length; i++) pushA(anchors[i]);
  if (facingGaps.topGap) {
    pushA(facingGaps.topGap.upper);
    pushA(facingGaps.topGap.lower);
  }
  if (facingGaps.bottomGap) {
    pushA(facingGaps.bottomGap.upper);
    pushA(facingGaps.bottomGap.lower);
  }
  if (pair.top) pushA(pair.top);
  if (pair.bottom) pushA(pair.bottom);

  // Afgekapt perforatie: full-res randcheck (geen extra overlay-zoek — dat blokkeerde de UI)
  if (!sprocketRight && (sample || stripCanvas)) {
    const topClipped = stripCanvas
      ? sprocketWhiteTouchesStripEdgeFullRes(stripCanvas, true)
      : sprocketWhiteTouchesStripEdge(sample, frameWidth, true);
    const botClipped = stripCanvas
      ? sprocketWhiteTouchesStripEdgeFullRes(stripCanvas, false)
      : sprocketWhiteTouchesStripEdge(sample, frameWidth, false);
    if (topClipped || botClipped) {
      return fail('status.autoAdvanceBadScanTriangleOutsideY');
    }
  }

  // Auto/scanwissel: frametip mag niet te dicht tegen de scanrand (afgekapt)
  if (fromScanNav && !sprocketRight) {
    const clearance = Math.max(36, Math.round(frameWidth * 0.02));
    if (facingGaps.topGap) {
      const topTip = facingGaps.topGap.lower && Number.isFinite(facingGaps.topGap.lower.y)
        ? facingGaps.topGap.lower.y
        : facingGaps.topGap.meetY;
      if (Number.isFinite(topTip) && topTip < clearance) {
        return fail('status.autoAdvanceBadScanTriangleOutsideY');
      }
      // Bovenste partner van de topnaad mag zelf ook niet afgekapt zijn
      if (facingGaps.topGap.upper) {
        const clip = triangleIncompleteAtScanEdge(facingGaps.topGap.upper, stripHeight, frameWidth);
        if (clip === 'Y') return fail('status.autoAdvanceBadScanTriangleOutsideY');
      }
    }
    if (facingGaps.bottomGap) {
      const botTip = facingGaps.bottomGap.upper && Number.isFinite(facingGaps.bottomGap.upper.y)
        ? facingGaps.bottomGap.upper.y
        : facingGaps.bottomGap.meetY;
      if (Number.isFinite(botTip) && (stripHeight - botTip) < clearance) {
        return fail('status.autoAdvanceBadScanTriangleOutsideY');
      }
      if (facingGaps.bottomGap.lower) {
        const clip = triangleIncompleteAtScanEdge(facingGaps.bottomGap.lower, stripHeight, frameWidth);
        if (clip === 'Y') return fail('status.autoAdvanceBadScanTriangleOutsideY');
      }
    }
  }

  for (let i = 0; i < edgeCheckList.length; i++) {
    const a = edgeCheckList[i];
    const ay = Number(a && a.y);
    const ax = Number(a && a.tipX);
    if (Number.isFinite(ay) && (ay < -marginY || ay > stripHeight + marginY)) {
      return fail('status.autoAdvanceBadScanTriangleOutsideY');
    }
    if (Number.isFinite(ax)) {
      if (sprocketRight) {
        if (ax < frameWidth * 0.68 || ax > frameWidth + marginX) {
          return fail('status.autoAdvanceBadScanTriangleOutsideX');
        }
      } else if (ax < -marginX || ax > frameWidth * 0.28) {
        return fail('status.autoAdvanceBadScanTriangleOutsideX');
      }
    }
    if (!sprocketRight) {
      const clip = triangleIncompleteAtScanEdge(a, stripHeight, frameWidth);
      if (clip === 'Y') return fail('status.autoAdvanceBadScanTriangleOutsideY');
      if (clip === 'X') return fail('status.autoAdvanceBadScanTriangleOutsideX');
    }
  }

  if (!sprocketRight) {
    const hasGap = !!(facingGaps.topGap || facingGaps.bottomGap);
    const hasPair = !!(pair.top || pair.bottom);
    if (!hasGap && !hasPair) return fail('status.autoAdvanceBadScanNoGap');
  }

  if (Number.isFinite(tipEdge)) {
    if (!sprocketRight) {
      if (tipEdge < frameWidth * 0.04) {
        return fail('status.autoAdvanceBadScanTriangleOutsideX');
      }
      const dx = tipEdge - left;
      if (dx < -Math.max(60, Math.round(frameWidth * 0.025))) {
        return fail('status.autoAdvanceBadScanTriangleOutsideCrop');
      }
      if (dx > Math.max(140, Math.round(gridW * 0.16))) {
        return fail('status.autoAdvanceBadScanTriangleInsideFar');
      }
    } else {
      const rightEdge = frameWidth - right;
      const dx = rightEdge - tipEdge;
      if (dx < -Math.max(60, Math.round(frameWidth * 0.025))) {
        return fail('status.autoAdvanceBadScanTriangleOutsideCrop');
      }
      if (dx > Math.max(140, Math.round(gridW * 0.16))) {
        return fail('status.autoAdvanceBadScanTriangleInsideFar');
      }
    }
  }

  if (!sprocketRight && facingGaps.bottomGap && facingGaps.bottomGap.upper) {
    const botTip = Number(facingGaps.bottomGap.upper.y);
    const botEdge = stripHeight - bottom;
    if (Number.isFinite(botTip) && Math.abs(botTip - botEdge) > Math.max(140, Math.round(gridH * 0.09))) {
      return fail('status.autoAdvanceBadScanVerticalMismatch');
    }
  }
  if (!sprocketRight && facingGaps.topGap && facingGaps.topGap.lower) {
    const topTip = Number(facingGaps.topGap.lower.y);
    if (Number.isFinite(topTip) && Math.abs(topTip - top) > Math.max(140, Math.round(gridH * 0.09))) {
      return fail('status.autoAdvanceBadScanVerticalMismatch');
    }
  }

  if (left > frameWidth * 0.42 || right > frameWidth * 0.42) {
    return fail('status.autoAdvanceBadScanGridOff');
  }
  if (top > stripHeight * 0.42 || bottom > stripHeight * 0.42) {
    return fail('status.autoAdvanceBadScanGridOff');
  }

  return { ok: true };
}

async function onLoadLint() {
  if (typeof window.api?.selectScanFile !== 'function') return;
  updateStatus(20, t('status.pickFile'));
  let lintPath;
  try {
    lintPath = await window.api.selectScanFile();
  } finally {
    updateStatus(0, t('status.operationEmpty'));
  }
  if (!lintPath) return;
  await loadScanByPath(lintPath);
}

async function onPrevScan() {
  const paths = await getProjectScanPaths();
  if (!paths.length) {
    alert(t('scanNav.noScans'));
    return;
  }
  const current = getState().path;
  const idx = current ? paths.indexOf(current) : -1;
  const prevIndex = idx <= 0 ? paths.length - 1 : idx - 1;
  await loadScanByPath(paths[prevIndex], { ...scanNavigationGridOptions(), triggerAutoAdvance: false });
}

async function onNextScan() {
  const paths = await getProjectScanPaths();
  if (!paths.length) {
    alert(t('scanNav.noScans'));
    return;
  }
  const current = getState().path;
  const idx = current ? paths.indexOf(current) : -1;
  const nextIndex = idx < 0 ? 0 : (idx >= paths.length - 1 ? 0 : idx + 1);
  await loadScanByPath(paths[nextIndex], { ...scanNavigationGridOptions(), triggerAutoAdvance: true });
}

async function onStripNavigateScan(payload) {
  if (stripNavigateBusy || exportScanBusy) return;
  stripNavigateBusy = true;
  try {
    await onStripNavigateScanBody(payload);
  } finally {
    stripNavigateBusy = false;
  }
}

/**
 * Vanuit scanlint-preview: eerst huidige lint + project naar schijf, daarna vorige/volgende scan of spring naar index.
 * Export alleen bij vooruitgaan (Volgende / Ga naar hoger). Vorige / terug springen schrijft nooit frames weg.
 */
async function onStripNavigateScanBody(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const index1 = p.index != null ? Math.floor(Number(p.index)) : NaN;
  const direction = p.direction === 'next' ? 'next' : p.direction === 'prev' ? 'prev' : '';
  const fromAutoAdvance = p.fromAutoAdvance === true;
  const isGoto = Number.isFinite(index1) && index1 >= 1;
  if (!isGoto && direction !== 'prev' && direction !== 'next') return;
  if (!hasProject()) {
    alert(t('scanNav.stripNavigateNeedContext'));
    return;
  }
  const paths = await getProjectScanPaths();
  if (!paths.length) {
    alert(t('scanNav.noScans'));
    return;
  }
  const current = getState().path;
  const idx = current ? paths.indexOf(current) : -1;
  const current1 = idx >= 0 ? idx + 1 : 0;
  if (isGoto && (index1 < 1 || index1 > paths.length)) {
    alert(t('scanNav.goToScanInvalid', { max: paths.length }));
    return;
  }
  // Vooruit = Volgende, of Ga naar een hoger scannummer. Terug = nooit exporteren.
  const goingForward = isGoto ? index1 > current1 : direction === 'next';
  const autoExportCurrent = p.exportCurrent === true && goingForward;
  if (!goingForward) {
    // Annuleer geplande Auto ▶ (anders exporteert die alsnog na Vorige).
    autoAdvanceScheduleToken += 1;
  }
  if (autoExportCurrent) {
    let exportResult = null;
    try {
      // Silent Volgende: altijd echt schrijven/overschrijven (zie onExportCurrentScan).
      const treatAsAuto = fromAutoAdvance === true || getState().autoAdvanceAfterAlign === true;
      exportResult = await onExportCurrentScan({
        silent: true,
        suppressPreview: true,
        fromAutoAdvance: treatAsAuto
      });
    } catch (_) {
      exportResult = { ok: false, error: t('frameExport.singleFailed') };
    }
    // skipped of written:0 mag nooit als succes door naar Volgende (anders loopt Nr. door zonder PNG's).
    const wroteOk = exportResult && exportResult.ok === true && !exportResult.skipped && (exportResult.written|0) > 0;
    if (!wroteOk) {
      if (fromAutoAdvance || getState().autoAdvanceAfterAlign) {
        stopAutoAdvanceAfterAlign(t('status.autoAdvanceExportFailed'));
      }
      if (exportResult?.error) alert(exportResult.error);
      else if (exportResult?.skipped) alert(t('frameExport.skippedNoWrite'));
      return;
    }
  }
  {
    const s = getState();
    if (s.path) {
      const snapshot = getLintStateSnapshot();
      if (snapshot) setLintStateForPath(s.path, snapshot);
    }
    // Niet awaiten op ~8MB I:-save (blokkeerde Volgende minuten). Geheugen OK; schijf via autosave.
    setDirty();
    queueAutoSave();
  }
  if (isGoto) {
    await loadScanByPath(paths[index1 - 1], {
      ...scanNavigationGridOptions(),
      triggerAutoAdvance: false,
      skipPersistAfterLoad: true
    });
    return;
  }
  // Auto-doorlopen: niet wrappen naar scan 1 — stop op het einde.
  if (fromAutoAdvance && direction === 'next' && idx >= paths.length - 1) {
    stopAutoAdvanceAfterAlign(t('status.autoAdvanceDone'));
    return;
  }
  const targetIndex =
    direction === 'prev'
      ? (idx <= 0 ? paths.length - 1 : idx - 1)
      : (idx < 0 ? 0 : (idx >= paths.length - 1 ? 0 : idx + 1));
  await loadScanByPath(paths[targetIndex], {
    ...scanNavigationGridOptions(),
    triggerAutoAdvance: direction === 'next',
    // Net opgeslagen vóór wissel — dubbele 7MB-save overslaan
    skipPersistAfterLoad: true
  });
}

async function onGoToScan() {
  const paths = await getProjectScanPaths();
  if (!paths.length) {
    alert(t('scanNav.noScans'));
    return;
  }
  const num = window.prompt(t('scanNav.goToScanPrompt', { max: paths.length }), '1');
  if (num === null || num === '') return;
  const index = parseInt(num, 10);
  if (!Number.isFinite(index) || index < 1 || index > paths.length) {
    alert(t('scanNav.goToScanInvalid', { max: paths.length }));
    return;
  }
  await loadScanByPath(paths[index - 1], scanNavigationGridOptions());
}

function onRotate90() {
  setRotation90(90);
  setDirty();
  updateUI();
  refreshPreviews();
}

function onOverviewResetGrid() {
  resetGridToDefault();
  refreshPreviewsGridOnly();
}

function onOverviewOffsetApply() {
  const xEl = el(ids.overviewOffsetX);
  const yEl = el(ids.overviewOffsetY);
  if (!xEl || !yEl) return;
  const x = parseInt(xEl.value, 10);
  const y = parseInt(yEl.value, 10);
  const yBottom = Number.isFinite(Number(getState().gridOffsetYBottom))
    ? Math.round(Number(getState().gridOffsetYBottom))
    : 0;
  onSetGridOffsetAbsolute({
    gridOffsetX: Number.isNaN(x) ? 0 : x,
    gridOffsetY: Number.isNaN(y) ? 0 : y,
    gridOffsetYBottom: yBottom
  });
}

function onOverviewFlipChanged() {
  const hEl = el(ids.overviewFlipH);
  const vEl = el(ids.overviewFlipV);
  if (!hEl || !vEl) return;
  setFlipHorizontal(!!hEl.checked);
  setFlipVertical(!!vEl.checked);
  setDirty();
  updateUI();
  refreshPreviews();
}

function onOverviewZoomModeChanged() {
  const zEl = el(ids.overviewZoomMode);
  if (!zEl) return;
  emitInlineStripZoomMode(zEl.value);
}

function onFineRotation() {
  const sl = el(ids.fineRotation);
  const val = el(ids.fineRotationValue);
  if (val && val.value !== '') {
    const raw = Number(String(val.value).replace(',', '.'));
    if (Number.isFinite(raw)) setFineRotation(raw);
  } else if (sl && sl.value !== '') {
    setFineRotation(Number(sl.value) / 1000);
  }
  setDirty();
  updateUI();
  refreshPreviews();
}

/** Stapknoppen fijne draaiing: 0,001° / 0,01° (zelfde stappen als Numpad +/−). */
function nudgeFineRotation(deltaDeg) {
  const s = getState();
  setFineRotation(s.fineRotationDeg + deltaDeg);
  setDirty();
  updateUI();
  refreshPreviews();
}

function onNumFrames() {
  const n = parseInt(el(ids.numFrames)?.value, 10);
  if (!Number.isNaN(n)) {
    const prev = getState().numFrames;
    setNumFrames(n);
    const s = getState();
    if (s.path && s.naturalWidth > 0 && s.naturalHeight > 0 && (n === 1 || prev === 1)) {
      applyAutoOrientationFromNaturalSize();
    }
  }
  setDirty();
  updateUI();
  updateStatsDisplay();
  updatePanelSummaryLines();
  refreshPreviewsGridOnly();
}

function onActiveFrame() {
  const n = parseInt(el(ids.activeFrame)?.value, 10);
  if (!Number.isNaN(n)) {
    /* Eerst huidige k clammen → map[k] klopt; daarna wisselen (anders gaat split-pan per pivot verloren). */
    syncGridSplitLowerPanClamp();
    setActiveFrameIndex(n - 1);
    syncGridSplitLowerPanClamp();
  }
  setDirty();
  updateUI();
  refreshPreviewsGridOnly();
}

function onPrevFrame() {
  const _pf = perfStart('HUIDIG FRAME: vorig frame ◀');
  syncGridSplitLowerPanClamp();
  setActiveFrameIndex(getState().activeFrameIndex - 1);
  syncGridSplitLowerPanClamp();
  setDirty();
  updateUI();
  refreshPreviewsGridOnly();
  _pf();
}

function onNextFrame() {
  const _pf = perfStart('HUIDIG FRAME: volgend frame ▶');
  syncGridSplitLowerPanClamp();
  setActiveFrameIndex(getState().activeFrameIndex + 1);
  syncGridSplitLowerPanClamp();
  setDirty();
  updateUI();
  refreshPreviewsGridOnly();
  _pf();
}

function onZoom() {
  const sl = el(ids.zoom);
  if (sl) {
    const v = Math.max(1, Math.min(100, Number(sl.value) || 50));
    const t = (v - 1) / 99;
    setZoomFrames(ZOOM_MAX - t * (ZOOM_MAX - ZOOM_MIN));
  }
  setDirty();
  updateUI();
  refreshPreviews();
}

const GRID_STEP_PERCENT = 0.10;
const GRID_STEP_PERCENT_VERTICAL = 0.12;
const DRAG_THRESHOLD = 8;

const GRID_MIN_SIZE_PX = 20;
const GRID_MIN_SIZE_RATIO = 0.05;

function clampGridOffsetX(frameWidth, x) {
  if (frameWidth < 1) return 0;
  const minW = Math.max(GRID_MIN_SIZE_PX, Math.round(frameWidth * GRID_MIN_SIZE_RATIO));
  const maxX = Math.max(0, Math.floor((frameWidth - minW) / 2));
  const minX = -maxX;
  return Math.max(minX, Math.min(maxX, Math.round(x)));
}

function clampGridOffsetY(frameHeight, y, offsetYBottom, numFrames) {
  if (frameHeight < 1) return 0;
  const n = Math.max(1, numFrames || 1);
  const stripHeight = frameHeight * n;
  const minTotalHeight = n * GRID_MIN_SIZE_PX;
  const bottom = Number(offsetYBottom) || 0;
  const minY = getMinGridOffsetYCanvas(stripHeight);
  const maxY = stripHeight - minTotalHeight - bottom;
  return Math.max(minY, Math.min(maxY, Math.round(y)));
}

const ASSIST_SAMPLE_MAX_DIM = 1024;
let assistSampleCache = null;
const ASSIST_TUNING_PRESETS = {
  standard: { bottomBiasSoft: 0, bottomBiasStrong: 0 },
  'bottom-soft': { bottomBiasSoft: 1, bottomBiasStrong: 1 },
  'bottom-v1': { bottomBiasSoft: 2, bottomBiasStrong: 3 },
  'difficult-edge': { bottomBiasSoft: 2, bottomBiasStrong: 4, dualEdgeBoost: 1.75 },
  'bottom-v2': { bottomBiasSoft: 3, bottomBiasStrong: 5 },
  'black-line': { bottomBiasSoft: 0, bottomBiasStrong: 0, yTarget: 'darkLine' },
  'black-line-left': { bottomBiasSoft: 0, bottomBiasStrong: 0, yTarget: 'darkLine', darkSide: 'right' },
  // Perforatie links: Y = overlay-driehoek / naad-tips; X = tip + inset.
  // Bias/inset gebakken zodat Reset (Extra/Offset 0) al goed staat op typische 16mm-scans.
  'sprocket-left': {
    bottomBiasSoft: 0,
    bottomBiasStrong: 0,
    yTarget: 'leftSprocket',
    freezeX: true,
    xTarget: 'triangleTips',
    // X-inset: −124 (geijkt op 7206). Y-bias 0: overlay-tip is al de naad;
    // oude +100 duwde volgende frames systematisch omlaag.
    triangleInsetSoft: -136,
    triangleInsetStrong: -124,
    triangleYBiasSoft: 0,
    triangleYBiasStrong: 0,
    // Overlay-template: Y op inwaartse tip / midden naad
    triangleOverlay: true
  },
  // Perforatie rechts (spiegel): soundtrack links, sprockets rechts
  'sprocket-right': {
    bottomBiasSoft: 0,
    bottomBiasStrong: 0,
    yTarget: 'rightSprocket',
    freezeX: true,
    xTarget: 'triangleTipsRight',
    // Negatief inset = rechterrand iets naar rechts (vaste breedte → links mee)
    triangleInsetSoft: -48,
    triangleInsetStrong: -56,
    // Kleine Y-bias: aperture-lijn-refine doet het zware werk
    triangleYBiasSoft: -4,
    triangleYBiasStrong: -6
  },
  'left-white': { bottomBiasSoft: 1, bottomBiasStrong: 1, xTarget: 'leftWhiteEdge' },
  'right-white': { bottomBiasSoft: 1, bottomBiasStrong: 1, xTarget: 'rightWhiteEdge' }
};

function getAssistMode() {
  const m = getState().autoRasterAssistMode;
  return m === 'soft' || m === 'strong' ? m : 'off';
}

function getAssistXRef() {
  return getState().autoRasterAssistXRef === 'left' ? 'left' : 'right';
}

function getAssistYRef() {
  const v = getState().autoRasterAssistYRef;
  return v === 'top' || v === 'bottom' ? v : 'both';
}

function getAssistExtraLeftPx() {
  return Math.max(0, Math.min(400, Math.round(Number(getState().autoRasterAssistExtraLeftPx) || 0)));
}

function getAssistExtraRightPx() {
  return Math.max(0, Math.min(400, Math.round(Number(getState().autoRasterAssistExtraRightPx) || 0)));
}

function getAssistExtraTopPx() {
  return Math.max(0, Math.min(400, Math.round(Number(getState().autoRasterAssistExtraTopPx) || 0)));
}

function getAssistExtraBottomPx() {
  return Math.max(0, Math.min(400, Math.round(Number(getState().autoRasterAssistExtraBottomPx) || 0)));
}

/** Live Extra L/R pan (positief = naar rechts). */
function applyAssistExtraShiftXDelta(deltaX) {
  const d = Math.round(Number(deltaX) || 0);
  if (!d) return;
  const canvas = getStripCanvas();
  const { frameWidth } = getFrameDimensions(canvas);
  if (!canvas || frameWidth < 1) return;
  const m = getEffectiveGridMargins(frameWidth);
  const next = panGridMarginsPreserveWidth(frameWidth, m.left, m.right, d);
  if (next.left === m.left && next.right === m.right) return;
  setGridOffsetXMargins(next.left, next.right);
  syncGridSplitLowerPanClamp();
}

/** Live Extra T/B pan (positief = omlaag, zelfde teken als Extra T − Extra B). */
function applyAssistExtraShiftYDelta(deltaY) {
  const d = Math.round(Number(deltaY) || 0);
  if (!d) return;
  const canvas = getStripCanvas();
  const { frameWidth, frameHeight } = getFrameDimensions(canvas);
  if (!canvas || frameWidth < 1 || frameHeight < 1) return;
  const s = getState();
  const n = Math.max(1, s.numFrames || 1);
  const top = Number(s.gridOffsetY) || 0;
  const bottom = Number.isFinite(Number(s.gridOffsetYBottom)) ? Math.round(Number(s.gridOffsetYBottom)) : 0;
  const stripH = frameHeight * n;
  const cv = panGridVerticalMarginsPreserveHeight(stripH, top, bottom, d);
  if (cv.top === top && cv.bottom === bottom) return;
  setGridOffsetYOnly(cv.top);
  setGridOffsetYBottom(cv.bottom);
  syncGridSplitLowerPanClamp();
}

function getAssistCenterBeforeDetect() {
  return getState().autoRasterCenterBeforeDetect === true;
}

function getAssistLeftWhiteMinMarginPx() {
  return Math.max(0, Math.min(24, Math.round(Number(getState().autoRasterLeftWhiteMinMarginPx) || 0)));
}

function getAssistDarkLineLeftBiasPx() {
  return Math.max(0, Math.min(6, Math.round(Number(getState().autoRasterDarkLineLeftBiasPx) || 0)));
}

function getAssistDarkLineStrongScale() {
  return Math.max(1, Math.min(48, Math.round(Number(getState().autoRasterDarkLineStrongScale) || 0)));
}

function getAssistDarkLineStrongScaleAuto() {
  return getState().autoRasterDarkLineStrongScaleAuto === true;
}

function getAssistDarkBottomBiasPx() {
  return Math.max(-24, Math.min(24, Math.round(Number(getState().autoRasterDarkBottomBiasPx) || 0)));
}

/** 1 = dunne aperture-lijn … 10 = dikke framestrook. */
function getAssistDarkLineThickness() {
  const v = Math.round(Number(getState().autoRasterDarkLineThickness));
  return Number.isFinite(v) ? Math.max(1, Math.min(10, v)) : 5;
}

/** 0 = dun … 1 = dik. */
function getAssistDarkLineThicknessT() {
  return (getAssistDarkLineThickness() - 1) / 9;
}

/** Zoekbereik ± px rond huidige rasterrand (canvas). */
function getAssistDarkLineSearchRangePx() {
  const v = Math.round(Number(getState().autoRasterDarkLineSearchRangePx));
  return Number.isFinite(v) ? Math.max(20, Math.min(300, v)) : 160;
}

/** 0–100: hoger = alleen helderder wit (selectiever voor echte driehoekjes). */
let triangleSensitivityOverride = null;

function getAssistTriangleSensitivity() {
  if (triangleSensitivityOverride != null) {
    return Math.max(0, Math.min(100, Math.round(Number(triangleSensitivityOverride) || 0)));
  }
  const v = Math.round(Number(getState().autoRasterTriangleSensitivity));
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50;
}

/** Wit-drempel: 0→140, 50→170, 100→200 (strenger op high-key blauw). */
function getTriangleWhiteThreshold() {
  return Math.round(140 + (getAssistTriangleSensitivity() / 100) * 60);
}

/**
 * Scoreer een sprocket-anker-set: naden + tipkwaliteit + tipX-stabiliteit.
 * Hoger = beter. Negatief = onbruikbaar.
 */
function scoreLeftSprocketDetectionCandidate(anchors, facingGaps, gridH, stripHeight, frameWidth, nearTopY, nearBottomY) {
  if (!anchors || anchors.length < 1) return -1000;
  let score = Math.min(anchors.length, 10) * 1.5;
  const tipScores = [];
  for (let i = 0; i < anchors.length; i++) {
    const s = Number(anchors[i] && anchors[i].score);
    if (Number.isFinite(s)) tipScores.push(s);
  }
  if (tipScores.length) {
    tipScores.sort((a, b) => b - a);
    score += tipScores.slice(0, 4).reduce((a, b) => a + b, 0) * 12;
  }
  const topGap = facingGaps && facingGaps.topGap;
  const botGap = facingGaps && facingGaps.bottomGap;
  if (topGap) {
    score += 28;
    if (topGap.upper && Number.isFinite(topGap.upper.score)) score += topGap.upper.score * 10;
    if (topGap.lower && Number.isFinite(topGap.lower.score)) score += topGap.lower.score * 10;
    const tipY = topGap.lower && Number.isFinite(topGap.lower.y) ? topGap.lower.y : topGap.meetY;
    if (Number.isFinite(nearTopY) && Number.isFinite(tipY)) {
      const err = Math.abs(tipY - nearTopY) / Math.max(40, gridH);
      score -= Math.min(35, err * 40);
    }
  }
  if (botGap) {
    score += 34;
    if (botGap.upper && Number.isFinite(botGap.upper.score)) score += botGap.upper.score * 10;
    if (botGap.lower && Number.isFinite(botGap.lower.score)) score += botGap.lower.score * 10;
    const tipY = botGap.upper && Number.isFinite(botGap.upper.y) ? botGap.upper.y : botGap.meetY;
    if (Number.isFinite(nearBottomY) && Number.isFinite(tipY)) {
      const err = Math.abs(tipY - nearBottomY) / Math.max(40, gridH);
      score -= Math.min(35, err * 40);
    }
  }
  if (topGap && botGap) {
    score += 18;
    const span = Math.abs((botGap.meetY || 0) - (topGap.meetY || 0));
    const spanErr = Math.abs(span - gridH) / Math.max(40, gridH);
    score -= Math.min(25, spanErr * 30);
  }
  // tipX-cluster: echte perforatie-tips liggen dicht bij elkaar in X
  const tips = [];
  for (let i = 0; i < anchors.length; i++) {
    const tx = Number(anchors[i] && anchors[i].tipX);
    if (Number.isFinite(tx)) tips.push(tx);
  }
  if (tips.length >= 2) {
    tips.sort((a, b) => a - b);
    const med = tips[Math.floor(tips.length / 2)];
    let spread = 0;
    for (let i = 0; i < tips.length; i++) spread += Math.abs(tips[i] - med);
    spread /= tips.length;
    score -= Math.min(20, (spread / Math.max(12, frameWidth * 0.01)) * 4);
    // Tip in verwachte band (~7–18%)
    const lo = frameWidth * 0.06;
    const hi = frameWidth * 0.2;
    if (med >= lo && med <= hi) score += 8;
    else score -= 12;
  }
  // Straf ankers te dicht bij striprand (vaak afgekapt / onbruikbaar)
  const edgePad = Math.max(24, Math.round(frameWidth * 0.018));
  for (let i = 0; i < anchors.length; i++) {
    const y = Number(anchors[i] && anchors[i].y);
    if (!Number.isFinite(y)) continue;
    if (y < edgePad || y > stripHeight - edgePad) score -= 6;
  }
  return score;
}

/**
 * Verzamel linker sprocket-ankers bij de huidige (of override) Driehoek %.
 * @param {{ tipOnly?: boolean }} [collectOpts] tipOnly = alleen snelle tip-scan (extra multi-pass).
 */
function collectLeftSprocketAnchors(sample, frameWidth, stripHeight, gridH, mode, nearOpts, collectOpts) {
  const tipOnly = !!(collectOpts && collectOpts.tipOnly);
  if (tipOnly) {
    return findLeftTriangleTipAnchors(sample, frameWidth, stripHeight, mode);
  }
  const overlayAnchors = findLeftTriangleOverlayAnchors(
    sample,
    frameWidth,
    stripHeight,
    gridH,
    mode,
    nearOpts || {}
  );
  // Tip-scan is duur over volle hoogte — alleen als overlay te weinig hits geeft
  if (overlayAnchors.length >= 2) return overlayAnchors;
  const tipAnchors = findLeftTriangleTipAnchors(sample, frameWidth, stripHeight, mode);
  if (overlayAnchors.length === 1 && tipAnchors.length) {
    return overlayAnchors.concat(tipAnchors).sort((a, b) => a.y - b.y);
  }
  return tipAnchors;
}

/**
 * Probeer meerdere Driehoek %-waarden en kies de set met de beste naad/tip-score.
 * Lost high-key vs low-key scans op zonder handmatig 10↔99 te schakelen.
 * @returns {{ anchors: object[], facingGaps: object, pair: object, sensitivity: number, score: number }}
 */
function findBestLeftSprocketDetection(sample, frameWidth, stripHeight, gridH, mode, opts) {
  const tipPickOpts = (opts && opts.tipPickOpts) || {};
  const nearOpts = {
    nearTopY: opts && opts.nearTopY,
    nearBottomY: opts && opts.nearBottomY
  };
  const userSens = getAssistTriangleSensitivity();
  // Handmatig Detecteer: 1 pass. Auto/scan-nav: user + één extreme (niet 4× overlay).
  const allowMulti = opts && opts.multiPass === true;
  const candidates = [];
  const pushSens = (v) => {
    const n = Math.max(0, Math.min(100, Math.round(Number(v))));
    if (!candidates.includes(n)) candidates.push(n);
  };
  pushSens(userSens);
  if (allowMulti) {
    // Alleen het andere uiterste — high-key vs low-key zonder 50/midden-pass
    pushSens(userSens >= 50 ? 10 : 99);
  }
  let best = null;
  const goodEnough = 55;

  for (let i = 0; i < candidates.length; i++) {
    const sens = candidates[i];
    triangleSensitivityOverride = sens;
    try {
      // Eerste pass: volledige overlay; extra passes alleen snelle tip-scan
      const anchors = collectLeftSprocketAnchors(
        sample,
        frameWidth,
        stripHeight,
        gridH,
        mode,
        nearOpts,
        i === 0 ? null : { tipOnly: true }
      );
      const facingGaps = pickFacingGapTriangleAnchors(anchors, gridH, stripHeight, frameWidth, tipPickOpts);
      const pair = pickTopBottomTriangleAnchors(anchors, gridH, stripHeight, tipPickOpts);
      const score = scoreLeftSprocketDetectionCandidate(
        anchors,
        facingGaps,
        gridH,
        stripHeight,
        frameWidth,
        nearOpts.nearTopY,
        nearOpts.nearBottomY
      );
      if (!best || score > best.score) {
        best = { anchors, facingGaps, pair, sensitivity: sens, score };
      }
      // Bruikbare boven+onder naad → stop (geen extra passes)
      if (facingGaps.topGap && facingGaps.bottomGap && score >= goodEnough) {
        break;
      }
      if (best.score >= goodEnough + 20 && facingGaps.topGap && facingGaps.bottomGap) {
        break;
      }
    } finally {
      triangleSensitivityOverride = null;
    }
  }

  if (!best) {
    return {
      anchors: [],
      facingGaps: { topGap: null, bottomGap: null },
      pair: { top: null, bottom: null },
      sensitivity: userSens,
      score: -1000
    };
  }
  return best;
}

/**
 * Rechthoekige zoek-overlay: tip rechts (inwaarts), basis links.
 * Punt (x,y) in sample-coords hoort bij driehoek met tip (tx,ty), diepte d, halfhoogte h.
 */
function pointInRightTriangleSample(x, y, tx, ty, d, h) {
  if (d < 1 || h < 1) return false;
  if (x > tx || x < tx - d) return false;
  const t = (tx - x) / d;
  return Math.abs(y - ty) <= h * t + 0.5;
}

/**
 * Scoreer één overlay-positie: wit binnen de driehoek, donker in een dunne omranding erbuiten.
 * Hoge score = omranding past over de witte perforatie-tip.
 * @returns {{ score: number, whiteIn: number, darkRing: number }|null}
 */
function scoreLeftTriangleOverlayAt(sample, tx, ty, tipDepthS, halfHS, whiteThr, bodyThr) {
  const d = Math.max(4, Math.round(tipDepthS));
  const h = Math.max(3, Math.round(halfHS));
  const ring = Math.max(2, Math.round(Math.min(d, h) * 0.35));
  const x0 = Math.max(0, Math.round(tx - d - ring));
  const x1 = Math.min(sample.width - 1, Math.round(tx + ring));
  const y0 = Math.max(0, Math.round(ty - h - ring));
  const y1 = Math.min(sample.height - 1, Math.round(ty + h + ring));
  let inN = 0;
  let inWhite = 0;
  let ringN = 0;
  let ringDark = 0;
  let tipWhite = 0;
  let tipN = 0;
  const step = Math.max(1, Math.floor(Math.min(d, h) / 14));
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const L = luminanceAt(sample.data, sample.width, x, y);
      const inside = pointInRightTriangleSample(x, y, tx, ty, d, h);
      if (inside) {
        inN++;
        if (L >= whiteThr) inWhite++;
        if (x >= tx - Math.max(2, Math.round(d * 0.2))) {
          tipN++;
          if (L >= whiteThr) tipWhite++;
        }
        continue;
      }
      // Omranding: net buiten de driehoek (Manhattan-achtig)
      const dx = x > tx ? x - tx : (x < tx - d ? (tx - d) - x : 0);
      const tEdge = x <= tx && x >= tx - d ? (tx - x) / d : 0;
      const yEdge = h * tEdge;
      const dy = Math.abs(y - ty) > yEdge ? Math.abs(y - ty) - yEdge : 0;
      const dist = Math.max(dx, dy);
      if (dist > 0 && dist <= ring) {
        ringN++;
        if (L < bodyThr) ringDark++;
      }
    }
  }
  if (inN < 10 || ringN < 5) return null;
  const whiteIn = inWhite / inN;
  const darkRing = ringDark / ringN;
  const tipFrac = tipN > 0 ? tipWhite / tipN : whiteIn;
  // Strenger: alleen scherpe witte tip + donkere omranding
  if (whiteIn < 0.55 || tipFrac < 0.5 || darkRing < 0.48) return null;
  const score = whiteIn * 0.45 + darkRing * 0.35 + tipFrac * 0.2;
  return { score, whiteIn, darkRing };
}

/**
 * Zoek beste overlay-match nabij een Y (canvas). Kleine speling in X/Y/schaal.
 * @returns {{ y: number, tipX: number, leftX: number, midY: number, halfH: number, score: number }|null}
 */
function searchLeftTriangleOverlayNear(sample, frameWidth, yFocusCanvas, mode, opts) {
  const sens = getAssistTriangleSensitivity();
  const whiteThr = getTriangleWhiteThreshold();
  const bodyThr = Math.max(95, whiteThr - 32);
  const yFocusS = Math.round(yFocusCanvas / sample.ky);
  const searchY = Math.max(
    8,
    Math.round((opts && opts.searchYCanvas != null ? opts.searchYCanvas : Math.max(40, frameWidth * 0.04)) / sample.ky)
  );
  const bandLeft = Math.max(0, Math.round(frameWidth * 0.01));
  const bandRight = Math.min(
    frameWidth - 2,
    Math.round(frameWidth * (0.175 - (sens / 100) * 0.025) + (mode === 'strong' ? 32 : 16))
  );
  const minTipXCanvas = Math.round(frameWidth * 0.07);
  const x0 = Math.max(1, Math.round(bandLeft / sample.kx));
  const x1 = Math.max(x0 + 4, Math.min(sample.width - 2, Math.round(bandRight / sample.kx)));
  const tipDepthBase = Math.max(
    10,
    Math.round((frameWidth * (mode === 'strong' ? 0.1 : 0.09)) / sample.kx)
  );
  const halfHBase = Math.max(
    5,
    Math.round((frameWidth * (mode === 'strong' ? 0.024 : 0.02)) / sample.ky)
  );
  const slack = Math.max(1, Math.round((opts && opts.pixelSlack != null ? opts.pixelSlack : 2) / Math.min(sample.kx, sample.ky)));
  const stepX = Math.max(1, Math.round(Math.max(1, slack)));
  const stepY = Math.max(1, Math.round(Math.max(1, slack)));
  let best = null;
  let bestScore = -Infinity;
  // Eerst één schaal (snel); alleen bij matige hit andere schalen proberen
  const depths = [tipDepthBase];
  const halves = [halfHBase];
  const yLo = Math.max(2, yFocusS - searchY);
  const yHi = Math.min(sample.height - 3, yFocusS + searchY);
  function consider(tx, ty, d, h) {
    const tipCanvas = tx * sample.kx;
    if (tipCanvas < minTipXCanvas) return;
    const sc = scoreLeftTriangleOverlayAt(sample, tx, ty, d, h, whiteThr, bodyThr);
    if (!sc) return;
    const yPenalty = Math.abs(ty - yFocusS) / Math.max(1, searchY) * 0.04;
    const score = sc.score - yPenalty;
    if (score > bestScore) {
      bestScore = score;
      best = {
        tipX: tipCanvas,
        leftX: (tx - d) * sample.kx,
        y: ty * sample.ky,
        midY: ty * sample.ky,
        halfH: h * sample.ky,
        score
      };
    }
  }
  for (let di = 0; di < depths.length; di++) {
    const d = depths[di];
    for (let hi = 0; hi < halves.length; hi++) {
      const h = halves[hi];
      for (let ty = yLo; ty <= yHi; ty += stepY) {
        for (let tx = x0 + d; tx <= x1; tx += stepX) {
          consider(tx, ty, d, h);
        }
      }
    }
  }
  if (best && best.score < 0.66) {
    // Extra schalen alleen als basis-match zwak maar aanwezig is
    const extraD = [Math.round(tipDepthBase * 0.85), Math.round(tipDepthBase * 1.15)];
    const extraH = [Math.round(halfHBase * 0.85), Math.round(halfHBase * 1.15)];
    for (let di = 0; di < extraD.length; di++) {
      const d = extraD[di];
      for (let hi = 0; hi < extraH.length; hi++) {
        const h = extraH[hi];
        for (let ty = yLo; ty <= yHi; ty += stepY * 2) {
          for (let tx = x0 + d; tx <= x1; tx += stepX * 2) {
            consider(tx, ty, d, h);
          }
        }
      }
    }
  }
  if (!best || best.score < 0.58) return null;
  // Fijne 1px refine rond winnaar
  const tx0 = Math.round(best.tipX / sample.kx);
  const ty0 = Math.round(best.y / sample.ky);
  const d0 = Math.max(4, Math.round((best.tipX - best.leftX) / sample.kx));
  const h0 = Math.max(3, Math.round(best.halfH / sample.ky));
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const tx = tx0 + dx;
      const ty = ty0 + dy;
      if (tx < 1 || ty < 1 || tx >= sample.width - 1 || ty >= sample.height - 1) continue;
      const sc = scoreLeftTriangleOverlayAt(sample, tx, ty, d0, h0, whiteThr, bodyThr);
      if (!sc || sc.score < best.score) continue;
      best = {
        tipX: tx * sample.kx,
        leftX: (tx - d0) * sample.kx,
        y: ty * sample.ky,
        midY: ty * sample.ky,
        halfH: h0 * sample.ky,
        score: sc.score
      };
    }
  }
  return best;
}

/**
 * Overlay-detectie links: zoek om de ~2 perforaties (stride ≈ framehoogte).
 * Anker-Y = tip (inwaartse punt) = horizontale naad-referentie.
 * @returns {{ y: number, tipX: number, leftX: number, halfH: number, score: number }[]}
 */
function findLeftTriangleOverlayAnchors(sample, frameWidth, stripHeight, gridH, mode, opts) {
  const targetH = Math.max(20, gridH || Math.round(stripHeight * 0.7));
  // Eén frame ≈ één perforatie; om de 2 → stride ≈ 2 frames, maar we zoeken
  // ook half-stappen nabij huidige top/onder voor het actieve raster.
  const stride = Math.max(40, Math.round(targetH * 0.95));
  const searchY = Math.max(18, Math.round(targetH * 0.08));
  const focuses = [];
  const nearTop = opts && Number.isFinite(Number(opts.nearTopY)) ? Number(opts.nearTopY) : NaN;
  const nearBot = opts && Number.isFinite(Number(opts.nearBottomY)) ? Number(opts.nearBottomY) : NaN;
  // Globale kandidaten: om de ~2 perforaties (≈ 2× framehoogte)
  for (let y = Math.round(targetH * 0.08); y < stripHeight - 8; y += stride * 2) {
    focuses.push(y);
  }
  for (let y = Math.round(targetH * 0.5); y < stripHeight - 8; y += stride * 2) {
    focuses.push(y);
  }
  const found = [];
  const minSep = Math.max(14, Math.round(targetH * 0.09));
  function addHit(hit) {
    if (!hit) return;
    let dup = false;
    for (let j = 0; j < found.length; j++) {
      if (Math.abs(found[j].y - hit.y) < minSep) {
        if (hit.score > found[j].score) found[j] = hit;
        dup = true;
        break;
      }
    }
    if (!dup) found.push(hit);
  }
  // Eerst huidige raster-randen (actief frame)
  if (Number.isFinite(nearTop)) {
    addHit(searchLeftTriangleOverlayNear(sample, frameWidth, nearTop, mode, {
      searchYCanvas: Math.max(searchY, Math.round(targetH * 0.1)),
      pixelSlack: 3
    }));
  }
  if (Number.isFinite(nearBot)) {
    addHit(searchLeftTriangleOverlayNear(sample, frameWidth, nearBot, mode, {
      searchYCanvas: Math.max(searchY, Math.round(targetH * 0.1)),
      pixelSlack: 3
    }));
  }
  // Globale scan alleen als lokale hits ontoereikend
  if (found.length < 2) {
    for (let i = 0; i < focuses.length; i++) {
      addHit(searchLeftTriangleOverlayNear(sample, frameWidth, focuses[i], mode, {
        searchYCanvas: searchY,
        pixelSlack: 3
      }));
      if (found.length >= 4) break;
    }
  }
  found.sort((a, b) => a.y - b.y);
  return found.map((a) => ({
    y: a.y,
    tipX: a.tipX,
    leftX: a.leftX,
    halfH: a.halfH,
    score: a.score
  }));
}

/**
 * Alle linker driehoek-tips over de volle hoogte.
 * Belangrijk: zoekband moet VOORBIJ de perforatiegaten reiken (echte tip ~12–16% breedte),
 * anders blijft alleen de buitenste witstrook over → raster te ver links.
 * @returns {{ y: number, tipX: number, leftX: number, halfH: number }[]}
 */
function findLeftTriangleTipAnchors(sample, frameWidth, stripHeight, mode) {
  const sens = getAssistTriangleSensitivity();
  const whiteThr = getTriangleWhiteThreshold();
  const bodyThr = Math.max(95, whiteThr - 32);
  // Driehoek %: hoger = iets strakker; band altijd ruim genoeg voor tip voorbij sprocket-gaten
  const bandRightFrac = 0.2 - (sens / 100) * 0.03;
  const bandRight = Math.max(
    200,
    Math.min(
      Math.round(frameWidth * 0.24),
      Math.round(frameWidth * bandRightFrac + (mode === 'strong' ? 48 : 24))
    )
  );
  const bandLeft = Math.max(0, Math.round(frameWidth * 0.008));
  // Negeer buitenste film-witstrook (typisch <6% breedte)
  const minTipXCanvas = Math.round(frameWidth * 0.06);
  const x0 = Math.max(1, Math.min(sample.width - 3, Math.round(bandLeft / sample.kx)));
  const x1 = Math.max(x0 + 2, Math.min(sample.width - 2, Math.round(bandRight / sample.kx)));
  const maxRunX = Math.max(6, Math.round((mode === 'strong' ? 80 : 64) / sample.kx));
  const tipXAtY = new Int32Array(sample.height);
  const leftXAtY = new Int32Array(sample.height);
  tipXAtY.fill(-1);
  leftXAtY.fill(-1);

  for (let y = 2; y < sample.height - 2; y++) {
    let runStart = -1;
    let peakL = 0;
    let bestTipX = -1;
    let bestLeftX = -1;
    let bestScore = -Infinity;
    for (let x = x0; x <= x1; x++) {
      const L = luminanceAt(sample.data, sample.width, x, y);
      if (runStart < 0) {
        if (L >= whiteThr) {
          const LBefore = luminanceAt(sample.data, sample.width, Math.max(0, x - 2), y);
          if (LBefore < bodyThr - 6) {
            runStart = x;
            peakL = L;
          }
        }
        continue;
      }
      if (L > peakL) peakL = L;
      // Alleen stoppen op absolute onder-drempel of grote val (niet kleine halo in de driehoek)
      const dropTol = Math.max(40, Math.round(36 + (100 - sens) * 0.1));
      const runLenNow = x - runStart + 1;
      const stillWhite = L >= whiteThr && L >= peakL - dropTol;
      if (stillWhite && runLenNow <= maxRunX) {
        continue;
      }
      const tipX = stillWhite
        ? Math.min(x, runStart + maxRunX - 1)
        : x - 1;
      if (tipX >= runStart) {
        const tipCanvas = tipX * sample.kx;
        const runLen = tipX - runStart + 1;
        // Buitenste witstrook overslaan; echte tip zit rechts van sprocket-gaten
        if (runLen >= 3 && tipCanvas >= minTipXCanvas) {
          const L2 = luminanceAt(sample.data, sample.width, Math.min(sample.width - 1, tipX + 1), y);
          const L3 = luminanceAt(sample.data, sample.width, Math.min(sample.width - 1, tipX + 3), y);
          const tipL = luminanceAt(sample.data, sample.width, tipX, y);
          if (L2 <= tipL - 6 || L3 <= tipL - 10 || L2 < whiteThr - 4) {
            // left edge: begrensde walk (niet terug naar buitenste strook over gaten heen)
            const maxWalk = Math.max(6, Math.round(70 / sample.kx));
            let edge = tipX;
            let walked = 0;
            while (edge > x0 && walked < maxWalk) {
              const Lp = luminanceAt(sample.data, sample.width, edge - 1, y);
              if (Lp < bodyThr) break;
              edge--;
              walked++;
            }
            // Sterk voorkeur voor meest rechtse tip
            const score = tipCanvas * 4 + runLen + (tipL - whiteThr) * 0.05;
            if (score > bestScore) {
              bestScore = score;
              bestTipX = tipX;
              bestLeftX = edge;
            }
          }
        }
      }
      runStart = -1;
      peakL = 0;
      if (L >= whiteThr) {
        const LBefore = luminanceAt(sample.data, sample.width, Math.max(0, x - 2), y);
        if (LBefore < bodyThr - 6) {
          runStart = x;
          peakL = L;
        }
      }
    }
    if (runStart >= 0) {
      const tipX = Math.min(x1, runStart + maxRunX - 1);
      const tipCanvas = tipX * sample.kx;
      const runLen = tipX - runStart + 1;
      if (runLen >= 3 && tipCanvas >= minTipXCanvas) {
        const maxWalk = Math.max(6, Math.round(70 / sample.kx));
        let edge = tipX;
        let walked = 0;
        while (edge > x0 && walked < maxWalk) {
          const Lp = luminanceAt(sample.data, sample.width, edge - 1, y);
          if (Lp < bodyThr) break;
          edge--;
          walked++;
        }
        const tipL = luminanceAt(sample.data, sample.width, tipX, y);
        const score = tipCanvas * 4 + runLen + (tipL - whiteThr) * 0.05;
        if (score > bestScore) {
          bestTipX = tipX;
          bestLeftX = edge;
        }
      }
    }
    tipXAtY[y] = bestTipX;
    leftXAtY[y] = bestLeftX;
  }

  const maxBlobRows = Math.max(10, Math.round(90 / sample.ky));
  const anchors = [];
  let y = 2;
  while (y < sample.height - 2) {
    if (tipXAtY[y] < 0) {
      y++;
      continue;
    }
    let y0 = y;
    let y1 = y;
    let maxTipX = tipXAtY[y];
    let maxTipY = y;
    while (y1 + 1 < sample.height - 2 && tipXAtY[y1 + 1] >= 0 && tipXAtY[y1 + 1] - tipXAtY[y1] > -10) {
      y1++;
      if (tipXAtY[y1] > maxTipX) {
        maxTipX = tipXAtY[y1];
        maxTipY = y1;
      }
    }
    const heightRows = y1 - y0 + 1;
    if (heightRows >= 3 && heightRows <= maxBlobRows) {
      const tipDepthPx = (maxTipX - x0) * sample.kx;
      const peakT = (maxTipY - y0) / Math.max(1, heightRows - 1);
      const triangleShape = peakT >= 0.15 && peakT <= 0.85;
      if (tipDepthPx >= minTipXCanvas * 0.8 && triangleShape && maxTipX * sample.kx >= minTipXCanvas) {
        const maxWalk = Math.max(6, Math.round(70 / sample.kx));
        const apexRows = [];
        const leftAtApex = [];
        for (let yy = y0; yy <= y1; yy++) {
          if (tipXAtY[yy] === maxTipX) {
            apexRows.push(yy);
            let edge = tipXAtY[yy];
            let walked = 0;
            while (edge > x0 && walked < maxWalk) {
              const Lp = luminanceAt(sample.data, sample.width, edge - 1, yy);
              if (Lp < bodyThr) break;
              edge--;
              walked++;
            }
            leftAtApex.push(edge);
          }
        }
        const tipY = apexRows.length
          ? apexRows[Math.floor(apexRows.length / 2)]
          : Math.round((y0 + y1) * 0.5);
        leftAtApex.sort((a, b) => a - b);
        const leftX = leftAtApex.length
          ? leftAtApex[Math.floor(leftAtApex.length / 2)]
          : Math.max(x0, maxTipX - maxWalk);
        anchors.push({
          y: tipY * sample.ky,
          tipX: maxTipX * sample.kx,
          leftX: leftX * sample.kx,
          halfH: ((y1 - y0) * sample.ky) * 0.5
        });
      }
    }
    y = y1 + 1;
  }
  return anchors.filter((a) => a.y >= 0 && a.y <= stripHeight && a.tipX >= minTipXCanvas);
}

/**
 * Rechter perforatie-ankers: tip = linkerrand van wit dat tot de rechter filmand doorloopt.
 * Zo vermijden we high-key cyaan in het beeld als valse "tip".
 */
function findRightTriangleTipAnchors(sample, frameWidth, stripHeight, mode) {
  const sens = getAssistTriangleSensitivity();
  // Rechter sprocket-wit is bijna puur wit — hogere drempel dan links (high-key frame)
  const whiteThr = Math.max(getTriangleWhiteThreshold() + 25, Math.round(185 + (sens / 100) * 40));
  const bodyThr = Math.max(100, whiteThr - 40);
  const bandLeft = Math.round(frameWidth * 0.7);
  const bandRight = Math.min(frameWidth - 2, Math.round(frameWidth * 0.998));
  const minTipXCanvas = Math.round(frameWidth * 0.82);
  const maxTipXCanvas = Math.round(frameWidth * 0.96);
  const x0 = Math.max(1, Math.min(sample.width - 3, Math.round(bandLeft / sample.kx)));
  const x1 = Math.max(x0 + 2, Math.min(sample.width - 2, Math.round(bandRight / sample.kx)));
  const tipXAtY = new Int32Array(sample.height);
  tipXAtY.fill(-1);

  for (let y = 2; y < sample.height - 2; y++) {
    // Zoek meest rechtse wit in de band (filmand kan donker zijn)
    let xRight = -1;
    for (let x = x1; x >= x0; x--) {
      if (luminanceAt(sample.data, sample.width, x, y) >= whiteThr) {
        xRight = x;
        break;
      }
    }
    if (xRight < 0) continue;

    let x = xRight;
    while (x > x0) {
      const L = luminanceAt(sample.data, sample.width, x, y);
      if (L < bodyThr) break;
      x--;
    }
    // x+1 = linkerrand van witstrook die tot rechts doorloopt (= tip / binnenkant)
    const tipX = Math.min(x1, x + 1);
    const tipCanvas = tipX * sample.kx;
    if (tipCanvas < minTipXCanvas || tipCanvas > maxTipXCanvas) continue;
    const runW = (xRight - tipX + 1) * sample.kx;
    if (runW < Math.max(24, frameWidth * 0.02)) continue;
    const LLeft = luminanceAt(sample.data, sample.width, Math.max(0, tipX - 3), y);
    if (LLeft >= bodyThr - 4) continue;
    tipXAtY[y] = tipX;
  }

  // Alleen lokale tipX-minima (= hoekdriehoekjes die het verst het beeld in wijzen).
  // Anders wordt de hele verticale witstrook één anker → raster zakt naar Y-onder=0.
  const tipVals = [];
  for (let y = 2; y < sample.height - 2; y++) {
    if (tipXAtY[y] >= 0) tipVals.push(tipXAtY[y]);
  }
  if (tipVals.length < 6) return [];
  tipVals.sort((a, b) => a - b);
  const medianTip = tipVals[Math.floor(tipVals.length / 2)];
  const pokeThr = medianTip - Math.max(3, Math.round(8 / sample.kx));
  const win = Math.max(3, Math.round(10 / sample.ky));
  const minimaY = [];
  for (let y = win; y < sample.height - win; y++) {
    const t = tipXAtY[y];
    if (t < 0 || t > pokeThr) continue;
    let isMin = true;
    for (let dy = -win; dy <= win; dy++) {
      if (dy === 0) continue;
      const t2 = tipXAtY[y + dy];
      if (t2 >= 0 && t2 < t) {
        isMin = false;
        break;
      }
    }
    if (isMin) minimaY.push(y);
  }
  if (!minimaY.length) return [];

  // Cluster aaneengesloten minima → één anker per hoek
  const anchors = [];
  let i = 0;
  while (i < minimaY.length) {
    let j = i;
    while (j + 1 < minimaY.length && minimaY[j + 1] - minimaY[j] <= Math.max(2, Math.round(6 / sample.ky))) j++;
    let sumY = 0;
    let bestX = Infinity;
    let bestY = minimaY[i];
    for (let k = i; k <= j; k++) {
      const yy = minimaY[k];
      sumY += yy;
      if (tipXAtY[yy] < bestX) {
        bestX = tipXAtY[yy];
        bestY = yy;
      }
    }
    const n = j - i + 1;
    // Y op de scherpste tip (meest links), niet blob-midden
    const tipY = bestY;
    const tipX = bestX;
    anchors.push({
      y: tipY * sample.ky,
      tipX: tipX * sample.kx,
      leftX: tipX * sample.kx,
      halfH: Math.max(4, ((minimaY[j] - minimaY[i] + 1) * sample.ky) * 0.5)
    });
    i = j + 1;
  }
  return anchors.filter((a) => a.y >= 0 && a.y <= stripHeight);
}

/**
 * Kies boven- en onder-anker: tip-paar waarvan afstand het dichtst bij vaste rasterhoogte ligt.
 * @param {{ wideSearch?: boolean }} [opts]
 */
function pickTopBottomTriangleAnchors(anchors, gridH, stripHeight, opts) {
  if (!anchors || !anchors.length) return { top: null, bottom: null };
  const sorted = anchors.slice().sort((a, b) => a.y - b.y);
  if (sorted.length === 1) {
    const mid = stripHeight * 0.5;
    if (sorted[0].y < mid) return { top: sorted[0], bottom: null };
    return { top: null, bottom: sorted[0] };
  }
  let best = null;
  let bestScore = Infinity;
  const targetH = Math.max(20, gridH);
  const wide = !!(opts && opts.wideSearch);
  const dyLo = wide ? 0.4 : 0.55;
  const dyHi = wide ? 1.6 : 1.45;
  const firstFrameBand = Math.max(targetH * 1.2, stripHeight * 0.22);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const dy = sorted[j].y - sorted[i].y;
      if (dy < targetH * dyLo || dy > targetH * dyHi) continue;
      let score = Math.abs(dy - targetH) - (sorted[i].tipX + sorted[j].tipX) * 0.01;
      // Eerste frametop hoort bovenaan de strip; tippen diep in de strook zijn vaak vorig/volgend frame.
      if (sorted[i].y > firstFrameBand) score += (sorted[i].y - firstFrameBand) * 0.35;
      if (score < bestScore) {
        bestScore = score;
        best = { top: sorted[i], bottom: sorted[j] };
      }
    }
  }
  if (best) return best;
  return { top: sorted[0], bottom: sorted[sorted.length - 1] };
}

/**
 * Naar-elkaar-wijzende driehoekjes in de framenaad (kleine dy).
 * meetY ≈ ontmoetingspunt = natuurlijke onder-/bovenrand van het raster.
 * tipX = rechtse tip (framerand); leftX = verticale basis (meer naar sprocket).
 *
 * @returns {{
 *   topGap: { upper: object, lower: object, meetY: number, tipX: number, leftX: number }|null,
 *   bottomGap: { upper: object, lower: object, meetY: number, tipX: number, leftX: number }|null
 * }}
 */
function pickFacingGapTriangleAnchors(anchors, gridH, stripHeight, frameWidth, opts) {
  const empty = { topGap: null, bottomGap: null };
  if (!anchors || anchors.length < 2) return empty;
  const sorted = anchors.slice().sort((a, b) => a.y - b.y);
  const targetH = Math.max(20, gridH);
  const wide = !!(opts && opts.wideSearch);
  // Nauwe naad-tips: strakkere dy/tipX-tolerantie
  const gapMin = Math.max(3, Math.round(targetH * (wide ? 0.002 : 0.003)));
  const gapMax = Math.max(24, Math.round(targetH * (wide ? 0.12 : 0.09)));
  const tipXTol = Math.max(8, Math.round(frameWidth * 0.025));
  const gaps = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const dy = b.y - a.y;
    if (dy < gapMin || dy > gapMax) continue;
    if (Math.abs((Number(a.tipX) || 0) - (Number(b.tipX) || 0)) > tipXTol) continue;
    const tipVals = [];
    if (Number.isFinite(Number(a.tipX))) tipVals.push(Number(a.tipX));
    if (Number.isFinite(Number(b.tipX))) tipVals.push(Number(b.tipX));
    tipVals.sort((u, v) => u - v);
    const tipX = tipVals.length
      ? tipVals[Math.floor(tipVals.length / 2)]
      : Number(a.tipX) || 0;
    const leftVals = [];
    if (Number.isFinite(Number(a.leftX))) leftVals.push(Number(a.leftX));
    if (Number.isFinite(Number(b.leftX))) leftVals.push(Number(b.leftX));
    leftVals.sort((u, v) => u - v);
    const leftX = leftVals.length
      ? leftVals[Math.floor(leftVals.length / 2)]
      : tipX;
    // Ondernaad: iets richting onderste tip (verder omlaag in de naad)
    // Topnaad: iets richting bovenste tip (niet te ver in vorig frame)
    gaps.push({
      upper: a,
      lower: b,
      meetY: (a.y + b.y) * 0.5,
      // Neutraal midden van de naad (geen extra duw omlaag; overlay-tip is leidend)
      meetYBottom: (a.y + b.y) * 0.5,
      meetYTop: (a.y + b.y) * 0.5,
      tipX,
      leftX,
      dy
    });
  }
  if (!gaps.length) return empty;

  // Topnaad: eerste gap dicht bij strip-top / bovenste framelijn
  let topGap = null;
  let topScore = Infinity;
  const topBand = Math.max(targetH * 0.45, stripHeight * 0.12);
  for (let i = 0; i < gaps.length; i++) {
    const g = gaps[i];
    if (g.meetY > topBand) continue;
    const score = g.meetY + g.dy * 0.15;
    if (score < topScore) {
      topScore = score;
      topGap = g;
    }
  }

  // Ondernaad van frame 1: gap rond ~gridH onder de top (of onder topGap)
  let bottomGap = null;
  let botScore = Infinity;
  const expectBot = topGap ? topGap.meetY + targetH : targetH;
  const botLo = expectBot - targetH * 0.35;
  const botHi = expectBot + targetH * 0.4;
  for (let i = 0; i < gaps.length; i++) {
    const g = gaps[i];
    if (topGap && g === topGap) continue;
    if (g.meetY < botLo || g.meetY > botHi) continue;
    // Straffen als meetY te dicht bij topGap (zelfde naad)
    if (topGap && Math.abs(g.meetY - topGap.meetY) < gapMax * 1.2) continue;
    const score = Math.abs(g.meetY - expectBot) + g.dy * 0.1;
    if (score < botScore) {
      botScore = score;
      bottomGap = g;
    }
  }
  // Fallback: eerste gap na topGap / na ~0.5*gridH
  if (!bottomGap) {
    const minY = topGap ? topGap.meetY + gapMax * 1.5 : targetH * 0.45;
    for (let i = 0; i < gaps.length; i++) {
      const g = gaps[i];
      if (g.meetY < minY) continue;
      if (g.meetY > targetH * 1.55) break;
      bottomGap = g;
      break;
    }
  }
  return { topGap, bottomGap };
}

/** Mediaan van eindige tipX-waarden uit naad-tips (framerand). */
function medianTriangleTipX(parts) {
  const vals = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    if (Number.isFinite(Number(p.tipX))) vals.push(Number(p.tipX));
  }
  if (!vals.length) return NaN;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

/** Mediaan van eindige leftX/tipX-waarden uit naad-tips (verticale zijkant). */
function medianTriangleLeftEdgeX(parts) {
  const vals = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    if (Number.isFinite(Number(p.leftX))) vals.push(Number(p.leftX));
    else if (Number.isFinite(Number(p.tipX))) vals.push(Number(p.tipX));
  }
  if (!vals.length) return NaN;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

/** Gemiddelde RGB/L in een horizontale band (canvas-coördinaten). */
function sampleBandMeanRGB(sample, y0Canvas, y1Canvas, x0Canvas, x1Canvas) {
  const y0 = Math.max(0, Math.min(sample.height - 1, Math.round(y0Canvas / sample.ky)));
  const y1 = Math.max(y0, Math.min(sample.height - 1, Math.round(y1Canvas / sample.ky)));
  const x0 = Math.max(0, Math.min(sample.width - 1, Math.round(x0Canvas / sample.kx)));
  const x1 = Math.max(x0 + 1, Math.min(sample.width - 1, Math.round(x1Canvas / sample.kx)));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const stepY = Math.max(1, Math.floor((y1 - y0) / 10));
  const stepX = Math.max(1, Math.floor((x1 - x0) / 24));
  for (let y = y0; y <= y1; y += stepY) {
    for (let x = x0; x <= x1; x += stepX) {
      const i = (y * sample.width + x) * 4;
      r += sample.data[i];
      g += sample.data[i + 1];
      b += sample.data[i + 2];
      n++;
    }
  }
  if (!n) return { r: 0, g: 0, b: 0, L: 0 };
  r /= n;
  g /= n;
  b /= n;
  return { r, g, b, L: r * 0.2126 + g * 0.7152 + b * 0.0722 };
}

/**
 * Tip met hout/vorige-vloer net eronder = typisch onderhoek vorig frame (bruine balk-fout).
 * Mag niet als BOVEN-anker dienen.
 */
function tipLooksLikePreviousFrameBottom(sample, tipYCanvas, frameWidth) {
  const x0 = Math.round(frameWidth * 0.18);
  const x1 = Math.round(frameWidth * 0.62);
  const band = sampleBandMeanRGB(sample, tipYCanvas + 10, tipYCanvas + 70, x0, x1);
  const blueish = band.b > band.r + 8 && band.b > 95;
  if (blueish) return false;
  const wood =
    band.r > band.g + 5 &&
    band.r > band.b + 10 &&
    band.L > 65 &&
    band.L < 170 &&
    band.r > 95;
  // Gedempte bruin/beige (niet altijd sterke R>>G) zoals frametussenruimte
  const warmMuted =
    band.r >= band.b - 5 &&
    band.r >= band.g - 10 &&
    band.L > 70 &&
    band.L < 145 &&
    band.b < 115;
  return wood || warmMuted;
}

/**
 * Snap boven-tip naar donkere aperture-lijn net onder/op de tip (echte frametop).
 */
function refineTopTipToApertureDarkLine(sample, tipYCanvas, frameWidth, left, right) {
  const x0 = Math.max(0, left + Math.round(frameWidth * 0.1));
  const x1 = Math.max(x0 + 8, frameWidth - right - Math.round(frameWidth * 0.1));
  const found = findBestDarkLineY(sample, tipYCanvas + 28, 85, x0, x1);
  if (!found || !Number.isFinite(found.yCanvas) || found.score < 8) return tipYCanvas;
  if (found.yCanvas < tipYCanvas - 25 || found.yCanvas > tipYCanvas + 110) return tipYCanvas;
  // Net onder de donkere lijn = start beeld
  return Math.round(found.yCanvas + 2);
}

/**
 * Tip-paar voor sprocket-rechts: straf "hout onder tip" (vorig frame) als boven-anker.
 * @param {{ wideSearch?: boolean }} [opts]
 */
function pickTopBottomTriangleAnchorsSprocketRight(anchors, gridH, stripHeight, sample, frameWidth, opts) {
  if (!anchors || !anchors.length) return { top: null, bottom: null };
  const sorted = anchors.slice().sort((a, b) => a.y - b.y);
  if (sorted.length === 1) {
    const mid = stripHeight * 0.5;
    if (sorted[0].y < mid) return { top: sorted[0], bottom: null };
    return { top: null, bottom: sorted[0] };
  }
  let best = null;
  let bestScore = Infinity;
  const targetH = Math.max(20, gridH);
  const wide = !!(opts && opts.wideSearch);
  const dyLo = wide ? 0.4 : 0.55;
  const dyHi = wide ? 1.6 : 1.45;
  const firstFrameBand = Math.max(targetH * 1.2, stripHeight * 0.22);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const dy = sorted[j].y - sorted[i].y;
      if (dy < targetH * dyLo || dy > targetH * dyHi) continue;
      let score = Math.abs(dy - targetH);
      if (tipLooksLikePreviousFrameBottom(sample, sorted[i].y, frameWidth)) score += 800;
      if (sorted[i].y > firstFrameBand) score += (sorted[i].y - firstFrameBand) * 0.5;
      // Bonus: donkere framelijn nabij boven-tip
      const x0 = Math.round(frameWidth * 0.12);
      const x1 = Math.round(frameWidth * 0.75);
      const dark = findBestDarkLineY(sample, sorted[i].y + 20, 70, x0, x1);
      if (dark && dark.score > 10 && Math.abs(dark.yCanvas - sorted[i].y) < 90) score -= 40;
      if (score < bestScore) {
        bestScore = score;
        best = { top: sorted[i], bottom: sorted[j] };
      }
    }
  }
  if (best) return best;
  // Fallback: eerste tip zonder hout-onder, anders klassiek
  let topIdx = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (!tipLooksLikePreviousFrameBottom(sample, sorted[i].y, frameWidth)) {
      topIdx = i;
      break;
    }
  }
  return { top: sorted[topIdx], bottom: sorted[sorted.length - 1] };
}

function panGridMarginsPreserveWidth(frameWidth, left, right, deltaX) {
  const fw = Math.max(1, Math.round(Number(frameWidth) || 0));
  const L = Math.max(0, Math.round(Number(left) || 0));
  const R = Math.max(0, Math.round(Number(right) || 0));
  const w = Math.max(1, fw - L - R);
  const d = Math.round(Number(deltaX) || 0);
  let nL = L + d;
  let nR = R - d;
  if (nL < 0) {
    nR += nL;
    nL = 0;
  }
  if (nR < 0) {
    nL += nR;
    nR = 0;
  }
  nL = Math.max(0, Math.min(fw - w, nL));
  nR = fw - w - nL;
  return { left: nL, right: Math.max(0, nR) };
}

/**
 * Verticaal pan: hoogte blijft exact gelijk; stopt bij eerste rakende scanrand (top/bottom ≥ 0).
 */
function panGridVerticalMarginsPreserveHeight(stripHeight, top, bottom, deltaY) {
  return panVerticalMarginsPreserveHeightOnStrip(stripHeight, top, bottom, deltaY);
}

/**
 * Zet rasterpositie zonder breedte/hoogte te wijzigen (Detecteer Grenzen mag formaat nooit “afkappen”).
 * @param {{ preferOnStrip?: boolean }} [opts] preferOnStrip: houd raster binnen lint (voorkomt export-clip van W×H)
 */
function placeGridPreserveSize(frameWidth, stripHeight, lockW, lockH, wantLeft, wantTop, opts) {
  const fw = Math.max(1, Math.round(Number(frameWidth) || 0));
  const S = Math.max(1, Math.round(Number(stripHeight) || 0));
  const w = Math.max(1, Math.min(fw, Math.round(Number(lockW) || 1)));
  const h = Math.max(1, Math.min(S, Math.round(Number(lockH) || 1)));
  const preferOnStrip = !(opts && opts.preferOnStrip === false);
  const minT = preferOnStrip ? 0 : getMinGridOffsetYCanvas(S);
  const minB = preferOnStrip ? 0 : getMinGridOffsetYBottomCanvas(S);
  let L = Math.round(Number(wantLeft) || 0);
  let T = Math.round(Number(wantTop) || 0);
  L = Math.max(0, Math.min(fw - w, L));
  const R = fw - w - L;
  const maxT = S - h - minB;
  T = Math.max(minT, Math.min(maxT, T));
  const B = S - h - T;
  return { left: L, right: Math.max(0, R), top: T, bottom: B };
}

function centerGridMarginsPreserveSize(frameWidth, stripHeight, left, right, top, bottom, frameHeight, numFrames) {
  const fw = Math.max(1, Math.round(Number(frameWidth) || 0));
  const sh = Math.max(1, Math.round(Number(stripHeight) || 0));
  const L = Math.max(0, Math.round(Number(left) || 0));
  const R = Math.max(0, Math.round(Number(right) || 0));
  const T = Math.round(Number(top) || 0);
  const B = Math.round(Number(bottom) || 0);

  const gridW = Math.max(1, fw - L - R);
  const targetLeftRaw = Math.round((fw - gridW) / 2);
  const targetRightRaw = fw - gridW - targetLeftRaw;
  const cx = clampGridMarginsCanvas(fw, targetLeftRaw, targetRightRaw);

  const gridH = Math.max(1, sh - T - B);
  const targetTopRaw = Math.round((sh - gridH) / 2);
  const targetBottomRaw = sh - gridH - targetTopRaw;
  const cy = clampGridVerticalMarginsCanvas(
    Math.max(1, Number(frameHeight) || 1),
    Math.max(1, Number(numFrames) || 1),
    targetTopRaw,
    targetBottomRaw
  );

  return { left: cx.left, right: cx.right, top: cy.top, bottom: cy.bottom };
}

function getAssistPreset() {
  const v = String(getState().autoRasterAssistPreset || '').trim().toLowerCase();
  return v === 'standard' ||
    v === 'bottom-soft' ||
    v === 'difficult-edge' ||
    v === 'bottom-v2' ||
    v === 'black-line' ||
    v === 'black-line-left' ||
    v === 'sprocket-left' ||
    v === 'sprocket-right' ||
    v === 'left-white' ||
    v === 'right-white'
    ? v
    : 'bottom-v1';
}

function getAssistPresetConfig() {
  return ASSIST_TUNING_PRESETS[getAssistPreset()] || ASSIST_TUNING_PRESETS['bottom-v1'];
}

function isAssistPresetDarkLineLockedX() {
  const cfg = getAssistPresetConfig();
  return !!(cfg && cfg.yTarget === 'darkLine');
}

function isAssistPresetFreezeX() {
  const cfg = getAssistPresetConfig();
  return !!(cfg && cfg.freezeX);
}

function isAssistPresetDarkLineYTarget() {
  const cfg = getAssistPresetConfig();
  return !!(cfg && cfg.yTarget === 'darkLine');
}

function isAssistPresetSprocketYTarget() {
  const cfg = getAssistPresetConfig();
  return !!(cfg && (cfg.yTarget === 'leftSprocket' || cfg.yTarget === 'rightSprocket'));
}

function isAssistPresetSprocketRight() {
  return getAssistPreset() === 'sprocket-right';
}

function isAssistPresetTriangleTipsXTarget() {
  const cfg = getAssistPresetConfig();
  return !!(cfg && (cfg.xTarget === 'triangleTips' || cfg.xTarget === 'triangleTipsRight'));
}

function isAssistPresetLeftWhiteEdgeTarget() {
  const cfg = getAssistPresetConfig();
  return !!(cfg && cfg.xTarget === 'leftWhiteEdge');
}

function isAssistPresetRightWhiteEdgeTarget() {
  const cfg = getAssistPresetConfig();
  return !!(cfg && cfg.xTarget === 'rightWhiteEdge');
}

function isAssistPresetDarkLineRightSide() {
  const cfg = getAssistPresetConfig();
  return !!(cfg && cfg.darkSide === 'right');
}

/** Zet logische X/Y-refs bij preset (spiegel / perforatie). */
function applyAssistPresetDefaultRefs(preset) {
  const p = typeof preset === 'string' ? preset.trim().toLowerCase() : '';
  let xRef = null;
  if (p === 'black-line' || p === 'left-white') xRef = 'right';
  else if (p === 'black-line-left' || p === 'right-white') xRef = 'left';
  else if (p === 'sprocket-left') xRef = 'left';
  else if (p === 'sprocket-right') xRef = 'right';
  if (xRef && getAssistXRef() !== xRef) {
    setAutoRasterAssistXRefState(xRef);
  }
  if ((p === 'sprocket-left' || p === 'sprocket-right') && getAssistYRef() !== 'both') {
    setAutoRasterAssistYRefState('both');
  }
}

function meanBandLuminance(sample, x0Canvas, x1Canvas, y0Canvas, y1Canvas) {
  const x0 = Math.max(0, Math.min(sample.width - 1, Math.round(Math.min(x0Canvas, x1Canvas) / sample.kx)));
  const x1 = Math.max(x0, Math.min(sample.width - 1, Math.round(Math.max(x0Canvas, x1Canvas) / sample.kx)));
  const y0 = Math.max(0, Math.min(sample.height - 1, Math.round(Math.min(y0Canvas, y1Canvas) / sample.ky)));
  const y1 = Math.max(y0, Math.min(sample.height - 1, Math.round(Math.max(y0Canvas, y1Canvas) / sample.ky)));
  const stepX = Math.max(1, Math.floor((x1 - x0) / 20));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 40));
  let sum = 0;
  let cnt = 0;
  for (let y = y0; y <= y1; y += stepY) {
    for (let x = x0; x <= x1; x += stepX) {
      sum += luminanceAt(sample.data, sample.width, x, y);
      cnt++;
    }
  }
  return cnt > 0 ? sum / cnt : 128;
}

function scoreWhiteVerticalEdgeSide(sample, frameWidth, stripHeight, side) {
  const y0 = stripHeight * 0.12;
  const y1 = stripHeight * 0.88;
  const xStart = side === 'left' ? Math.round(frameWidth * 0.02) : Math.round(frameWidth * 0.78);
  const xEnd = side === 'left' ? Math.round(frameWidth * 0.24) : Math.round(frameWidth * 0.98);
  const step = Math.max(2, Math.round(frameWidth * 0.006));
  let best = 0;
  for (let x = xStart; x <= xEnd; x += step) {
    const signed = edgeSignedVertical(sample, x, y0, y1, true, side === 'right');
    const white = outsideWhitenessVertical(sample, x, y0, y1, side === 'right');
    const score = Math.max(0, signed) + Math.max(0, (white - 175) * 0.18);
    if (score > best) best = score;
  }
  return best;
}

/**
 * Kies de meest waarschijnlijke assist-preset op basis van sprocket-tips,
 * dunne horizontale aperture-lijnen en witte verticale randen.
 */
function analyzeBestAssistPreset() {
  const canvas = getStripCanvas();
  const { frameWidth, frameHeight } = getFrameDimensions(canvas);
  if (!canvas || frameWidth < 1 || frameHeight < 1) {
    return { ok: false, preset: null, reason: 'no-strip' };
  }
  const sample = getAssistSample(canvas);
  if (!sample) return { ok: false, preset: null, reason: 'no-sample' };
  const n = Math.max(1, getState().numFrames || 1);
  const stripHeight = frameHeight * n;
  const mode = 'soft';
  const leftAnchors = findLeftTriangleTipAnchors(sample, frameWidth, stripHeight, mode);
  const rightAnchors = findRightTriangleTipAnchors(sample, frameWidth, stripHeight, mode);
  let sprocketLeftScore = leftAnchors.length * 14;
  let sprocketRightScore = rightAnchors.length * 14;
  if (leftAnchors.length >= 2) sprocketLeftScore += 28;
  else if (leftAnchors.length === 1) sprocketLeftScore += 8;
  if (rightAnchors.length >= 2) sprocketRightScore += 28;
  else if (rightAnchors.length === 1) sprocketRightScore += 8;

  const m = getEffectiveGridMargins(frameWidth);
  const top = Number(getState().gridOffsetY) || 0;
  const bottom = Number.isFinite(Number(getState().gridOffsetYBottom))
    ? Math.round(Number(getState().gridOffsetYBottom))
    : 0;
  const x0 = m.left + Math.round(frameWidth * 0.1);
  const x1 = frameWidth - m.right - Math.round(frameWidth * 0.1);
  const searchRange = Math.max(48, Math.min(160, Math.round(frameHeight * 0.14)));
  const darkTop = findBestDarkLineY(sample, top + Math.round(frameHeight * 0.02), searchRange, x0, x1, 'topInner');
  const darkBot = findBestDarkLineY(
    sample,
    Math.min(stripHeight - 4, top + frameHeight - Math.round(frameHeight * 0.02)),
    searchRange,
    x0,
    x1,
    'bottomInner'
  );
  const darkRaw = Math.max(0, Number(darkTop.score) || 0) + Math.max(0, Number(darkBot.score) || 0);
  // Sterke aperture-lijnen: voorkeur voor zwarte-lijn i.p.v. perforatie (voorkomt Y naar display-bodem)
  if (darkRaw > 42) {
    sprocketLeftScore *= 0.55;
    sprocketRightScore *= 0.55;
  }
  const darkLineScore = darkRaw * 0.55 + (darkRaw > 42 ? 28 : 0);

  const yMid0 = stripHeight * 0.2;
  const yMid1 = stripHeight * 0.8;
  const leftDark = 255 - meanBandLuminance(sample, 0, frameWidth * 0.09, yMid0, yMid1);
  const rightDark = 255 - meanBandLuminance(sample, frameWidth * 0.91, frameWidth, yMid0, yMid1);
  // Donkere strook rechts → black-line-left (darkSide: right); anders black-line
  const blackLinePreset = rightDark > leftDark + 6 ? 'black-line-left' : 'black-line';

  const whiteLeft = scoreWhiteVerticalEdgeSide(sample, frameWidth, stripHeight, 'left');
  const whiteRight = scoreWhiteVerticalEdgeSide(sample, frameWidth, stripHeight, 'right');
  const dualEdge =
    edgeStrengthVertical(sample, Math.max(2, m.left), yMid0, yMid1) +
    edgeStrengthVertical(sample, Math.min(frameWidth - 2, frameWidth - m.right), yMid0, yMid1);

  const candidates = [
    { preset: 'sprocket-left', score: sprocketLeftScore },
    { preset: 'sprocket-right', score: sprocketRightScore },
    { preset: blackLinePreset, score: darkLineScore + (darkRaw > 36 ? 22 : 0) },
    { preset: 'left-white', score: whiteLeft * 0.85 },
    { preset: 'right-white', score: whiteRight * 0.85 },
    { preset: 'bottom-v1', score: 10 + dualEdge * 0.12 }
  ];
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const second = candidates[1];
  // Zwak verschil → veilige dual-edge default
  if (
    best.preset !== 'bottom-v1' &&
    second &&
    best.score < 18 &&
    best.score - second.score < 4
  ) {
    return {
      ok: true,
      preset: 'bottom-v1',
      score: candidates.find((c) => c.preset === 'bottom-v1').score,
      scores: Object.fromEntries(candidates.map((c) => [c.preset, Math.round(c.score * 10) / 10])),
      reason: 'weak-signal'
    };
  }
  return {
    ok: true,
    preset: best.preset,
    score: best.score,
    scores: Object.fromEntries(candidates.map((c) => [c.preset, Math.round(c.score * 10) / 10])),
    reason: 'best'
  };
}

function getAssistSample(stripCanvas) {
  if (!stripCanvas || stripCanvas.width < 4 || stripCanvas.height < 4) return null;
  /*
   * Cache-sleutel = het strip-canvas-OBJECT zelf. getStripCanvas() geeft hetzelfde gecachte canvas terug zolang
   * de strip niet wijzigt (zelfde pad/rotatie/spiegel/paint); het wordt pas een nieuw object bij een echte
   * wijziging. Zo hoeven we de (dure) downscale + getImageData niet opnieuw te doen bij herhaald positioneren,
   * en vervalt de cache automatisch bij scanwissel/roteren/spiegelen — zonder verspreide handmatige resets.
   */
  if (
    assistSampleCache &&
    assistSampleCache.canvas === stripCanvas &&
    assistSampleCache.srcW === stripCanvas.width &&
    assistSampleCache.srcH === stripCanvas.height
  ) {
    return assistSampleCache;
  }
  const tSample = performance.now();
  const maxDim = Math.max(stripCanvas.width, stripCanvas.height);
  const scale = maxDim > ASSIST_SAMPLE_MAX_DIM ? ASSIST_SAMPLE_MAX_DIM / maxDim : 1;
  const sw = Math.max(4, Math.round(stripCanvas.width * scale));
  const sh = Math.max(4, Math.round(stripCanvas.height * scale));
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(stripCanvas, 0, 0, sw, sh);
  const img = ctx.getImageData(0, 0, sw, sh);
  assistSampleCache = {
    canvas: stripCanvas,
    srcW: stripCanvas.width,
    srcH: stripCanvas.height,
    width: sw,
    height: sh,
    data: img.data,
    kx: stripCanvas.width / sw,
    ky: stripCanvas.height / sh
  };
  perfLog('getAssistSample (downscale+getImageData)', performance.now() - tSample, 'src=' + stripCanvas.width + 'x' + stripCanvas.height + ' sample=' + sw + 'x' + sh);
  return assistSampleCache;
}

function luminanceAt(data, w, x, y) {
  const i = (y * w + x) * 4;
  return data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
}

function edgeStrengthVertical(sample, xCanvas, y0Canvas, y1Canvas) {
  const x = Math.round(xCanvas / sample.kx);
  if (x < 1 || x >= sample.width - 1) return 0;
  const y0 = Math.max(1, Math.min(sample.height - 2, Math.round(y0Canvas / sample.ky)));
  const y1 = Math.max(y0 + 1, Math.min(sample.height - 1, Math.round(y1Canvas / sample.ky)));
  const step = Math.max(1, Math.floor((y1 - y0) / 60));
  let sum = 0;
  let cnt = 0;
  for (let y = y0; y <= y1; y += step) {
    const a = luminanceAt(sample.data, sample.width, x - 1, y);
    const b = luminanceAt(sample.data, sample.width, x, y);
    sum += Math.abs(b - a);
    cnt++;
  }
  return cnt > 0 ? sum / cnt : 0;
}

function edgeSignedVertical(sample, xCanvas, y0Canvas, y1Canvas, preferOutsideWhite, outsideOnRight) {
  const x = Math.round(xCanvas / sample.kx);
  if (x < 1 || x >= sample.width - 1) return 0;
  const y0 = Math.max(1, Math.min(sample.height - 2, Math.round(y0Canvas / sample.ky)));
  const y1 = Math.max(y0 + 1, Math.min(sample.height - 1, Math.round(y1Canvas / sample.ky)));
  const step = Math.max(1, Math.floor((y1 - y0) / 60));
  let sum = 0;
  let cnt = 0;
  for (let y = y0; y <= y1; y += step) {
    const leftLum = luminanceAt(sample.data, sample.width, x - 1, y);
    const rightLum = luminanceAt(sample.data, sample.width, x, y);
    const outside = outsideOnRight ? rightLum : leftLum;
    const inside = outsideOnRight ? leftLum : rightLum;
    const signed = preferOutsideWhite ? (outside - inside) : (inside - outside);
    sum += signed;
    cnt++;
  }
  return cnt > 0 ? sum / cnt : 0;
}

function bandContrastVertical(sample, xCanvas, y0Canvas, y1Canvas, outsideOnRight) {
  const x = Math.round(xCanvas / sample.kx);
  if (x < 2 || x >= sample.width - 2) return 0;
  const y0 = Math.max(1, Math.min(sample.height - 2, Math.round(y0Canvas / sample.ky)));
  const y1 = Math.max(y0 + 1, Math.min(sample.height - 1, Math.round(y1Canvas / sample.ky)));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 60));
  const dNear = 1;
  const dFar = 6;
  let sum = 0;
  let cnt = 0;
  for (let y = y0; y <= y1; y += stepY) {
    const inNearX = outsideOnRight ? x - dNear : x + dNear;
    const inFarX = outsideOnRight ? x - dFar : x + dFar;
    const outNearX = outsideOnRight ? x + dNear : x - dNear;
    const outFarX = outsideOnRight ? x + dFar : x - dFar;
    if (inFarX < 0 || inFarX >= sample.width || outFarX < 0 || outFarX >= sample.width) continue;
    const inside = 0.55 * luminanceAt(sample.data, sample.width, inNearX, y) + 0.45 * luminanceAt(sample.data, sample.width, inFarX, y);
    const outside = 0.55 * luminanceAt(sample.data, sample.width, outNearX, y) + 0.45 * luminanceAt(sample.data, sample.width, outFarX, y);
    sum += outside - inside;
    cnt++;
  }
  return cnt > 0 ? sum / cnt : 0;
}

function outsideWhitenessVertical(sample, xCanvas, y0Canvas, y1Canvas, outsideOnRight) {
  const x = Math.round(xCanvas / sample.kx);
  if (x < 2 || x >= sample.width - 2) return 0;
  const y0 = Math.max(1, Math.min(sample.height - 2, Math.round(y0Canvas / sample.ky)));
  const y1 = Math.max(y0 + 1, Math.min(sample.height - 1, Math.round(y1Canvas / sample.ky)));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 60));
  const xo = outsideOnRight ? x + 3 : x - 3;
  if (xo < 0 || xo >= sample.width) return 0;
  let sum = 0;
  let cnt = 0;
  for (let y = y0; y <= y1; y += stepY) {
    sum += luminanceAt(sample.data, sample.width, xo, y);
    cnt++;
  }
  return cnt > 0 ? sum / cnt : 0;
}

function median3(a, b, c) {
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  if (b > c) {
    const t = b;
    b = c;
    c = t;
  }
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  return b;
}

/**
 * Score verticale frameland in één Y-band.
 * Kiest de sterkere polariteit (buiten wit óf buiten donker) zodat zwarte én witte randen werken.
 */
function scoreVerticalFrameEdgeBand(sample, xCanvas, y0Canvas, y1Canvas, outsideOnRight) {
  const sWhite = edgeSignedVertical(sample, xCanvas, y0Canvas, y1Canvas, true, outsideOnRight);
  const sDark = edgeSignedVertical(sample, xCanvas, y0Canvas, y1Canvas, false, outsideOnRight);
  const signed = Math.max(sWhite, sDark);
  const edge = edgeStrengthVertical(sample, xCanvas, y0Canvas, y1Canvas);
  const contrast = bandContrastVertical(sample, xCanvas, y0Canvas, y1Canvas, outsideOnRight);
  const contrastAbs = Math.abs(contrast);
  const wOut = outsideWhitenessVertical(sample, xCanvas, y0Canvas, y1Canvas, outsideOnRight);
  // Wit-buiten bonus alleen als die polariteit wint; anders geen straf voor donkere marge
  const whiteBonus = sWhite >= sDark ? ((wOut / 255) * 12) : 0;
  return 0.40 * signed + 0.32 * contrastAbs + 0.18 * edge + 0.10 * whiteBonus;
}

/**
 * Mediaan over boven/midden/onder — beeldinhoud trekt minder aan één band.
 */
function scoreVerticalFrameEdgeMultiBand(sample, xCanvas, top, bottom, stripHeight, outsideOnRight) {
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.04));
  const y1 = Math.max(y0 + 6, stripHeight - bottom - Math.round(stripHeight * 0.04));
  const h = y1 - y0;
  const b0 = scoreVerticalFrameEdgeBand(sample, xCanvas, y0, y0 + Math.round(h * 0.28), outsideOnRight);
  const b1 = scoreVerticalFrameEdgeBand(
    sample,
    xCanvas,
    y0 + Math.round(h * 0.36),
    y0 + Math.round(h * 0.64),
    outsideOnRight
  );
  const b2 = scoreVerticalFrameEdgeBand(sample, xCanvas, y0 + Math.round(h * 0.72), y1, outsideOnRight);
  return median3(b0, b1, b2);
}

/**
 * Full-res refine van een verticale frameland (zoals refineThinDarkLineYFullRes voor Y).
 * @returns {{ xCanvas: number, score: number }|null}
 */
function refineVerticalEdgeXFullRes(stripCanvas, xHintCanvas, y0Canvas, y1Canvas, outsideOnRight) {
  if (!stripCanvas || stripCanvas.width < 32 || stripCanvas.height < 32) return null;
  let ctx;
  try {
    ctx = stripCanvas.getContext('2d', { willReadFrequently: true });
  } catch (_) {
    return null;
  }
  if (!ctx) return null;
  const w = stripCanvas.width;
  const h = stripCanvas.height;
  const xHint = Math.round(xHintCanvas);
  const userRange = getAssistDarkLineSearchRangePx();
  const search = Math.max(6, Math.min(48, Math.round(userRange * 0.35)));
  const x0 = Math.max(2, xHint - search);
  const x1 = Math.min(w - 3, xHint + search);
  const y0 = Math.max(0, Math.round(y0Canvas));
  const y1 = Math.min(h - 1, Math.max(y0 + 8, Math.round(y1Canvas)));
  const bandW = x1 - x0 + 1;
  const bandH = y1 - y0 + 1;
  if (bandW < 5 || bandH < 8) return null;
  let img;
  try {
    img = ctx.getImageData(x0, y0, bandW, bandH);
  } catch (_) {
    return null;
  }
  const data = img.data;
  const stepY = Math.max(1, Math.floor(bandH / 100));
  const d = 2;
  let bestCol = xHint - x0;
  let bestScore = -Infinity;
  const lumAt = (row, col) => {
    const i = (row * bandW + col) * 4;
    return data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
  };
  for (let col = d; col < bandW - d; col++) {
    let sumWhite = 0;
    let sumDark = 0;
    let sumEdge = 0;
    let cnt = 0;
    for (let row = 0; row < bandH; row += stepY) {
      const L = lumAt(row, col);
      const LIn = outsideOnRight ? lumAt(row, col - d) : lumAt(row, col + d);
      const LOut = outsideOnRight ? lumAt(row, col + d) : lumAt(row, col - d);
      sumWhite += LOut - LIn;
      sumDark += LIn - LOut;
      sumEdge += Math.abs(LOut - LIn);
      // Dunne verticale donkere lijn (aperture/kader)
      const LSide = 0.5 * (lumAt(row, col - 1) + lumAt(row, col + 1));
      const valley = LSide - L;
      sumEdge += Math.max(0, valley) * 0.45;
      cnt++;
    }
    if (cnt < 1) continue;
    const signed = Math.max(sumWhite, sumDark) / cnt;
    const edge = sumEdge / cnt;
    const distPen = 0.08 * Math.abs((x0 + col) - xHint);
    const score = 0.55 * signed + 0.45 * edge - distPen;
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }
  return { xCanvas: x0 + bestCol, score: bestScore };
}

/**
 * Zoek beste verticale frameland rond currentX (zoekbereik), niet over half het frame.
 */
function findBestVerticalFrameEdgeX(
  sample,
  frameWidth,
  stripHeight,
  top,
  bottom,
  preferredSide,
  currentX,
  searchRangeCanvas,
  mode,
  options = null
) {
  const opt = options && typeof options === 'object' ? options : {};
  const side = preferredSide === 'left' ? 'left' : 'right';
  const outsideOnRight = side === 'right';
  const hardMinX = side === 'right' ? Math.round(frameWidth * 0.42) : 2;
  const hardMaxX = side === 'right' ? frameWidth - 2 : Math.round(frameWidth * 0.58);
  const cur = Math.max(hardMinX, Math.min(hardMaxX, Math.round(currentX)));
  const rangeScale = Number.isFinite(Number(opt.rangeScale)) && Number(opt.rangeScale) > 0 ? Number(opt.rangeScale) : 1;
  const range = Math.max(
    10,
    Math.round((Number.isFinite(searchRangeCanvas) ? Math.abs(searchRangeCanvas) : getAssistDarkLineSearchRangePx()) * rangeScale)
  );
  const minX = Math.max(hardMinX, cur - range);
  const maxX = Math.min(hardMaxX, cur + range);
  const distPenaltyScale = Number.isFinite(Number(opt.distPenaltyScale))
    ? Math.max(0, Number(opt.distPenaltyScale))
    : 1;
  const penalty = (mode === 'strong' ? 0.06 : 0.11) * distPenaltyScale;
  let bestX = cur;
  let bestScore = -Infinity;
  for (let x = minX; x <= maxX; x += 1) {
    const s = scoreVerticalFrameEdgeMultiBand(sample, x, top, bottom, stripHeight, outsideOnRight);
    const dist = Math.abs(x - cur);
    const score = s - penalty * Math.min(60, dist);
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
    }
  }
  return Number.isFinite(bestX) ? bestX : cur;
}

function bestVerticalEdgeX(sample, frameWidth, stripHeight, top, bottom, preferredSide, currentX, mode, options = null) {
  const opt = options && typeof options === 'object' ? options : {};
  const searchRange = Number.isFinite(Number(opt.searchRangePx))
    ? Number(opt.searchRangePx)
    : getAssistDarkLineSearchRangePx();
  // wideSearch: groter bereik bij her-acquire (nog steeds begrensd, niet half frame)
  const rangeScale = opt.wideSearch === true ? (mode === 'strong' ? 2.2 : 1.8) : 1;
  return findBestVerticalFrameEdgeX(
    sample,
    frameWidth,
    stripHeight,
    top,
    bottom,
    preferredSide,
    currentX,
    searchRange,
    mode,
    { ...opt, rangeScale }
  );
}

function findLeftDarkStripBoundaryX(sample, frameWidth, stripHeight, top, bottom, mode) {
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.04));
  const y1 = Math.max(y0 + 2, stripHeight - bottom - Math.round(stripHeight * 0.04));
  const minX = 2;
  const maxX = Math.max(minX + 2, Math.round(frameWidth * 0.62));
  const preferLeft = Math.round(frameWidth * 0.2);
  const penalty = mode === 'strong' ? 0.025 : 0.04;
  let bestX = minX;
  let bestScore = -Infinity;
  for (let x = minX; x <= maxX; x += 1) {
    const s = edgeSignedVertical(sample, x, y0, y1, true, true);
    const b = bandContrastVertical(sample, x, y0, y1, true);
    const w = outsideWhitenessVertical(sample, x, y0, y1, true);
    const a = edgeStrengthVertical(sample, x, y0, y1);
    const distPenalty = penalty * Math.abs(x - preferLeft);
    const score = 0.4 * s + 0.3 * b + 0.2 * ((w / 255) * 20) + 0.1 * a - distPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
    }
  }
  return Number.isFinite(bestX) ? bestX : minX;
}

function hasLeftDarkStripIntrusion(sample, frameWidth, stripHeight, left, right, top, bottom) {
  const xL = Math.max(2, Math.min(frameWidth - 4, Math.round(left + Math.max(2, frameWidth * 0.012))));
  const xMid = Math.max(xL + 2, Math.min(frameWidth - 3, Math.round(left + Math.max(10, (frameWidth - left - right) * 0.22))));
  const y0 = Math.max(2, Math.round(top + stripHeight * 0.08));
  const y1 = Math.max(y0 + 2, Math.round(stripHeight - bottom - stripHeight * 0.08));
  const lBand = outsideWhitenessVertical(sample, xL, y0, y1, false);
  const midBand = outsideWhitenessVertical(sample, xMid, y0, y1, false);
  if (!Number.isFinite(lBand) || !Number.isFinite(midBand)) return false;
  // Donkere verticale strook links: linkerkolom duidelijk donkerder dan binnengebied.
  return lBand < 72 && (midBand - lBand) > 34;
}

function meanColumnLuminance(sample, xCanvas, y0Canvas, y1Canvas) {
  const x = Math.max(0, Math.min(sample.width - 1, Math.round(xCanvas / sample.kx)));
  const y0 = Math.max(0, Math.min(sample.height - 1, Math.round(y0Canvas / sample.ky)));
  const y1 = Math.max(y0, Math.min(sample.height - 1, Math.round(y1Canvas / sample.ky)));
  const step = Math.max(1, Math.floor((y1 - y0) / 90));
  let sum = 0;
  let cnt = 0;
  for (let y = y0; y <= y1; y += step) {
    sum += luminanceAt(sample.data, sample.width, x, y);
    cnt++;
  }
  return cnt > 0 ? sum / cnt : 0;
}

function columnLuminanceStats(sample, xCanvas, y0Canvas, y1Canvas) {
  const x = Math.max(0, Math.min(sample.width - 1, Math.round(xCanvas / sample.kx)));
  const y0 = Math.max(0, Math.min(sample.height - 1, Math.round(y0Canvas / sample.ky)));
  const y1 = Math.max(y0, Math.min(sample.height - 1, Math.round(y1Canvas / sample.ky)));
  const step = Math.max(1, Math.floor((y1 - y0) / 120));
  let sum = 0;
  let sum2 = 0;
  let cnt = 0;
  for (let y = y0; y <= y1; y += step) {
    const v = luminanceAt(sample.data, sample.width, x, y);
    sum += v;
    sum2 += v * v;
    cnt++;
  }
  if (cnt < 1) return { mean: 0, std: 0 };
  const mean = sum / cnt;
  const variance = Math.max(0, sum2 / cnt - mean * mean);
  return { mean, std: Math.sqrt(variance) };
}

function findLeftBlackToImageTransitionX(sample, frameWidth, stripHeight, top, bottom) {
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.05));
  const y1 = Math.max(y0 + 2, stripHeight - bottom - Math.round(stripHeight * 0.05));
  const minX = 3;
  const maxX = Math.max(minX + 4, Math.round(frameWidth * 0.62));
  let bestX = null;
  let bestScore = -Infinity;
  for (let x = minX; x <= maxX; x += 1) {
    const l = meanColumnLuminance(sample, (x - 2) * sample.kx, y0, y1);
    const r = meanColumnLuminance(sample, (x + 2) * sample.kx, y0, y1);
    const diff = r - l;
    if (l > 105) continue;
    if (r < 118) continue;
    if (diff < 20) continue;
    const score = diff + 0.25 * (r - 120) + 0.15 * (100 - l);
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
    }
  }
  return bestX != null && Number.isFinite(bestX) ? bestX : null;
}

function findLeftBlackToImageTransitionByProfile(sample, frameWidth, stripHeight, top, bottom) {
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.05));
  const y1 = Math.max(y0 + 2, stripHeight - bottom - Math.round(stripHeight * 0.05));
  const minX = 3;
  const maxX = Math.max(minX + 12, Math.round(frameWidth * 0.62));
  const cols = [];
  for (let x = minX; x <= maxX; x += 1) {
    cols.push(meanColumnLuminance(sample, x, y0, y1));
  }
  if (cols.length < 12) return null;
  let bestIdx = -1;
  let bestGrad = -Infinity;
  for (let i = 2; i < cols.length - 6; i++) {
    const leftAvg = (cols[i - 2] + cols[i - 1] + cols[i]) / 3;
    const rightAvg = (cols[i + 1] + cols[i + 2] + cols[i + 3]) / 3;
    const grad = rightAvg - leftAvg;
    if (leftAvg > 120) continue;
    if (rightAvg < 120) continue;
    if (grad > bestGrad) {
      bestGrad = grad;
      bestIdx = i;
    }
  }
  if (bestIdx < 0 || bestGrad < 16) return null;
  return { x: minX + bestIdx, strength: bestGrad };
}

function findGlobalLeftStripBoundaryX(sample, frameWidth, stripHeight) {
  const y0 = Math.max(0, Math.round(stripHeight * 0.05));
  const y1 = Math.max(y0 + 2, Math.round(stripHeight * 0.95));
  const minX = 3;
  const maxX = Math.max(minX + 16, Math.round(frameWidth * 0.42));
  const profile = [];
  for (let x = minX; x <= maxX; x += 1) {
    profile.push(meanColumnLuminance(sample, x, y0, y1));
  }
  if (profile.length < 18) return null;
  let bestIdx = -1;
  let bestScore = -Infinity;
  for (let i = 4; i < profile.length - 8; i++) {
    const lAvg = (profile[i - 4] + profile[i - 3] + profile[i - 2] + profile[i - 1] + profile[i]) / 5;
    const rAvg = (profile[i + 1] + profile[i + 2] + profile[i + 3] + profile[i + 4] + profile[i + 5]) / 5;
    const grad = rAvg - lAvg;
    if (lAvg > 140) continue;
    if (rAvg < 95) continue;
    if (grad < 14) continue;
    const score = grad + 0.2 * (rAvg - 100) + 0.15 * (120 - lAvg);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;
  return { x: minX + bestIdx, score: bestScore };
}

function findGlobalLeftDarkToBrightEdgeX(sample, frameWidth, stripHeight) {
  const y0 = 0;
  const y1 = Math.max(y0 + 2, Math.round(stripHeight - 1));
  const minX = 2;
  const maxX = Math.max(minX + 20, Math.round(frameWidth * 0.48));
  const prof = [];
  for (let x = minX; x <= maxX; x += 1) {
    prof.push(meanColumnLuminance(sample, x, y0, y1));
  }
  if (prof.length < 8) return null;
  let bestI = -1;
  let bestJump = -Infinity;
  // Gebruik een eenvoudige max-gradient in de linkerhelft: altijd een kandidaat, geen harde drempel nodig.
  for (let i = 2; i < prof.length - 3; i++) {
    const leftAvg = (prof[i - 2] + prof[i - 1] + prof[i]) / 3;
    const rightAvg = (prof[i + 1] + prof[i + 2] + prof[i + 3]) / 3;
    const jump = rightAvg - leftAvg;
    if (jump > bestJump) {
      bestJump = jump;
      bestI = i;
    }
  }
  if (bestI < 0) return null;
  return minX + bestI;
}

function findLeftStripBoundaryTopBottom(sample, frameWidth, stripHeight, top, bottom) {
  const xMin = 2;
  const xMax = Math.max(xMin + 12, Math.round(frameWidth * 0.4));
  const yTop0 = Math.max(0, Math.round(top + stripHeight * 0.06));
  const yTop1 = Math.max(yTop0 + 2, Math.round(top + stripHeight * 0.2));
  const yBot1 = Math.max(0, Math.round(stripHeight - bottom - stripHeight * 0.06));
  const yBot0 = Math.max(0, Math.round(stripHeight - bottom - stripHeight * 0.2));
  if (yTop1 <= yTop0 || yBot1 <= yBot0) return null;

  const dark = [];
  for (let x = xMin; x <= xMax; x += 1) {
    const t = meanColumnLuminance(sample, x, yTop0, yTop1);
    const b = meanColumnLuminance(sample, x, yBot0, yBot1);
    // Alleen als boven + onder beide donker zijn -> filmrand/strook, niet middeninhoud.
    dark.push(t < 128 && b < 128);
  }
  if (dark.length < 10) return null;

  // Zoek de eerste voldoende brede donkere run vanaf links.
  let runStart = -1;
  let runEnd = -1;
  for (let i = 0; i < dark.length; i++) {
    if (dark[i]) {
      if (runStart < 0) runStart = i;
      runEnd = i;
    } else if (runStart >= 0) {
      break;
    }
  }
  if (runStart < 0 || runEnd - runStart < 4) return null;

  const boundaryX = xMin + runEnd;
  return Math.max(xMin, Math.min(xMax, boundaryX));
}

function findRightStripBoundaryTopBottom(sample, frameWidth, stripHeight, top, bottom) {
  const xMax = Math.max(2, frameWidth - 2);
  const xMin = Math.max(2, Math.round(frameWidth * 0.6));
  const yTop0 = Math.max(0, Math.round(top + stripHeight * 0.06));
  const yTop1 = Math.max(yTop0 + 2, Math.round(top + stripHeight * 0.2));
  const yBot1 = Math.max(0, Math.round(stripHeight - bottom - stripHeight * 0.06));
  const yBot0 = Math.max(0, Math.round(stripHeight - bottom - stripHeight * 0.2));
  if (yTop1 <= yTop0 || yBot1 <= yBot0) return null;

  const dark = [];
  for (let x = xMax; x >= xMin; x -= 1) {
    const t = meanColumnLuminance(sample, x, yTop0, yTop1);
    const b = meanColumnLuminance(sample, x, yBot0, yBot1);
    dark.push(t < 128 && b < 128);
  }
  if (dark.length < 10) return null;
  let runStart = -1;
  let runEnd = -1;
  for (let i = 0; i < dark.length; i++) {
    if (dark[i]) {
      if (runStart < 0) runStart = i;
      runEnd = i;
    } else if (runStart >= 0) {
      break;
    }
  }
  if (runStart < 0 || runEnd - runStart < 4) return null;

  const boundaryX = xMax - runEnd;
  return Math.max(xMin, Math.min(xMax, boundaryX));
}

function findGlobalRightImageBoundaryX(sample, frameWidth, stripHeight) {
  const y0 = Math.max(0, Math.round(stripHeight * 0.05));
  const y1 = Math.max(y0 + 2, Math.round(stripHeight * 0.95));
  const minX = Math.max(6, Math.round(frameWidth * 0.62));
  const maxX = Math.max(minX + 4, frameWidth - 8);
  let bestX = null;
  let bestScore = -Infinity;
  for (let x = minX; x <= maxX; x += 1) {
    const inNear = meanColumnLuminance(sample, (x - 2) * sample.kx, y0, y1);
    const inFar = meanColumnLuminance(sample, (x - 6) * sample.kx, y0, y1);
    const outNear = meanColumnLuminance(sample, (x + 2) * sample.kx, y0, y1);
    const outFar = meanColumnLuminance(sample, (x + 7) * sample.kx, y0, y1);
    const inLum = 0.55 * inNear + 0.45 * inFar;
    const outLum = 0.55 * outNear + 0.45 * outFar;
    const grad = outLum - inLum;
    // Echte rechter framegrens: buitenkant duidelijk wit en binnenkant merkbaar donkerder.
    if (outNear < 168 || outFar < 172) continue;
    if (inLum > 165) continue;
    if (grad < 20) continue;
    const score = 0.65 * grad + 0.2 * (outLum - 170) + 0.15 * (165 - Math.min(165, inLum));
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
    }
  }
  if (!Number.isFinite(bestX)) return null;
  return { x: bestX, score: bestScore };
}

function findUniformLeftDarkStripEndX(sample, frameWidth, stripHeight, top, bottom) {
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.06));
  const y1 = Math.max(y0 + 2, stripHeight - bottom - Math.round(stripHeight * 0.06));
  const minX = 2;
  const maxX = Math.max(minX + 14, Math.round(frameWidth * 0.34));
  let runStart = -1;
  let runEnd = -1;
  for (let x = minX; x <= maxX; x += 1) {
    const stats = columnLuminanceStats(sample, x, y0, y1);
    const darkUniform = stats.mean < 108 && stats.std < 32;
    if (darkUniform) {
      if (runStart < 0) runStart = x;
      runEnd = x;
    } else if (runStart >= 0) {
      // Accepteer de eerste voldoende brede uniforme donkere strook links.
      if (runEnd - runStart >= 4) return runEnd;
      runStart = -1;
      runEnd = -1;
    }
  }
  if (runStart >= 0 && runEnd - runStart >= 4) return runEnd;
  return null;
}

function findLeftDarkRunEndX(sample, frameWidth, stripHeight) {
  const y0 = Math.max(0, Math.round(stripHeight * 0.06));
  const y1 = Math.max(y0 + 2, Math.round(stripHeight * 0.94));
  const minX = 1;
  const maxX = Math.max(minX + 12, Math.round(frameWidth * 0.42));
  const meanCols = [];
  for (let x = minX; x <= maxX; x += 1) {
    meanCols.push(meanColumnLuminance(sample, x, y0, y1));
  }
  if (meanCols.length < 14) return null;
  let bestStart = -1;
  let bestEnd = -1;
  let curStart = -1;
  for (let i = 0; i < meanCols.length; i++) {
    const dark = meanCols[i] < 95;
    if (dark) {
      if (curStart < 0) curStart = i;
    } else if (curStart >= 0) {
      const curEnd = i - 1;
      if (curEnd - curStart >= 3) {
        if (bestStart < 0 || (curEnd - curStart) > (bestEnd - bestStart)) {
          bestStart = curStart;
          bestEnd = curEnd;
        }
      }
      curStart = -1;
    }
  }
  if (curStart >= 0) {
    const curEnd = meanCols.length - 1;
    if (curEnd - curStart >= 3) {
      if (bestStart < 0 || (curEnd - curStart) > (bestEnd - bestStart)) {
        bestStart = curStart;
        bestEnd = curEnd;
      }
    }
  }
  if (bestStart < 0 || bestEnd < 0) return null;
  const runStartX = minX + bestStart;
  const runEndX = minX + bestEnd;
  if (runStartX > Math.round(frameWidth * 0.26)) return null;
  return { x: runEndX, width: runEndX - runStartX + 1 };
}

function findRightDarkRunStartX(sample, frameWidth, stripHeight) {
  const y0 = Math.max(0, Math.round(stripHeight * 0.06));
  const y1 = Math.max(y0 + 2, Math.round(stripHeight * 0.94));
  const maxX = Math.max(2, frameWidth - 1);
  const minX = Math.min(maxX - 12, Math.max(2, Math.round(frameWidth * 0.58)));
  const meanCols = [];
  const xs = [];
  for (let x = maxX; x >= minX; x -= 1) {
    meanCols.push(meanColumnLuminance(sample, x, y0, y1));
    xs.push(x);
  }
  if (meanCols.length < 14) return null;
  let bestStart = -1;
  let bestEnd = -1;
  let curStart = -1;
  for (let i = 0; i < meanCols.length; i++) {
    const dark = meanCols[i] < 95;
    if (dark) {
      if (curStart < 0) curStart = i;
    } else if (curStart >= 0) {
      const curEnd = i - 1;
      if (curEnd - curStart >= 3) {
        if (bestStart < 0 || (curEnd - curStart) > (bestEnd - bestStart)) {
          bestStart = curStart;
          bestEnd = curEnd;
        }
      }
      curStart = -1;
    }
  }
  if (curStart >= 0) {
    const curEnd = meanCols.length - 1;
    if (curEnd - curStart >= 3) {
      if (bestStart < 0 || (curEnd - curStart) > (bestEnd - bestStart)) {
        bestStart = curStart;
        bestEnd = curEnd;
      }
    }
  }
  if (bestStart < 0 || bestEnd < 0) return null;
  const runStartX = xs[bestStart];
  const runEndX = xs[bestEnd];
  if (runStartX < Math.round(frameWidth * 0.74)) return null;
  return { x: runEndX, width: runStartX - runEndX + 1 };
}

function evaluateLeftStripIntrusion(sample, frameWidth, stripHeight, left, right, top, bottom) {
  const gridW = Math.max(1, frameWidth - left - right);
  if (gridW < 20) return { intrudes: false, severity: 0 };
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.08));
  const y1 = Math.max(y0 + 2, stripHeight - bottom - Math.round(stripHeight * 0.08));
  const leftBandEnd = Math.max(left + 2, Math.min(frameWidth - 2, Math.round(left + Math.max(18, gridW * 0.14))));
  const nearA = Math.max(leftBandEnd + 2, Math.min(frameWidth - 2, Math.round(left + Math.max(16, gridW * 0.12))));
  const nearB = Math.max(nearA + 2, Math.min(frameWidth - 2, Math.round(left + Math.max(34, gridW * 0.24))));
  const innerA = Math.max(leftBandEnd + 2, Math.min(frameWidth - 2, Math.round(left + Math.max(40, gridW * 0.32))));
  const innerB = Math.max(innerA + 2, Math.min(frameWidth - 2, Math.round(left + Math.max(70, gridW * 0.52))));
  let leftSum = 0;
  let leftMin = Infinity;
  let leftCnt = 0;
  for (let x = Math.max(left + 1, 1); x <= leftBandEnd; x += 2) {
    const lum = meanColumnLuminance(sample, x, y0, y1);
    leftSum += lum;
    if (lum < leftMin) leftMin = lum;
    leftCnt++;
  }
  let nearSum = 0;
  let nearCnt = 0;
  for (let x = nearA; x <= nearB; x += 2) {
    nearSum += meanColumnLuminance(sample, x, y0, y1);
    nearCnt++;
  }
  let innerSum = 0;
  let innerCnt = 0;
  for (let x = innerA; x <= innerB; x += 3) {
    innerSum += meanColumnLuminance(sample, x, y0, y1);
    innerCnt++;
  }
  if (leftCnt < 1 || nearCnt < 1 || innerCnt < 1) return { intrudes: false, severity: 0 };
  const leftAvg = leftSum / leftCnt;
  const nearAvg = nearSum / nearCnt;
  const innerAvg = innerSum / innerCnt;
  const contrast = innerAvg - leftAvg;
  const darkness = Math.max(0, 95 - leftAvg) + Math.max(0, 74 - leftMin);
  const severity = 0.7 * contrast + 0.5 * darkness;
  const stripLikeRecovery = nearAvg > 98 && (nearAvg - leftAvg) > 18;
  const intrudes = leftAvg < 95 && leftMin < 72 && contrast > 24 && stripLikeRecovery;
  return { intrudes, severity };
}

function evaluateRightWhiteIntrusion(sample, frameWidth, stripHeight, left, right, top, bottom) {
  const gridW = Math.max(1, frameWidth - left - right);
  if (gridW < 20) return { intrudes: false, severity: 0 };
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.08));
  const y1 = Math.max(y0 + 2, stripHeight - bottom - Math.round(stripHeight * 0.08));
  const rightBandStart = Math.max(1, Math.min(frameWidth - 2, Math.round(frameWidth - right - Math.max(18, gridW * 0.14))));
  const rightBandEnd = Math.max(rightBandStart + 1, Math.min(frameWidth - 1, Math.round(frameWidth - right - 1)));
  const innerA = Math.max(1, Math.min(frameWidth - 2, Math.round(frameWidth - right - Math.max(70, gridW * 0.52))));
  const innerB = Math.max(innerA + 1, Math.min(frameWidth - 2, Math.round(frameWidth - right - Math.max(40, gridW * 0.32))));
  let rightSum = 0;
  let rightCnt = 0;
  for (let x = rightBandStart; x <= rightBandEnd; x += 2) {
    rightSum += meanColumnLuminance(sample, x, y0, y1);
    rightCnt++;
  }
  let innerSum = 0;
  let innerCnt = 0;
  for (let x = innerA; x <= innerB; x += 3) {
    innerSum += meanColumnLuminance(sample, x, y0, y1);
    innerCnt++;
  }
  if (rightCnt < 1 || innerCnt < 1) return { intrudes: false, severity: 0 };
  const rightAvg = rightSum / rightCnt;
  const innerAvg = innerSum / innerCnt;
  const whiteness = rightAvg - innerAvg;
  const severity = 0.8 * whiteness + 0.3 * Math.max(0, rightAvg - 180);
  const intrudes = rightAvg > 168 && whiteness > 22;
  return { intrudes, severity };
}

function evaluateLeftWhiteIntrusion(sample, frameWidth, stripHeight, left, right, top, bottom) {
  const gridW = Math.max(1, frameWidth - left - right);
  if (gridW < 20) return { intrudes: false, severity: 0 };
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.08));
  const y1 = Math.max(y0 + 2, stripHeight - bottom - Math.round(stripHeight * 0.08));
  const leftBandStart = Math.max(1, Math.min(frameWidth - 2, Math.round(left + 1)));
  const leftBandEnd = Math.max(leftBandStart + 1, Math.min(frameWidth - 2, Math.round(left + Math.max(18, gridW * 0.14))));
  const innerA = Math.max(leftBandEnd + 1, Math.min(frameWidth - 2, Math.round(left + Math.max(40, gridW * 0.32))));
  const innerB = Math.max(innerA + 1, Math.min(frameWidth - 2, Math.round(left + Math.max(70, gridW * 0.52))));
  let leftSum = 0;
  let leftCnt = 0;
  for (let x = leftBandStart; x <= leftBandEnd; x += 2) {
    leftSum += meanColumnLuminance(sample, x, y0, y1);
    leftCnt++;
  }
  let innerSum = 0;
  let innerCnt = 0;
  for (let x = innerA; x <= innerB; x += 3) {
    innerSum += meanColumnLuminance(sample, x, y0, y1);
    innerCnt++;
  }
  if (leftCnt < 1 || innerCnt < 1) return { intrudes: false, severity: 0 };
  const leftAvg = leftSum / leftCnt;
  const innerAvg = innerSum / innerCnt;
  const whiteness = leftAvg - innerAvg;
  const severity = 0.8 * whiteness + 0.3 * Math.max(0, leftAvg - 180);
  const intrudes = leftAvg > 168 && whiteness > 22;
  return { intrudes, severity };
}

function evaluateRightStripIntrusion(sample, frameWidth, stripHeight, left, right, top, bottom) {
  const gridW = Math.max(1, frameWidth - left - right);
  if (gridW < 20) return { intrudes: false, severity: 0 };
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.08));
  const y1 = Math.max(y0 + 2, stripHeight - bottom - Math.round(stripHeight * 0.08));
  const rightBandStart = Math.max(1, Math.min(frameWidth - 2, Math.round(frameWidth - right - Math.max(18, gridW * 0.14))));
  const rightBandEnd = Math.max(rightBandStart + 1, Math.min(frameWidth - 2, Math.round(frameWidth - right - 1)));
  const nearA = Math.max(1, Math.min(frameWidth - 2, Math.round(frameWidth - right - Math.max(34, gridW * 0.24))));
  const nearB = Math.max(nearA + 1, Math.min(frameWidth - 2, Math.round(frameWidth - right - Math.max(16, gridW * 0.12))));
  const innerA = Math.max(1, Math.min(frameWidth - 2, Math.round(frameWidth - right - Math.max(70, gridW * 0.52))));
  const innerB = Math.max(innerA + 1, Math.min(frameWidth - 2, Math.round(frameWidth - right - Math.max(40, gridW * 0.32))));
  let rightSum = 0;
  let rightMin = Infinity;
  let rightCnt = 0;
  for (let x = rightBandStart; x <= rightBandEnd; x += 2) {
    const lum = meanColumnLuminance(sample, x, y0, y1);
    rightSum += lum;
    if (lum < rightMin) rightMin = lum;
    rightCnt++;
  }
  let nearSum = 0;
  let nearCnt = 0;
  for (let x = nearA; x <= nearB; x += 2) {
    nearSum += meanColumnLuminance(sample, x, y0, y1);
    nearCnt++;
  }
  let innerSum = 0;
  let innerCnt = 0;
  for (let x = innerA; x <= innerB; x += 3) {
    innerSum += meanColumnLuminance(sample, x, y0, y1);
    innerCnt++;
  }
  if (rightCnt < 1 || nearCnt < 1 || innerCnt < 1) return { intrudes: false, severity: 0 };
  const rightAvg = rightSum / rightCnt;
  const nearAvg = nearSum / nearCnt;
  const innerAvg = innerSum / innerCnt;
  const contrast = innerAvg - rightAvg;
  const darkness = Math.max(0, 95 - rightAvg) + Math.max(0, 74 - rightMin);
  const severity = 0.7 * contrast + 0.5 * darkness;
  const stripLikeRecovery = nearAvg > 98 && (nearAvg - rightAvg) > 18;
  const intrudes = rightAvg < 95 && rightMin < 72 && contrast > 24 && stripLikeRecovery;
  return { intrudes, severity };
}

function suggestDarkLineStrongScaleAuto(sample, frameWidth, stripHeight, left, right, top, bottom, baseBiasPx, manualScalePx = 1) {
  const biasPx = Math.max(1, Math.round(Number(baseBiasPx) || 1));
  if (biasPx <= 0) return 1;

  const minScale = Math.max(1, Math.min(48, Math.round(Number(manualScalePx) || 1)));
  let bestScale = minScale;
  let bestScore = Infinity;
  const maxScale = 48;

  for (let scale = minScale; scale <= maxScale; scale++) {
    const delta = -Math.max(0, Math.round(biasPx * scale));
    const c = panGridMarginsPreserveWidth(frameWidth, left, right, delta);

    const rightWhite = evaluateRightWhiteIntrusion(sample, frameWidth, stripHeight, c.left, c.right, top, bottom);
    const leftDark = evaluateLeftStripIntrusion(sample, frameWidth, stripHeight, c.left, c.right, top, bottom);

    const rightSeverity = Math.max(0, Number(rightWhite && rightWhite.severity) || 0);
    const leftSeverity = Math.max(0, Number(leftDark && leftDark.severity) || 0);

    // Hard prioriteit: witte rechterstrook uit beeld; daarna zwarte strook links vermijden.
    const rightPenalty = (rightWhite && rightWhite.intrudes ? 1000 : 0) + rightSeverity * 5;
    const leftPenalty = (leftDark && leftDark.intrudes ? 280 : 0) + leftSeverity * 0.8;

    // Kleine voorkeur voor lagere schaal bij vergelijkbare score.
    const scalePenalty = scale * 0.2;
    const score = rightPenalty + leftPenalty + scalePenalty;

    if (score < bestScore) {
      bestScore = score;
      bestScale = scale;
    }
  }

  return Math.max(minScale, Math.min(maxScale, bestScale));
}

function suggestDarkLineStrongScaleAutoMirror(sample, frameWidth, stripHeight, left, right, top, bottom, baseBiasPx, manualScalePx = 1) {
  const biasPx = Math.max(1, Math.round(Number(baseBiasPx) || 1));
  if (biasPx <= 0) return 1;

  const minScale = Math.max(1, Math.min(48, Math.round(Number(manualScalePx) || 1)));
  let bestScale = minScale;
  let bestScore = Infinity;
  const maxScale = 48;

  for (let scale = minScale; scale <= maxScale; scale++) {
    const delta = Math.max(0, Math.round(biasPx * scale));
    const c = panGridMarginsPreserveWidth(frameWidth, left, right, delta);

    const leftWhite = evaluateLeftWhiteIntrusion(sample, frameWidth, stripHeight, c.left, c.right, top, bottom);
    const rightDark = evaluateRightStripIntrusion(sample, frameWidth, stripHeight, c.left, c.right, top, bottom);

    const leftSeverity = Math.max(0, Number(leftWhite && leftWhite.severity) || 0);
    const rightSeverity = Math.max(0, Number(rightDark && rightDark.severity) || 0);
    const leftPenalty = (leftWhite && leftWhite.intrudes ? 1000 : 0) + leftSeverity * 5;
    const rightPenalty = (rightDark && rightDark.intrudes ? 280 : 0) + rightSeverity * 0.8;
    const scalePenalty = scale * 0.2;
    const score = leftPenalty + rightPenalty + scalePenalty;

    if (score < bestScore) {
      bestScore = score;
      bestScale = scale;
    }
  }

  return Math.max(minScale, Math.min(maxScale, bestScale));
}

function hasSimpleLeftDarkIntrusion(sample, frameWidth, stripHeight, left, right, top, bottom) {
  const gridW = Math.max(1, frameWidth - left - right);
  if (gridW < 20) return false;
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.08));
  const y1 = Math.max(y0 + 2, stripHeight - bottom - Math.round(stripHeight * 0.08));
  const leftA = Math.max(1, Math.min(frameWidth - 2, Math.round(left + 2)));
  const leftB = Math.max(leftA + 1, Math.min(frameWidth - 2, Math.round(left + Math.max(14, gridW * 0.06))));
  const midA = Math.max(leftB + 2, Math.min(frameWidth - 2, Math.round(left + gridW * 0.35)));
  const midB = Math.max(midA + 1, Math.min(frameWidth - 2, Math.round(left + gridW * 0.55)));
  let leftSum = 0;
  let leftCnt = 0;
  for (let x = leftA; x <= leftB; x += 2) {
    leftSum += meanColumnLuminance(sample, x, y0, y1);
    leftCnt++;
  }
  let midSum = 0;
  let midCnt = 0;
  for (let x = midA; x <= midB; x += 3) {
    midSum += meanColumnLuminance(sample, x, y0, y1);
    midCnt++;
  }
  if (leftCnt < 1 || midCnt < 1) return false;
  const leftMean = leftSum / leftCnt;
  const midMean = midSum / midCnt;
  return leftMean < 112 && (midMean - leftMean) > 20;
}

function hasSimpleRightDarkIntrusion(sample, frameWidth, stripHeight, left, right, top, bottom) {
  const gridW = Math.max(1, frameWidth - left - right);
  if (gridW < 20) return false;
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.08));
  const y1 = Math.max(y0 + 2, stripHeight - bottom - Math.round(stripHeight * 0.08));
  const rightB = Math.max(1, Math.min(frameWidth - 2, Math.round(frameWidth - right - 2)));
  const rightA = Math.max(1, Math.min(rightB - 1, Math.round(frameWidth - right - Math.max(14, gridW * 0.06))));
  const midB = Math.max(1, Math.min(frameWidth - 2, Math.round(frameWidth - right - gridW * 0.35)));
  const midA = Math.max(1, Math.min(midB - 1, Math.round(frameWidth - right - gridW * 0.55)));
  let rightSum = 0;
  let rightCnt = 0;
  for (let x = rightA; x <= rightB; x += 2) {
    rightSum += meanColumnLuminance(sample, x, y0, y1);
    rightCnt++;
  }
  let midSum = 0;
  let midCnt = 0;
  for (let x = midA; x <= midB; x += 3) {
    midSum += meanColumnLuminance(sample, x, y0, y1);
    midCnt++;
  }
  if (rightCnt < 1 || midCnt < 1) return false;
  const rightMean = rightSum / rightCnt;
  const midMean = midSum / midCnt;
  return rightMean < 112 && (midMean - rightMean) > 20;
}

function findLeftWhiteToImageTransitionX(sample, frameWidth, stripHeight, top, bottom, minWhiteRunPx = 0) {
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.06));
  const y1 = Math.max(y0 + 2, stripHeight - bottom - Math.round(stripHeight * 0.06));
  const minX = 2;
  const maxX = Math.max(minX + 12, Math.round(frameWidth * 0.42));
  const profile = [];
  for (let x = minX; x <= maxX; x += 1) {
    profile.push(meanColumnLuminance(sample, x, y0, y1));
  }
  if (profile.length < 10) return null;
  let bestIdx = -1;
  let bestScore = -Infinity;
  for (let i = 2; i < profile.length - 5; i++) {
    const leftAvg = (profile[i - 2] + profile[i - 1] + profile[i]) / 3;
    const rightAvg = (profile[i + 1] + profile[i + 2] + profile[i + 3]) / 3;
    const drop = leftAvg - rightAvg;
    if (leftAvg < 165) continue;
    if (drop < 10) continue;
    const runMin = Math.max(0, Math.round(Number(minWhiteRunPx) || 0));
    if (runMin > 0) {
      let run = 0;
      for (let j = i; j >= 0; j--) {
        if (profile[j] >= 168) run++;
        else break;
      }
      if (run < runMin) continue;
    }
    const score = drop + 0.28 * Math.max(0, leftAvg - 170) + 0.16 * Math.max(0, 206 - rightAvg);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;
  return minX + bestIdx;
}

function findRightWhiteToImageTransitionX(sample, frameWidth, stripHeight, top, bottom, minWhiteRunPx = 0) {
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.06));
  const y1 = Math.max(y0 + 2, stripHeight - bottom - Math.round(stripHeight * 0.06));
  const minX = Math.max(2, Math.round(frameWidth * 0.58));
  const maxX = Math.max(minX + 12, frameWidth - 3);
  const profile = [];
  for (let x = minX; x <= maxX; x += 1) {
    profile.push(meanColumnLuminance(sample, x, y0, y1));
  }
  if (profile.length < 10) return null;
  let bestIdx = -1;
  let bestScore = -Infinity;
  for (let i = profile.length - 4; i >= 2; i--) {
    const leftAvg = (profile[i - 3] + profile[i - 2] + profile[i - 1]) / 3;
    const rightAvg = (profile[i] + profile[i + 1] + profile[i + 2]) / 3;
    const rise = rightAvg - leftAvg;
    if (rightAvg < 165) continue;
    if (rise < 10) continue;
    const runMin = Math.max(0, Math.round(Number(minWhiteRunPx) || 0));
    if (runMin > 0) {
      let run = 0;
      for (let j = i; j < profile.length; j++) {
        if (profile[j] >= 168) run++;
        else break;
      }
      if (run < runMin) continue;
    }
    const score = rise + 0.28 * Math.max(0, rightAvg - 170) + 0.16 * Math.max(0, 206 - leftAvg);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;
  return minX + bestIdx;
}

function hasSimpleLeftWhiteIntrusion(sample, frameWidth, stripHeight, left, right, top, bottom) {
  const gridW = Math.max(1, frameWidth - left - right);
  if (gridW < 20) return false;
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.08));
  const y1 = Math.max(y0 + 2, stripHeight - bottom - Math.round(stripHeight * 0.08));
  const leftA = Math.max(1, Math.min(frameWidth - 2, Math.round(left + 1)));
  const leftB = Math.max(leftA + 1, Math.min(frameWidth - 2, Math.round(left + Math.max(12, gridW * 0.07))));
  const midA = Math.max(leftB + 2, Math.min(frameWidth - 2, Math.round(left + gridW * 0.33)));
  const midB = Math.max(midA + 1, Math.min(frameWidth - 2, Math.round(left + gridW * 0.56)));
  let leftSum = 0;
  let leftCnt = 0;
  for (let x = leftA; x <= leftB; x += 2) {
    leftSum += meanColumnLuminance(sample, x, y0, y1);
    leftCnt++;
  }
  let midSum = 0;
  let midCnt = 0;
  for (let x = midA; x <= midB; x += 3) {
    midSum += meanColumnLuminance(sample, x, y0, y1);
    midCnt++;
  }
  if (leftCnt < 1 || midCnt < 1) return false;
  const leftMean = leftSum / leftCnt;
  const midMean = midSum / midCnt;
  return leftMean > 172 && (leftMean - midMean) > 18;
}

function hasSimpleRightWhiteIntrusion(sample, frameWidth, stripHeight, left, right, top, bottom) {
  const gridW = Math.max(1, frameWidth - left - right);
  if (gridW < 20) return false;
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.08));
  const y1 = Math.max(y0 + 2, stripHeight - bottom - Math.round(stripHeight * 0.08));
  const rightB = Math.max(1, Math.min(frameWidth - 2, Math.round(frameWidth - right - 1)));
  const rightA = Math.max(1, Math.min(rightB - 1, Math.round(frameWidth - right - Math.max(12, gridW * 0.07))));
  const midB = Math.max(1, Math.min(frameWidth - 2, Math.round(frameWidth - right - gridW * 0.33)));
  const midA = Math.max(1, Math.min(midB - 1, Math.round(frameWidth - right - gridW * 0.56)));
  let rightSum = 0;
  let rightCnt = 0;
  for (let x = rightA; x <= rightB; x += 2) {
    rightSum += meanColumnLuminance(sample, x, y0, y1);
    rightCnt++;
  }
  let midSum = 0;
  let midCnt = 0;
  for (let x = midA; x <= midB; x += 3) {
    midSum += meanColumnLuminance(sample, x, y0, y1);
    midCnt++;
  }
  if (rightCnt < 1 || midCnt < 1) return false;
  const rightMean = rightSum / rightCnt;
  const midMean = midSum / midCnt;
  return rightMean > 172 && (rightMean - midMean) > 18;
}

function pushGridRightOutOfLeftStrip(sample, frameWidth, stripHeight, left, right, top, bottom, mode, baselineLeft = null) {
  const base = evaluateLeftStripIntrusion(sample, frameWidth, stripHeight, left, right, top, bottom);
  if (!base.intrudes) return { left, right };
  const trProfile = findLeftBlackToImageTransitionByProfile(sample, frameWidth, stripHeight, top, bottom);
  const trSimple = findLeftBlackToImageTransitionX(sample, frameWidth, stripHeight, top, bottom);
  const trX = trProfile && Number.isFinite(trProfile.x)
    ? trProfile.x
    : (Number.isFinite(trSimple) ? trSimple : null);
  if (!Number.isFinite(trX)) return { left, right };
  let targetLeft = Math.max(0, Math.min(frameWidth - 2, Math.round(trX + 2)));
  const severity = Number(base.severity) || 0;
  const shiftCap = mode === 'strong'
    ? (severity > 56 ? 56 : severity > 40 ? 34 : 20)
    : (severity > 56 ? 40 : severity > 40 ? 24 : 14);
  if (Number.isFinite(Number(baselineLeft))) {
    const baseline = Math.max(0, Math.round(Number(baselineLeft)));
    targetLeft = Math.min(targetLeft, baseline + shiftCap);
  }
  const needRight = Math.round(targetLeft - left);
  if (needRight <= 0) return { left, right };
  const sx = Math.max(0, Math.min(shiftCap, needRight));
  return panGridMarginsPreserveWidth(frameWidth, left, right, sx);
}

function edgeStrengthHorizontal(sample, yCanvas, x0Canvas, x1Canvas) {
  const y = Math.round(yCanvas / sample.ky);
  if (y < 1 || y >= sample.height - 1) return 0;
  const x0 = Math.max(1, Math.min(sample.width - 2, Math.round(x0Canvas / sample.kx)));
  const x1 = Math.max(x0 + 1, Math.min(sample.width - 1, Math.round(x1Canvas / sample.kx)));
  const step = Math.max(1, Math.floor((x1 - x0) / 80));
  let sum = 0;
  let cnt = 0;
  for (let x = x0; x <= x1; x += step) {
    const a = luminanceAt(sample.data, sample.width, x, y - 1);
    const b = luminanceAt(sample.data, sample.width, x, y);
    sum += Math.abs(b - a);
    cnt++;
  }
  return cnt > 0 ? sum / cnt : 0;
}

function edgeSignedHorizontal(sample, yCanvas, x0Canvas, x1Canvas, preferOutsideWhite, outsideBelow, edgeBias = 0) {
  const y = Math.round(yCanvas / sample.ky);
  if (y < 1 || y >= sample.height - 1) return 0;
  const x0 = Math.max(1, Math.min(sample.width - 2, Math.round(x0Canvas / sample.kx)));
  const x1 = Math.max(x0 + 1, Math.min(sample.width - 1, Math.round(x1Canvas / sample.kx)));
  const step = Math.max(1, Math.floor((x1 - x0) / 90));
  const mid = (x0 + x1) / 2;
  const half = Math.max(1, (x1 - x0) / 2);
  let sum = 0;
  let wsum = 0;
  for (let x = x0; x <= x1; x += step) {
    const upLum = luminanceAt(sample.data, sample.width, x, y - 1);
    const downLum = luminanceAt(sample.data, sample.width, x, y);
    const outside = outsideBelow ? downLum : upLum;
    const inside = outsideBelow ? upLum : downLum;
    const signed = preferOutsideWhite ? (outside - inside) : (inside - outside);
    const edgeW = 1 + Math.max(0, edgeBias) * Math.abs((x - mid) / half);
    sum += signed * edgeW;
    wsum += edgeW;
  }
  return wsum > 0 ? sum / wsum : 0;
}

function edgeSignedHorizontalWindow(sample, yCanvas, x0Canvas, x1Canvas, preferOutsideWhite, outsideBelow) {
  const y = Math.round(yCanvas / sample.ky);
  if (y < 1 || y >= sample.height - 1) return 0;
  const x0 = Math.max(1, Math.min(sample.width - 2, Math.round(x0Canvas / sample.kx)));
  const x1 = Math.max(x0 + 1, Math.min(sample.width - 1, Math.round(x1Canvas / sample.kx)));
  const step = Math.max(1, Math.floor((x1 - x0) / 40));
  let sum = 0;
  let cnt = 0;
  for (let x = x0; x <= x1; x += step) {
    const upLum = luminanceAt(sample.data, sample.width, x, y - 1);
    const downLum = luminanceAt(sample.data, sample.width, x, y);
    const outside = outsideBelow ? downLum : upLum;
    const inside = outsideBelow ? upLum : downLum;
    const signed = preferOutsideWhite ? (outside - inside) : (inside - outside);
    sum += signed;
    cnt++;
  }
  return cnt > 0 ? sum / cnt : 0;
}

function ridgeScoreHorizontal(sample, yCanvas, x0Canvas, x1Canvas, edgeBias = 0) {
  const y = Math.round(yCanvas / sample.ky);
  if (y < 2 || y >= sample.height - 2) return -Infinity;
  const x0 = Math.max(1, Math.min(sample.width - 2, Math.round(x0Canvas / sample.kx)));
  const x1 = Math.max(x0 + 1, Math.min(sample.width - 1, Math.round(x1Canvas / sample.kx)));
  const step = Math.max(1, Math.floor((x1 - x0) / 80));
  const d = 3;
  const mid = (x0 + x1) / 2;
  const half = Math.max(1, (x1 - x0) / 2);
  let sum = 0;
  let wsum = 0;
  for (let x = x0; x <= x1; x += step) {
    const lum = luminanceAt(sample.data, sample.width, x, y);
    const up = luminanceAt(sample.data, sample.width, x, y - d);
    const down = luminanceAt(sample.data, sample.width, x, y + d);
    const ridge = lum - 0.5 * (up + down);
    const edgeW = 1 + Math.max(0, edgeBias) * Math.abs((x - mid) / half);
    sum += ridge * edgeW;
    wsum += edgeW;
  }
  return wsum > 0 ? sum / wsum : -Infinity;
}

function darkLineScoreHorizontal(sample, yCanvas, x0Canvas, x1Canvas, edgeBias = 0) {
  const y = Math.round(yCanvas / sample.ky);
  if (y < 2 || y >= sample.height - 2) return -Infinity;
  const x0 = Math.max(1, Math.min(sample.width - 2, Math.round(x0Canvas / sample.kx)));
  const x1 = Math.max(x0 + 1, Math.min(sample.width - 1, Math.round(x1Canvas / sample.kx)));
  const step = Math.max(1, Math.floor((x1 - x0) / 80));
  const d = 3;
  const mid = (x0 + x1) / 2;
  const half = Math.max(1, (x1 - x0) / 2);
  let sum = 0;
  let wsum = 0;
  for (let x = x0; x <= x1; x += step) {
    const lum = luminanceAt(sample.data, sample.width, x, y);
    const up = luminanceAt(sample.data, sample.width, x, y - d);
    const down = luminanceAt(sample.data, sample.width, x, y + d);
    const valley = 0.5 * (up + down) - lum;
    const darkBoost = (255 - lum) / 255;
    const edgeW = 1 + Math.max(0, edgeBias) * Math.abs((x - mid) / half);
    sum += valley * (1 + 0.6 * darkBoost) * edgeW;
    wsum += edgeW;
  }
  return wsum > 0 ? sum / wsum : -Infinity;
}

/**
 * Score voor een dunne horizontale zwarte aperture-lijn (1–3 px).
 * Anders dan darkLineScore (brede valley d=3): hier d=1 zodat dikke banden/stof minder winnen.
 */
function thinDarkLineScoreHorizontal(sample, yCanvas, x0Canvas, x1Canvas, edgeBias = 0) {
  const y = Math.round(yCanvas / sample.ky);
  if (y < 2 || y >= sample.height - 2) return -Infinity;
  const x0 = Math.max(1, Math.min(sample.width - 2, Math.round(x0Canvas / sample.kx)));
  const x1 = Math.max(x0 + 1, Math.min(sample.width - 1, Math.round(x1Canvas / sample.kx)));
  const step = Math.max(1, Math.floor((x1 - x0) / 100));
  const mid = (x0 + x1) / 2;
  const half = Math.max(1, (x1 - x0) / 2);
  let sum = 0;
  let wsum = 0;
  for (let x = x0; x <= x1; x += step) {
    const lum = luminanceAt(sample.data, sample.width, x, y);
    const up = luminanceAt(sample.data, sample.width, x, y - 1);
    const down = luminanceAt(sample.data, sample.width, x, y + 1);
    const up2 = luminanceAt(sample.data, sample.width, x, y - 2);
    const down2 = luminanceAt(sample.data, sample.width, x, y + 2);
    // Smalle valley: lijn donkerder dan directe buren én dan iets verder
    const valley1 = 0.5 * (up + down) - lum;
    const valley2 = 0.5 * (up2 + down2) - lum;
    const darkBoost = (255 - lum) / 255;
    // Straffen als buren ook heel donker zijn (dikke balk i.p.v. dunne lijn)
    const neighborDark = (255 - Math.min(up, down)) / 255;
    const thinBonus = Math.max(0, valley1 - 0.35 * neighborDark * 40);
    const edgeW = 1 + Math.max(0, edgeBias) * Math.abs((x - mid) / half);
    sum += (0.7 * thinBonus + 0.3 * Math.max(0, valley2) + 18 * darkBoost) * edgeW;
    wsum += edgeW;
  }
  return wsum > 0 ? sum / wsum : -Infinity;
}

/**
 * Full-res refine: aperture-lijn op het echte strip-canvas (sample mist 1–2 px lijnen).
 * @param {'topInner'|'bottomInner'} lockEdge
 */
function refineThinDarkLineYFullRes(stripCanvas, yHintCanvas, x0Canvas, x1Canvas, lockEdge) {
  if (!stripCanvas || stripCanvas.width < 32 || stripCanvas.height < 32) return null;
  let ctx;
  try {
    ctx = stripCanvas.getContext('2d', { willReadFrequently: true });
  } catch (_) {
    return null;
  }
  if (!ctx) return null;
  const w = stripCanvas.width;
  const h = stripCanvas.height;
  const yHint = Math.round(yHintCanvas);
  const t = getAssistDarkLineThicknessT();
  // Dun: smalle band; dik: ruimere band — begrensd door gebruikers-zoekbereik
  const userRange = getAssistDarkLineSearchRangePx();
  const search = Math.max(8, Math.min(Math.round(userRange * 0.4), Math.round(10 + t * 22)));
  const y0 = Math.max(2, yHint - search);
  const y1 = Math.min(h - 3, yHint + search);
  const x0 = Math.max(0, Math.round(x0Canvas));
  const x1 = Math.min(w - 1, Math.max(x0 + 8, Math.round(x1Canvas)));
  const bandW = x1 - x0 + 1;
  const bandH = y1 - y0 + 1;
  if (bandW < 8 || bandH < 5) return null;
  let img;
  try {
    img = ctx.getImageData(x0, y0, bandW, bandH);
  } catch (_) {
    return null;
  }
  const data = img.data;
  const stepX = Math.max(1, Math.floor(bandW / 120));
  const dNbr = Math.max(1, Math.round(1 + t * 2)); // 1…3 px buur-afstand
  let bestY = yHint;
  let bestScore = -Infinity;
  const lumAt = (row, col) => {
    const i = (row * bandW + col) * 4;
    return data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
  };
  for (let row = dNbr; row < bandH - dNbr; row++) {
    let sum = 0;
    let cnt = 0;
    for (let col = 0; col < bandW; col += stepX) {
      const L = lumAt(row, col);
      const up = lumAt(row - dNbr, col);
      const down = lumAt(row + dNbr, col);
      const valley = 0.5 * (up + down) - L;
      const dark = (255 - L) / 255;
      const neighborDark = (255 - Math.min(up, down)) / 255;
      // Dun: straf dikke buren; dik: valley mag breder
      let s = valley * (1 + dark) - neighborDark * (14 * (1 - t));
      if (lockEdge === 'topInner') {
        s += 0.15 * (down - up);
      } else if (lockEdge === 'bottomInner') {
        s += 0.15 * (up - down);
      }
      sum += s;
      cnt++;
    }
    const score = cnt > 0 ? sum / cnt : -Infinity;
    if (score > bestScore) {
      bestScore = score;
      bestY = y0 + row;
    }
  }
  if (!Number.isFinite(bestScore) || bestScore < 1.5) return null;
  return { yCanvas: bestY, score: bestScore };
}

/**
 * Zoek horizontale zwarte framelijn nabij yCenter.
 * @param {'valley'|'topInner'|'bottomInner'} [lockEdge]
 *   valley = donkerste midden (kan jitteren in dikke band)
 *   topInner = dunne aperture-lijn aan bovenkant (beeldkant)
 *   bottomInner = dunne aperture-lijn aan onderkant (beeldkant)
 */
function findBestDarkLineY(sample, yCenterCanvas, yRangeCanvas, x0Canvas, x1Canvas, lockEdge) {
  const edgeMode = lockEdge === 'topInner' || lockEdge === 'bottomInner' ? lockEdge : 'valley';
  const yCenter = Math.round(yCenterCanvas / sample.ky);
  const yRange = Math.max(4, Math.round(Math.abs(yRangeCanvas) / sample.ky));
  const yMin = Math.max(2, yCenter - yRange);
  const yMax = Math.min(sample.height - 3, yCenter + yRange);
  const x0 = Math.max(1, Math.min(sample.width - 2, Math.round(x0Canvas / sample.kx)));
  const x1 = Math.max(x0 + 1, Math.min(sample.width - 1, Math.round(x1Canvas / sample.kx)));
  const t = getAssistDarkLineThicknessT();
  const thinW = 0.5 * (1 - t);
  const thickW = 0.5 * t;
  let bestY = yCenter;
  let bestScore = -Infinity;
  for (let y = yMin; y <= yMax; y++) {
    const yCanvas = y * sample.ky;
    const dark = darkLineScoreHorizontal(sample, yCanvas, x0 * sample.kx, x1 * sample.kx, 0.3);
    const thin = thinDarkLineScoreHorizontal(sample, yCanvas, x0 * sample.kx, x1 * sample.kx, 0.25);
    const edge = edgeStrengthHorizontal(sample, yCanvas, x0 * sample.kx, x1 * sample.kx);
    let score;
    if (edgeMode === 'topInner') {
      const signed = edgeSignedHorizontal(sample, yCanvas, x0 * sample.kx, x1 * sample.kx, true, true, 0.2);
      score = thinW * thin + thickW * dark + 0.28 * signed + 0.12 * edge - 0.005 * Math.abs(y - yCenter);
    } else if (edgeMode === 'bottomInner') {
      const signed = edgeSignedHorizontal(sample, yCanvas, x0 * sample.kx, x1 * sample.kx, true, false, 0.2);
      score = thinW * thin + thickW * dark + 0.28 * signed + 0.12 * edge - 0.005 * Math.abs(y - yCenter);
    } else {
      const signed = edgeSignedHorizontal(sample, yCanvas, x0 * sample.kx, x1 * sample.kx, false, true, 0.15);
      score = 0.66 * dark + 0.22 * edge + 0.12 * signed - 0.008 * Math.abs(y - yCenter);
    }
    if (score > bestScore) {
      bestScore = score;
      bestY = y;
    }
  }
  return { yCanvas: bestY * sample.ky, score: bestScore };
}

/**
 * Vind Y-centra van witte perforaties (sprockets) in de linker strook.
 * Op 16mm/tekenfilm vallen die centra samen met de horizontale framelijnen.
 */
function findLeftSprocketCentersY(sample, frameWidth, stripHeight, leftMarginPx) {
  const bandRight = Math.max(
    12,
    Math.min(
      leftMarginPx > 12 ? leftMarginPx - 2 : Math.round(frameWidth * 0.2),
      Math.round(frameWidth * 0.32)
    )
  );
  const bandLeft = Math.max(0, Math.round(bandRight * 0.15));
  const x0 = Math.max(1, Math.min(sample.width - 3, Math.round(bandLeft / sample.kx)));
  const x1 = Math.max(x0 + 2, Math.min(sample.width - 2, Math.round(bandRight / sample.kx)));

  const profile = new Float64Array(sample.height);
  for (let y = 1; y < sample.height - 1; y++) {
    let mx = 0;
    for (let x = x0; x <= x1; x++) {
      mx = Math.max(mx, luminanceAt(sample.data, sample.width, x, y));
    }
    profile[y] = mx;
  }
  const smooth = new Float64Array(sample.height);
  for (let y = 1; y < sample.height - 1; y++) {
    smooth[y] = 0.25 * profile[y - 1] + 0.5 * profile[y] + 0.25 * profile[y + 1];
  }

  // Adaptieve drempel: sprockets zijn de helderste pieken in de linkerband
  const vals = [];
  for (let y = 2; y < sample.height - 2; y++) vals.push(smooth[y]);
  vals.sort((a, b) => a - b);
  const p75 = vals[Math.floor(vals.length * 0.75)] || 160;
  const p95 = vals[Math.floor(vals.length * 0.95)] || 220;
  const threshold = Math.max(150, Math.min(230, 0.55 * p75 + 0.45 * p95));

  const centers = [];
  let inPeak = false;
  let peakStart = 0;
  for (let y = 2; y < sample.height - 1; y++) {
    if (smooth[y] >= threshold) {
      if (!inPeak) {
        inPeak = true;
        peakStart = y;
      }
    } else if (inPeak) {
      const peakEnd = y;
      const heightPx = peakEnd - peakStart;
      // Negeer dunne ruis; sprockets zijn relatief hoog in sample-ruimte
      if (heightPx >= 2) {
        let sumW = 0;
        let sumY = 0;
        for (let yy = peakStart; yy < peakEnd; yy++) {
          const w = Math.max(0, smooth[yy] - threshold * 0.85);
          sumW += w;
          sumY += w * yy;
        }
        const cy = sumW > 1e-6 ? sumY / sumW : (peakStart + peakEnd - 1) * 0.5;
        centers.push(cy * sample.ky);
      }
      inPeak = false;
    }
  }
  return centers.filter((y) => y >= 0 && y <= stripHeight);
}

function nearestSprocketY(centers, targetY, maxDist) {
  if (!centers || !centers.length) return null;
  let best = null;
  let bestD = Infinity;
  const limit = Number.isFinite(maxDist) ? maxDist : Infinity;
  for (let i = 0; i < centers.length; i++) {
    const d = Math.abs(centers[i] - targetY);
    if (d < bestD && d <= limit) {
      bestD = d;
      best = centers[i];
    }
  }
  return best;
}

/**
 * Y van de tippen van witte hoekdriehoekjes links (horizontale framelijnen).
 * Tip-Y = rij waar de witte blob het verst naar rechts reikt (het punt), niet het zwaartepunt.
 */
function findLeftTriangleTipYs(sample, frameWidth, stripHeight, leftMarginPx, mode) {
  const whiteThr = getTriangleWhiteThreshold();
  const bandRight = Math.max(
    14,
    Math.min(
      leftMarginPx > 10 ? leftMarginPx + Math.round(frameWidth * 0.02) : Math.round(frameWidth * 0.18),
      Math.round(frameWidth * 0.22)
    )
  );
  const bandLeft = Math.max(0, Math.round(bandRight * 0.08));
  const x0 = Math.max(1, Math.min(sample.width - 3, Math.round(bandLeft / sample.kx)));
  const x1 = Math.max(x0 + 2, Math.min(sample.width - 2, Math.round(bandRight / sample.kx)));
  const maxRunX = Math.max(4, Math.round((mode === 'strong' ? 52 : 40) / sample.kx));
  const tipXAtY = new Int32Array(sample.height);
  tipXAtY.fill(-1);

  for (let y = 2; y < sample.height - 2; y++) {
    let runStart = -1;
    let bestTipX = -1;
    for (let x = x0; x <= x1; x++) {
      const L = luminanceAt(sample.data, sample.width, x, y);
      if (L >= whiteThr) {
        if (runStart < 0) runStart = x;
      } else if (runStart >= 0) {
        const tipX = x - 1;
        const runLen = tipX - runStart + 1;
        if (runLen >= 2 && runLen <= maxRunX) {
          const L2 = luminanceAt(sample.data, sample.width, Math.min(sample.width - 1, x + 1), y);
          if (L2 < whiteThr - 10 && tipX > bestTipX) bestTipX = tipX;
        }
        runStart = -1;
      }
    }
    tipXAtY[y] = bestTipX;
  }

  const centers = [];
  let y = 2;
  while (y < sample.height - 2) {
    if (tipXAtY[y] < 0) {
      y++;
      continue;
    }
    let y0 = y;
    let y1 = y;
    let maxTipX = tipXAtY[y];
    while (y1 + 1 < sample.height - 2 && tipXAtY[y1 + 1] >= 0 && tipXAtY[y1 + 1] - tipXAtY[y1] > -8) {
      y1++;
      if (tipXAtY[y1] > maxTipX) maxTipX = tipXAtY[y1];
    }
    const heightRows = y1 - y0 + 1;
    if (heightRows >= 2 && heightRows <= Math.max(12, Math.round(60 / sample.ky))) {
      const tipDepth = (maxTipX - x0) / Math.max(1, x1 - x0);
      if (tipDepth >= 0.2) {
        const apexRows = [];
        for (let yy = y0; yy <= y1; yy++) {
          if (tipXAtY[yy] === maxTipX) apexRows.push(yy);
        }
        const tipY = apexRows.length
          ? apexRows[Math.floor(apexRows.length / 2)]
          : Math.round((y0 + y1) * 0.5);
        centers.push(tipY * sample.ky);
      }
    }
    y = y1 + 1;
  }
  return centers.filter((yy) => yy >= 0 && yy <= stripHeight);
}

/**
 * Tip-Y van de linker-onder hoekdriehoek (wijst het frame in).
 * Zoekt alleen dicht bij de huidige onderlijn — niet hoog in lichte frame-inhoud.
 */
function findLeftBottomCornerTriangleTipY(sample, frameWidth, yFocusCanvas, leftMarginPx, mode) {
  const whiteThr = getTriangleWhiteThreshold();
  const yFocus = Math.round(yFocusCanvas / sample.ky);
  const yHalfUp = Math.max(8, Math.round((mode === 'strong' ? 56 : 40) / sample.ky));
  const yHalfDown = Math.max(6, Math.round((mode === 'strong' ? 36 : 28) / sample.ky));
  const y0 = Math.max(2, yFocus - yHalfUp);
  const y1 = Math.min(sample.height - 3, yFocus + yHalfDown);
  const xRight = Math.max(
    12,
    Math.min(
      sample.width - 2,
      Math.round(
        Math.min(
          leftMarginPx > 4 ? leftMarginPx + frameWidth * 0.05 : frameWidth * 0.18,
          frameWidth * 0.2
        ) / sample.kx
      )
    )
  );
  const xLeft = Math.max(1, Math.round((frameWidth * 0.01) / sample.kx));

  let bestScore = -Infinity;
  let bestY = null;

  for (let y = y0; y <= y1; y++) {
    let runStart = -1;
    for (let x = xLeft; x <= xRight; x++) {
      const L = luminanceAt(sample.data, sample.width, x, y);
      if (L >= whiteThr) {
        if (runStart < 0) runStart = x;
      } else if (runStart >= 0) {
        const tipX = x - 1;
        const runLen = tipX - runStart + 1;
        const LBefore = luminanceAt(sample.data, sample.width, Math.max(0, runStart - 2), y);
        const L2 = luminanceAt(sample.data, sample.width, Math.min(sample.width - 1, x + 1), y);
        if (
          runLen >= 2 &&
          runLen <= Math.max(6, Math.round(56 / sample.kx)) &&
          LBefore < whiteThr - 12 &&
          L2 < whiteThr - 4
        ) {
          const score = tipX * 1.2 - Math.abs(y - yFocus) * 0.45 + runLen * 0.8;
          if (score > bestScore) {
            bestScore = score;
            bestY = y;
          }
        }
        runStart = -1;
      }
    }
  }
  if (bestY == null) return null;
  return bestY * sample.ky;
}

/**
 * Tip-Y van het linkse witte driehoekje rond yFocus.
 * Tip = rij met de grootste tip-X (het punt dat het frame in wijst).
 */
function findLeftTriangleTipYNear(sample, frameWidth, yFocusCanvas, leftMarginPx, mode, preferLower) {
  if (preferLower) {
    const corner = findLeftBottomCornerTriangleTipY(sample, frameWidth, yFocusCanvas, leftMarginPx, mode);
    if (Number.isFinite(corner)) return corner;
  }
  const whiteThr = getTriangleWhiteThreshold();
  const yFocus = Math.round(yFocusCanvas / sample.ky);
  // Tip dicht bij huidige lijn — beperkte band (voorkomt sprong/comprimeren op lichte frames)
  const yHalfUp = Math.max(
    8,
    Math.round((preferLower ? (mode === 'strong' ? 64 : 48) : (mode === 'strong' ? 56 : 40)) / sample.ky)
  );
  const yHalfDown = Math.max(6, Math.round((mode === 'strong' ? 40 : 28) / sample.ky));
  const y0 = Math.max(2, yFocus - yHalfUp);
  const y1 = Math.min(sample.height - 3, yFocus + yHalfDown);
  // Alleen in linker perforatiestrook zoeken — niet in lichte frame-inhoud
  const bandRight = Math.max(
    24,
    Math.min(
      leftMarginPx > 4 ? leftMarginPx + Math.round(frameWidth * 0.035) : Math.round(frameWidth * 0.1),
      Math.round(frameWidth * 0.12)
    )
  );
  const bandLeft = Math.max(0, Math.round(bandRight * 0.03));
  const x0 = Math.max(1, Math.min(sample.width - 3, Math.round(bandLeft / sample.kx)));
  const x1 = Math.max(x0 + 2, Math.min(sample.width - 2, Math.round(bandRight / sample.kx)));
  const maxRunX = Math.max(6, Math.round((mode === 'strong' ? 72 : 56) / sample.kx));

  let maxTipX = -1;
  const tipXAtY = [];

  for (let y = y0; y <= y1; y++) {
    let runStart = -1;
    let rowTipX = -1;
    for (let x = x0; x <= x1; x++) {
      const L = luminanceAt(sample.data, sample.width, x, y);
      if (L >= whiteThr) {
        if (runStart < 0) runStart = x;
      } else if (runStart >= 0) {
        const tipX = x - 1;
        const runLen = tipX - runStart + 1;
        if (runLen >= 2 && runLen <= maxRunX) {
          const L2 = luminanceAt(sample.data, sample.width, Math.min(sample.width - 1, x + 1), y);
          const LBefore = luminanceAt(sample.data, sample.width, Math.max(0, runStart - 2), y);
          if (LBefore < whiteThr - 12 && L2 < whiteThr - 4 && tipX > rowTipX) rowTipX = tipX;
        }
        runStart = -1;
      }
    }
    // Ook: doorlopende witte run tot x1 (tip tegen zoekrand)
    if (runStart >= 0) {
      const tipX = x1;
      const runLen = tipX - runStart + 1;
      const LBefore = luminanceAt(sample.data, sample.width, Math.max(0, runStart - 2), y);
      if (runLen >= 2 && runLen <= maxRunX && LBefore < whiteThr - 12 && tipX > rowTipX) rowTipX = tipX;
    }
    tipXAtY[y] = rowTipX;
    if (rowTipX > maxTipX) maxTipX = rowTipX;
  }
  if (maxTipX < 0) return null;

  // Alleen rijen met exact de maximale tip-X (= echte punt)
  const apexYs = [];
  for (let y = y0; y <= y1; y++) {
    if (tipXAtY[y] === maxTipX) apexYs.push(y);
  }
  if (!apexYs.length) return null;

  // Midden van het tip-punt: tipX-gewogen Y (sterker gewicht = scherpere tip)
  let sumWY = 0;
  let sumW = 0;
  for (let i = 0; i < apexYs.length; i++) {
    const y = apexYs[i];
    const tx = tipXAtY[y];
    const w = Math.max(1, (tx - (maxTipX - 2)) * (tx - (maxTipX - 2)));
    sumWY += y * w;
    sumW += w;
  }
  const tipSampleY = sumW > 0 ? sumWY / sumW : apexYs[Math.floor((apexYs.length - 1) / 2)];
  return tipSampleY * sample.ky;
}

/**
 * Verfijn tip-Y op volle strip-resolutie.
 * Voor onder-hoek: tip wijst omhoog/rechts het frame in.
 */
function refineLeftTriangleTipYFullRes(stripCanvas, tipYApprox, leftMarginPx, frameWidth, preferLower) {
  if (!stripCanvas || !Number.isFinite(tipYApprox)) return tipYApprox;
  const w = stripCanvas.width;
  const h = stripCanvas.height;
  if (w < 8 || h < 8) return tipYApprox;
  const yC = Math.round(tipYApprox);
  const yPadUp = preferLower ? 40 : 24;
  const yPadDown = preferLower ? 20 : 24;
  const y0 = Math.max(0, yC - yPadUp);
  const y1 = Math.min(h - 1, yC + yPadDown);
  const x1 = Math.max(
    8,
    Math.min(w - 1, Math.round(Math.max(leftMarginPx + frameWidth * 0.06, frameWidth * 0.12)))
  );
  const x0 = Math.max(0, Math.round(x1 * 0.04));
  const rw = x1 - x0 + 1;
  const rh = y1 - y0 + 1;
  if (rw < 4 || rh < 3) return tipYApprox;
  let ctx;
  try {
    ctx = stripCanvas.getContext('2d', { willReadFrequently: true });
  } catch (_) {
    ctx = stripCanvas.getContext('2d');
  }
  if (!ctx) return tipYApprox;
  let img;
  try {
    img = ctx.getImageData(x0, y0, rw, rh);
  } catch (_) {
    return tipYApprox;
  }
  const data = img.data;
  const whiteThr = 145;
  let bestScore = -Infinity;
  let bestY = tipYApprox;

  for (let yy = 0; yy < rh; yy++) {
    for (let xx = 0; xx < rw; xx++) {
      const i = (yy * rw + xx) * 4;
      const L = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      if (L < whiteThr) continue;
      const absY = y0 + yy;
      const absX = x0 + xx;
      let score;
      if (preferLower) {
        // Onder-tip: omhoog + naar rechts (het punt)
        score = absX * 2.2 - absY * 0.9 + (L - whiteThr) * 0.04;
      } else {
        score = absX * 2.0 - Math.abs(absY - yC) * 0.2;
      }
      if (score > bestScore) {
        bestScore = score;
        bestY = absY;
      }
    }
  }
  return Number.isFinite(bestY) ? bestY : tipYApprox;
}

/**
 * Linker verticale zijkant van een witte hoekdriehoek (niet de tip, niet de buitenste filmrand).
 * = start van witte run mét donker links én tip→donker rechts.
 */
/**
 * Linker verticale witte driehoek-zijde: eerst tip (wit→donker rechts), dan links wandelen tot donker.
 * Zo klemmen we op de rechte zijkant, niet op de tip en niet op de buitenste filmrand.
 */
function findLeftTriangleVerticalWhiteEdgeX(sample, frameWidth, yFocusCanvas, mode, preferXCanvas) {
  const tipThr = getTriangleWhiteThreshold();
  const bodyThr = Math.max(100, tipThr - 28);
  const darkThr = tipThr - 2;
  const yFocus = Math.round(yFocusCanvas / sample.ky);
  const yHalf = Math.max(10, Math.round((mode === 'strong' ? 90 : 64) / sample.ky));
  const y0 = Math.max(1, yFocus - yHalf);
  const y1 = Math.min(sample.height - 2, yFocus + yHalf);
  const maxRunCanvas = Math.max(56, Math.round(frameWidth * 0.07));
  const minRunCanvas = Math.max(4, Math.round(6 / sample.kx));
  // prefer ≈ tip (iets rechts van huidige linkerrand)
  const prefer = Number.isFinite(preferXCanvas)
    ? preferXCanvas
    : Math.round(frameWidth * 0.2);
  const bandRight = mode === 'strong'
    ? Math.max(90, Math.round(frameWidth * 0.08))
    : Math.max(64, Math.round(frameWidth * 0.055));
  const bandLeft = mode === 'strong'
    ? Math.max(180, Math.round(frameWidth * 0.16))
    : Math.max(140, Math.round(frameWidth * 0.12));
  const xMin = Math.max(1, Math.round((prefer - bandLeft) / sample.kx));
  const xMax = Math.min(sample.width - 3, Math.round((prefer + bandRight) / sample.kx));
  const hits = [];

  for (let y = y0; y <= y1; y++) {
    let runStart = -1;
    for (let x = xMin; x <= xMax; x++) {
      const L = luminanceAt(sample.data, sample.width, x, y);
      if (L >= tipThr) {
        if (runStart < 0) runStart = x;
      } else if (runStart >= 0) {
        const tipX = x - 1;
        const runLen = tipX - runStart + 1;
        const runCanvas = runLen * sample.kx;
        const L2 = luminanceAt(sample.data, sample.width, Math.min(sample.width - 1, x + 1), y);
        const L3 = luminanceAt(sample.data, sample.width, Math.min(sample.width - 1, x + 4), y);
        if (
          runCanvas >= minRunCanvas &&
          runCanvas <= maxRunCanvas &&
          L <= darkThr + 12 &&
          L2 <= darkThr + 28 &&
          L3 <= darkThr + 40
        ) {
          // Wandelen met lagere drempel zodat hele driehoek-zijde gevonden wordt (niet alleen tip)
          let edgeX = tipX;
          while (edgeX > xMin) {
            const Lp = luminanceAt(sample.data, sample.width, edgeX - 1, y);
            if (Lp < bodyThr) break;
            edgeX--;
          }
          const LBefore = luminanceAt(
            sample.data,
            sample.width,
            Math.max(0, edgeX - 2),
            y
          );
          if (LBefore < bodyThr - 8) {
            const leftCanvas = edgeX * sample.kx;
            const tipCanvas = tipX * sample.kx;
            const distTip = Math.abs(tipCanvas - prefer);
            const distY = Math.abs(y - yFocus) * sample.ky;
            const score = runLen * 1.4 - 0.028 * distTip - 0.02 * distY;
            hits.push({ xCanvas: leftCanvas, tipCanvas, score, distY });
          }
        }
        runStart = -1;
      }
    }
  }

  if (!hits.length) return null;
  hits.sort((a, b) => b.score - a.score);
  const bestScore = hits[0].score;
  const strong = hits.filter((t) => t.score >= bestScore - 5);
  // Mediaan van sterke treffers (stabiel per frame, geen bias naar tip/rand)
  strong.sort((a, b) => a.xCanvas - b.xCanvas);
  return Math.round(strong[Math.floor(strong.length / 2)].xCanvas);
}

/**
 * Rechter hoekdriehoek / frame-rand tip (spiegel).
 */
function findRightTriangleVerticalWhiteEdgeX(sample, frameWidth, yFocusCanvas, mode, preferXCanvas) {
  const whiteThr = 170;
  const darkThr = 140;
  const yFocus = Math.round(yFocusCanvas / sample.ky);
  const yHalf = Math.max(5, Math.round((mode === 'strong' ? 56 : 40) / sample.ky));
  const y0 = Math.max(1, yFocus - yHalf);
  const y1 = Math.min(sample.height - 2, yFocus + yHalf);
  const maxRunCanvas = Math.max(28, Math.round(frameWidth * 0.045));
  const band = mode === 'strong'
    ? Math.max(90, Math.round(frameWidth * 0.08))
    : Math.max(60, Math.round(frameWidth * 0.055));
  const prefer = Number.isFinite(preferXCanvas) ? preferXCanvas : Math.round(frameWidth * 0.82);
  const xMin = Math.max(1, Math.round((prefer - band) / sample.kx));
  const xMax = Math.min(sample.width - 2, Math.round((prefer + band) / sample.kx));
  const tips = [];

  for (let y = y0; y <= y1; y++) {
    let runStart = -1;
    for (let x = xMax; x >= xMin; x--) {
      const L = luminanceAt(sample.data, sample.width, x, y);
      if (L >= whiteThr) {
        if (runStart < 0) runStart = x;
      } else if (runStart >= 0) {
        const tipX = x + 1;
        const runLen = runStart - tipX + 1;
        const runCanvas = runLen * sample.kx;
        const L2 = luminanceAt(sample.data, sample.width, Math.max(0, x - 1), y);
        if (runLen >= 2 && runCanvas <= maxRunCanvas && L <= darkThr && L2 <= darkThr + 15) {
          const tipCanvas = tipX * sample.kx;
          const distX = Math.abs(tipCanvas - prefer);
          const distY = Math.abs(y - yFocus) * sample.ky;
          const score = -tipCanvas * 0.04 + runLen * 1.6 - 0.035 * distX - 0.02 * distY;
          tips.push({ xCanvas: tipCanvas, score });
        }
        runStart = -1;
      }
    }
  }
  if (!tips.length) return null;
  tips.sort((a, b) => b.score - a.score);
  const topN = tips.slice(0, Math.min(11, tips.length)).map((t) => t.xCanvas).sort((a, b) => a - b);
  return topN[Math.floor(topN.length / 2)];
}

/**
 * Verticale anker = linker verticale zijkant van driehoekjes (niet de tip), breedte vast.
 */
function snapGridToCornerTriangleTips(sample, frameWidth, stripHeight, left, right, top, bottom, mode) {
  const topY = top;
  const bottomY = stripHeight - bottom;
  const yNearTop = Math.round(topY + (bottomY - topY) * 0.1);
  const yNearBottom = Math.round(bottomY - (bottomY - topY) * 0.1);
  const startWidth = Math.max(20, frameWidth - left - right);
  const curLeft = left;
  const cfg = getAssistPresetConfig();
  const inset = mode === 'strong'
    ? Math.round(Number(cfg && cfg.triangleInsetStrong) || 0)
    : Math.round(Number(cfg && cfg.triangleInsetSoft) || 0);
  const maxShift = mode === 'strong'
    ? Math.max(160, Math.round(frameWidth * 0.18))
    : Math.max(120, Math.round(frameWidth * 0.14));

  // Zoek rond tip (= iets rechts van huidige linkerrand), brede band naar links voor frame-jitter
  const tipPrefer = Math.min(
    Math.round(frameWidth * 0.28),
    Math.max(curLeft + Math.round(frameWidth * 0.012), Math.round(frameWidth * 0.04))
  );
  const leftEdges = [];
  for (const y of [topY, bottomY, yNearTop, yNearBottom]) {
    const le = findLeftTriangleVerticalWhiteEdgeX(sample, frameWidth, y, mode, tipPrefer);
    if (Number.isFinite(le)) leftEdges.push(le);
  }
  if (!leftEdges.length) return { left, right, moved: false };

  leftEdges.sort((a, b) => a - b);
  const mid = leftEdges[Math.floor(leftEdges.length / 2)];
  let targetLeft = Math.round(mid + inset);

  let delta = targetLeft - curLeft;
  delta = Math.max(-maxShift, Math.min(maxShift, delta));
  if (delta === 0) return { left, right, moved: false };

  const c = panGridMarginsPreserveWidth(frameWidth, left, right, delta);
  if (frameWidth - c.left - c.right !== startWidth) {
    const c2 = panGridMarginsPreserveWidth(frameWidth, left, right, delta);
    return { left: c2.left, right: c2.right, moved: c2.left !== left || c2.right !== right };
  }
  return { left: c.left, right: c.right, moved: c.left !== left || c.right !== right };
}

/**
 * Tip-punt (meest rechtse wit) nabij y — voor X-anker met vaste rasterbreedte.
 */
function findLeftTriangleTipPointXNear(sample, frameWidth, yFocusCanvas, mode, preferXCanvas) {
  const tipThr = getTriangleWhiteThreshold();
  const bodyThr = Math.max(95, tipThr - 32);
  const yFocus = Math.round(yFocusCanvas / sample.ky);
  const yHalf = Math.max(8, Math.round((mode === 'strong' ? 72 : 48) / sample.ky));
  const y0 = Math.max(1, yFocus - yHalf);
  const y1 = Math.min(sample.height - 2, yFocus + yHalf);
  const prefer = Number.isFinite(preferXCanvas) ? preferXCanvas : Math.round(frameWidth * 0.14);
  const minTipXCanvas = Math.round(frameWidth * 0.06);
  const bandLeft = Math.max(80, Math.round(frameWidth * 0.08));
  const bandRight = Math.max(100, Math.round(frameWidth * 0.1));
  const xMin = Math.max(1, Math.round((prefer - bandLeft) / sample.kx));
  const xMax = Math.min(sample.width - 3, Math.round((prefer + bandRight) / sample.kx));
  const maxRunX = Math.max(6, Math.round(72 / sample.kx));
  const tips = [];

  for (let y = y0; y <= y1; y++) {
    let runStart = -1;
    let peakL = 0;
    for (let x = xMin; x <= xMax; x++) {
      const L = luminanceAt(sample.data, sample.width, x, y);
      if (runStart < 0) {
        if (L >= tipThr) {
          const LBefore = luminanceAt(sample.data, sample.width, Math.max(0, x - 2), y);
          if (LBefore < bodyThr - 6) {
            runStart = x;
            peakL = L;
          }
        }
        continue;
      }
      if (L > peakL) peakL = L;
      const dropTol = 40;
      const runLenNow = x - runStart + 1;
      const stillWhite = L >= tipThr && L >= peakL - dropTol;
      if (stillWhite && runLenNow <= maxRunX) continue;
      const tipX = stillWhite ? Math.min(x, runStart + maxRunX - 1) : x - 1;
      if (tipX >= runStart + 2) {
        const tipCanvas = tipX * sample.kx;
        if (tipCanvas >= minTipXCanvas) {
          const dist = Math.abs(tipCanvas - prefer);
          const distY = Math.abs(y - yFocus) * sample.ky;
          tips.push({ x: tipCanvas, score: tipCanvas * 0.05 - 0.02 * dist - 0.02 * distY });
        }
      }
      runStart = -1;
      peakL = 0;
    }
  }
  if (!tips.length) return null;
  tips.sort((a, b) => b.score - a.score);
  return Math.round(tips[0].x);
}

/**
 * Full-res tip-punt (meest rechts wit), niet de linker witstrook-rand.
 */
function refineLeftTriangleTipPointXFullRes(stripCanvas, tipApprox, yFocus, frameWidth) {
  if (!stripCanvas || !Number.isFinite(tipApprox) || !Number.isFinite(yFocus)) return tipApprox;
  const w = stripCanvas.width;
  const h = stripCanvas.height;
  const yC = Math.round(yFocus);
  const y0 = Math.max(0, yC - 28);
  const y1 = Math.min(h - 1, yC + 28);
  const x0 = Math.max(0, Math.round(tipApprox - frameWidth * 0.06));
  const x1 = Math.max(x0 + 4, Math.min(w - 1, Math.round(tipApprox + frameWidth * 0.05)));
  const rw = x1 - x0 + 1;
  const rh = y1 - y0 + 1;
  if (rw < 4 || rh < 3) return tipApprox;
  let ctx;
  try {
    ctx = stripCanvas.getContext('2d', { willReadFrequently: true });
  } catch (_) {
    ctx = stripCanvas.getContext('2d');
  }
  if (!ctx) return tipApprox;
  let img;
  try {
    img = ctx.getImageData(x0, y0, rw, rh);
  } catch (_) {
    return tipApprox;
  }
  const data = img.data;
  const tipThr = getTriangleWhiteThreshold();
  const bodyThr = Math.max(95, tipThr - 32);
  const maxRun = Math.max(8, Math.round(frameWidth * 0.05));
  const tips = [];

  for (let yy = 0; yy < rh; yy++) {
    let runStart = -1;
    let peakL = 0;
    for (let xx = 0; xx < rw; xx++) {
      const i = (yy * rw + xx) * 4;
      const L = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      if (runStart < 0) {
        if (L >= tipThr) {
          let LBefore = bodyThr;
          if (xx >= 2) {
            const bi = (yy * rw + (xx - 2)) * 4;
            LBefore = data[bi] * 0.2126 + data[bi + 1] * 0.7152 + data[bi + 2] * 0.0722;
          }
          if (LBefore < bodyThr - 6) {
            runStart = xx;
            peakL = L;
          }
        }
        continue;
      }
      if (L > peakL) peakL = L;
      const stillWhite = L >= tipThr && L >= peakL - 28;
      const runLenNow = xx - runStart + 1;
      if (stillWhite && runLenNow <= maxRun) continue;
      const tip = stillWhite ? Math.min(xx, runStart + maxRun - 1) : xx - 1;
      if (tip >= runStart + 1) {
        const absX = x0 + tip;
        const dist = Math.abs(absX - tipApprox);
        const distY = Math.abs((y0 + yy) - yC);
        tips.push({ x: absX, score: absX * 0.05 - 0.04 * dist - 0.02 * distY });
      }
      runStart = -1;
      peakL = 0;
    }
  }
  if (!tips.length) return tipApprox;
  tips.sort((a, b) => b.score - a.score);
  const best = tips[0].score;
  const strong = tips.filter((t) => t.score >= best - 4).map((t) => t.x).sort((a, b) => a - b);
  // Mediaan van sterke tip-hits (niet min → geen witstrook)
  return strong[Math.floor(strong.length / 2)];
}

/**
 * Extra: linker verticale zijkant via tip→links wandelen op volle resolutie.
 */
function refineLeftTriangleTipXFullRes(stripCanvas, leftApprox, yFocus, frameWidth) {
  if (!stripCanvas || !Number.isFinite(leftApprox) || !Number.isFinite(yFocus)) return leftApprox;
  const w = stripCanvas.width;
  const h = stripCanvas.height;
  const yC = Math.round(yFocus);
  const y0 = Math.max(0, yC - 36);
  const y1 = Math.min(h - 1, yC + 36);
  const tipPrefer = Math.round(leftApprox + Math.max(12, frameWidth * 0.012));
  const x1 = Math.max(8, Math.min(w - 1, Math.round(Math.max(tipPrefer + frameWidth * 0.05, leftApprox + frameWidth * 0.08))));
  const x0 = Math.max(0, Math.round(Math.min(leftApprox - frameWidth * 0.08, frameWidth * 0.01)));
  const rw = x1 - x0 + 1;
  const rh = y1 - y0 + 1;
  if (rw < 4 || rh < 3) return leftApprox;
  let ctx;
  try {
    ctx = stripCanvas.getContext('2d', { willReadFrequently: true });
  } catch (_) {
    ctx = stripCanvas.getContext('2d');
  }
  if (!ctx) return leftApprox;
  let img;
  try {
    img = ctx.getImageData(x0, y0, rw, rh);
  } catch (_) {
    return leftApprox;
  }
  const data = img.data;
  const tipThr = getTriangleWhiteThreshold();
  const bodyThr = Math.max(100, tipThr - 28);
  const darkThr = tipThr + 2;
  const leftEdges = [];
  const maxRun = Math.max(10, Math.round(frameWidth * 0.07));
  const minRun = 3;
  for (let yy = 0; yy < rh; yy++) {
    let runStart = -1;
    for (let xx = 0; xx < rw; xx++) {
      const i = (yy * rw + xx) * 4;
      const L = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      if (L >= tipThr) {
        if (runStart < 0) runStart = xx;
      } else if (runStart >= 0) {
        const tip = xx - 1;
        const runLen = tip - runStart + 1;
        let L2 = L;
        if (xx + 1 < rw) {
          const i2 = (yy * rw + (xx + 1)) * 4;
          L2 = data[i2] * 0.2126 + data[i2 + 1] * 0.7152 + data[i2 + 2] * 0.0722;
        }
        if (runLen >= minRun && runLen <= maxRun && L <= darkThr + 15 && L2 <= darkThr + 30) {
          let edge = tip;
          while (edge > 0) {
            const bi = (yy * rw + (edge - 1)) * 4;
            const Lp = data[bi] * 0.2126 + data[bi + 1] * 0.7152 + data[bi + 2] * 0.0722;
            if (Lp < bodyThr) break;
            edge--;
          }
          let LBefore = bodyThr;
          if (edge > 1) {
            const bi = (yy * rw + (edge - 2)) * 4;
            LBefore = data[bi] * 0.2126 + data[bi + 1] * 0.7152 + data[bi + 2] * 0.0722;
          }
          if (LBefore < bodyThr - 8) {
            const absX = x0 + edge;
            const tipAbs = x0 + tip;
            const distTip = Math.abs(tipAbs - tipPrefer);
            const distY = Math.abs((y0 + yy) - yC);
            leftEdges.push({ x: absX, score: runLen * 1.5 - 0.03 * distTip - 0.02 * distY });
          }
        }
        runStart = -1;
      }
    }
  }
  if (!leftEdges.length) return leftApprox;
  leftEdges.sort((a, b) => b.score - a.score);
  const best = leftEdges[0].score;
  const strong = leftEdges.filter((e) => e.score >= best - 5).map((e) => e.x);
  // Linkse zijkant van de driehoek (niet mediaan richting tip)
  return Math.min(...strong);
}

function findTriangleMarkerY(sample, yCenterCanvas, yRangeCanvas, x0Canvas, x1Canvas) {
  const yCenter = Math.round(yCenterCanvas / sample.ky);
  const yRange = Math.max(3, Math.round(Math.abs(yRangeCanvas) / sample.ky));
  const yMin = Math.max(2, yCenter - yRange);
  const yMax = Math.min(sample.height - 3, yCenter + yRange);
  const x0 = Math.max(1, Math.min(sample.width - 2, Math.round(x0Canvas / sample.kx)));
  const x1 = Math.max(x0 + 1, Math.min(sample.width - 1, Math.round(x1Canvas / sample.kx)));
  let bestY = yCenter;
  let bestScore = -Infinity;
  for (let y = yMin; y <= yMax; y++) {
    const ridge = ridgeScoreHorizontal(
      sample,
      y * sample.ky,
      x0 * sample.kx,
      x1 * sample.kx,
      1.0
    );
    const signed = edgeSignedHorizontalWindow(
      sample,
      y * sample.ky,
      x0 * sample.kx,
      x1 * sample.kx,
      true,
      true
    );
    const score = 0.6 * ridge + 0.4 * signed - 0.02 * Math.abs(y - yCenter);
    if (score > bestScore) {
      bestScore = score;
      bestY = y;
    }
  }
  return { yCanvas: bestY * sample.ky, score: bestScore };
}

function findBottomBySideTriangles(sample, frameWidth, stripHeight, left, right, currentBottomEdge, mode) {
  const xEdgeL = Math.max(0, left + 1);
  const xEdgeR = Math.max(xEdgeL + 3, frameWidth - right - 1);
  const span = Math.max(8, Math.round((xEdgeR - xEdgeL) * 0.08));
  const yCenter = Math.round(currentBottomEdge / sample.ky);
  const yRange = Math.max(24, Math.round((mode === 'strong' ? 180 : 120) / sample.ky));
  const yMin = Math.max(2, yCenter - yRange);
  const yMax = Math.min(sample.height - 3, yCenter + yRange);
  const xl0 = Math.max(1, Math.min(sample.width - 2, Math.round(xEdgeL / sample.kx)));
  const xl1 = Math.max(xl0 + 1, Math.min(sample.width - 1, Math.round((xEdgeL + span) / sample.kx)));
  const xr0 = Math.max(1, Math.min(sample.width - 2, Math.round((xEdgeR - span) / sample.kx)));
  const xr1 = Math.max(xr0 + 1, Math.min(sample.width - 1, Math.round(xEdgeR / sample.kx)));
  let bestY = yCenter;
  let bestScore = -Infinity;
  for (let y = yMin; y <= yMax; y++) {
    const yCanvas = y * sample.ky;
    const leftMark = edgeSignedHorizontalWindow(sample, yCanvas, xl0 * sample.kx, xl1 * sample.kx, true, true);
    const rightMark = edgeSignedHorizontalWindow(sample, yCanvas, xr0 * sample.kx, xr1 * sample.kx, true, true);
    const leftRidge = ridgeScoreHorizontal(sample, yCanvas, xl0 * sample.kx, xl1 * sample.kx, 1.0);
    const rightRidge = ridgeScoreHorizontal(sample, yCanvas, xr0 * sample.kx, xr1 * sample.kx, 1.0);
    const bothMarks = Math.min(leftMark, rightMark);
    const bothRidge = Math.min(leftRidge, rightRidge);
    const distPenalty = 0.03 * Math.abs(y - yCenter);
    const score = 0.55 * bothMarks + 0.45 * bothRidge - distPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestY = y;
    }
  }
  // Preset-bias: finetuning blijft wisselbaar per scan/project zonder codewijziging.
  const presetCfg = getAssistPresetConfig();
  const bottomBiasPx = mode === 'strong' ? presetCfg.bottomBiasStrong : presetCfg.bottomBiasSoft;
  const yCanvasBiased = Math.max(0, Math.min(stripHeight - 1, bestY * sample.ky + bottomBiasPx));
  return { yCanvas: yCanvasBiased, score: bestScore };
}

function suggestAssistShiftX(sample, frameWidth, stripHeight, left, right, top, bottom, mode, options = null) {
  const opt = options && typeof options === 'object' ? options : {};
  const rangeScale = Number.isFinite(Number(opt.rangeScale)) && Number(opt.rangeScale) > 0 ? Number(opt.rangeScale) : 1;
  const xRef = getAssistXRef();
  const refScale = xRef === 'right' ? 1.45 : 1.2;
  // Zoekbereik begrenst lokale X-snap (was vast 8/18 px × scale)
  const userRange = getAssistDarkLineSearchRangePx();
  const range = Math.max(
    3,
    Math.min(
      Math.round(userRange * 0.55),
      Math.round((mode === 'strong' ? 18 : 8) * rangeScale * refScale)
    )
  );
  const penalty = mode === 'strong' ? 0.28 : 0.65;
  let bestShift = 0;
  let bestScore = -Infinity;
  let baseScore = -Infinity;
  for (let t = -range; t <= range; t++) {
    const xl = left + t;
    const xr = frameWidth - right + t;
    if (xl < 2 || xr > frameWidth - 2 || xr - xl < 10) continue;
    let score;
    if (xRef === 'left') {
      score = scoreVerticalFrameEdgeMultiBand(sample, xl, top, bottom, stripHeight, false);
    } else {
      score = scoreVerticalFrameEdgeMultiBand(sample, xr, top, bottom, stripHeight, true);
    }
    score -= penalty * Math.abs(t);
    if (t === 0) baseScore = score;
    if (score > bestScore) {
      bestScore = score;
      bestShift = t;
    }
  }
  if (!Number.isFinite(baseScore)) baseScore = bestScore;
  if (opt.force === true) return Number.isFinite(bestShift) ? bestShift : 0;
  const defaultMinGain = xRef === 'right'
    ? (mode === 'strong' ? 0.35 : 0.8)
    : (mode === 'strong' ? 0.55 : 1.1);
  const minGain = Number.isFinite(Number(opt.minGain)) ? Number(opt.minGain) : defaultMinGain;
  return bestScore > baseScore + minGain ? bestShift : 0;
}

function suggestAssistShiftY(sample, frameWidth, stripHeight, left, right, top, bottom, mode, options = null) {
  const opt = options && typeof options === 'object' ? options : {};
  const presetCfg = getAssistPresetConfig();
  const useDarkLineRef = presetCfg && presetCfg.yTarget === 'darkLine';
  const xEdgeL = Math.max(0, left + 1);
  const xEdgeR = Math.max(xEdgeL + 3, frameWidth - right - 1);
  const x0 = Math.max(0, left + Math.round(frameWidth * 0.08));
  const x1 = Math.max(x0 + 2, frameWidth - right - Math.round(frameWidth * 0.08));
  const sideWin = Math.max(6, Math.round((xEdgeR - xEdgeL) * 0.08));
  const rangeScale = Number.isFinite(Number(opt.rangeScale)) && Number(opt.rangeScale) > 0 ? Number(opt.rangeScale) : 1;
  const yRef = getAssistYRef();
  const refScale = useDarkLineRef
    ? (yRef === 'bottom' || yRef === 'top' ? 0.95 : 0.9)
    : (yRef === 'bottom' ? 1.45 : yRef === 'top' ? 1.2 : 1);
  const range = Math.max(3, Math.round((mode === 'strong' ? 14 : 6) * rangeScale * refScale));
  const penalty = mode === 'strong' ? 0.3 : 0.65;
  let bestShift = 0;
  let bestScore = -Infinity;
  let baseScore = -Infinity;
  const yTopBase = top;
  let yBottomBase = stripHeight - bottom;
  if (yRef === 'bottom' && !useDarkLineRef) {
    const markerRange = Math.max(18, Math.round((mode === 'strong' ? 90 : 60)));
    const markerL = findTriangleMarkerY(sample, yBottomBase, markerRange, xEdgeL, xEdgeL + sideWin);
    const markerR = findTriangleMarkerY(sample, yBottomBase, markerRange, xEdgeR - sideWin, xEdgeR);
    if (Number.isFinite(markerL.score) && Number.isFinite(markerR.score)) {
      const weighted =
        (markerL.yCanvas * Math.max(0.01, markerL.score + 20) + markerR.yCanvas * Math.max(0.01, markerR.score + 20)) /
        (Math.max(0.01, markerL.score + 20) + Math.max(0.01, markerR.score + 20));
      if (Number.isFinite(weighted)) {
        yBottomBase = weighted;
      }
    }
  }
  for (let t = -range; t <= range; t++) {
    const yTop = yTopBase + t;
    const yBottom = yBottomBase + t;
    if (yTop < 2 || yBottom > stripHeight - 2 || yBottom - yTop < 10) continue;
    const sTAbs = edgeStrengthHorizontal(sample, yTop, x0, x1);
    const sBAbs = edgeStrengthHorizontal(sample, yBottom, x0, x1);
    const sTSigned = edgeSignedHorizontal(sample, yTop, x0, x1, true, false, 0.7);
    const sBSigned = edgeSignedHorizontal(sample, yBottom, x0, x1, true, true, 1.25);
    const sBSideLeft = edgeSignedHorizontalWindow(sample, yBottom, xEdgeL, xEdgeL + sideWin, true, true);
    const sBSideRight = edgeSignedHorizontalWindow(sample, yBottom, xEdgeR - sideWin, xEdgeR, true, true);
    const sBSide = 0.7 * Math.min(sBSideLeft, sBSideRight) + 0.3 * Math.max(sBSideLeft, sBSideRight);
    const rBMain = ridgeScoreHorizontal(sample, yBottom, x0, x1, 0.25);
    const rBSideL = ridgeScoreHorizontal(sample, yBottom, xEdgeL, xEdgeL + sideWin, 1.0);
    const rBSideR = ridgeScoreHorizontal(sample, yBottom, xEdgeR - sideWin, xEdgeR, 1.0);
    const rBSide = 0.5 * rBSideL + 0.5 * rBSideR;
    const dTMain = darkLineScoreHorizontal(sample, yTop, x0, x1, 0.15);
    const dBMain = darkLineScoreHorizontal(sample, yBottom, x0, x1, 0.25);
    const dBSideL = darkLineScoreHorizontal(sample, yBottom, xEdgeL, xEdgeL + sideWin, 1.0);
    const dBSideR = darkLineScoreHorizontal(sample, yBottom, xEdgeR - sideWin, xEdgeR, 1.0);
    const dBSide = 0.5 * dBSideL + 0.5 * dBSideR;
    const sT = 0.6 * sTAbs + 0.4 * sTSigned;
    const sB = 0.14 * sBAbs + 0.18 * sBSigned + 0.26 * sBSide + 0.20 * rBMain + 0.22 * rBSide;
    const dB = 0.58 * dBMain + 0.42 * dBSide;
    const sBCombined = useDarkLineRef ? (0.2 * sB + 0.8 * dB) : sB;
    const sTCombined = useDarkLineRef ? (0.25 * sT + 0.75 * dTMain) : sT;
    let score;
    if (yRef === 'top') score = sTCombined - (useDarkLineRef ? penalty * 0.85 : penalty) * Math.abs(t);
    else if (yRef === 'bottom') score = sBCombined - (useDarkLineRef ? penalty * 0.5 : penalty * 0.7) * Math.abs(t);
    else score = (0.42 * sTCombined + 0.58 * sBCombined) - (useDarkLineRef ? penalty * 0.8 : penalty) * Math.abs(t);
    if (t === 0) baseScore = score;
    if (score > bestScore) {
      bestScore = score;
      bestShift = t;
    }
  }
  if (!Number.isFinite(baseScore)) baseScore = bestScore;
  const defaultMinGain = useDarkLineRef
    ? (mode === 'strong' ? 0.45 : 0.9)
    : (yRef === 'bottom'
      ? (mode === 'strong' ? 0.65 : 1.25)
      : (mode === 'strong' ? 0.9 : 1.8));
  const minGain = Number.isFinite(Number(opt.minGain)) ? Number(opt.minGain) : defaultMinGain;
  return bestScore > baseScore + minGain ? bestShift : 0;
}

function suggestAssistShiftXDualEdge(sample, frameWidth, stripHeight, left, right, top, bottom, mode, boost = 1) {
  const y0 = Math.max(0, top + Math.round(stripHeight * 0.06));
  const y1 = Math.max(y0 + 2, stripHeight - bottom - Math.round(stripHeight * 0.06));
  const b = Math.max(1, Number(boost) || 1);
  const rangeBase = mode === 'strong' ? 20 : 12;
  const range = Math.max(8, Math.round(rangeBase * b));
  const penalty = (mode === 'strong' ? 0.15 : 0.25) / b;
  let bestShift = 0;
  let bestScore = -Infinity;
  let baseScore = -Infinity;
  for (let t = -range; t <= range; t++) {
    const xl = left + t;
    const xr = frameWidth - right + t;
    if (xl < 2 || xr > frameWidth - 2 || xr - xl < 10) continue;
    const sL = edgeStrengthVertical(sample, xl, y0, y1);
    const sR = edgeStrengthVertical(sample, xr, y0, y1);
    const bL = Math.abs(edgeSignedVertical(sample, xl, y0, y1, true, false));
    const bR = Math.abs(edgeSignedVertical(sample, xr, y0, y1, true, true));
    const score = 0.42 * sL + 0.42 * sR + 0.08 * bL + 0.08 * bR - penalty * Math.abs(t);
    if (t === 0) baseScore = score;
    if (score > bestScore) {
      bestScore = score;
      bestShift = t;
    }
  }
  if (!Number.isFinite(baseScore)) baseScore = bestScore;
  const minGain = (mode === 'strong' ? 0.28 : 0.45) / b;
  return bestScore > baseScore + minGain ? bestShift : 0;
}

function suggestAssistShiftYDualEdge(sample, frameWidth, stripHeight, left, right, top, bottom, mode, boost = 1) {
  const x0 = Math.max(0, left + Math.round(frameWidth * 0.08));
  const x1 = Math.max(x0 + 2, frameWidth - right - Math.round(frameWidth * 0.08));
  const b = Math.max(1, Number(boost) || 1);
  const rangeBase = mode === 'strong' ? 20 : 12;
  const range = Math.max(8, Math.round(rangeBase * b));
  const penalty = (mode === 'strong' ? 0.15 : 0.25) / b;
  let bestShift = 0;
  let bestScore = -Infinity;
  let baseScore = -Infinity;
  for (let t = -range; t <= range; t++) {
    const yTop = top + t;
    const yBottom = stripHeight - bottom + t;
    if (yTop < 2 || yBottom > stripHeight - 2 || yBottom - yTop < 10) continue;
    const sT = edgeStrengthHorizontal(sample, yTop, x0, x1);
    const sB = edgeStrengthHorizontal(sample, yBottom, x0, x1);
    const rT = ridgeScoreHorizontal(sample, yTop, x0, x1, 0.15);
    const rB = ridgeScoreHorizontal(sample, yBottom, x0, x1, 0.15);
    const score = 0.38 * sT + 0.38 * sB + 0.12 * rT + 0.12 * rB - penalty * Math.abs(t);
    if (t === 0) baseScore = score;
    if (score > bestScore) {
      bestScore = score;
      bestShift = t;
    }
  }
  if (!Number.isFinite(baseScore)) baseScore = bestScore;
  const minGain = (mode === 'strong' ? 0.25 : 0.4) / b;
  return bestScore > baseScore + minGain ? bestShift : 0;
}

function isFixResolutionLockActive() {
  return getState().fixResolutionLocked === true;
}

function onWidthNarrow() {
  if (isFixResolutionLockActive()) return;
  const canvas = getStripCanvas();
  const { frameWidth } = getFrameDimensions(canvas);
  if (frameWidth < 1) { if (el(ids.loadLint)) el(ids.loadLint).focus(); return; }
  const s = getState();
  const step = Math.max(1, Math.round(frameWidth * GRID_STEP_PERCENT));
  const effectiveX = getEffectiveGridOffsetX(frameWidth);
  const next = clampGridOffsetX(frameWidth, effectiveX + step);
  setGridOffset(next, s.gridOffsetY);
  setDirty();
  updateUI();
  requestAnimationFrame(() => refreshPreviewsGridOnly());
}

function onWidthWiden() {
  if (isFixResolutionLockActive()) return;
  const canvas = getStripCanvas();
  const { frameWidth } = getFrameDimensions(canvas);
  if (frameWidth < 1) { if (el(ids.loadLint)) el(ids.loadLint).focus(); return; }
  const s = getState();
  const step = Math.max(1, Math.round(frameWidth * GRID_STEP_PERCENT));
  const effectiveX = getEffectiveGridOffsetX(frameWidth);
  const next = clampGridOffsetX(frameWidth, Math.max(0, effectiveX - step));
  setGridOffset(next, s.gridOffsetY);
  setDirty();
  updateUI();
  requestAnimationFrame(() => refreshPreviewsGridOnly());
}

function onVerticalPush() {
  if (isFixResolutionLockActive()) return;
  const canvas = getStripCanvas();
  const { frameHeight } = getFrameDimensions(canvas);
  if (frameHeight < 1) { if (el(ids.loadLint)) el(ids.loadLint).focus(); return; }
  const s = getState();
  const step = Math.max(1, Math.round(frameHeight * GRID_STEP_PERCENT_VERTICAL));
  const next = clampGridOffsetY(frameHeight, (s.gridOffsetY || 0) + step, s.gridOffsetYBottom, s.numFrames);
  setGridOffset(s.gridOffsetX, next);
  setDirty();
  updateUI();
  requestAnimationFrame(() => refreshPreviewsGridOnly());
}

function onVerticalStretch() {
  if (isFixResolutionLockActive()) return;
  const canvas = getStripCanvas();
  const { frameHeight } = getFrameDimensions(canvas);
  if (frameHeight < 1) { if (el(ids.loadLint)) el(ids.loadLint).focus(); return; }
  const s = getState();
  const step = Math.max(1, Math.round(frameHeight * GRID_STEP_PERCENT_VERTICAL));
  const next = clampGridOffsetY(frameHeight, (s.gridOffsetY || 0) - step, s.gridOffsetYBottom, s.numFrames);
  setGridOffset(s.gridOffsetX, next);
  setDirty();
  updateUI();
  requestAnimationFrame(() => refreshPreviewsGridOnly());
}

function applyGridOffsetPreset(presetKey) {
  const preset = GRID_OFFSET_PRESETS[presetKey];
  if (!preset) return;
  const canvas = getStripCanvas();
  const s = getState();
  const numFrames = Math.max(1, s.numFrames);
  let frameW = 1000;
  let frameH = 750;
  if (canvas) {
    frameW = canvas.width;
    frameH = Math.max(1, Math.round(canvas.height / numFrames));
  }
  const ox = Math.round(frameW * preset.percentX);
  const oy = Math.round(frameH * preset.percentY);
  setGridOffset(ox, oy);
  setDirty();
  updateUI();
  refreshPreviewsGridOnly();
}

/** Filmformaat + zelfde start-offset als snelknoppen FILMFORMAAT-paneel. */
function applyFilmFormatQuickPreset(formatKey) {
  if (!GRID_OFFSET_PRESETS[formatKey]) return;
  setFilmFormat(formatKey);
  const ff = el(ids.filmFormat);
  if (ff) ff.value = formatKey;
  applyGridOffsetPreset(formatKey);
  persistCurrentLintStateInProject();
}

/**
 * Workflow: één frame per scan + standaard start-offset voor gekozen (of huidige) filmsoort.
 * split/frozen raster wordt via setNumFrames(1) al gewist.
 */
function applySingleFrameWorkflowForFormat(filmFormatId) {
  const fmt =
    filmFormatId && GRID_OFFSET_PRESETS[filmFormatId] ? String(filmFormatId) : getState().filmFormat;
  if (!GRID_OFFSET_PRESETS[fmt]) return;
  setFilmFormat(fmt);
  const ff = el(ids.filmFormat);
  if (ff) ff.value = fmt;
  setNumFrames(1);
  setActiveFrameIndex(0);
  applyGridOffsetPreset(fmt);
  syncGridSplitLowerPanClamp();
  setDirty();
  updateUI();
  refreshPreviews();
  persistCurrentLintStateInProject();
}

function onWorkflowSingleFrameClick() {
  applySingleFrameWorkflowForFormat(getState().filmFormat);
}

function onWorkflowApplyStarterClick() {
  const raw = String(el(ids.workflowStarterFilm)?.value || '').trim();
  const useFormat = GRID_OFFSET_PRESETS[raw] ? raw : null;
  applySingleFrameWorkflowForFormat(useFormat);
}

function onFilmFormatChange() {
  const v = el(ids.filmFormat)?.value;
  if (v) setFilmFormat(v);
  setDirty();
  updateUI();
  persistCurrentLintStateInProject();
}

function onPolarityChange() {
  const pos = el(ids.polarityPos)?.checked;
  setFilmPolarity(pos ? 'positief' : 'negatief');
  setDirty();
  updateUI();
  persistCurrentLintStateInProject();
}

function onTiltPivotChange() {
  const v = el(ids.tiltPivot)?.value;
  if (v) setTiltPivot(v);
  setDirty();
  updateUI();
  persistCurrentLintStateInProject();
  if (getState().image) refreshPreviews();
}

function onOutputFormatChange() {
  const v = el(ids.outputFormat)?.value;
  if (v) setOutputFormat(v);
  setDirty();
  updateUI();
  persistCurrentLintStateInProject();
  try { window.api?.setAppSettings?.({ outputFormat: getState().outputFormat }); } catch (_) {}
}

function onJpgQualityChange() {
  const raw = el(ids.jpgQuality)?.value;
  const q = Math.max(1, Math.min(100, Math.round(Number(raw) || 92)));
  setJpgQuality(q);
  if (el(ids.jpgQuality)) el(ids.jpgQuality).value = String(q);
  setDirty();
  persistCurrentLintStateInProject();
  try { window.api?.setAppSettings?.({ jpgQuality: getState().jpgQuality }); } catch (_) {}
}

/**
 * Doelafmetingen voor export: leest actieve keuze (Frame generator of Instellingen), daarna prefs.
 * @returns {{ w: number, h: number, allowUpscale: boolean } | null} null = geen schaling (native rasterpixels)
 */
function getExportOutputDimensions(appSettings) {
  return null;
}

function scaleCanvasToSize(sourceCanvas, targetW, targetH, allowUpscale = true) {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  if (sw < 1 || sh < 1 || targetW < 1 || targetH < 1) return sourceCanvas;
  const scaleFit = Math.min(targetW / sw, targetH / sh);
  const scale = allowUpscale ? scaleFit : Math.min(scaleFit, 1);
  const outW = Math.max(1, Math.round(sw * scale));
  const outH = Math.max(1, Math.round(sh * scale));
  if (!allowUpscale && outW === sw && outH === sh) return sourceCanvas;
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, targetW, targetH);
  const dx = Math.round((targetW - outW) / 2);
  const dy = Math.round((targetH - outH) / 2);
  if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = true;
  if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, sw, sh, dx, dy, outW, outH);
  return out;
}

function applyTheme(darkMode) {
  if (document.body) {
    document.body.classList.toggle('theme-light', !darkMode);
  }
}

function applyCompactUi(compactUi) {
  if (document.body) {
    document.body.classList.toggle('compact-ui', compactUi === true);
  }
}

async function loadAppSettings() {
  try {
    const s = await window.api?.getAppSettings?.();
    if (!s || typeof s !== 'object') return;
    const previewRes = Math.max(512, Math.min(8192, Number(s.stripPreviewRes) || DEFAULT_STRIP_PREVIEW_MAX_DIM));
    setStripPreviewMaxDim(previewRes);
    const stripResMain = el(ids.stripPreviewRes);
    if (stripResMain) {
      const closest = STRIP_PREVIEW_MAX_DIM_OPTIONS.includes(previewRes)
        ? previewRes
        : STRIP_PREVIEW_MAX_DIM_OPTIONS.reduce((a, b) => (Math.abs(a - previewRes) <= Math.abs(b - previewRes) ? a : b));
      stripResMain.value = String(closest);
    }
    setPreserveGridOnScanNav(s.preserveGridOnScanNav !== false);
    applyTheme(s.darkMode);
    applyCompactUi(!!s.compactUi);
    const arrowPx = (s.arrowStepPx != null && Number(s.arrowStepPx) >= 1) ? Math.min(10, Number(s.arrowStepPx)) : 1;
    const arrowShiftPx = (s.arrowStepShiftPx != null && Number(s.arrowStepShiftPx) >= 10) ? Math.min(100, Number(s.arrowStepShiftPx)) : 10;
    setArrowStepPx(arrowPx);
    setArrowStepShiftPx(arrowShiftPx);
    const overlayWidth = Math.max(1, Math.min(20000, Number(s.overlayGridRefPxWidth) || 103));
    const overlayHeight = Math.max(1, Math.min(20000, Number(s.overlayGridRefPxHeight) || 75));
    const overlayFrames = Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, Number(s.overlayGridRefPxFrames) || 30));
    if (el(ids.gridRefPxWidth)) el(ids.gridRefPxWidth).value = String(Math.round(overlayWidth));
    if (el(ids.gridRefPxHeight)) el(ids.gridRefPxHeight).value = String(Math.round(overlayHeight));
    if (el(ids.gridRefPxFrames)) el(ids.gridRefPxFrames).value = String(Math.round(overlayFrames));
    setScanDpi(Number(s.scanDpi) || 4800);
    setPerfEnabled(s.perfLogging === true);
    setOutputFormat(s.outputFormat === 'jpg' || s.outputFormat === 'jpeg' ? 'jpg' : 'png');
    if (s.jpgQuality != null) setJpgQuality(s.jpgQuality);
    const frameCount = getProjectTotalFrameCountEstimate();
    exportScanBatchAutoMerge = s.exportScanBatchAutoMerge !== false;
    exportScanBatchWrapNav = s.exportScanBatchWrapNav === true;
    exportBatchDisablePreview = s.exportBatchDisablePreview === true;
    exportScanBatchRangeRefs = normalizeExportScanBatchRangeRefs(s.exportScanBatchRangeRefs);
    exportBatchResumeState = normalizeExportBatchResumeState(s.exportBatchResumeState);
    const mergeToggleEl = el(ids.exportBatchAutoMerge);
    if (mergeToggleEl) mergeToggleEl.checked = exportScanBatchAutoMerge;
    const wrapToggleEl = el(ids.exportBatchWrapNav);
    if (wrapToggleEl) wrapToggleEl.checked = exportScanBatchWrapNav;
    const disablePreviewToggleEl = el(ids.exportBatchDisablePreview);
    if (disablePreviewToggleEl) disablePreviewToggleEl.checked = exportBatchDisablePreview;
    exportScanBatchRanges = normalizeExportScanBatchRanges(
      s.exportScanBatchRanges,
      frameCount > 0 ? frameCount : Number.POSITIVE_INFINITY
    );
    if (exportScanBatchAutoMerge) {
      exportScanBatchRanges = sortAndMergeExportScanBatchRanges(exportScanBatchRanges);
    }
    pruneExportScanBatchRangeRefsToCurrentRanges();
    exportScanBatchSelectedIndex = exportScanBatchRanges.length ? 0 : -1;
    exportScanBatchEditIndex = -1;
    setExportBatchInsertMode('append');
    const maxFrameForDraft = frameCount > 0 ? frameCount : Number.POSITIVE_INFINITY;
    const savedDraftFrom = Math.max(1, Math.floor(Number(s.exportScanRangeDraftFrom) || 1));
    const savedDraftToRaw = Math.max(1, Math.floor(Number(s.exportScanRangeDraftTo) || (frameCount > 0 ? frameCount : 1)));
    const savedDraftTo = Math.min(maxFrameForDraft, savedDraftToRaw);
    const savedDraftFromClamped = Math.min(savedDraftFrom, savedDraftTo);
    setExportRangeInputs(savedDraftFromClamped, savedDraftTo);
    updateUI();
    updateFloatingPreviewButtonUi().catch(() => {});
    if (getState().image) refreshPreviews();
  } catch (_) {}
}

function initSubPanelCollapse() {
  document.querySelectorAll('.sub-panel-collapse-btn').forEach((btn) => {
    const panel = btn.closest('.sub-panel') || btn.closest('.panel-collapsible');
    if (panel) {
      const collapsed = panel.classList.contains('sub-panel--collapsed');
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      const iconInit = btn.querySelector('.sub-panel-collapse-icon');
      if (iconInit) iconInit.textContent = collapsed ? '▶' : '▼';
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = btn.closest('.sub-panel') || btn.closest('.panel-collapsible');
      if (!panel) return;
      panel.classList.toggle('sub-panel--collapsed');
      const collapsed = panel.classList.contains('sub-panel--collapsed');
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      const icon = btn.querySelector('.sub-panel-collapse-icon');
      if (icon) icon.textContent = collapsed ? '▶' : '▼';
    });
  });
}

/** Voortgang scanlint-map → zelfde percentage als modal (toolbar “Belasting”). */
function formatProgressDuration(ms) {
  const totalSec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  if (hh > 0) return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function scanInfosProgressToStatus(d) {
  const current = Number(d?.current) || 0;
  const total = Number(d?.total) || 0;
  if (total > 0) {
    const etaMs = Number(d?.etaMs);
    const etaLabel = Number.isFinite(etaMs) ? formatProgressDuration(etaMs) : t('scanFolderOverlay.timeUnknown');
    updateStatus(Math.round((100 * current) / total), t('status.scanStripProgressEta', { current, total, eta: etaLabel }));
  }
}

async function onRefreshScanList() {
  if (!hasProject()) return;
  const meta = getProjectMeta();
  const location = meta?.location;
  if (!location || !window.api?.getScanInfos) return;
  try {
    const { cancelled, infos } = await getScanInfosWithProgressOverlay(
      location,
      window.api.getScanInfos.bind(window.api),
      scanInfosProgressToStatus
    );
    if (cancelled) return;
    if (Array.isArray(infos)) {
      updateProjectScanInfos(infos);
      setDirty();
      updateProjectUI();
    }
  } finally {
    updateStatus(0, t('status.operationEmpty'));
  }
}

/** Aanroep vanuit RASTER SETUP: andere map met scanlinten kiezen, lijst opnieuw opbouwen en eerste passende lint laden. */
async function onPickScanFolderFromStrip() {
  if (!hasProject() || !window.api?.selectFolder || !window.api?.getScanInfos) {
    alert(t('stripWindow.pickScanFolderNoProject'));
    return;
  }
  const meta = getProjectMeta();
  const folder = await window.api.selectFolder({
    title: t('stripWindow.pickScanFolderDialogTitle'),
    type: 'fileLocation',
    defaultPath: meta?.location || undefined
  });
  if (!folder) return;
  persistCurrentLintStateInProject();
  try {
    const { cancelled, infos } = await getScanInfosWithProgressOverlay(
      folder,
      window.api.getScanInfos.bind(window.api),
      scanInfosProgressToStatus
    );
    if (cancelled) return;
    if (!Array.isArray(infos) || infos.length === 0) {
      alert(t('stripWindow.pickScanFolderEmpty'));
      return;
    }
    updateProjectScanFolder(folder, infos);
    updateProjectUI();
    const paths = infos.map((i) => i.path).filter(Boolean);
    const toLoad = pickResumeLintPath(paths, getState().lintStates, getState().path && paths.includes(getState().path) ? getState().path : null);
    if (toLoad) {
      await loadScanByPath(toLoad);
    }
    const saved = await saveProject({ includeScanInfos: true });
    if (!saved?.ok) {
      alert(t('stripWindow.pickScanFolderSaveFailed'));
    }
  } finally {
    updateStatus(0, t('status.operationEmpty'));
  }
}

function onTimecodeFpsChange() {
  const input = el(ids.timecodeFps);
  if (!input) return;
  const v = parseInt(input.value, 10);
  if (!Number.isNaN(v)) {
    setTimecodeFps(v);
    updateStatsDisplay();
  }
}

async function onPickProjectFolder() {
  const folder = await window.api?.selectFolder?.({ title: t('project.pickProjectFolderTitle'), type: 'projectFolder' });
  if (folder && el(ids.projectFolderPath)) {
    el(ids.projectFolderPath).setAttribute('data-path', folder);
    el(ids.projectFolderPath).textContent = folder.length > 45 ? '...' + folder.slice(-42) : folder;
  }
}

let lastScanInfos = [];

function isManualScanCountEnabled() {
  return el(ids.scanCountManual)?.checked === true;
}

function syncScanCountInputMode() {
  const manual = isManualScanCountEnabled();
  const scanCountEl = el(ids.scanCount);
  const refreshBtn = el(ids.refreshScanCount);
  const useCurrentBtn = el(ids.scanCountUseCurrent);
  const orientWrap = el(ids.scanOrientWrap);
  const manualToggle = el(ids.scanCountManual);
  if (manualToggle) manualToggle.title = t('project.scanCountManualTooltip');
  if (scanCountEl) {
    scanCountEl.readOnly = !manual;
    scanCountEl.classList.toggle('input-readonly', !manual);
    scanCountEl.title = manual ? t('project.scanCountManualInputTooltip') : t('project.scanCountTooltip');
  }
  if (refreshBtn) {
    refreshBtn.disabled = manual;
    refreshBtn.title = manual ? t('project.scanCountManualTooltip') : t('project.refreshScanCountTooltip');
  }
  if (useCurrentBtn) {
    useCurrentBtn.title = t('project.scanCountUseCurrentTooltip');
  }
  if (manual && orientWrap) orientWrap.classList.add('hidden');
}

async function onScanCountManualToggle() {
  syncScanCountInputMode();
  if (!isManualScanCountEnabled()) {
    const path = el(ids.locationPath)?.getAttribute('data-path');
    if (path) await updateScanCountAndOrient(path);
  } else {
    lastScanInfos = [];
  }
}

async function onPickLocation() {
  const folder = await window.api?.selectFolder?.({ title: t('project.pickFileLocationTitle'), type: 'fileLocation' });
  if (folder) {
    const locEl = el(ids.locationPath);
    if (locEl) {
      locEl.setAttribute('data-path', folder);
      locEl.textContent = folder.length > 45 ? '...' + folder.slice(-42) : folder;
    }
    if (!isManualScanCountEnabled()) {
      await updateScanCountAndOrient(folder);
    } else {
      lastScanInfos = [];
      syncScanCountInputMode();
    }
  }
}

async function updateScanCountAndOrient(folderPath) {
  const path = folderPath || el(ids.locationPath)?.getAttribute('data-path');
  if (!path || !window.api?.getScanInfos) return;
  let infos = [];
  try {
    const result = await getScanInfosWithProgressOverlay(
      path,
      window.api.getScanInfos.bind(window.api),
      scanInfosProgressToStatus
    );
    if (result.cancelled) return;
    infos = result.infos;
  } finally {
    updateStatus(0, t('status.operationEmpty'));
  }
  lastScanInfos = Array.isArray(infos) ? infos : [];
  const count = lastScanInfos.length;
  const scanCountEl = el(ids.scanCount);
  if (scanCountEl) {
    scanCountEl.value = count > 0 ? String(count) : '';
    scanCountEl.placeholder = count === 0 ? '—' : '';
  }
  const wrap = el(ids.scanOrientWrap);
  const summaryEl = el(ids.scanOrientSummary);
  const listEl = el(ids.scanList);
  if (count === 0) {
    if (wrap) wrap.classList.add('hidden');
    if (summaryEl) summaryEl.textContent = '—';
    if (listEl) listEl.innerHTML = '';
    return;
  }
  const vertical = lastScanInfos.filter(s => s.orientation === 'vertical').length;
  const horizontal = lastScanInfos.filter(s => s.orientation === 'horizontal').length;
  if (wrap) wrap.classList.remove('hidden');
  if (summaryEl) summaryEl.textContent = `${vertical} verticaal, ${horizontal} horizontaal (horizontale worden bij laden 90° gedraaid)`;
  if (listEl) {
    listEl.innerHTML = lastScanInfos.map(s => {
      const badge = s.orientation === 'horizontal' ? 'H' : 'V';
      const badgeClass = s.orientation === 'horizontal' ? 'badge-h' : 'badge-v';
      return `<li><span class="scan-badge ${badgeClass}">${badge}</span> ${escapeHtml(s.name || s.path)}</li>`;
    }).join('');
  }
}

function escapeHtml(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

async function updateScanCountField(folderPath) {
  await updateScanCountAndOrient(folderPath);
}

async function onRefreshScanCount() {
  await updateScanCountAndOrient();
}

async function onScanCountUseCurrent() {
  const path = el(ids.locationPath)?.getAttribute('data-path');
  if (!path) {
    alert(t('project.scanCountUseCurrentNeedsLocation'));
    return;
  }
  await updateScanCountAndOrient(path);
  if (isManualScanCountEnabled()) syncScanCountInputMode();
}

async function onCreateProject() {
  const projectFolderPath = el(ids.projectFolderPath)?.getAttribute('data-path')?.trim();
  let locationPath = el(ids.locationPath)?.getAttribute('data-path')?.trim();
  if (!projectFolderPath) { alert(t('project.pickFolderFirst')); return; }
  const name = (el(ids.projectName)?.value || '').trim() || undefined;
  const framesPerLint = parseInt(el(ids.projectFrames)?.value, 10);
  const manualCount = isManualScanCountEnabled();
  const countPath = locationPath || projectFolderPath;
  if (!manualCount && countPath) {
    await updateScanCountAndOrient(countPath);
  }
  const scanCountVal = el(ids.scanCount)?.value?.trim();
  const numberOfScans = scanCountVal ? parseInt(scanCountVal, 10) : undefined;
  if (manualCount && (!Number.isFinite(numberOfScans) || numberOfScans < 0)) {
    alert(t('project.scanCountManualInvalid'));
    return;
  }
  updateStatus(30, t('status.creatingProject'));
  const s = getState();
  let result;
  try {
    result = await createProject({
    projectFolderPath,
    name,
    location: locationPath || projectFolderPath,
    framesPerLint: Number.isNaN(framesPerLint) ? 30 : Math.max(1, Math.min(99, framesPerLint)),
    numberOfScans: Number.isFinite(numberOfScans) ? numberOfScans : undefined,
    scanInfos: !manualCount && lastScanInfos.length ? lastScanInfos : undefined,
    filmFormat: s.filmFormat || '16mm-double',
    filmPolarity: s.filmPolarity || 'positief',
    outputFolder: s.exportFolderPath || null,
    outputFormat: s.outputFormat === 'jpg' || s.outputFormat === 'jpeg' ? 'jpg' : 'png',
    jpgQuality: s.jpgQuality,
    scanDpi: s.scanDpi || 4800
  });
  } finally {
    updateStatus(0, t('status.operationEmpty'));
  }
  if (result.ok) {
    el(ids.newProjectForm)?.classList.add('hidden');
    el(ids.showNewProjectForm)?.classList.remove('hidden');
    updateProjectUI();
  } else {
    alert(result.error || t('project.createFailedFallback'));
  }
}

function onCancelNewProject() {
  el(ids.newProjectForm)?.classList.add('hidden');
  el(ids.showNewProjectForm)?.classList.remove('hidden');
  if (hasProject()) {
    el(ids.projectFirstStep)?.classList.add('hidden');
  }
}

let promptingNewProjectFolders = false;

async function promptFoldersForNewProject() {
  if (promptingNewProjectFolders) return;
  promptingNewProjectFolders = true;
  try {
    await onPickLocation();
    await onPickExportFolder();
  } finally {
    promptingNewProjectFolders = false;
  }
}

async function onShowNewProjectForm() {
  el(ids.newProjectForm)?.classList.remove('hidden');
  el(ids.showNewProjectForm)?.classList.add('hidden');
  await promptFoldersForNewProject();
}

function onNewProjectClick() {
  el(ids.projectFirstStep)?.classList.remove('hidden');
  onShowNewProjectForm();
}

async function finishOpenProject(result) {
  if (!result.ok) {
    if (result.error) alert(result.error);
    return;
  }
  /* Nog uitgestelde opslag van het vorige project eerst wegschrijven vóór we van project wisselen. */
  await flushAutoSaveNow();
  clearCache();
  invalidateStripCanvasCache();
  assistSampleCache = null;
  updateProjectUI();
  const paths = await getProjectScanPaths();
  const toLoad = pickResumeLintPath(paths, getState().lintStates, result.project?.currentLintPath ?? getProjectMeta()?.currentLintPath);
  if (toLoad) await loadScanByPath(toLoad);
}

async function onOpenProjectClick() {
  updateStatus(50, t('status.openingProject'));
  let result;
  try {
    result = await openProject();
  } finally {
    updateStatus(0, t('status.operationEmpty'));
  }
  await finishOpenProject(result);
}

async function onOpenProjectFileClick() {
  updateStatus(50, t('status.openingProject'));
  let result;
  try {
    result = await openProjectFromFile();
  } finally {
    updateStatus(0, t('status.operationEmpty'));
  }
  await finishOpenProject(result);
}

async function onSuggestProjectFolderClick() {
  const name = (el(ids.projectName)?.value || '').trim();
  const suggested = await window.api?.getSuggestedProjectFolder?.(name || undefined);
  if (!suggested || !el(ids.projectFolderPath)) return;
  el(ids.projectFolderPath).setAttribute('data-path', suggested);
  el(ids.projectFolderPath).textContent = suggested.length > 45 ? '...' + suggested.slice(-42) : suggested;
}

async function onProjectStartenClick() {
  if (hasProject()) return;
  const lastPath = await window.api?.getLastProjectPath?.();
  if (!lastPath) {
    alert(t('project.noLastProject'));
    return;
  }
  updateStatus(50, t('status.startingProject'));
  let result;
  try {
    result = await openProjectByPath(lastPath);
  } finally {
    updateStatus(0, t('status.operationEmpty'));
  }
  if (!result?.ok) {
    if (result?.error) alert(result.error);
    return;
  }
  clearCache();
  invalidateStripCanvasCache();
  assistSampleCache = null;
  updateProjectUI();
  updateUI();
  const paths = await getProjectScanPaths();
  const toLoad = pickResumeLintPath(paths, getState().lintStates, result.project?.currentLintPath ?? getProjectMeta()?.currentLintPath);
  if (toLoad) await loadScanByPath(toLoad);
}

async function onSaveProjectClick() {
  updateStatus(50, t('status.savingProject'));
  let result;
  try {
    result = await saveProject();
  } finally {
    updateStatus(0, t('status.operationEmpty'));
  }
  if (result.ok) updateProjectUI();
  else if (result.error) alert(result.error);
}

async function onDeleteProjectClick() {
  const result = await deleteProject();
  if (result.canceled) return;
  if (result.ok) {
    clearCache();
    invalidateStripCanvasCache();
    assistSampleCache = null;
    updateProjectUI();
    updateUI();
    refreshPreviews();
  } else if (result.error) alert(result.error);
}

async function onCloseProjectClick() {
  if (!hasProject()) return;
  if (isDirty() && !confirm(t('project.closeProjectConfirm'))) return;
  /* Uitgestelde opslag nog wegschrijven vóór het project sluit. */
  await flushAutoSaveNow();
  clearCache();
  invalidateStripCanvasCache();
  assistSampleCache = null;
  closeCurrentProject();
  await loadAppSettings();
  const snap = await window.api?.getAppSettings?.().catch(() => null);
  const defFrames = snap?.defaultFramesPerStrip ?? DEFAULT_FRAMES_PER_STRIP;
  setNumFrames(defFrames);
  resetGridStateToDefault();
  updateProjectUI();
  updateUI();
  refreshPreviews();
}

/** Zet Y-marges opnieuw door clamp met strip S/n = zelfde fh als ladder/preview (na referentiemodus-wissel). */
function snapGridVerticalMarginsToStripClamp() {
  const canvas = getStripCanvas();
  const s = getState();
  const n = Math.max(1, s.numFrames || 1);
  if (!canvas || canvas.height < 1) return;
  const fh = canvas.height / n;
  const cv = clampGridVerticalMarginsCanvas(fh, n, s.gridOffsetY ?? 0, s.gridOffsetYBottom ?? 0);
  const top = Number(s.gridOffsetY) || 0;
  const bottom = Number.isFinite(Number(s.gridOffsetYBottom)) ? Math.round(s.gridOffsetYBottom) : 0;
  if (cv.top !== top || cv.bottom !== bottom) {
    setGridOffsetYOnly(cv.top);
    setGridOffsetYBottom(cv.bottom);
  }
}

/** Houdt gridSplitLowerPanCanvas binnen clamp; zet op 0 als referentie-modus geen split gebruikt. */
function syncGridSplitLowerPanClamp() {
  const s = getState();
  if (!usesSplitLowerVerticalPan()) {
    /* k=0 of k=n: geen split; oude d maakt eerste split-stap een no-op. */
    const cur = Math.round(Number(s.gridSplitLowerPanCanvas) || 0);
    if (cur !== 0) setGridSplitLowerPanCanvas(0);
    return;
  }
  const canvas = getStripCanvas();
  const n = Math.max(1, s.numFrames || 1);
  if (!canvas) return;
  const { frameHeight } = getFrameDimensions(canvas);
  if (frameHeight < 1) return;
  ensurePivotFrozenLowerCellHeight(frameHeight, n);
  const cv = clampGridVerticalMarginsCanvas(frameHeight, n, s.gridOffsetY ?? 0, s.gridOffsetYBottom ?? 0);
  const k = resolveVerticalPivotKFromState();
  const d = clampGridSplitLowerPanCanvas(frameHeight, n, cv.top, cv.bottom, k, s.gridSplitLowerPanCanvas);
  const curD = Math.round(Number(s.gridSplitLowerPanCanvas) || 0);
  if (d !== curD) setGridSplitLowerPanCanvas(d);
}

/** Referentielijn midden (2≤k<n): T±/B± en Duw (ook Shift+tot rand) gebruiken split-pan d; koppel hoeft niet aan. Hand ▲▼ verschuift het hele raster (rigide). */
function isMiddleSplitVerticalRefWithLink() {
  return usesSplitLowerVerticalPan();
}

function applyMiddleSplitPanFromStripControls(frameHeight, n, curTop, curBottom, splitStepCanvas) {
  const s = getState();
  ensurePivotFrozenLowerCellHeight(frameHeight, n);
  const k = resolveVerticalPivotKFromState();
  const dNew = applySplitLowerPanStepCanvas(
    frameHeight,
    n,
    curTop,
    curBottom,
    k,
    s.gridSplitLowerPanCanvas,
    splitStepCanvas
  );
  setGridSplitLowerPanCanvas(dNew);
  syncGridSplitLowerPanClamp();
}

async function updateFloatingPreviewButtonUi(forcedOpen) {
  const btn = el(ids.openStrip);
  if (!btn) return;
  let isOpen = forcedOpen;
  if (isOpen == null) {
    try {
      const r = await window.api?.isStripPreviewOpen?.();
      isOpen = !!(r && r.open);
    } catch (_) {
      isOpen = false;
    }
  }
  btn.classList.toggle('pressed', !!isOpen);
  btn.classList.toggle('is-on', !!isOpen);
  btn.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
  const labelKey = isOpen ? 'strip.floatingPreviewToggleOn' : 'strip.floatingPreviewToggleOff';
  const label = t(labelKey);
  if (label && label !== labelKey) btn.textContent = label;
  const tip = t(isOpen ? 'strip.previewScanlintTooltipOn' : 'strip.previewScanlintTooltipOff');
  if (tip && tip !== 'strip.previewScanlintTooltipOn' && tip !== 'strip.previewScanlintTooltipOff') {
    btn.title = tip;
  }
}

/** Alleen open/sluit het zwevende raster-previewvenster (raakt RASTER SETUP in het hoofdvenster niet). */
async function onOpenStrip() {
  const s = getState();
  if (!s.image && hasProject()) {
    const paths = await getProjectScanPaths();
    const resume = paths.length
      ? pickResumeLintPath(paths, getState().lintStates, getProjectMeta()?.currentLintPath)
      : null;
    if (resume) {
      updateStatus(50, t('status.stripLoading'));
      try {
        await loadScanByPath(resume);
      } finally {
        updateStatus(0, t('status.operationEmpty'));
      }
    }
  }
  try {
    let isOpen = false;
    try {
      const r = await window.api?.isStripPreviewOpen?.();
      isOpen = !!(r && r.open);
    } catch (_) {}
    if (isOpen) {
      if (typeof window.api?.closeStripPreview === 'function') {
        await window.api.closeStripPreview();
      }
      await updateFloatingPreviewButtonUi(false);
    } else {
      if (typeof window.api?.openStripPreview === 'function') {
        const res = await window.api.openStripPreview();
        if (res && res.ok === false && res.error) alert(res.error);
      }
      await updateFloatingPreviewButtonUi(true);
    }
  } catch (e) {
    alert(e?.message || String(e));
  }
  refreshPreviews();
}

async function onOpenSettings() {
  try {
    const res = await window.api?.openSettingsWindow?.();
    if (res && res.ok === false && res.error) {
      alert(res.error);
    }
  } catch (e) {
    alert(e?.message || String(e));
  }
}

async function onOpenDocs() {
  try {
    const res = await window.api?.openDocsWindow?.();
    if (res && res.ok === false && res.error) {
      alert(res.error);
    }
  } catch (e) {
    alert(e?.message || String(e));
  }
}

function onFrameGridOffsetFromPreview(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  let deltaX = p.deltaX != null ? Number(p.deltaX) : 0;
  const deltaY = p.deltaY != null ? Number(p.deltaY) : 0;
  const tool = p.tool || 'hand';
  if (isFixResolutionLockActive() && tool !== 'hand') return;

  const s = getState();
  /* Horizontaal gespiegelde strip: marge wordt in canvas-X bijgewerkt, maar de preview toont gespiegeld —
   * zonder tekenwissel voelen ◀/▶ (en pijltjes) omgekeerd aan t.o.v. het beeld. */
  if (tool === 'hand' && s.flipHorizontal) {
    deltaX = -deltaX;
  }
  const n = Math.max(1, s.numFrames || 1);
  let frameWidth = 0;
  let frameHeight = 0;
  let scaleX = 1;
  let scaleY = 1;
  let dim = null;

  const canvas = getStripCanvas();
  if (canvas) {
    dim = getScaledDimensions(canvas);
    if (dim && dim.width >= 1 && dim.height >= 1) {
      const fd = getFrameDimensions(canvas);
      frameWidth = fd.frameWidth;
      frameHeight = fd.frameHeight;
      if (frameWidth >= 1 && frameHeight >= 1) {
        scaleX = canvas.width / dim.width;
        scaleY = canvas.height / dim.height;
      }
    }
  }
  if (frameWidth < 1 || frameHeight < 1) {
    const dims = getStripCanvasDimensions();
    if (dims && dims.width >= 1 && dims.height >= 1) {
      frameWidth = dims.width;
      frameHeight = Math.max(1, Math.round(dims.height / n));
      const dim = getScaledDimensionsFromSize(dims.width, dims.height);
      scaleX = dim.width >= 1 ? dims.width / dim.width : 1;
      scaleY = dim.height >= 1 ? dims.height / dim.height : 1;
    }
  }
  if (frameWidth < 1 || frameHeight < 1) return;

  if (!Number.isFinite(scaleX) || scaleX <= 0) scaleX = 1;
  if (!Number.isFinite(scaleY) || scaleY <= 0) scaleY = 1;

  const stripHeight = frameHeight * n;
  const minTotalHeight = n * GRID_MIN_SIZE_PX;

  const rawDx = deltaX * scaleX;
  let dx = rawDx !== 0 ? (Math.round(rawDx) || (rawDx > 0 ? 1 : -1)) : 0;
  const rawDy = deltaY * scaleY;
  let dy = rawDy !== 0 ? (Math.round(rawDy) || (rawDy > 0 ? 1 : -1)) : 0;
  if (tool === 'hand' && deltaX !== 0 && dx === 0) dx = deltaX > 0 ? 1 : -1;
  if (tool === 'hand' && deltaY !== 0 && dy === 0) dy = deltaY > 0 ? 1 : -1;
  if (tool === 'hand' && dx !== 0) {
    const minW = Math.max(GRID_MIN_SIZE_PX, Math.round(frameWidth * GRID_MIN_SIZE_RATIO));
    const maxX = Math.max(1, Math.floor((frameWidth - minW) / 2));
    const maxStep = Math.max(1, Math.min(maxX, Math.ceil(maxX * 0.15)));
    dx = Math.max(-maxStep, Math.min(maxStep, dx));
  }
  if (tool === 'breedte' && dx !== 0) {
    const minW = Math.max(GRID_MIN_SIZE_PX, Math.round(frameWidth * GRID_MIN_SIZE_RATIO));
    const maxX = Math.max(1, Math.floor((frameWidth - minW) / 2));
    const maxStep = Math.max(1, Math.min(maxX, Math.ceil(frameWidth * 0.08)));
    dx = Math.max(-maxStep, Math.min(maxStep, dx));
  }
  if ((tool === 'hand' || tool === 'verticaal') && dy !== 0) {
    const maxYStep = Math.max(1, Math.min(frameHeight, Math.ceil(frameHeight * 0.12)));
    dy = Math.max(-maxYStep, Math.min(maxYStep, dy));
  }
  const newX = clampGridOffsetX(frameWidth, getEffectiveGridOffsetX(frameWidth) + dx);

  if (tool === 'hand') {
    const nFrames = Math.max(1, s.numFrames || 1);
    const m0 = getEffectiveGridMargins(frameWidth);
    let nextLeft = m0.left;
    let nextRight = m0.right;
    let nextTop = Number(s.gridOffsetY) || 0;
    let nextBottom = Number.isFinite(Number(s.gridOffsetYBottom)) ? Math.round(Number(s.gridOffsetYBottom)) : 0;
    if (dx !== 0) {
      const c = panGridMarginsPreserveWidth(frameWidth, nextLeft, nextRight, dx);
      nextLeft = c.left;
      nextRight = c.right;
    }
    if (dy !== 0) {
      const cv = applyRigidVerticalPanStepCanvas(frameHeight, nFrames, nextTop, nextBottom, dy);
      nextTop = cv.top;
      nextBottom = cv.bottom;
    }
    // Geen assist-snap bij Hand: die trok na links-stappen weer naar rechts terug.
    setGridOffsetXMargins(nextLeft, nextRight);
    setGridOffsetYOnly(nextTop);
    setGridOffsetYBottom(nextBottom);
    syncGridSplitLowerPanClamp();
  } else if (tool === 'verticaal') {
    const newY = clampGridOffsetY(frameHeight, s.gridOffsetY + dy, s.gridOffsetYBottom, s.numFrames);
    setGridOffset(newX, newY);
  } else {
    setGridOffset(newX, s.gridOffsetY);
  }

  setDirty();
  updateUI();
  if (canvas && dim && dim.width >= 1 && dim.height >= 1 && canvas.height > 0) {
    const scale = dim.height / canvas.height;
    const overrideX = getState().gridOffsetXAsymmetric ? undefined : newX;
    const gridPayload = buildGridPayload(dim.width, dim.height, scale, overrideX, canvas.width);
    refreshPreviewsGridOnly(gridPayload);
  } else {
    refreshPreviewsGridOnly();
  }
}

function onStripAdjustWidthEdge(payload) {
  if (isFixResolutionLockActive()) return;
  const p = payload && typeof payload === 'object' ? payload : {};
  const edge = p.edge === 'right' ? 'right' : 'left';
  const deltaDisplay = p.delta != null ? Number(p.delta) : 0;
  if (deltaDisplay === 0) return;
  const _pf = perfStart('MANUELE POSITIE: breedte-rand (L/R)');

  const s = getState();
  const n = Math.max(1, s.numFrames || 1);
  let frameWidth = 0;
  let scaleX = 1;
  let dim = null;
  const canvas = getStripCanvas();
  if (canvas) {
    dim = getScaledDimensions(canvas);
    if (dim && dim.width >= 1 && dim.height >= 1) {
      const fd = getFrameDimensions(canvas);
      frameWidth = fd.frameWidth;
      if (frameWidth >= 1) scaleX = canvas.width / dim.width;
    }
  }
  if (frameWidth < 1) {
    const dims = getStripCanvasDimensions();
    if (dims && dims.width >= 1 && dims.height >= 1) {
      frameWidth = dims.width;
      const d2 = getScaledDimensionsFromSize(dims.width, dims.height);
      scaleX = d2.width >= 1 ? dims.width / d2.width : 1;
    }
  }
  if (frameWidth < 1) return;
  if (!Number.isFinite(scaleX) || scaleX <= 0) scaleX = 1;

  let stepC = Math.round(deltaDisplay * scaleX);
  if (stepC === 0) stepC = deltaDisplay > 0 ? 1 : -1;

  const ox = getEffectiveGridOffsetX(frameWidth);
  let left;
  let right;
  if (s.gridOffsetXAsymmetric) {
    left = Number(s.gridOffsetXLeft);
    right = Number(s.gridOffsetXRight);
    if (!Number.isFinite(left)) left = ox;
    if (!Number.isFinite(right)) right = ox;
  } else {
    left = right = ox;
  }

  if (edge === 'left') {
    left += stepC;
  } else {
    right += stepC;
  }

  const c = clampGridMarginsCanvas(frameWidth, left, right);
  setGridOffsetXMargins(c.left, c.right);

  setDirty();
  updateUI();
  if (canvas && dim && dim.width >= 1 && dim.height >= 1 && canvas.height > 0) {
    const scale = dim.height / canvas.height;
    refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale, undefined, canvas.width));
  } else {
    refreshPreviewsGridOnly();
  }
  _pf();
}

function onStripAdjustHeightEdge(payload) {
  if (isFixResolutionLockActive()) return;
  const p = payload && typeof payload === 'object' ? payload : {};
  const edge = p.edge === 'bottom' ? 'bottom' : 'top';
  const deltaDisplay = p.delta != null ? Number(p.delta) : 0;
  if (deltaDisplay === 0) return;

  const s = getState();
  const n = Math.max(1, s.numFrames || 1);
  let frameHeight = 0;
  let scaleY = 1;
  let dim = null;
  const canvas = getStripCanvas();
  if (canvas) {
    dim = getScaledDimensions(canvas);
    if (dim && dim.width >= 1 && dim.height >= 1) {
      const fd = getFrameDimensions(canvas);
      frameHeight = fd.frameHeight;
      if (frameHeight >= 1) scaleY = canvas.height / dim.height;
    }
  }
  if (frameHeight < 1) {
    const dims = getStripCanvasDimensions();
    if (dims && dims.width >= 1 && dims.height >= 1) {
      frameHeight = Math.max(1, Math.round(dims.height / n));
      const d2 = getScaledDimensionsFromSize(dims.width, dims.height);
      scaleY = d2.height >= 1 ? dims.height / d2.height : 1;
    }
  }
  if (frameHeight < 1) return;
  if (!Number.isFinite(scaleY) || scaleY <= 0) scaleY = 1;

  let stepC = Math.round(deltaDisplay * scaleY);
  if (stepC === 0) stepC = deltaDisplay > 0 ? 1 : -1;
  const _pf = perfStart('MANUELE POSITIE: hoogte-rand (T/B)');

  const curTop = Number(s.gridOffsetY) || 0;
  const curBottom = Number.isFinite(Number(s.gridOffsetYBottom)) ? Math.round(s.gridOffsetYBottom) : 0;

  if (isMiddleSplitVerticalRefWithLink()) {
    applyMiddleSplitPanFromStripControls(frameHeight, n, curTop, curBottom, stepC);
    setDirty();
    updateUI();
    if (canvas && dim && dim.width >= 1 && dim.height >= 1 && canvas.height > 0) {
      const scale = dim.height / canvas.height;
      refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale, undefined, canvas.width));
    } else {
      refreshPreviewsGridOnly();
    }
    _pf();
    return;
  }

  let top = curTop;
  let bottom = curBottom;
  if (edge === 'top') {
    top += stepC;
  } else {
    bottom += stepC;
  }

  const c = clampGridVerticalMarginsCanvas(frameHeight, n, top, bottom);
  setGridOffsetYOnly(c.top);
  setGridOffsetYBottom(c.bottom);
  syncGridSplitLowerPanClamp();

  setDirty();
  updateUI();
  if (canvas && dim && dim.width >= 1 && dim.height >= 1 && canvas.height > 0) {
    const scale = dim.height / canvas.height;
    refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale, undefined, canvas.width));
  } else {
    refreshPreviewsGridOnly();
  }
  _pf();
}

function onStripVerticalRigidPanBoundaryFromPreview(towardCompress) {
  if (isFixResolutionLockActive()) return;
  const canvas = getStripCanvas();
  const { frameHeight } = getFrameDimensions(canvas);
  if (frameHeight < 1) return;
  const s = getState();
  const n = Math.max(1, s.numFrames || 1);
  const top = Number(s.gridOffsetY) || 0;
  const bottom = Number.isFinite(Number(s.gridOffsetYBottom)) ? Math.round(s.gridOffsetYBottom) : 0;
  /* Shift+Duw (strip-preview): bij midden-split alleen d naar min/max; anders heel raster (of onder vast bij k=n+koppel). */
  if (usesSplitLowerVerticalPan()) {
    const k = resolveVerticalPivotKFromState();
    const d = splitLowerPanToBoundaryCanvas(frameHeight, n, top, bottom, k, !!towardCompress);
    setGridSplitLowerPanCanvas(d);
    syncGridSplitLowerPanClamp();
  } else {
    setGridSplitLowerPanCanvas(0);
    const kRef = resolveVerticalPivotKFromState();
    const link = panelUsesVerticalAnchorLink();
    const c =
      link && kRef === n
        ? bottomAnchoredVerticalPanToBoundaryCanvas(frameHeight, n, top, bottom, !!towardCompress)
        : rigidVerticalPanToBoundaryCanvas(frameHeight, n, top, bottom, !!towardCompress);
    setGridOffsetYOnly(c.top);
    setGridOffsetYBottom(c.bottom);
    syncGridSplitLowerPanClamp();
  }
  setDirty();
  updateUI();
  let dim = null;
  if (canvas) dim = getScaledDimensions(canvas);
  if (canvas && dim && dim.width >= 1 && dim.height >= 1 && canvas.height > 0) {
    const scale = dim.height / canvas.height;
    refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale, undefined, canvas.width));
  } else {
    refreshPreviewsGridOnly();
  }
}

/**
 * Duw Omhoog/Omlaag: bij lijn k=n + koppel aan = onder vast, alleen Y-boven (celhoogte varieert).
 * Bij 0<k<n: alleen split-pan (zelfde inner en lijn op strip-Y).
 * Anders = rigide pan zoals Hand in niet-split-modus.
 *
 * Payload: { delta } (getekend, legacy) of { delta, duwKind: 'compress'|'stretch' } met delta = stap (≥0).
 */
function onStripVerticalFixedBottomStep(payload) {
  if (isFixResolutionLockActive()) return;
  const p = payload && typeof payload === 'object' ? payload : { delta: payload };
  const d = p.delta != null ? Number(p.delta) : 0;
  const duwKind = p.duwKind === 'compress' || p.duwKind === 'stretch' ? p.duwKind : null;
  if (!duwKind && d === 0) return;

  const s = getState();
  const n = Math.max(1, s.numFrames || 1);
  let frameHeight = 0;
  let scaleY = 1;
  let dim = null;
  const canvas = getStripCanvas();
  if (canvas) {
    dim = getScaledDimensions(canvas);
    if (dim && dim.width >= 1 && dim.height >= 1) {
      const fd = getFrameDimensions(canvas);
      frameHeight = fd.frameHeight;
      if (frameHeight >= 1) scaleY = canvas.height / dim.height;
    }
  }
  if (frameHeight < 1) {
    const dims = getStripCanvasDimensions();
    if (dims && dims.width >= 1 && dims.height >= 1) {
      frameHeight = Math.max(1, Math.round(dims.height / n));
      const d2 = getScaledDimensionsFromSize(dims.width, dims.height);
      scaleY = d2.height >= 1 ? dims.height / d2.height : 1;
    }
  }
  if (frameHeight < 1) return;
  if (!Number.isFinite(scaleY) || scaleY <= 0) scaleY = 1;

  const curTop = Number(s.gridOffsetY) || 0;
  const bottom = Number.isFinite(Number(s.gridOffsetYBottom)) ? Math.round(s.gridOffsetYBottom) : 0;
  const kRef = resolveVerticalPivotKFromState();
  const link = panelUsesVerticalAnchorLink();

  const mag = Math.max(1, Math.round(Math.abs(d) * scaleY));
  let stepC;
  if (duwKind) {
    /* Strip: positieve stap + soort — zelfde teken als vroeger (+ = Omlaag/compress, − = Omhoog/stretch). */
    stepC = duwKind === 'compress' ? mag : -mag;
  } else {
    stepC = Math.round(d * scaleY);
    if (stepC === 0) stepC = d > 0 ? 1 : -1;
  }

  /*
   * Midden-split (2≤k<n): alleen gridSplitLowerPanCanvas (zelfde familie als Shift+Duw tot rand).
   * Geen T/B (anders schuift de vaste rand mee op het lint). Hand ▲▼ gebruikt hier juist wél rigide T/B.
   */
  if (isMiddleSplitVerticalRefWithLink()) {
    applyMiddleSplitPanFromStripControls(frameHeight, n, curTop, bottom, stepC);
    setDirty();
    updateUI();
    if (canvas && dim && dim.width >= 1 && dim.height >= 1 && canvas.height > 0) {
      const scale = dim.height / canvas.height;
      refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale, undefined, canvas.width));
    } else {
      refreshPreviewsGridOnly();
    }
    return;
  }

  /*
   * Koppeling uit: Duw altijd rigide.
   * Koppeling aan + lijn k=n: Y-onder vast (Duw). Split gaat hierboven; anders rigide pan.
   */
  const useBottomAnchoredDuw = link && kRef === n;
  const c = useBottomAnchoredDuw
    ? applyBottomAnchoredVerticalPanStepCanvas(frameHeight, n, curTop, bottom, stepC)
    : applyRigidVerticalPanStepCanvas(frameHeight, n, curTop, bottom, stepC);
  setGridOffsetYOnly(c.top);
  setGridOffsetYBottom(c.bottom);
  syncGridSplitLowerPanClamp();

  setDirty();
  updateUI();
  if (canvas && dim && dim.width >= 1 && dim.height >= 1 && canvas.height > 0) {
    const scale = dim.height / canvas.height;
    refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale, undefined, canvas.width));
  } else {
    refreshPreviewsGridOnly();
  }
}

function onStripVerticalAnchorFromPreview(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  if (typeof p.mode !== 'string' && p.customK == null) return;

  if (typeof p.mode === 'string') {
    setGridVerticalAnchorMode(p.mode);
  }
  if (p.customK != null) {
    setGridVerticalPivotCustomK(p.customK);
  }
  syncGridSplitLowerPanClamp();
  /* Geen snapGridVerticalMarginsToStripClamp hier: bij eerste k van n→midden gaf dat ~1px rasterverschuiving na Enter; T/B blijven via clamp elders consistent. */
  setDirty();
  updateUI();
  const canvas = getStripCanvas();
  if (canvas) {
    const dim = getScaledDimensions(canvas);
    if (dim && dim.width >= 1 && dim.height >= 1 && canvas.height > 0) {
      const scale = dim.height / canvas.height;
      refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale, undefined, canvas.width));
      return;
    }
  }
  refreshPreviewsGridOnly();
}

function onArrowKeyGridOffset(dx, dy) {
  onFrameGridOffsetFromPreview({ deltaX: dx, deltaY: dy, tool: 'hand' });
}

function onSetGridOffsetAbsolute(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const canvas = getStripCanvas();
  const { frameWidth, frameHeight } = getFrameDimensions(canvas);
  if (frameWidth < 1 || frameHeight < 1) return;
  const _pf = perfStart('MANUELE POSITIE: raster verplaatsen/positie');
  const s = getState();
  const n = Math.max(1, s.numFrames);
  const newX = clampGridOffsetX(frameWidth, p.gridOffsetX != null ? Number(p.gridOffsetX) : s.gridOffsetX);
  const wantY = p.gridOffsetY != null ? Number(p.gridOffsetY) : (s.gridOffsetY || 0);
  const wantYB = p.gridOffsetYBottom != null ? Number(p.gridOffsetYBottom) : (s.gridOffsetYBottom ?? 0);
  let cv = clampGridVerticalMarginsCanvas(frameHeight, n, wantY, wantYB);
  let nextX = newX;
  const assistMode = getAssistMode();
  if (assistMode !== 'off' && canvas) {
    const sample = getAssistSample(canvas);
    if (sample) {
      const stripHeightCanvas = frameHeight * n;
      let left = nextX;
      let right = nextX;
      if (!isAssistPresetDarkLineLockedX()) {
        const snapX = suggestAssistShiftX(sample, frameWidth, stripHeightCanvas, left, right, cv.top, cv.bottom, assistMode);
        if (snapX !== 0) {
          const c = panGridMarginsPreserveWidth(frameWidth, left, right, snapX);
          left = c.left;
          right = c.right;
          nextX = Math.round((left + right) / 2);
        }
      }
      const snapY = suggestAssistShiftY(sample, frameWidth, stripHeightCanvas, left, right, cv.top, cv.bottom, assistMode);
      if (snapY !== 0) {
        cv = clampGridVerticalMarginsCanvas(frameHeight, n, cv.top + snapY, cv.bottom - snapY);
      }
    }
  }
  setGridOffset(nextX, cv.top);
  setGridOffsetYBottom(cv.bottom);
  syncGridSplitLowerPanClamp();
  setDirty();
  updateUI();
  if (canvas) {
    const dim = getScaledDimensions(canvas);
    if (dim && dim.width >= 1 && dim.height >= 1 && canvas.height > 0) {
      const scale = dim.height / canvas.height;
      refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale, nextX, canvas.width));
    } else {
      refreshPreviewsGridOnly();
    }
  } else {
    refreshPreviewsGridOnly();
  }
  _pf();
}

function onAutoDetectFrameBoundsFromPreview(opts) {
  const detectOpts = opts && typeof opts === 'object' ? opts : {};
  const fromScanNav = detectOpts.fromScanNav === true;
  triangleSensitivityOverride = null;
  // Sample-cache behouden: opnieuw downscalen van een grote scan blokkeert knoppen seconden lang
  const modeRaw = getAssistMode();
  // Perforatie: ook bij Assist uit toch zacht klemmen (nodig bij Vorige/Volgende).
  const mode = modeRaw === 'off' ? 'soft' : modeRaw;
  const canvas = getStripCanvas();
  const { frameWidth, frameHeight } = getFrameDimensions(canvas);
  if (!canvas || frameWidth < 1 || frameHeight < 1) return false;
  const sample = getAssistSample(canvas);
  if (!sample) return false;
  const s = getState();
  const n = Math.max(1, s.numFrames || 1);
  const stripHeightCanvas = frameHeight * n;
  let m = getEffectiveGridMargins(frameWidth);
  let left = m.left;
  let right = m.right;
  let top = Number(s.gridOffsetY) || 0;
  let bottom = Number.isFinite(Number(s.gridOffsetYBottom)) ? Math.round(Number(s.gridOffsetYBottom)) : 0;
  // Extra L/R/T/B kunnen al live in het raster zitten: eerst terugdraaien, na detectie opnieuw toepassen.
  const undoExtraX = getAssistExtraLeftPx() - getAssistExtraRightPx();
  const undoExtraY = getAssistExtraTopPx() - getAssistExtraBottomPx();
  if (undoExtraX !== 0) {
    const cUndoX = panGridMarginsPreserveWidth(frameWidth, left, right, -undoExtraX);
    left = cUndoX.left;
    right = cUndoX.right;
  }
  if (undoExtraY !== 0) {
    const cUndoY = panGridVerticalMarginsPreserveHeight(stripHeightCanvas, top, bottom, -undoExtraY);
    top = cUndoY.top;
    bottom = cUndoY.bottom;
  }
  const baselineLeft = left;
  const baselineRight = right;
  const baselineTop = top;
  const baselineBottom = bottom;
  const lockXForDarkLine = isAssistPresetDarkLineLockedX();
  const freezeX = isAssistPresetFreezeX() || isAssistPresetSprocketYTarget();
  const sprocketYTargetEarly = isAssistPresetSprocketYTarget();
  if (getAssistCenterBeforeDetect()) {
    // Perforatie: Center eerst overslaan — X/Y komen van driehoekjes; centreren veroorzaakt sprongen.
    if (!freezeX && !sprocketYTargetEarly) {
      const centered = centerGridMarginsPreserveSize(
        frameWidth,
        stripHeightCanvas,
        left,
        right,
        top,
        bottom,
        frameHeight,
        n
      );
      left = centered.left;
      right = centered.right;
      top = centered.top;
      bottom = centered.bottom;
    }
  }
  const startTop = top;
  const startBottom = bottom;
  const xRef = getAssistXRef();
  const yRef = getAssistYRef();
  const presetCfg = getAssistPresetConfig();
  const targetLeftWhiteEdge = !freezeX && isAssistPresetLeftWhiteEdgeTarget();
  const targetRightWhiteEdge = !freezeX && isAssistPresetRightWhiteEdgeTarget();
  const darkLineOnRightSide = isAssistPresetDarkLineRightSide();
  const darkLineYTarget = isAssistPresetDarkLineYTarget();
  const curRightX = frameWidth - right;
  const curLeftX = left;
  // Zwarte-lijn: X beperkt tot aparte pass na Y. Perforatie: X bevriezen.
  const allowXAutoDetect = !lockXForDarkLine && !freezeX;
  let targetEdgeX = bestVerticalEdgeX(
    sample,
    frameWidth,
    stripHeightCanvas,
    top,
    bottom,
    xRef,
    xRef === 'right' ? curRightX : curLeftX,
    mode
  );
  if (allowXAutoDetect) {
    const yBand0 = Math.max(0, top + Math.round(stripHeightCanvas * 0.05));
    const yBand1 = Math.max(yBand0 + 8, stripHeightCanvas - bottom - Math.round(stripHeightCanvas * 0.05));
    const refinedEdge = refineVerticalEdgeXFullRes(
      canvas,
      targetEdgeX,
      yBand0,
      yBand1,
      xRef === 'right'
    );
    if (refinedEdge && Number.isFinite(refinedEdge.xCanvas)) targetEdgeX = refinedEdge.xCanvas;
  }
  const startLeftX = left;
  const startRightX = right;
  if (allowXAutoDetect) {
    let targetShift = 0;
    if (xRef === 'right') {
      targetShift = Math.round(targetEdgeX - curRightX);
    } else {
      targetShift = Math.round(targetEdgeX - curLeftX);
    }
    if (targetShift !== 0) {
      const maxDirectShift = mode === 'strong'
        ? Math.max(56, Math.round(frameWidth * 0.3))
        : Math.max(34, Math.round(frameWidth * 0.2));
      targetShift = Math.max(-maxDirectShift, Math.min(maxDirectShift, targetShift));
      const cDirect = panGridMarginsPreserveWidth(frameWidth, left, right, targetShift);
      left = cDirect.left;
      right = cDirect.right;
    }
    const maxCoarseShift = mode === 'strong'
      ? Math.max(42, Math.round(frameWidth * 0.24))
      : Math.max(26, Math.round(frameWidth * 0.14));
    const coarseRangeScaleX = xRef === 'right'
      ? (mode === 'strong' ? 10.0 : 7.0)
      : (mode === 'strong' ? 7.0 : 5.0);
    const coarseSnapX = suggestAssistShiftX(
      sample,
      frameWidth,
      stripHeightCanvas,
      left,
      right,
      top,
      bottom,
      mode,
      { rangeScale: coarseRangeScaleX, minGain: -1, force: true }
    );
    if (coarseSnapX !== 0) {
      const coarseShift = Math.max(-maxCoarseShift, Math.min(maxCoarseShift, coarseSnapX));
      const c0 = panGridMarginsPreserveWidth(frameWidth, left, right, coarseShift);
      left = c0.left;
      right = c0.right;
    }
  }
  const yRangeBoost = darkLineYTarget
    ? (yRef === 'bottom' || yRef === 'top' ? 1.05 : 0.95)
    : (yRef === 'bottom' ? 2.8 : yRef === 'top' ? 1.8 : 1.4);
  const iter = mode === 'strong' ? 4 : 3;
  for (let i = 0; i < iter; i++) {
    const xRefBoost = xRef === 'right' ? 1.45 : 1.2;
    const rangeScaleX = (mode === 'strong' ? (2.2 - i * 0.35) : (1.8 - i * 0.28)) * xRefBoost;
    const rangeScaleY = Math.max(1.2, rangeScaleX * yRangeBoost);
    const minGainX = mode === 'strong' ? (0.3 + i * 0.06) : (0.55 + i * 0.1);
    const minGainYBase = mode === 'strong' ? (0.6 + i * 0.08) : (1.0 + i * 0.14);
    const minGainY = darkLineYTarget
      ? Math.max(0.3, minGainYBase * 0.55)
      : (yRef === 'bottom' ? Math.max(0.4, minGainYBase * 0.7) : minGainYBase);
    if (allowXAutoDetect) {
      const snapX = suggestAssistShiftX(sample, frameWidth, stripHeightCanvas, left, right, top, bottom, mode, { rangeScale: rangeScaleX, minGain: minGainX });
      if (snapX !== 0) {
        const c = panGridMarginsPreserveWidth(frameWidth, left, right, snapX);
        left = c.left;
        right = c.right;
      }
    }
    // Perforatie: geen algemene Y-edge snap (verstoort driehoek-tips, vooral op lichte frames)
    if (!sprocketYTargetEarly) {
      const snapY = suggestAssistShiftY(sample, frameWidth, stripHeightCanvas, left, right, top, bottom, mode, { rangeScale: rangeScaleY, minGain: minGainY });
      if (snapY !== 0) {
        const cv = panGridVerticalMarginsPreserveHeight(stripHeightCanvas, top, bottom, snapY);
        top = cv.top;
        bottom = cv.bottom;
      }
    }
  }
  if (allowXAutoDetect && xRef === 'right') {
    const prevRightEdge = frameWidth - m.right;
    const nextRightEdge = frameWidth - right;
    if (Math.abs(nextRightEdge - prevRightEdge) < 2) {
      const forced = suggestAssistShiftX(
        sample,
        frameWidth,
        stripHeightCanvas,
        left,
        right,
        top,
        bottom,
        mode,
        { rangeScale: mode === 'strong' ? 9.0 : 6.5, force: true }
      );
      if (forced !== 0) {
        const cForced = panGridMarginsPreserveWidth(frameWidth, left, right, forced);
        left = cForced.left;
        right = cForced.right;
      }
    }
  }
  // Als X na de normale pass nauwelijks bewoog, forceer een ruimere her-acquire op de zijkanten.
  if (allowXAutoDetect) {
    const movedX = Math.abs(left - startLeftX) + Math.abs(right - startRightX);
    if (movedX < 2) {
      const curRightEdge = frameWidth - right;
      const curLeftEdge = left;
      const reacquireRightEdge = bestVerticalEdgeX(
        sample,
        frameWidth,
        stripHeightCanvas,
        top,
        bottom,
        'right',
        curRightEdge,
        mode,
        { distPenaltyScale: 0.25, wideSearch: true }
      );
      const reacquireLeftEdge = bestVerticalEdgeX(
        sample,
        frameWidth,
        stripHeightCanvas,
        top,
        bottom,
        'left',
        curLeftEdge,
        mode,
        { distPenaltyScale: 0.25, wideSearch: true }
      );
      const shiftFromRight = Math.round(reacquireRightEdge - curRightEdge);
      const shiftFromLeft = Math.round(reacquireLeftEdge - curLeftEdge);
      let wideForced = 0;
      if (xRef === 'right') {
        wideForced = shiftFromRight !== 0 ? shiftFromRight : shiftFromLeft;
      } else {
        wideForced = shiftFromLeft !== 0 ? shiftFromLeft : shiftFromRight;
      }
      if (wideForced === 0 && Math.abs(shiftFromLeft) !== Math.abs(shiftFromRight)) {
        wideForced = Math.abs(shiftFromLeft) > Math.abs(shiftFromRight) ? shiftFromLeft : shiftFromRight;
      }
      if (wideForced !== 0) {
        const maxWideShift = mode === 'strong'
          ? Math.max(64, Math.round(frameWidth * 0.34))
          : Math.max(40, Math.round(frameWidth * 0.22));
        const sx = Math.max(-maxWideShift, Math.min(maxWideShift, wideForced));
        const cWide = panGridMarginsPreserveWidth(frameWidth, left, right, sx);
        left = cWide.left;
        right = cWide.right;
      }
      const movedAfterWide = Math.abs(left - startLeftX) + Math.abs(right - startRightX);
      // Laatste reddingsboei: linkse zwarte strook detecteren en raster rechts van die grens zetten.
      if (movedAfterWide < 2) {
        const stripBoundaryX = findLeftDarkStripBoundaryX(sample, frameWidth, stripHeightCanvas, top, bottom, mode);
        const targetLeft = Math.max(0, Math.min(frameWidth - 2, stripBoundaryX + 2));
        const stripShift = Math.round(targetLeft - left);
        if (stripShift !== 0) {
          const maxStripShift = mode === 'strong'
            ? Math.max(72, Math.round(frameWidth * 0.38))
            : Math.max(48, Math.round(frameWidth * 0.26));
          const sx2 = Math.max(-maxStripShift, Math.min(maxStripShift, stripShift));
          const cStrip = panGridMarginsPreserveWidth(frameWidth, left, right, sx2);
          left = cStrip.left;
          right = cStrip.right;
        }
      }
    }
  }
  // Guard: als zwarte strook links nog in het raster valt, nooit verder naar links trekken.
  if (allowXAutoDetect && xRef === 'right') {
    const transitionX = findLeftBlackToImageTransitionX(sample, frameWidth, stripHeightCanvas, top, bottom);
    if (Number.isFinite(transitionX)) {
      const targetLeftFromTransition = Math.max(0, Math.min(frameWidth - 2, Math.round(transitionX + 2)));
      const needRight = Math.round(targetLeftFromTransition - left);
      if (needRight > 0) {
        const maxShiftTransition = mode === 'strong'
          ? Math.max(96, Math.round(frameWidth * 0.46))
          : Math.max(60, Math.round(frameWidth * 0.3));
        const sxT = Math.max(0, Math.min(maxShiftTransition, needRight));
        const cT = panGridMarginsPreserveWidth(frameWidth, left, right, sxT);
        left = cT.left;
        right = cT.right;
      }
    }
    const hasIntrusion = hasLeftDarkStripIntrusion(sample, frameWidth, stripHeightCanvas, left, right, top, bottom);
    if (hasIntrusion) {
      const stripBoundaryX = findLeftDarkStripBoundaryX(sample, frameWidth, stripHeightCanvas, top, bottom, mode);
      const targetLeft = Math.max(0, Math.min(frameWidth - 2, stripBoundaryX + 2));
      const neededShiftRight = Math.round(targetLeft - left);
      if (neededShiftRight > 0) {
        const maxFixShift = mode === 'strong'
          ? Math.max(84, Math.round(frameWidth * 0.42))
          : Math.max(52, Math.round(frameWidth * 0.28));
        const sxFix = Math.max(0, Math.min(maxFixShift, neededShiftRight));
        const cFix = panGridMarginsPreserveWidth(frameWidth, left, right, sxFix);
        left = cFix.left;
        right = cFix.right;
      }
    }
  }
  // Grote verticale missers: extra coarse pass, maar voorzichtig begrensd om "uit beeld springen" te vermijden.
  // Perforatie: nooit — dit trekt high-key frames naar verkeerde Y vóór driehoek-ankers.
  if (!sprocketYTargetEarly && mode === 'strong' && Math.abs(top - startTop) < 2 && Math.abs(bottom - startBottom) < 2) {
    const coarseSnapY = suggestAssistShiftY(
      sample,
      frameWidth,
      stripHeightCanvas,
      left,
      right,
      top,
      bottom,
      mode,
      { rangeScale: 4.0, minGain: -1, force: true }
    );
    if (coarseSnapY !== 0) {
      const maxCoarseShiftY = Math.max(54, Math.round(stripHeightCanvas * 0.08));
      const sY = Math.max(-maxCoarseShiftY, Math.min(maxCoarseShiftY, coarseSnapY));
      const cvCoarseY = panGridVerticalMarginsPreserveHeight(stripHeightCanvas, top, bottom, sY);
      top = cvCoarseY.top;
      bottom = cvCoarseY.bottom;
    }
  }
  // Extra L/R/T/B worden pas ná alle auto-correcties toegepast (anders overschrijft detectie ze).
  // Fine-tune voor preset "Zwarte": X blijft stabiel, maar linker zwarte strook nooit in beeld laten.
  if (xRef === 'right' && lockXForDarkLine) {
    const darkIntrusionStrong = evaluateLeftStripIntrusion(sample, frameWidth, stripHeightCanvas, left, right, top, bottom).intrudes;
    const darkIntrusionSimple = hasSimpleLeftDarkIntrusion(sample, frameWidth, stripHeightCanvas, left, right, top, bottom);
    if (darkIntrusionStrong) {
      const edgeCandidates = [];
      const edgeGlobal = findGlobalLeftDarkToBrightEdgeX(sample, frameWidth, stripHeightCanvas);
      if (Number.isFinite(edgeGlobal)) edgeCandidates.push(Math.round(edgeGlobal));
      const edgeTopBottom = findLeftStripBoundaryTopBottom(sample, frameWidth, stripHeightCanvas, top, bottom);
      if (Number.isFinite(edgeTopBottom)) edgeCandidates.push(Math.round(edgeTopBottom));
      const edgeRun = findLeftDarkRunEndX(sample, frameWidth, stripHeightCanvas);
      if (edgeRun && Number.isFinite(edgeRun.x)) edgeCandidates.push(Math.round(edgeRun.x));
      if (edgeCandidates.length) {
        const margin = mode === 'strong' ? 3 : 2;
        const minLeftSafe = Math.max(0, Math.min(frameWidth - 2, Math.max(...edgeCandidates) + margin));
        if (left < minLeftSafe) {
          const needRight = minLeftSafe - left;
          const maxDarkLineShift = mode === 'strong'
            ? Math.max(20, Math.round(frameWidth * 0.06))
            : Math.max(10, Math.round(frameWidth * 0.03));
          const sxDarkLine = Math.max(0, Math.min(maxDarkLineShift, needRight));
          const cDarkLine = panGridMarginsPreserveWidth(frameWidth, left, right, sxDarkLine);
          left = cDarkLine.left;
          right = cDarkLine.right;
        }
      }
      // Restintrusie in kleine stapjes wegwerken zonder grote jump.
      const stepPxDarkLine = 1;
      const maxStepsDarkLine = mode === 'strong' ? 4 : 2;
      for (let i = 0; i < maxStepsDarkLine; i++) {
        if (!hasSimpleLeftDarkIntrusion(sample, frameWidth, stripHeightCanvas, left, right, top, bottom)) break;
        const cStepDarkLine = panGridMarginsPreserveWidth(frameWidth, left, right, stepPxDarkLine);
        if (cStepDarkLine.left === left && cStepDarkLine.right === right) break;
        left = cStepDarkLine.left;
        right = cStepDarkLine.right;
      }
    } else if (darkIntrusionSimple) {
      // Alleen een micro-correctie bij lichte signalen; voorkomt doorschieten naar rechts.
      const cMicro = panGridMarginsPreserveWidth(frameWidth, left, right, 1);
      left = cMicro.left;
      right = cMicro.right;
    }
  }
  // Mirror fine-tune: rechter zwarte strook buiten beeld houden (preset "Zwarte lijn (L)").
  if (xRef === 'left' && lockXForDarkLine && darkLineOnRightSide) {
    const darkIntrusionStrong = evaluateRightStripIntrusion(sample, frameWidth, stripHeightCanvas, left, right, top, bottom).intrudes;
    const darkIntrusionSimple = hasSimpleRightDarkIntrusion(sample, frameWidth, stripHeightCanvas, left, right, top, bottom);
    if (darkIntrusionStrong) {
      const edgeCandidates = [];
      const edgeTopBottom = findRightStripBoundaryTopBottom(sample, frameWidth, stripHeightCanvas, top, bottom);
      if (Number.isFinite(edgeTopBottom)) edgeCandidates.push(Math.round(edgeTopBottom));
      const edgeRun = findRightDarkRunStartX(sample, frameWidth, stripHeightCanvas);
      if (edgeRun && Number.isFinite(edgeRun.x)) edgeCandidates.push(Math.round(edgeRun.x));
      if (edgeCandidates.length) {
        const margin = mode === 'strong' ? 3 : 2;
        const maxRightSafe = Math.max(2, Math.min(frameWidth - 1, Math.min(...edgeCandidates) - margin));
        const currentRightEdge = frameWidth - right;
        if (currentRightEdge > maxRightSafe) {
          const needLeft = currentRightEdge - maxRightSafe;
          const maxDarkLineShift = mode === 'strong'
            ? Math.max(20, Math.round(frameWidth * 0.06))
            : Math.max(10, Math.round(frameWidth * 0.03));
          const sxDarkLine = -Math.max(0, Math.min(maxDarkLineShift, needLeft));
          const cDarkLine = panGridMarginsPreserveWidth(frameWidth, left, right, sxDarkLine);
          left = cDarkLine.left;
          right = cDarkLine.right;
        }
      }
      const stepPxDarkLine = 1;
      const maxStepsDarkLine = mode === 'strong' ? 4 : 2;
      for (let i = 0; i < maxStepsDarkLine; i++) {
        if (!hasSimpleRightDarkIntrusion(sample, frameWidth, stripHeightCanvas, left, right, top, bottom)) break;
        const cStepDarkLine = panGridMarginsPreserveWidth(frameWidth, left, right, -stepPxDarkLine);
        if (cStepDarkLine.left === left && cStepDarkLine.right === right) break;
        left = cStepDarkLine.left;
        right = cStepDarkLine.right;
      }
    } else if (darkIntrusionSimple) {
      const cMicro = panGridMarginsPreserveWidth(frameWidth, left, right, -1);
      left = cMicro.left;
      right = cMicro.right;
    }
  }
  // Extra preset: detecteer en verwijder linker witte verticale rand om frame-to-frame shaking te beperken.
  if (xRef === 'right' && targetLeftWhiteEdge) {
    if (hasSimpleLeftWhiteIntrusion(sample, frameWidth, stripHeightCanvas, left, right, top, bottom)) {
      const whiteCandidates = [];
      const leftWhiteMinMarginPx = getAssistLeftWhiteMinMarginPx();
      const whiteTransition = findLeftWhiteToImageTransitionX(sample, frameWidth, stripHeightCanvas, top, bottom, leftWhiteMinMarginPx);
      if (Number.isFinite(whiteTransition)) whiteCandidates.push(Math.round(whiteTransition));
      const topBottomBoundary = findLeftStripBoundaryTopBottom(sample, frameWidth, stripHeightCanvas, top, bottom);
      if (Number.isFinite(topBottomBoundary)) whiteCandidates.push(Math.round(topBottomBoundary));
      if (whiteCandidates.length) {
        const whiteMargin = mode === 'strong' ? 3 : 2;
        const minLeftWhiteSafe = Math.max(0, Math.min(frameWidth - 2, Math.max(...whiteCandidates) + whiteMargin));
        if (left < minLeftWhiteSafe) {
          const needRight = minLeftWhiteSafe - left;
          const maxWhiteShift = mode === 'strong'
            ? Math.max(40, Math.round(frameWidth * 0.12))
            : Math.max(24, Math.round(frameWidth * 0.07));
          const sxWhite = Math.max(0, Math.min(maxWhiteShift, needRight));
          const cWhite = panGridMarginsPreserveWidth(frameWidth, left, right, sxWhite);
          left = cWhite.left;
          right = cWhite.right;
        }
      }
      const whiteStepPx = 1;
      const whiteMaxSteps = mode === 'strong' ? 6 : 4;
      for (let i = 0; i < whiteMaxSteps; i++) {
        if (!hasSimpleLeftWhiteIntrusion(sample, frameWidth, stripHeightCanvas, left, right, top, bottom)) break;
        const cWhiteStep = panGridMarginsPreserveWidth(frameWidth, left, right, whiteStepPx);
        if (cWhiteStep.left === left && cWhiteStep.right === right) break;
        left = cWhiteStep.left;
        right = cWhiteStep.right;
      }
    }
  }
  // Mirror extra preset: detecteer en verwijder rechter witte verticale rand.
  if (xRef === 'left' && targetRightWhiteEdge) {
    if (hasSimpleRightWhiteIntrusion(sample, frameWidth, stripHeightCanvas, left, right, top, bottom)) {
      const whiteCandidates = [];
      const rightWhiteMinMarginPx = getAssistLeftWhiteMinMarginPx();
      const whiteTransition = findRightWhiteToImageTransitionX(sample, frameWidth, stripHeightCanvas, top, bottom, rightWhiteMinMarginPx);
      if (Number.isFinite(whiteTransition)) whiteCandidates.push(Math.round(whiteTransition));
      const topBottomBoundary = findRightStripBoundaryTopBottom(sample, frameWidth, stripHeightCanvas, top, bottom);
      if (Number.isFinite(topBottomBoundary)) whiteCandidates.push(Math.round(topBottomBoundary));
      if (whiteCandidates.length) {
        const whiteMargin = mode === 'strong' ? 3 : 2;
        const maxRightWhiteSafe = Math.max(2, Math.min(frameWidth - 1, Math.min(...whiteCandidates) - whiteMargin));
        const currentRightEdge = frameWidth - right;
        if (currentRightEdge > maxRightWhiteSafe) {
          const needLeft = currentRightEdge - maxRightWhiteSafe;
          const maxWhiteShift = mode === 'strong'
            ? Math.max(40, Math.round(frameWidth * 0.12))
            : Math.max(24, Math.round(frameWidth * 0.07));
          const sxWhite = -Math.max(0, Math.min(maxWhiteShift, needLeft));
          const cWhite = panGridMarginsPreserveWidth(frameWidth, left, right, sxWhite);
          left = cWhite.left;
          right = cWhite.right;
        }
      }
      const whiteStepPx = 1;
      const whiteMaxSteps = mode === 'strong' ? 6 : 4;
      for (let i = 0; i < whiteMaxSteps; i++) {
        if (!hasSimpleRightWhiteIntrusion(sample, frameWidth, stripHeightCanvas, left, right, top, bottom)) break;
        const cWhiteStep = panGridMarginsPreserveWidth(frameWidth, left, right, -whiteStepPx);
        if (cWhiteStep.left === left && cWhiteStep.right === right) break;
        left = cWhiteStep.left;
        right = cWhiteStep.right;
      }
    }
  }
  // Safety: bij "Zwarte"/linker-wit presets nooit extreem naar rechts springen in 1 detect-run.
  if (xRef === 'right' && (lockXForDarkLine || targetLeftWhiteEdge)) {
    const movedRightFromStart = Math.max(0, left - startLeftX);
    const maxPresetRightShift = lockXForDarkLine
      ? (mode === 'strong' ? Math.max(14, Math.round(frameWidth * 0.04)) : Math.max(8, Math.round(frameWidth * 0.022)))
      : (mode === 'strong' ? Math.max(44, Math.round(frameWidth * 0.13)) : Math.max(26, Math.round(frameWidth * 0.075)));
    if (movedRightFromStart > maxPresetRightShift) {
      const pullBack = movedRightFromStart - maxPresetRightShift;
      const cPresetCap = panGridMarginsPreserveWidth(frameWidth, left, right, -pullBack);
      left = cPresetCap.left;
      right = cPresetCap.right;
    }
  }
  if (xRef === 'left' && (targetRightWhiteEdge || (lockXForDarkLine && darkLineOnRightSide))) {
    const movedLeftFromStart = Math.max(0, startLeftX - left);
    const maxPresetLeftShift = lockXForDarkLine
      ? (mode === 'strong' ? Math.max(14, Math.round(frameWidth * 0.04)) : Math.max(8, Math.round(frameWidth * 0.022)))
      : (mode === 'strong' ? Math.max(44, Math.round(frameWidth * 0.13)) : Math.max(26, Math.round(frameWidth * 0.075)));
    if (movedLeftFromStart > maxPresetLeftShift) {
      const pullBack = movedLeftFromStart - maxPresetLeftShift;
      const cPresetCap = panGridMarginsPreserveWidth(frameWidth, left, right, pullBack);
      left = cPresetCap.left;
      right = cPresetCap.right;
    }
  }
  // Micro-bias: bij preset "Zwarte" kan gebruiker de finale links-correctie in px instellen.
  if (xRef === 'right' && lockXForDarkLine) {
    const darkLineLeftBiasPx = getAssistDarkLineLeftBiasPx();
    const manualStrongScale = getAssistDarkLineStrongScale();
    const strongScale = mode === 'strong'
      ? (
          getAssistDarkLineStrongScaleAuto()
            ? suggestDarkLineStrongScaleAuto(sample, frameWidth, stripHeightCanvas, left, right, top, bottom, darkLineLeftBiasPx, manualStrongScale)
            : manualStrongScale
        )
      : 1;
    const effectiveBiasLeft = Math.max(0, Math.round(darkLineLeftBiasPx * strongScale));
    const cBiasLeft = panGridMarginsPreserveWidth(frameWidth, left, right, -effectiveBiasLeft);
    left = cBiasLeft.left;
    right = cBiasLeft.right;
  }
  if (xRef === 'left' && lockXForDarkLine && darkLineOnRightSide) {
    const darkLineLeftBiasPx = getAssistDarkLineLeftBiasPx();
    const manualStrongScale = getAssistDarkLineStrongScale();
    const strongScale = mode === 'strong'
      ? (
          getAssistDarkLineStrongScaleAuto()
            ? suggestDarkLineStrongScaleAutoMirror(sample, frameWidth, stripHeightCanvas, left, right, top, bottom, darkLineLeftBiasPx, manualStrongScale)
            : manualStrongScale
        )
      : 1;
    const effectiveBiasRight = Math.max(0, Math.round(darkLineLeftBiasPx * strongScale));
    const cBiasRight = panGridMarginsPreserveWidth(frameWidth, left, right, effectiveBiasRight);
    left = cBiasRight.left;
    right = cBiasRight.right;
  }
  // Moeilijke frames zonder duidelijke strip-/witrand: lokale dual-edge finesse (X/Y).
  // freezeX (perforatie): geen X-push hier; Y dual-edge mag nog (daarna sprocket-Y).
  if (!freezeX && !lockXForDarkLine && !targetLeftWhiteEdge && !targetRightWhiteEdge) {
    const dualEdgeBoost = Math.max(1, Number(presetCfg && presetCfg.dualEdgeBoost) || 1);
    const dualShiftX = suggestAssistShiftXDualEdge(sample, frameWidth, stripHeightCanvas, left, right, top, bottom, mode, dualEdgeBoost);
    if (dualShiftX !== 0) {
      const cDual = panGridMarginsPreserveWidth(frameWidth, left, right, dualShiftX);
      left = cDual.left;
      right = cDual.right;
    }
    const dualShiftY = suggestAssistShiftYDualEdge(sample, frameWidth, stripHeightCanvas, left, right, top, bottom, mode, dualEdgeBoost);
    if (dualShiftY !== 0) {
      const cvDual = panGridVerticalMarginsPreserveHeight(stripHeightCanvas, top, bottom, dualShiftY);
      top = cvDual.top;
      bottom = cvDual.bottom;
    }
  }
  // Anti-jump guard: bij X-ref rechts geen grote onverwachte sprong naar links tussen gelijkaardige frames.
  if (xRef === 'right' && allowXAutoDetect) {
    const rightWhite = evaluateRightWhiteIntrusion(sample, frameWidth, stripHeightCanvas, left, right, top, bottom);
    const maxLeftBackstep = rightWhite.intrudes
      ? (mode === 'strong'
        ? Math.max(24, Math.round(frameWidth * 0.24))
        : Math.max(16, Math.round(frameWidth * 0.16)))
      : (mode === 'strong' ? 8 : 5);
    const minAllowedLeft = Math.max(0, baselineLeft - maxLeftBackstep);
    if (left < minAllowedLeft) {
      const needRight = minAllowedLeft - left;
      const cBack = panGridMarginsPreserveWidth(frameWidth, left, right, needRight);
      left = cBack.left;
      right = cBack.right;
    }
    // Bewaak ook tegen onverwachte breedteverschuiving door clamp-paths.
    const baselineWidth = Math.max(1, frameWidth - baselineLeft - baselineRight);
    const currentWidth = Math.max(1, frameWidth - left - right);
    if (Math.abs(currentWidth - baselineWidth) > 1) {
      const targetRight = Math.max(0, frameWidth - baselineWidth - left);
      const cWidth = clampGridMarginsCanvas(frameWidth, left, targetRight);
      left = cWidth.left;
      right = cWidth.right;
    }
  }
  // Finale safety-guard: bij duidelijke links-zwarte strook de linker rand nooit links van de overgang laten eindigen.
  if (xRef === 'right' && allowXAutoDetect) {
    const transition = findLeftBlackToImageTransitionByProfile(sample, frameWidth, stripHeightCanvas, top, bottom);
    if (transition && Number.isFinite(transition.x) && Number.isFinite(transition.strength)) {
      const minSafeLeft = Math.max(0, Math.min(frameWidth - 2, Math.round(transition.x + 2)));
      if (left < minSafeLeft) {
        const needRight = minSafeLeft - left;
        const maxSafeShift = mode === 'strong'
          ? Math.max(96, Math.round(frameWidth * 0.45))
          : Math.max(60, Math.round(frameWidth * 0.3));
        const sxSafe = Math.max(0, Math.min(maxSafeShift, needRight));
        const cSafe = panGridMarginsPreserveWidth(frameWidth, left, right, sxSafe);
        left = cSafe.left;
        right = cSafe.right;
      }
    }
  }
  // Globale safety-guard: raster mag nooit links van globale zwarte-strookgrens eindigen.
  if (xRef === 'right' && allowXAutoDetect) {
    const g = findGlobalLeftStripBoundaryX(sample, frameWidth, stripHeightCanvas);
    if (g && Number.isFinite(g.x)) {
      const minGlobalLeft = Math.max(0, Math.min(frameWidth - 2, Math.round(g.x + 2)));
      if (left < minGlobalLeft) {
        const needRight = minGlobalLeft - left;
        const maxGlobalShift = mode === 'strong'
          ? Math.max(120, Math.round(frameWidth * 0.5))
          : Math.max(80, Math.round(frameWidth * 0.35));
        const sxGlobal = Math.max(0, Math.min(maxGlobalShift, needRight));
        const cGlobal = panGridMarginsPreserveWidth(frameWidth, left, right, sxGlobal);
        left = cGlobal.left;
        right = cGlobal.right;
      }
    }
  }
  // Finale rechter-grens lock: align op globale overgang beeld->wit rechts.
  if (xRef === 'right' && allowXAutoDetect) {
    const rb = findGlobalRightImageBoundaryX(sample, frameWidth, stripHeightCanvas);
    if (rb && Number.isFinite(rb.x)) {
      const curRightEdge = frameWidth - right;
      const targetRightEdge = Math.max(2, Math.min(frameWidth - 2, Math.round(rb.x - 2)));
      const needShift = Math.round(targetRightEdge - curRightEdge);
      // Rechter-lock mag alleen naar rechts corrigeren; nooit meer links terugtrekken.
      if (needShift > 0) {
        const maxRightLockShift = mode === 'strong'
          ? Math.max(96, Math.round(frameWidth * 0.32))
          : Math.max(64, Math.round(frameWidth * 0.22));
        const sxLock = Math.max(-maxRightLockShift, Math.min(maxRightLockShift, needShift));
        const cRightLock = panGridMarginsPreserveWidth(frameWidth, left, right, sxLock);
        left = cRightLock.left;
        right = cRightLock.right;
      }
    }
  }
  // Extra robuuste guard: uniforme donkere linker strook (filmrand) nooit binnen raster laten.
  if (xRef === 'right' && allowXAutoDetect) {
    const darkStripEnd = findUniformLeftDarkStripEndX(sample, frameWidth, stripHeightCanvas, top, bottom);
    if (Number.isFinite(darkStripEnd)) {
      const minLeftFromUniformStrip = Math.max(0, Math.min(frameWidth - 2, Math.round(darkStripEnd + 2)));
      if (left < minLeftFromUniformStrip) {
        const needRight = minLeftFromUniformStrip - left;
        const maxUniformShift = mode === 'strong'
          ? Math.max(128, Math.round(frameWidth * 0.52))
          : Math.max(86, Math.round(frameWidth * 0.36));
        const sxUniform = Math.max(0, Math.min(maxUniformShift, needRight));
        const cUniform = panGridMarginsPreserveWidth(frameWidth, left, right, sxUniform);
        left = cUniform.left;
        right = cUniform.right;
      }
    }
  }
  // Extra harde linkergrens: bij donkere linker strook raster altijd rechts van strookeinde houden.
  if (xRef === 'right' && allowXAutoDetect) {
    const darkRun = findLeftDarkRunEndX(sample, frameWidth, stripHeightCanvas);
    if (darkRun && Number.isFinite(darkRun.x)) {
      const minLeftFromDarkRun = Math.max(0, Math.min(frameWidth - 2, Math.round(darkRun.x + 2)));
      if (left < minLeftFromDarkRun) {
        const needRight = minLeftFromDarkRun - left;
        const maxDarkRunShift = mode === 'strong'
          ? Math.max(120, Math.round(frameWidth * 0.5))
          : Math.max(80, Math.round(frameWidth * 0.35));
        const sxDark = Math.max(0, Math.min(maxDarkRunShift, needRight));
        const cDark = panGridMarginsPreserveWidth(frameWidth, left, right, sxDark);
        left = cDark.left;
        right = cDark.right;
      }
    }
  }
  // Deterministische eindstap: als zwarte strook links nog in raster valt, verder naar rechts pannen tot weg.
  if (xRef === 'right' && allowXAutoDetect) {
    const pushed = pushGridRightOutOfLeftStrip(sample, frameWidth, stripHeightCanvas, left, right, top, bottom, mode, baselineLeft);
    left = pushed.left;
    right = pushed.right;
  }
  // Harde simpele fallback: globale donker->helder rand links afdwingen.
  if (xRef === 'right' && allowXAutoDetect) {
    const hardEdgeX = findGlobalLeftDarkToBrightEdgeX(sample, frameWidth, stripHeightCanvas);
    if (Number.isFinite(hardEdgeX)) {
      const hardMargin = mode === 'strong' ? 8 : 6;
      const minLeftHard = Math.max(0, Math.min(frameWidth - 2, Math.round(hardEdgeX + hardMargin)));
      if (left < minLeftHard) {
        const needRight = minLeftHard - left;
        const maxHardShift = mode === 'strong'
          ? Math.max(150, Math.round(frameWidth * 0.56))
          : Math.max(110, Math.round(frameWidth * 0.42));
        const sxHard = Math.max(0, Math.min(maxHardShift, needRight));
        const cHard = panGridMarginsPreserveWidth(frameWidth, left, right, sxHard);
        left = cHard.left;
        right = cHard.right;
      }
    }
  }
  // Top+bottom fallback: afdwingen op basis van linker strook buiten middeninhoud.
  if (xRef === 'right' && allowXAutoDetect) {
    const tbBoundary = findLeftStripBoundaryTopBottom(sample, frameWidth, stripHeightCanvas, top, bottom);
    if (Number.isFinite(tbBoundary)) {
      const minLeftTB = Math.max(0, Math.min(frameWidth - 2, Math.round(tbBoundary + 3)));
      if (left < minLeftTB) {
        const needRight = minLeftTB - left;
        const maxTBShift = mode === 'strong'
          ? Math.max(150, Math.round(frameWidth * 0.6))
          : Math.max(110, Math.round(frameWidth * 0.45));
        const sxTB = Math.max(0, Math.min(maxTBShift, needRight));
        const cTB = panGridMarginsPreserveWidth(frameWidth, left, right, sxTB);
        left = cTB.left;
        right = cTB.right;
      }
    }
  }
  // Simpele robuuste eindstap: zolang linker strook duidelijk donker blijft, in kleine stappen naar rechts schuiven.
  if (xRef === 'right' && allowXAutoDetect) {
    const stepPx = mode === 'strong' ? 4 : 3;
    const maxSteps = mode === 'strong' ? 24 : 18;
    for (let i = 0; i < maxSteps; i++) {
      if (!hasSimpleLeftDarkIntrusion(sample, frameWidth, stripHeightCanvas, left, right, top, bottom)) break;
      const cStep = panGridMarginsPreserveWidth(frameWidth, left, right, stepPx);
      if (cStep.left === left && cStep.right === right) break;
      left = cStep.left;
      right = cStep.right;
    }
  }
  // Harde stability-regel voor X-ref rechts: nooit links eindigen t.o.v. start van deze detectie-run.
  if (xRef === 'right' && allowXAutoDetect && left < startLeftX) {
    const needRight = startLeftX - left;
    const cNoLeft = panGridMarginsPreserveWidth(frameWidth, left, right, needRight);
    left = cNoLeft.left;
    right = cNoLeft.right;
  }
  // Fine-tune: beperk de totale auto-X-push bij normale presets om overshoot te vermijden.
  if (xRef === 'right' && allowXAutoDetect) {
    const movedRightFromStart = Math.max(0, left - startLeftX);
    const maxAutoRightShift = mode === 'strong'
      ? Math.max(150, Math.round(frameWidth * 0.36))
      : Math.max(72, Math.round(frameWidth * 0.18));
    if (movedRightFromStart > maxAutoRightShift) {
      const pullBack = movedRightFromStart - maxAutoRightShift;
      const cBudget = panGridMarginsPreserveWidth(frameWidth, left, right, -pullBack);
      left = cBudget.left;
      right = cBudget.right;
    }
  }
  const sprocketYTarget = isAssistPresetSprocketYTarget();
  let sprocketHealthCtx = null;
  let tipEdgeForHealth = NaN;
  if (yRef === 'bottom' && !darkLineYTarget && !sprocketYTarget) {
    const currentBottomEdge = stripHeightCanvas - bottom;
    const tri = findBottomBySideTriangles(sample, frameWidth, stripHeightCanvas, left, right, currentBottomEdge, mode);
    if (Number.isFinite(tri.yCanvas)) {
      const shift = Math.round(tri.yCanvas - currentBottomEdge);
      if (shift !== 0) {
        const maxShift = mode === 'strong' ? Math.max(120, Math.round(stripHeightCanvas * 0.2)) : Math.max(80, Math.round(stripHeightCanvas * 0.14));
        const s = Math.max(-maxShift, Math.min(maxShift, shift));
        const cvTri = panGridVerticalMarginsPreserveHeight(stripHeightCanvas, top, bottom, s);
        top = cvTri.top;
        bottom = cvTri.bottom;
      }
    }
  }
  if (sprocketYTarget) {
    const gridH0 = Math.max(20, stripHeightCanvas - top - bottom);
    const sprocketRight = isAssistPresetSprocketRight();
    const tipPickOpts = { wideSearch: fromScanNav || mode === 'strong' };
    let anchors;
    let facingGaps;
    let pair;
    if (sprocketRight) {
      anchors = findRightTriangleTipAnchors(sample, frameWidth, stripHeightCanvas, mode);
      facingGaps = { topGap: null, bottomGap: null };
      pair = pickTopBottomTriangleAnchorsSprocketRight(anchors, gridH0, stripHeightCanvas, sample, frameWidth, tipPickOpts);
    } else {
      // Handmatig: 1× Driehoek %. Auto/scan-nav: user + één extreme indien nodig
      const bestDet = findBestLeftSprocketDetection(
        sample,
        frameWidth,
        stripHeightCanvas,
        gridH0,
        mode,
        {
          tipPickOpts,
          nearTopY: top,
          nearBottomY: stripHeightCanvas - bottom,
          multiPass: fromScanNav
        }
      );
      anchors = bestDet.anchors;
      facingGaps = bestDet.facingGaps;
      pair = bestDet.pair;
      // Gebruik winnende gevoeligheid voor latere X-overlay zoekacties in dit detect-blok
      triangleSensitivityOverride = bestDet.sensitivity;
    }
    // Bewaar voor foute-scan check na placeGrid
    sprocketHealthCtx = {
      sprocketRight,
      anchors,
      facingGaps,
      pair
    };
    const maxShift = mode === 'strong'
      ? Math.max(220, Math.round(stripHeightCanvas * 0.28))
      : Math.max(160, Math.round(stripHeightCanvas * 0.22));
    const tipCfgY = getAssistPresetConfig();
    const yBias = mode === 'strong'
      ? Math.round(Number(tipCfgY && tipCfgY.triangleYBiasStrong) || 0)
      : Math.round(Number(tipCfgY && tipCfgY.triangleYBiasSoft) || 0);
    const useBothTips = !!(pair.top && pair.bottom);
    const useFacingBottom = !!(facingGaps && facingGaps.bottomGap && Number.isFinite(facingGaps.bottomGap.meetY));
    const useFacingTop = !!(facingGaps && facingGaps.topGap && Number.isFinite(facingGaps.topGap.meetY));

    // 1) Horizontaal (Y)
    if (!sprocketRight && (useFacingBottom || useFacingTop)) {
      /*
       * Stabiele frametips (niet naad-midden dat wisselt als één tip mist):
       * - bovenkant huidig frame = lower tip van topGap
       * - onderkant huidig frame = upper tip van bottomGap
       * Kleine |sPick| = tip-ruis → negeren/dempen; grote sprong blijft absoluut.
       */
      let sPick = 0;
      const topEdgeY = facingGaps.topGap
        ? (facingGaps.topGap.lower && Number.isFinite(facingGaps.topGap.lower.y)
          ? facingGaps.topGap.lower.y
          : facingGaps.topGap.meetY)
        : NaN;
      const botEdgeY = facingGaps.bottomGap
        ? (facingGaps.bottomGap.upper && Number.isFinite(facingGaps.bottomGap.upper.y)
          ? facingGaps.bottomGap.upper.y
          : facingGaps.bottomGap.meetY)
        : NaN;
      if (Number.isFinite(topEdgeY) && Number.isFinite(botEdgeY)) {
        const shiftTop = (topEdgeY + yBias) - top;
        const shiftBot = (botEdgeY + yBias) - (stripHeightCanvas - bottom);
        sPick = Math.round(shiftTop * 0.45 + shiftBot * 0.55);
      } else if (Number.isFinite(botEdgeY)) {
        sPick = Math.round((botEdgeY + yBias) - (stripHeightCanvas - bottom));
        // Alleen-onder anker: begrens grote sprong omlaag (voorkomt “plakken” aan strip-/display-bodem)
        if (sPick > 0) {
          const downCap = Math.max(24, Math.round(gridH0 * 0.03));
          sPick = Math.min(sPick, downCap);
        }
      } else if (Number.isFinite(topEdgeY)) {
        sPick = Math.round((topEdgeY + yBias) - top);
      }
      const noise = Math.max(10, Math.round(gridH0 * 0.004));
      const softCap = Math.max(36, Math.round(gridH0 * 0.02));
      let sDirect = 0;
      if (Math.abs(sPick) <= noise) {
        sDirect = 0; // tip-speling / ruis
      } else if (fromScanNav && Math.abs(sPick) <= softCap * 2.2) {
        // Middelgrote correctie bij Volgende: dempen (voorkomt omhoog/omlaag-jitter)
        sDirect = Math.max(-softCap, Math.min(softCap, Math.round(sPick * 0.7)));
      } else {
        const largeJump = Math.abs(sPick) > maxShift * 0.7;
        const allowAbsoluteY = fromScanNav || largeJump || useFacingBottom;
        sDirect = allowAbsoluteY
          ? Math.round(sPick)
          : Math.max(-maxShift, Math.min(maxShift, Math.round(sPick)));
      }
      if (sDirect !== 0) {
        const cv = panGridVerticalMarginsPreserveHeight(stripHeightCanvas, top, bottom, sDirect);
        top = cv.top;
        bottom = cv.bottom;
      }
    } else if (useBothTips) {
      let topTargetY = pair.top.y + yBias;
      if (sprocketRight) {
        // Vermijd bruine balk: geen vorig-frame-vloer als top; snap naar aperture-lijn
        if (tipLooksLikePreviousFrameBottom(sample, pair.top.y, frameWidth)) {
          topTargetY = (pair.bottom.y + yBias) - gridH0;
        } else {
          topTargetY = refineTopTipToApertureDarkLine(
            sample,
            pair.top.y,
            frameWidth,
            left,
            right
          ) + yBias;
        }
      }
      const shiftTop = topTargetY - top;
      const shiftBot = (pair.bottom.y + yBias) - (stripHeightCanvas - bottom);
      const tipSpan = pair.bottom.y - pair.top.y;
      const gridHNow = Math.max(20, stripHeightCanvas - top - bottom);
      let sPick;
      if (sprocketRight) {
        // Rechts: bovenkant (na refine) leidend — vaste hoogte
        sPick = shiftTop;
      } else if (tipSpan > gridHNow + 12) {
        sPick = shiftTop;
      } else if (tipSpan < gridHNow - 12) {
        sPick = Math.round(shiftTop * 0.65 + shiftBot * 0.35);
      } else {
        sPick = Math.round((shiftTop + shiftBot) * 0.5);
      }
      /*
       * Grote onderlinge scanverschuivingen: niet afklemmen op maxShift.
       * Auto ▶ droeg het oude raster mee; de tip-correctie bleef dan half steken → systematische fout.
       */
      const largeJump = Math.abs(sPick) > maxShift * 0.7;
      const allowAbsoluteY = fromScanNav || largeJump;
      const sDirect = allowAbsoluteY
        ? Math.round(sPick)
        : Math.max(-maxShift, Math.min(maxShift, sPick));
      if (sDirect !== 0) {
        const cv = panGridVerticalMarginsPreserveHeight(stripHeightCanvas, top, bottom, sDirect);
        top = cv.top;
        bottom = cv.bottom;
      }
    } else if (yRef === 'top' && pair.top) {
      const s = Math.round((pair.top.y + yBias) - top);
      const allowAbsoluteY = fromScanNav || Math.abs(s) > maxShift * 0.7;
      const sDirect = allowAbsoluteY ? s : Math.max(-maxShift, Math.min(maxShift, s));
      if (sDirect !== 0) {
        const cv = panGridVerticalMarginsPreserveHeight(stripHeightCanvas, top, bottom, sDirect);
        top = cv.top;
        bottom = cv.bottom;
      }
    } else if ((yRef === 'bottom' || yRef === 'both') && pair.bottom) {
      let s = Math.round((pair.bottom.y + yBias) - (stripHeightCanvas - bottom));
      // Zonder betrouwbare top-tip: geen grote sprong omlaag
      if (!pair.top && s > 0) {
        const downCap = Math.max(24, Math.round(gridH0 * 0.03));
        s = Math.min(s, downCap);
      }
      const allowAbsoluteY = fromScanNav || Math.abs(s) > maxShift * 0.7;
      const sDirect = allowAbsoluteY ? s : Math.max(-maxShift, Math.min(maxShift, s));
      if (sDirect !== 0) {
        const cv = panGridVerticalMarginsPreserveHeight(stripHeightCanvas, top, bottom, sDirect);
        top = cv.top;
        bottom = cv.bottom;
      }
    } else if (!sprocketRight) {
      // Fallback links: oude lokale zoektocht rond huidige randen
      const searchRight0 = Math.max(left, Math.round(frameWidth * 0.12));
      const shifts = [];
      if (yRef === 'top' || yRef === 'both') {
        const curTopEdge = top;
        let target = findLeftTriangleTipYNear(sample, frameWidth, curTopEdge, searchRight0, mode, false);
        if (Number.isFinite(target)) {
          target = refineLeftTriangleTipYFullRes(canvas, target, searchRight0, frameWidth, false);
        }
        if (Number.isFinite(target)) shifts.push(target - curTopEdge);
      }
      if (yRef === 'bottom' || yRef === 'both') {
        const curBottomEdge = stripHeightCanvas - bottom;
        let target = findLeftTriangleTipYNear(sample, frameWidth, curBottomEdge, searchRight0, mode, true);
        if (Number.isFinite(target)) {
          target = refineLeftTriangleTipYFullRes(canvas, target, searchRight0, frameWidth, true);
        }
        if (Number.isFinite(target)) shifts.push(target - curBottomEdge);
      }
      if (shifts.length) {
        const avgShift = shifts.reduce((a, b) => a + b, 0) / shifts.length;
        let sDirect = Math.round(avgShift);
        if (sDirect === 0 && Math.abs(avgShift) >= 0.25) sDirect = avgShift > 0 ? 1 : -1;
        const allowAbsoluteY = fromScanNav || Math.abs(sDirect) > maxShift * 0.7;
        if (!allowAbsoluteY) sDirect = Math.max(-maxShift, Math.min(maxShift, sDirect));
        if (sDirect !== 0) {
          const cvSp = panGridVerticalMarginsPreserveHeight(stripHeightCanvas, top, bottom, sDirect);
          top = cvSp.top;
          bottom = cvSp.bottom;
        }
      }
    }

    if (yRef === 'bottom' || yRef === 'both') {
      const darkBottomBiasPx = getAssistDarkBottomBiasPx();
      if (darkBottomBiasPx !== 0) {
        const cvBottomBias = panGridVerticalMarginsPreserveHeight(
          stripHeightCanvas,
          top,
          bottom,
          -darkBottomBiasPx
        );
        top = cvBottomBias.top;
        bottom = cvBottomBias.bottom;
      }
    }

    // 2) Verticaal (X): zelfde overlay-driehoek als Y — absolute plaatsing op tipX
    if (isAssistPresetTriangleTipsXTarget()) {
      const tipCfg = getAssistPresetConfig();
      const tipInset = mode === 'strong'
        ? Math.round(Number(tipCfg && tipCfg.triangleInsetStrong) || 0)
        : Math.round(Number(tipCfg && tipCfg.triangleInsetSoft) || 0);

      const applyLeftFromTipEdge = (tipEdge) => {
        if (!Number.isFinite(tipEdge)) return false;
        const maxBand = Math.round(frameWidth * 0.2);
        const minBand = Math.round(frameWidth * 0.045);
        if (tipEdge < minBand || tipEdge > maxBand) return false;
        const targetLeft = Math.round(tipEdge + tipInset);
        const d = targetLeft - left;
        if (d === 0) return true;
        // Absolute pan (breedte vast); limiet ruim genoeg na Center, maar niet voorbij ~22% breedte
        const maxD = Math.max(320, Math.round(frameWidth * 0.22));
        const dd = Math.max(-maxD, Math.min(maxD, d));
        const cX = panGridMarginsPreserveWidth(frameWidth, left, right, dd);
        left = cX.left;
        right = cX.right;
        return true;
      };

      let placedX = false;
      if (!sprocketRight) {
        /*
         * Primair: tipX van dezelfde naad-overlay als Y (inwaartse punt).
         * Neem de meest linkse betrouwbare tip — voorkomt trek naar heldere lijnen rechts.
         * Geen full-res refine.
         */
        const tipVals = [];
        const collect = (v, score) => {
          if (!Number.isFinite(v)) return;
          const maxBand = Math.round(frameWidth * 0.2);
          const minBand = Math.round(frameWidth * 0.045);
          if (v < minBand || v > maxBand) return;
          tipVals.push({ x: v, score: Number.isFinite(score) ? score : 0.55 });
        };
        const gatherGap = (gap) => {
          if (!gap) return;
          collect(gap.tipX, gap.upper && gap.upper.score);
          if (gap.upper) collect(gap.upper.tipX, gap.upper.score);
          if (gap.lower) collect(gap.lower.tipX, gap.lower.score);
        };
        if (useFacingBottom || useFacingTop) {
          gatherGap(facingGaps.topGap);
          gatherGap(facingGaps.bottomGap);
        }
        // Alleen opnieuw zoeken als Y-ankers geen bruikbare tipX gaven
        if (!tipVals.length) {
          const yFocusList = [top, stripHeightCanvas - bottom];
          for (let yi = 0; yi < yFocusList.length; yi++) {
            const hit = searchLeftTriangleOverlayNear(sample, frameWidth, yFocusList[yi], mode, {
              searchYCanvas: Math.max(28, Math.round(gridH0 * 0.08)),
              pixelSlack: 2
            });
            if (hit) collect(hit.tipX, hit.score);
          }
        }
        if (tipVals.length) {
          tipVals.sort((a, b) => b.score - a.score || a.x - b.x);
          // Beste score; bij gelijke score de meest linkse
          const topScore = tipVals[0].score;
          const strong = tipVals.filter((t) => t.score >= topScore - 0.06);
          strong.sort((a, b) => a.x - b.x);
          // Mediaan van de linkse sterke hits (niet de rechtse uitbijter)
          const tipEdge = strong[Math.floor((strong.length - 1) * 0.35)];
          tipEdgeForHealth = tipEdge.x;
          placedX = applyLeftFromTipEdge(tipEdge.x);
        }
        // Geen hit → X ongemoeid laten (Center blijft staan i.p.v. naar rechts springen)
      } else {
        // Rechts: bestaande tip-logica
        const tipCandidates = [];
        if (pair.top && Number.isFinite(pair.top.tipX)) tipCandidates.push(pair.top.tipX);
        if (pair.bottom && Number.isFinite(pair.bottom.tipX)) tipCandidates.push(pair.bottom.tipX);
        if (tipCandidates.length) {
          tipCandidates.sort((a, b) => a - b);
          const tipEdge = tipCandidates[Math.floor(tipCandidates.length / 2)];
          tipEdgeForHealth = tipEdge;
          const targetRightEdge = Math.round(tipEdge - tipInset);
          const curRightEdge = frameWidth - right;
          const d = targetRightEdge - curRightEdge;
          if (d !== 0) {
            const maxDDefault = Math.max(260, Math.round(frameWidth * 0.28));
            const allowAbsoluteX = fromScanNav || Math.abs(d) > maxDDefault * 0.7;
            const maxD = allowAbsoluteX
              ? Math.max(frameWidth, Math.round(frameWidth * 0.95))
              : maxDDefault;
            const dd = Math.max(-maxD, Math.min(maxD, d));
            const cX = panGridMarginsPreserveWidth(frameWidth, left, right, dd);
            left = cX.left;
            right = cX.right;
            placedX = true;
          }
        }
      }
      void placedX;
    }
    // Multi-pass override altijd resetten (ook als X-pad werd overgeslagen)
    triangleSensitivityOverride = null;
  }
  if (darkLineYTarget) {
    const x0 = Math.max(0, left + Math.round(frameWidth * 0.08));
    const x1 = Math.max(x0 + 2, frameWidth - right - Math.round(frameWidth * 0.08));
    const tThick = getAssistDarkLineThicknessT();
    // Gebruikers-zoekbereik (± px rond huidige rand); dikte mag iets verruimen/versmallen
    const baseRange = getAssistDarkLineSearchRangePx();
    const targetRange = Math.max(
      20,
      Math.round(baseRange * (0.85 + 0.3 * tThick) * (mode === 'strong' ? 1.1 : 1))
    );
    const shifts = [];
    if (yRef === 'top' || yRef === 'both') {
      const curTopEdge = top;
      let topTarget = findBestDarkLineY(sample, curTopEdge, targetRange, x0, x1, 'topInner');
      const refinedTop = refineThinDarkLineYFullRes(canvas, topTarget.yCanvas, x0, x1, 'topInner');
      if (refinedTop && Number.isFinite(refinedTop.yCanvas)) topTarget = refinedTop;
      if (Number.isFinite(topTarget.yCanvas)) shifts.push(topTarget.yCanvas - curTopEdge);
    }
    if (yRef === 'bottom' || yRef === 'both') {
      const curBottomEdge = stripHeightCanvas - bottom;
      let bottomTarget = findBestDarkLineY(sample, curBottomEdge, targetRange, x0, x1, 'bottomInner');
      const refinedBot = refineThinDarkLineYFullRes(canvas, bottomTarget.yCanvas, x0, x1, 'bottomInner');
      if (refinedBot && Number.isFinite(refinedBot.yCanvas)) bottomTarget = refinedBot;
      if (Number.isFinite(bottomTarget.yCanvas)) shifts.push(bottomTarget.yCanvas - curBottomEdge);
    }
    if (shifts.length) {
      const avgShift = shifts.reduce((a, b) => a + b, 0) / shifts.length;
      const maxShift = Math.max(
        48,
        Math.min(
          Math.round(stripHeightCanvas * (mode === 'strong' ? 0.14 : 0.1)),
          Math.round(baseRange * 1.25)
        )
      );
      let sDirect = Math.round(avgShift);
      // Dode zone: dun toleranter voor 1 px; dik iets ruimer tegen ruis
      const dead = tThick < 0.35 ? 1 : 2;
      if (Math.abs(sDirect) < dead) sDirect = 0;
      sDirect = Math.max(-maxShift, Math.min(maxShift, sDirect));
      if (sDirect !== 0) {
        const cvDark = panGridVerticalMarginsPreserveHeight(stripHeightCanvas, top, bottom, sDirect);
        top = cvDark.top;
        bottom = cvDark.bottom;
      }
    }
  }
  if (darkLineYTarget && (yRef === 'bottom' || yRef === 'both')) {
    const darkBottomBiasPx = getAssistDarkBottomBiasPx();
    if (darkBottomBiasPx !== 0) {
      // Positieve bias trimt extra van onder (raster visueel iets omhoog).
      const cvBottomBias = panGridVerticalMarginsPreserveHeight(
        stripHeightCanvas,
        top,
        bottom,
        -darkBottomBiasPx
      );
      top = cvBottomBias.top;
      bottom = cvBottomBias.bottom;
    }
  }
  // Zwarte-lijn: Y is goed, maar X stond vroeger vrijwel uit → altijd manueel.
  // Gerichte X-snap rond huidige rand (zoekbereik) + full-res refine; geen half-frame scan.
  if (lockXForDarkLine && !freezeX) {
    const yBand0 = Math.max(0, top + Math.round(stripHeightCanvas * 0.05));
    const yBand1 = Math.max(yBand0 + 8, stripHeightCanvas - bottom - Math.round(stripHeightCanvas * 0.05));
    const searchRange = getAssistDarkLineSearchRangePx();
    const side = xRef === 'left' ? 'left' : 'right';
    const curEdgeX = side === 'right' ? frameWidth - right : left;
    let targetEdge = findBestVerticalFrameEdgeX(
      sample,
      frameWidth,
      stripHeightCanvas,
      top,
      bottom,
      side,
      curEdgeX,
      searchRange,
      mode,
      { distPenaltyScale: 0.85 }
    );
    const refinedX = refineVerticalEdgeXFullRes(
      canvas,
      targetEdge,
      yBand0,
      yBand1,
      side === 'right'
    );
    if (refinedX && Number.isFinite(refinedX.xCanvas)) targetEdge = refinedX.xCanvas;
    let sx = Math.round(targetEdge - curEdgeX);
    const deadX = 1;
    if (Math.abs(sx) < deadX) sx = 0;
    const maxDarkX = mode === 'strong'
      ? Math.max(36, Math.min(Math.round(searchRange * 1.1), Math.round(frameWidth * 0.12)))
      : Math.max(22, Math.min(Math.round(searchRange * 0.9), Math.round(frameWidth * 0.08)));
    sx = Math.max(-maxDarkX, Math.min(maxDarkX, sx));
    if (sx !== 0) {
      const cDarkX = panGridMarginsPreserveWidth(frameWidth, left, right, sx);
      left = cDarkX.left;
      right = cDarkX.right;
    }
  }
  // Gebruikers-offsets ná detectie (tooltips: "na detectie"). Moeten de laatste Y/X-stap zijn.
  const extraLeftPx = getAssistExtraLeftPx();
  const extraRightPx = getAssistExtraRightPx();
  const extraShiftX = extraLeftPx - extraRightPx;
  if (extraShiftX !== 0) {
    const cExtraX = panGridMarginsPreserveWidth(frameWidth, left, right, extraShiftX);
    left = cExtraX.left;
    right = cExtraX.right;
  }
  const extraTopPx = getAssistExtraTopPx();
  const extraBottomPx = getAssistExtraBottomPx();
  const extraShiftY = extraTopPx - extraBottomPx;
  if (extraShiftY !== 0) {
    const cExtraY = panGridVerticalMarginsPreserveHeight(stripHeightCanvas, top, bottom, extraShiftY);
    top = cExtraY.top;
    bottom = cExtraY.bottom;
  }
  // Laatste Y-lock (perforatie): uitgeschakeld — trok high-key frames weer van tip-ankers af.
  // (Ankers hierboven zijn de enige Y-bron voor sprocket-left.)

  /*
   * Hard formaat-slot: Detecteer Grenzen mag alleen verschuiven.
   * Eerdere clamps/pan met Math.max(0,top) of asymmetrische Y-clamp kapten breedte/hoogte af
   * → “buiten beeld” + rasterformaat opnieuw invoeren.
   */
  {
    const lockW = Math.max(1, Math.round(frameWidth - baselineLeft - baselineRight));
    const lockH = Math.max(1, Math.round(stripHeightCanvas - baselineTop - baselineBottom));
    const placed = placeGridPreserveSize(frameWidth, stripHeightCanvas, lockW, lockH, left, top, {
      preferOnStrip: true
    });
    left = placed.left;
    right = placed.right;
    top = placed.top;
    bottom = placed.bottom;
  }

  let badScanPayload = null;
  // Perforatie-preset: altijd health-check (ook als ankerblok om een of andere reden leeg bleef)
  if (sprocketHealthCtx || isAssistPresetSprocketYTarget()) {
    const health = evaluateSprocketScanHealth({
      ...(sprocketHealthCtx || { sprocketRight: isAssistPresetSprocketRight(), anchors: [], facingGaps: {}, pair: {} }),
      tipEdge: tipEdgeForHealth,
      frameWidth,
      stripHeight: stripHeightCanvas,
      left,
      right,
      top,
      bottom,
      sample,
      stripCanvas: canvas,
      fromScanNav,
      mode
    });
    if (!health.ok) {
      badScanPayload = {
        badScan: true,
        message: health.message || t('status.autoAdvanceBadScan')
      };
      // Geen UI-fouttekst meer; Auto ▶ stopt stil bij perforatie-health-fail
    }
  }

  const cur = getState();
  const prevM = getEffectiveGridMargins(frameWidth);
  const prevTop = Number(cur.gridOffsetY) || 0;
  const prevBottom = Number.isFinite(Number(cur.gridOffsetYBottom)) ? Math.round(Number(cur.gridOffsetYBottom)) : 0;
  if (left === prevM.left && right === prevM.right && top === prevTop && bottom === prevBottom) {
    if (badScanPayload) return { changed: false, ...badScanPayload };
    return false;
  }
  setGridOffsetXMargins(left, right);
  setGridOffsetYOnly(top);
  setGridOffsetYBottom(bottom);
  syncGridSplitLowerPanClamp();
  setDirty();
  updateUI();
  const dim = getScaledDimensions(canvas);
  if (dim && dim.width >= 1 && dim.height >= 1 && canvas.height > 0) {
    const scale = dim.height / canvas.height;
    refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale, undefined, canvas.width));
  } else {
    refreshPreviewsGridOnly();
  }
  if (badScanPayload) return { changed: true, ...badScanPayload };
  return true;
}

function onCenterGridFromPreview() {
  const canvas = getStripCanvas();
  const { frameWidth, frameHeight } = getFrameDimensions(canvas);
  if (!canvas || frameWidth < 1 || frameHeight < 1) return false;
  const s = getState();
  const n = Math.max(1, s.numFrames || 1);
  const stripHeightCanvas = frameHeight * n;
  const m = getEffectiveGridMargins(frameWidth);
  const centered = centerGridMarginsPreserveSize(
    frameWidth,
    stripHeightCanvas,
    m.left,
    m.right,
    Number(s.gridOffsetY) || 0,
    Number.isFinite(Number(s.gridOffsetYBottom)) ? Math.round(Number(s.gridOffsetYBottom)) : 0,
    frameHeight,
    n
  );
  const prevTop = Number(s.gridOffsetY) || 0;
  const prevBottom = Number.isFinite(Number(s.gridOffsetYBottom)) ? Math.round(Number(s.gridOffsetYBottom)) : 0;
  if (centered.left === m.left && centered.right === m.right && centered.top === prevTop && centered.bottom === prevBottom) return false;
  setGridOffsetXMargins(centered.left, centered.right);
  setGridOffsetYOnly(centered.top);
  setGridOffsetYBottom(centered.bottom);
  syncGridSplitLowerPanClamp();
  setDirty();
  updateUI();
  const dim = getScaledDimensions(canvas);
  if (dim && dim.width >= 1 && dim.height >= 1 && canvas.height > 0) {
    const scale = dim.height / canvas.height;
    refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale, undefined, canvas.width));
  } else {
    refreshPreviewsGridOnly();
  }
  return true;
}

function bind() {
  el(ids.newProject)?.addEventListener('click', onNewProjectClick);
  el(ids.projectStarten)?.addEventListener('click', onProjectStartenClick);
  el(ids.openProject)?.addEventListener('click', onOpenProjectClick);
  el(ids.openProjectFile)?.addEventListener('click', onOpenProjectFileClick);
  el(ids.suggestProjectFolder)?.addEventListener('click', () => { onSuggestProjectFolderClick().catch(() => {}); });
  el(ids.saveProject)?.addEventListener('click', onSaveProjectClick);
  el(ids.deleteProject)?.addEventListener('click', onDeleteProjectClick);
  el(ids.closeProject)?.addEventListener('click', () => { onCloseProjectClick().catch(() => {}); });
  el(ids.showNewProjectForm)?.addEventListener('click', onShowNewProjectForm);
  el(ids.pickProjectFolder)?.addEventListener('click', onPickProjectFolder);
  el(ids.pickLocation)?.addEventListener('click', onPickLocation);
  el(ids.refreshScanCount)?.addEventListener('click', onRefreshScanCount);
  el(ids.scanCountUseCurrent)?.addEventListener('click', () => { onScanCountUseCurrent().catch(() => {}); });
  el(ids.scanCountManual)?.addEventListener('change', () => { onScanCountManualToggle().catch(() => {}); });
  el(ids.scanCount)?.addEventListener('change', function () {
    if (!isManualScanCountEnabled()) return;
    const scanCountEl = el(ids.scanCount);
    const v = Math.max(0, Math.round(Number(scanCountEl?.value) || 0));
    if (scanCountEl) scanCountEl.value = String(v);
  });
  el(ids.refreshScanList)?.addEventListener('click', onRefreshScanList);
  el(ids.timecodeFps)?.addEventListener('change', onTimecodeFpsChange);
  el(ids.timecodeFps)?.addEventListener('input', onTimecodeFpsChange);
  el(ids.createProject)?.addEventListener('click', onCreateProject);
  el(ids.cancelNewProject)?.addEventListener('click', onCancelNewProject);
  el(ids.prevScan)?.addEventListener('click', onPrevScan);
  el(ids.nextScan)?.addEventListener('click', onNextScan);
  el(ids.goToScan)?.addEventListener('click', onGoToScan);
  el(ids.loadLint)?.addEventListener('click', onLoadLint);
  el(ids.tiltPivot)?.addEventListener('change', onTiltPivotChange);
  initSubPanelCollapse();
  el(ids.fineRotation)?.addEventListener('input', onFineRotation);
  el(ids.fineRotationValue)?.addEventListener('input', onFineRotation);
  el(ids.fineRotationValue)?.addEventListener('change', onFineRotation);
  el(ids.fineMinusCoarse)?.addEventListener('click', () => nudgeFineRotation(-0.01));
  el(ids.fineMinusFine)?.addEventListener('click', () => nudgeFineRotation(-0.001));
  el(ids.finePlusFine)?.addEventListener('click', () => nudgeFineRotation(0.001));
  el(ids.finePlusCoarse)?.addEventListener('click', () => nudgeFineRotation(0.01));
  el(ids.numFrames)?.addEventListener('change', onNumFrames);
  el(ids.activeFrame)?.addEventListener('change', onActiveFrame);
  el(ids.prevFrame)?.addEventListener('click', onPrevFrame);
  el(ids.nextFrame)?.addEventListener('click', onNextFrame);
  el(ids.zoom)?.addEventListener('input', onZoom);
  el(ids.applyGridFromPx)?.addEventListener('click', applyGridFromPxInputs);
  el(ids.captureGridRefPx)?.addEventListener('click', fillGridPxFieldsFromCurrentCell);
  const overlayRefWidthEl = el(ids.gridRefPxWidth);
  const overlayRefHeightEl = el(ids.gridRefPxHeight);
  const overlayRefFramesEl = el(ids.gridRefPxFrames);
  const onOverlayRefPxInputChanged = () => persistOverlayGridRefPxValues();
  overlayRefWidthEl?.addEventListener('change', onOverlayRefPxInputChanged);
  overlayRefWidthEl?.addEventListener('input', onOverlayRefPxInputChanged);
  overlayRefHeightEl?.addEventListener('change', onOverlayRefPxInputChanged);
  overlayRefHeightEl?.addEventListener('input', onOverlayRefPxInputChanged);
  overlayRefFramesEl?.addEventListener('change', onOverlayRefPxInputChanged);
  overlayRefFramesEl?.addEventListener('input', onOverlayRefPxInputChanged);
  const rangeFromEl = el(ids.exportScanFrom);
  const rangeToEl = el(ids.exportScanTo);
  const onExportRangeDraftChanged = () => persistExportRangeDraftInputs();
  rangeFromEl?.addEventListener('change', onExportRangeDraftChanged);
  rangeFromEl?.addEventListener('input', onExportRangeDraftChanged);
  rangeToEl?.addEventListener('change', onExportRangeDraftChanged);
  rangeToEl?.addEventListener('input', onExportRangeDraftChanged);
  el(ids.workflowSingleFrame)?.addEventListener('click', onWorkflowSingleFrameClick);
  const stripResEl = el(ids.stripPreviewRes);
  if (stripResEl) {
    stripResEl.addEventListener('change', function () {
      const v = parseInt(stripResEl.value, 10);
      if (!isNaN(v)) {
        setStripPreviewMaxDim(v);
        refreshPreviews();
      }
    });
  }
  el(ids.pickExportFolder)?.addEventListener('click', onPickExportFolder);
  el(ids.exportBaseName)?.addEventListener('change', function () { setExportBaseName(el(ids.exportBaseName)?.value); });
  el(ids.exportBaseName)?.addEventListener('input', function () { setExportBaseName(el(ids.exportBaseName)?.value); });
  el(ids.outputFormat)?.addEventListener('change', onOutputFormatChange);
  el(ids.jpgQuality)?.addEventListener('change', onJpgQualityChange);
  el(ids.jpgQuality)?.addEventListener('input', onJpgQualityChange);
  el(ids.exportBatchRangeAdd)?.addEventListener('click', () => { onAddOrUpdateBatchRange().catch(() => {}); });
  el(ids.exportBatchRangeEdit)?.addEventListener('click', () => { onBatchRangeEditMode().catch(() => {}); });
  el(ids.exportBatchRangeInsertAbove)?.addEventListener('click', onBatchRangeInsertAboveMode);
  el(ids.exportBatchRangeInsertBelow)?.addEventListener('click', onBatchRangeInsertBelowMode);
  el(ids.exportBatchRangeRemove)?.addEventListener('click', onBatchRangeRemoveSelected);
  el(ids.exportBatchRangeClear)?.addEventListener('click', onBatchRangeClearAll);
  el(ids.exportBatchRangeRun)?.addEventListener('click', () => { onRunBatchRangeList().catch(() => {}); });
  el(ids.exportBatchRangePrev)?.addEventListener('click', () => { onGoToPreviousBatchRange().catch(() => {}); });
  el(ids.exportBatchRangeNext)?.addEventListener('click', () => { onGoToNextBatchRange().catch(() => {}); });
  el(ids.exportBatchRangeImport)?.addEventListener('click', () => { onImportBatchRangeList().catch(() => {}); });
  el(ids.exportBatchRangeOpenNotepad)?.addEventListener('click', () => { onOpenBatchRangeNotepadList().catch(() => {}); });
  el(ids.exportBatchRangeReimport)?.addEventListener('click', () => { onReimportBatchRangeFromNotepad().catch(() => {}); });
  el(ids.exportBatchAutoMerge)?.addEventListener('change', onToggleBatchAutoMerge);
  el(ids.exportBatchWrapNav)?.addEventListener('change', onToggleBatchWrapNav);
  el(ids.exportBatchDisablePreview)?.addEventListener('change', onToggleBatchDisablePreview);
  el(ids.exportBatchPause)?.addEventListener('click', togglePauseBatchRun);
  el(ids.exportBatchStop)?.addEventListener('click', requestStopBatchRun);
  el(ids.exportBatchResume)?.addEventListener('click', () => { onResumeStoppedBatchRun().catch(() => {}); });
  el(ids.exportCurrent)?.addEventListener('click', onExportCurrentScan);
  el(ids.exportBatch)?.addEventListener('click', onExportBatch);
  el(ids.openStrip)?.addEventListener('click', onOpenStrip);
  el(ids.openSettings)?.addEventListener('click', () => { onOpenSettings().catch(() => {}); });
  el(ids.openDocs)?.addEventListener('click', () => { onOpenDocs().catch(() => {}); });
  el(ids.overviewResetGrid)?.addEventListener('click', onOverviewResetGrid);
  el(ids.overviewOffsetX)?.addEventListener('change', onOverviewOffsetApply);
  el(ids.overviewOffsetY)?.addEventListener('change', onOverviewOffsetApply);
  el(ids.overviewOffsetX)?.addEventListener('keydown', (e) => { if (e.key === 'Enter') onOverviewOffsetApply(); });
  el(ids.overviewOffsetY)?.addEventListener('keydown', (e) => { if (e.key === 'Enter') onOverviewOffsetApply(); });
  el(ids.overviewRotate90)?.addEventListener('click', onRotate90);
  el(ids.overviewFlipH)?.addEventListener('change', onOverviewFlipChanged);
  el(ids.overviewFlipV)?.addEventListener('change', onOverviewFlipChanged);
  el(ids.overviewZoomMode)?.addEventListener('change', onOverviewZoomModeChanged);

  document.addEventListener('keydown', function (e) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
    if (e.code === 'Numpad1') { e.preventDefault(); onFramePreviewJump('top'); return; }
    if (e.code === 'Numpad2') { e.preventDefault(); onFramePreviewJump('middle'); return; }
    if (e.code === 'Numpad3') { e.preventDefault(); onFramePreviewJump('bottom'); return; }
    if (e.code === 'NumpadAdd' || e.code === 'NumpadSubtract') {
      const rotStep = e.shiftKey ? 0.01 : 0.001;
      const delta = e.code === 'NumpadAdd' ? rotStep : -rotStep;
      const s = getState();
      setFineRotation(s.fineRotationDeg + delta);
      setDirty();
      updateUI();
      refreshPreviews();
      e.preventDefault();
      return;
    }
    const s = getState();
    const step = e.shiftKey ? (s.arrowStepShiftPx ?? 10) : (s.arrowStepPx ?? 1);
    const k = e.keyCode != null ? e.keyCode : e.which;
    let dx = 0, dy = 0;
    if (e.key === 'ArrowLeft' || e.code === 'ArrowLeft' || k === 37) dx = -step;
    else if (e.key === 'ArrowRight' || e.code === 'ArrowRight' || k === 39) dx = step;
    else if (e.key === 'ArrowUp' || e.code === 'ArrowUp' || k === 38) dy = -step;
    else if (e.key === 'ArrowDown' || e.code === 'ArrowDown' || k === 40) dy = step;
    else return;
    e.preventDefault();
    onFrameGridOffsetFromPreview({ deltaX: dx, deltaY: dy, tool: 'hand' });
  });
}

function registerQuitSaveHandler() {
  window.api?.onRequestQuitSave?.(() => {
    void (async () => {
      try {
        if (hasProject()) {
          if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
          cancelPendingProjectSave();
          persistCurrentLintStateInProject();
          await saveProject();
        }
      } catch (err) {
        console.error(
          t('errors.logQuitSaveFailed', {
            message: err && err.message != null ? err.message : String(err)
          })
        );
      } finally {
        window.api?.sendQuitSaveComplete?.();
      }
    })();
  });
}

function extractEulaForLocale(markdown, locale) {
  const md = typeof markdown === 'string' ? markdown : '';
  const nlMarker = '# Film2Frame – Gebruikersovereenkomst';
  const idx = md.indexOf(nlMarker);
  if (locale === 'nl') {
    return (idx >= 0 ? md.slice(idx) : md).trim();
  }
  return (idx >= 0 ? md.slice(0, idx) : md).trim();
}

async function fillEulaTextForLocale(locale) {
  const textEl = el(ids.eulaText);
  if (!textEl) return;
  textEl.textContent = t('eulaGate.loading');
  const res = await window.api?.getEulaText?.().catch(() => null);
  if (res?.ok && res.markdown) {
    textEl.textContent = extractEulaForLocale(res.markdown, locale === 'en' ? 'en' : 'nl');
  } else {
    textEl.textContent = t('eulaGate.loadError');
  }
}

/**
 * First-run gate: blocks until user accepts current EULA version (or quits).
 * @returns {Promise<boolean>} true if accepted / already accepted
 */
async function ensureEulaAccepted() {
  const status = await window.api?.getEulaStatus?.().catch(() => null);
  if (status?.accepted) return true;

  const overlay = el(ids.eulaOverlay);
  const checkbox = el(ids.eulaCheckbox);
  const acceptBtn = el(ids.eulaAccept);
  const declineBtn = el(ids.eulaDecline);
  const localeSel = el(ids.eulaLocale);
  if (!overlay || !checkbox || !acceptBtn || !declineBtn) return true;

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('eula-gate-open');
  checkbox.checked = false;
  acceptBtn.disabled = true;
  if (localeSel) localeSel.value = getLocale() === 'en' ? 'en' : 'nl';
  applyToDOM(overlay);
  await fillEulaTextForLocale(localeSel?.value || getLocale());

  return new Promise((resolve) => {
    const syncAcceptEnabled = () => {
      acceptBtn.disabled = !checkbox.checked;
    };
    const onCheck = () => syncAcceptEnabled();
    const onLocale = async () => {
      const v = localeSel.value;
      if (v !== 'en' && v !== 'nl') return;
      await setI18nLocale(window.api, v);
      applyToDOM();
      applyToDOM(overlay);
      const mainLocale = el(ids.locale);
      if (mainLocale) mainLocale.value = v;
      await fillEulaTextForLocale(v);
    };
    const cleanup = () => {
      checkbox.removeEventListener('change', onCheck);
      acceptBtn.removeEventListener('click', onAccept);
      declineBtn.removeEventListener('click', onDecline);
      localeSel?.removeEventListener('change', onLocale);
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('eula-gate-open');
    };
    const onAccept = async () => {
      if (!checkbox.checked) return;
      acceptBtn.disabled = true;
      const res = await window.api?.acceptEula?.().catch(() => null);
      if (!res?.ok) {
        acceptBtn.disabled = !checkbox.checked;
        return;
      }
      cleanup();
      resolve(true);
    };
    const onDecline = () => {
      window.api?.quitApp?.();
    };
    checkbox.addEventListener('change', onCheck);
    acceptBtn.addEventListener('click', onAccept);
    declineBtn.addEventListener('click', onDecline);
    localeSel?.addEventListener('change', onLocale);
    syncAcceptEnabled();
    checkbox.focus();
  });
}

async function init() {
  setupInlineStripBridge();
  initInlineStripFrame();
  bind();
  syncScanCountInputMode();
  emitInlineStripZoomMode(inlineStripLastZoomMode);
  if (window.api?.getTranslations) {
    await initI18n(window.api);
    const localeEl = el(ids.locale);
    if (localeEl) {
      localeEl.value = getLocale();
      localeEl.addEventListener('change', async () => {
        const v = localeEl.value;
        if (v === 'en' || v === 'nl') {
          await setI18nLocale(window.api, v);
          applyToDOM();
          updateProjectUI();
          updateUI();
          updateFloatingPreviewButtonUi().catch(() => {});
        }
      });
    }
  }
  await ensureEulaAccepted();
  registerQuitSaveHandler();
  /* Prestatie-timing (deze build): meld waar het logbestand staat en hoe je het uitzet. */
  try {
    if (isPerfEnabled() && window.api?.getPerfLogPath) {
      const perfPath = await window.api.getPerfLogPath();
      console.log('[perf] timing actief — logbestand: ' + perfPath + '  (uitzetten: localStorage.setItem("f2fPerf","0") en herladen)');
      window.api?.appendPerfLog?.('[perf] --- sessie gestart ' + new Date().toISOString() + ' ---');
    }
  } catch (_) {}
  updateUI();
  updateFloatingPreviewButtonUi().catch(() => {});
  if (!hasProject()) {
    el(ids.lintPanel)?.classList.add('hidden');
    el(ids.projectFirstStep)?.classList.remove('hidden');
    const lastPath = await window.api?.getLastProjectPath?.();
    if (lastPath) {
      try {
        const result = await openProjectByPath(lastPath);
        if (result?.ok) {
          clearCache();
          invalidateStripCanvasCache();
          assistSampleCache = null;
          updateProjectUI();
          updateUI();
          const paths = await getProjectScanPaths();
          const toLoad = pickResumeLintPath(paths, getState().lintStates, result.project?.currentLintPath ?? getProjectMeta()?.currentLintPath);
          if (toLoad) await loadScanByPath(toLoad);
        }
      } catch (_) {}
    }
  }
  loadAppSettings().catch(() => {});
  const v = await window.api?.getAppVersion?.().catch(() => null);
  const buildVer = v?.buildVersion || '—';
  if (el(ids.buildVersion)) el(ids.buildVersion).textContent = buildVer;
  if (el(ids.aboutVersion)) el(ids.aboutVersion).textContent = buildVer;
  el(ids.aboutBtn)?.addEventListener('click', () => {
    if (el(ids.aboutOverlay)) el(ids.aboutOverlay).classList.remove('hidden');
    if (el(ids.aboutOverlay)) el(ids.aboutOverlay).setAttribute('aria-hidden', 'false');
  });
  el(ids.aboutClose)?.addEventListener('click', () => {
    if (el(ids.aboutOverlay)) el(ids.aboutOverlay).classList.add('hidden');
    if (el(ids.aboutOverlay)) el(ids.aboutOverlay).setAttribute('aria-hidden', 'true');
  });
  window.api?.onAppSettingsSynced?.(() => {
    loadAppSettings().catch(() => {});
  });
  window.api?.onStripShortcutsUpdated?.((payload) => {
    emitInlineStripShortcuts(payload);
  });
  window.api?.onStripLocaleChanged?.(() => {
    emitInlineStripLocaleChanged();
  });
  // Floating RASTER SETUP → hoofdvenster (IPC-brug)
  window.api?.onPickScanFolderFromStrip?.(() => {
    onPickScanFolderFromStrip().catch(() => {});
  });
  window.api?.onStripPreviewClosed?.(() => {
    updateFloatingPreviewButtonUi(false).catch(() => {});
    refreshPreviews();
  });
  window.api?.onStripPreviewReady?.(() => {
    updateFloatingPreviewButtonUi(true).catch(() => {});
    refreshPreviews();
    setTimeout(() => refreshPreviews(), 400);
  });
  window.api?.onFrameGridOffsetUpdate?.(onFrameGridOffsetFromPreview);
  window.api?.onSetGridOffsetAbsolute?.(onSetGridOffsetAbsolute);
  window.api?.onFramePreviewJump?.(onFramePreviewJump);
  window.api?.onSetActiveFrame?.(onSetActiveFrameFromPreview);
  window.api?.onResetGrid?.(resetGridToDefault);
  window.api?.onStatusFromStrip?.(function (d) { updateStatus(d?.percent, d?.operation); });
  window.api?.onStripRotate90?.(function () { onRotate90(); });
  window.api?.onStripSetFlip?.(function (p) {
    setFlipHorizontal(!!p?.flipHorizontal);
    setFlipVertical(!!p?.flipVertical);
    setDirty();
    updateUI();
    refreshPreviews();
  });
  window.api?.onStripApplyWidthNarrow?.(onWidthNarrow);
  window.api?.onStripApplyWidthWiden?.(onWidthWiden);
  window.api?.onStripAdjustWidthEdge?.(onStripAdjustWidthEdge);
  window.api?.onStripAdjustHeightEdge?.(onStripAdjustHeightEdge);
  window.api?.onStripApplyVerticalPush?.(onVerticalPush);
  window.api?.onStripApplyVerticalStretch?.(onVerticalStretch);
  window.api?.onStripVerticalRigidPanBoundary?.((payload) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    onStripVerticalRigidPanBoundaryFromPreview(!!p.towardCompress);
  });
  window.api?.onStripVerticalFixedBottomStep?.((payload) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    onStripVerticalFixedBottomStep(p);
  });
  window.api?.onStripVerticalAnchor?.((payload) => {
    onStripVerticalAnchorFromPreview(payload);
  });
  window.api?.onStripPanelLinkVerticalAnchor?.((payload) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    const link = !!p.link;
    if (link === (getState().gridPanelLinkVerticalAnchor !== false)) return;
    setGridPanelLinkVerticalAnchor(link);
    syncGridSplitLowerPanClamp();
    setDirty();
    updateUI();
    requestAnimationFrame(() => refreshPreviewsGridOnly());
  });
  window.api?.onStripNavigateScan?.((payload) => {
    onStripNavigateScan(payload).catch(() => {});
  });
}

function resetGridToDefault() {
  setGridOffset(0, 0);
  setGridOffsetYBottom(0);
  setDirty();
  updateUI();
  requestAnimationFrame(() => refreshPreviewsGridOnly());
}

/**
 * Raster in scanlint-canvas-pixels: celbreedte (= rasteropening), celhoogte, aantal frames.
 * Horizontaal centreren; als n×hoogte ≤ striphoogte: rest als Y-onder (zoals mm-pad).
 */
function applyGridFromReferenceCellPx(frameWidthPx, frameHeightPx, numFrames) {
  const canvas = getStripCanvas();
  if (!canvas) return false;
  const stripWidth = canvas.width;
  const stripHeight = canvas.height;
  if (stripWidth < 1 || stripHeight < 1) return false;
  const n = Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, Math.round(Number(numFrames)) || MIN_FRAMES));
  const fw = Math.max(1, Math.round(Number(frameWidthPx)));
  const fh = Math.max(1, Math.round(Number(frameHeightPx)));
  const totalGridHeight = n * fh;
  let gridOffsetX = Math.max(0, Math.round((stripWidth - fw) / 2));
  let gridOffsetY = 0;
  let gridOffsetYBottom = 0;
  if (totalGridHeight <= stripHeight) {
    gridOffsetYBottom = Math.max(0, stripHeight - totalGridHeight);
  }
  setNumFrames(n);
  setGridOffset(gridOffsetX, gridOffsetY);
  setGridOffsetYBottom(gridOffsetYBottom);
  return true;
}

function onStripApplyFrameSizePx(payload) {
  if (isFixResolutionLockActive()) return;
  const p = payload && typeof payload === 'object' ? payload : {};
  let w = Number(p.frameWidthPx);
  let h = Number(p.frameHeightPx);
  if (!Number.isFinite(w) || w < 1 || !Number.isFinite(h) || h < 1) return;
  const pixelSpace = typeof p.pixelSpace === 'string' ? p.pixelSpace : 'preview';
  if (pixelSpace === 'export') {
    const previewDims = getStripCanvasDimensions();
    const exportDims = getExportStripDimensions();
    if (previewDims && exportDims && previewDims.width > 0 && previewDims.height > 0) {
      const kx = exportDims.width / previewDims.width;
      const ky = exportDims.height / previewDims.height;
      if (Number.isFinite(kx) && kx > 0) w = Math.max(1, Math.round(w / kx));
      if (Number.isFinite(ky) && ky > 0) h = Math.max(1, Math.round(h / ky));
    }
  }
  const s = getState();
  const n = Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, Number.isFinite(Number(s.numFrames)) ? Number(s.numFrames) : MIN_FRAMES));
  if (!applyGridFromReferenceCellPx(w, h, n)) return;
  setDirty();
  updateUI();
  refreshPreviewsGridOnly();
}

/**
 * Raster aanpassen op basis van metrische maten (mm) en px/mm.
 * Berekent offset en aantal frames zodat de celgrootte zo dicht mogelijk bij de opgegeven mm ligt.
 */
function applyGridFromMm() {
  if (isFixResolutionLockActive()) return;
  const canvas = getStripCanvas();
  if (!canvas) {
    if (el(ids.loadLint)) el(ids.loadLint).focus();
    return;
  }
  const stripWidth = canvas.width;
  const stripHeight = canvas.height;
  if (stripWidth < 1 || stripHeight < 1) return;
  const widthMm = Number(el(ids.gridMmWidth)?.value);
  const heightMm = Number(el(ids.gridMmHeight)?.value);
  let numFrames = parseInt(el(ids.gridMmFrames)?.value, 10);
  const pxPerMm = Number(el(ids.gridPxPerMm)?.value);
  if (!Number.isFinite(widthMm) || widthMm <= 0 || !Number.isFinite(heightMm) || heightMm <= 0 || !Number.isFinite(pxPerMm) || pxPerMm <= 0) {
    return;
  }
  numFrames = Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, Number.isFinite(numFrames) ? numFrames : MIN_FRAMES));
  const frameWidthPx = Math.max(1, Math.round(widthMm * pxPerMm));
  const frameHeightPx = Math.max(1, Math.round(heightMm * pxPerMm));
  if (!applyGridFromReferenceCellPx(frameWidthPx, frameHeightPx, numFrames)) return;
  setDirty();
  updateUI();
  refreshPreviewsGridOnly();
}

function applyGridFromPxInputs() {
  if (isFixResolutionLockActive()) return;
  const canvas = getStripCanvas();
  if (!canvas) {
    if (el(ids.loadLint)) el(ids.loadLint).focus();
    return;
  }
  const w = Number(el(ids.gridRefPxWidth)?.value);
  const h = Number(el(ids.gridRefPxHeight)?.value);
  let numFrames = parseInt(el(ids.gridRefPxFrames)?.value, 10);
  if (!Number.isFinite(w) || w < 1 || !Number.isFinite(h) || h < 1) return;
  numFrames = Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, Number.isFinite(numFrames) ? numFrames : MIN_FRAMES));
  if (!applyGridFromReferenceCellPx(w, h, numFrames)) return;
  persistOverlayGridRefPxValues();
  setDirty();
  updateUI();
  refreshPreviewsGridOnly();
}

/** Vul pixelvelden met afmetingen van het actieve frame volgens het huidige raster (scanlint-canvas). */
function fillGridPxFieldsFromCurrentCell() {
  const canvas = getStripCanvas();
  if (!canvas) return;
  const s = getState();
  const n = Math.max(1, s.numFrames);
  const rows = getLadderRowsCanvas(canvas.height, n);
  const idx = Math.max(0, Math.min(n - 1, s.activeFrameIndex));
  const row = rows[idx];
  const gr = getGridRect(canvas.width, row.h);
  const wPx = Math.max(1, Math.round(gr.width));
  const hPx = Math.max(1, Math.round(row.h));
  if (el(ids.gridRefPxWidth)) el(ids.gridRefPxWidth).value = String(wPx);
  if (el(ids.gridRefPxHeight)) el(ids.gridRefPxHeight).value = String(hPx);
  if (el(ids.gridRefPxFrames)) el(ids.gridRefPxFrames).value = String(n);
  persistOverlayGridRefPxValues();
}

function onFramePreviewJump(position) {
  const s = getState();
  const n = Math.max(1, s.numFrames);
  syncGridSplitLowerPanClamp();
  if (position === 'top') setActiveFrameIndex(0);
  else if (position === 'middle') setActiveFrameIndex(Math.floor((n - 1) / 2));
  else if (position === 'bottom') setActiveFrameIndex(n - 1);
  syncGridSplitLowerPanClamp();
  updateUI();
  requestAnimationFrame(() => refreshPreviewsGridOnly());
}

function onSetActiveFrameFromPreview(frameNumber) {
  const n = Math.max(1, getState().numFrames);
  const index = Math.max(0, Math.min(n - 1, Math.floor(Number(frameNumber) || 1) - 1));
  syncGridSplitLowerPanClamp();
  setActiveFrameIndex(index);
  syncGridSplitLowerPanClamp();
  updateUI();
  requestAnimationFrame(() => refreshPreviewsGridOnly());
}

async function onPickExportFolder() {
  const folder = await window.api?.selectExportFolder?.();
  if (folder) {
    setExportFolderPath(folder);
    updateUI();
  }
}

function setFrameGeneratorProgress(opts) {
  const { visible, pct = 0, message = '' } = opts || {};
  const wrap = el(ids.frameGeneratorProgressWrap);
  const bar = el(ids.frameGeneratorProgressBar);
  const host = el(ids.frameGeneratorProgressBarhost);
  const pctEl = el(ids.frameGeneratorProgressPct);
  const labelEl = el(ids.frameGeneratorProgressLabel);
  if (!wrap || !bar) return;
  if (visible) wrap.classList.remove('hidden');
  else wrap.classList.add('hidden');
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  bar.style.width = `${p}%`;
  if (host) host.setAttribute('aria-valuenow', String(p));
  if (pctEl) pctEl.textContent = `${p}%`;
  if (labelEl) labelEl.textContent = message || '';
}

function formatBatchProgressStats(ctx) {
  if (!ctx || typeof ctx !== 'object') return '';
  const startedAtMs = Number(ctx.startedAtMs);
  const processedFrames = Math.max(0, Math.floor(Number(ctx.processedFrames) || 0));
  const totalFrames = Math.max(0, Math.floor(Number(ctx.totalFrames) || 0));
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0 || totalFrames < 1) return '';
  const elapsedMs = Math.max(0, Date.now() - startedAtMs);
  const elapsedSec = elapsedMs / 1000;
  const fps = elapsedSec > 0 ? (processedFrames / elapsedSec) : 0;
  const remainingFrames = Math.max(0, totalFrames - processedFrames);
  const etaMs = fps > 0 ? Math.round((remainingFrames / fps) * 1000) : NaN;
  const etaLabel = Number.isFinite(etaMs) ? formatProgressDuration(etaMs) : t('scanFolderOverlay.timeUnknown');
  return t('frameGenerator.progressStats', {
    elapsed: formatProgressDuration(elapsedMs),
    eta: etaLabel,
    fps: (Math.round(fps * 10) / 10).toFixed(1)
  });
}

function withBatchProgressStats(baseMessage, ctx) {
  const stats = formatBatchProgressStats(ctx);
  if (!stats) return baseMessage || '';
  return baseMessage ? `${baseMessage} · ${stats}` : stats;
}

function setCalibrationStatusAccent(enabled) {
  const opEl = document.getElementById('status-operation');
  if (!opEl) return;
  opEl.classList.toggle('toolbar-status-operation--calibration-success', enabled === true);
}

function showTransientStatusMessage(message, timeoutMs = 1800) {
  if (!message) return;
  transientStatusToken += 1;
  const token = transientStatusToken;
  if (transientStatusTimer) {
    clearTimeout(transientStatusTimer);
    transientStatusTimer = null;
  }
  setCalibrationStatusAccent(true);
  updateStatus(0, message);
  transientStatusTimer = setTimeout(() => {
    if (token !== transientStatusToken) return;
    setCalibrationStatusAccent(false);
    updateStatus(0, t('status.operationEmpty'));
    transientStatusTimer = null;
  }, Math.max(400, Math.floor(Number(timeoutMs) || 1800)));
}

function pathBasename(p) {
  const s = String(p || '').replace(/\\/g, '/');
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}

function pathDirname(p) {
  const s = String(p || '').replace(/\\/g, '/');
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(0, i) : '';
}

function normPathKey(p) {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function pathStem(fileName) {
  const base = String(fileName || '');
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return base || 'frame';
  return base.slice(0, dot) || 'frame';
}

/** Output-bestandsnamen: zelfde stam als inputscan; bij meerdere frames per lint: _01, _02, … */
/**
 * Uitvoer-encoding op basis van het gekozen formaat: PNG (lossless) of JPG met kwaliteit (1–100).
 * @returns {{ ext: 'png'|'jpg', mime: 'image/png'|'image/jpeg', quality: number|undefined }}
 */
function getExportEncoding() {
  const s = getState();
  const fmt = (s.outputFormat || 'png').toLowerCase();
  if (fmt === 'jpg' || fmt === 'jpeg') {
    const q = Math.max(1, Math.min(100, Math.round(Number(s.jpgQuality) || 92)));
    return { ext: 'jpg', mime: 'image/jpeg', quality: q / 100 };
  }
  return { ext: 'png', mime: 'image/png', quality: undefined };
}

/** Encodeer een canvas naar een ArrayBuffer volgens de gekozen uitvoer-encoding (toBlob, met fallback naar toDataURL). */
function canvasToExportBuffer(canvas, enc) {
  const { mime, quality } = enc || getExportEncoding();
  return new Promise((resolve, reject) => {
    try {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error(t('ipc.errorNoImageData'))); return; }
            blob.arrayBuffer().then(resolve).catch(reject);
          },
          mime,
          quality
        );
        return;
      }
      const dataUrl = quality != null ? canvas.toDataURL(mime, quality) : canvas.toDataURL(mime);
      const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      if (!b64) { reject(new Error(t('ipc.errorNoImageData'))); return; }
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      resolve(out.buffer);
    } catch (err) {
      reject(err);
    }
  });
}

function getExportFileNamesForScan(scanPath, numFrames) {
  const stem = pathStem(pathBasename(scanPath)).replace(/[/\\:*?"<>|]/g, '_') || 'frame';
  const n = Math.max(1, Math.round(Number(numFrames) || 1));
  const ext = getExportEncoding().ext;
  if (n <= 1) return [`${stem}.${ext}`];
  const names = [];
  for (let i = 0; i < n; i++) {
    names.push(`${stem}_${String(i + 1).padStart(2, '0')}.${ext}`);
  }
  return names;
}

function assertExportFolderNotInput(folder, scanPath) {
  const outKey = normPathKey(folder);
  if (!outKey) return t('frameExport.pickFolderFirst');
  const srcDir = normPathKey(pathDirname(scanPath));
  if (srcDir && outKey === srcDir) return t('frameExport.outputSameAsInput');
  const location = normPathKey(getProjectMeta()?.location);
  if (location && outKey === location) return t('frameExport.outputSameAsInput');
  return null;
}

/** Exporteert alle frames van de huidige scan naar de doelmap.
 * Bestandsnaam = originele scanstam (bijv. Frame_15962.png). Outputmap mag niet = inputmap. */
async function onExportCurrentScan(options = null) {
  const silent = !!(options && options.silent);
  const suppressPreview = !!(options && options.suppressPreview);
  // Auto ▶ of silent Volgende: altijd overschrijven (geen "Ga verder"-skip die wel navigeert maar niets schrijft).
  const skipOverwriteConfirm = !!(
    options &&
    (options.skipOverwriteConfirm || options.fromAutoAdvance || silent)
  );
  if (exportScanBusy) {
    const msg = t('frameExport.singleFailed');
    if (!silent) alert(msg);
    return { ok: false, error: msg };
  }
  exportScanBusy = true;
  let pair = null;
  try {
    const folder = getState().exportFolderPath;
    if (!folder) {
      const msg = t('frameExport.pickFolderFirst');
      if (!silent) alert(msg);
      return { ok: false, error: msg };
    }
    const s = getState();
    const scanPath = s.path;
    if (!scanPath) {
      const msg = t('frameExport.noStripLoaded');
      if (!silent) alert(msg);
      return { ok: false, error: msg };
    }
    const sameFolderErr = assertExportFolderNotInput(folder, scanPath);
    if (sameFolderErr) {
      if (!silent) alert(sameFolderErr);
      return { ok: false, error: sameFolderErr };
    }
    pair = getStripCanvasPairForExport();
    if (!pair) {
      const msg = t('frameExport.noStripLoaded');
      if (!silent) alert(msg);
      return { ok: false, error: msg };
    }
    const { preview: previewStrip, export: exportStrip } = pair;
    const n = Math.max(1, s.numFrames);
    const fileNames = getExportFileNamesForScan(scanPath, n);
    const appSettings = await window.api?.getAppSettings?.().catch(() => null);
    const outDims = getExportOutputDimensions(appSettings);

    let overwrite = false;
    let existing = [];
    try {
      if (window.api?.exportFilesExist) {
        const ex = await window.api.exportFilesExist(folder, fileNames);
        if (ex && ex.any) existing = Array.isArray(ex.existing) ? ex.existing : fileNames;
      }
    } catch (_) {}
    if (existing.length > 0) {
      if (!skipOverwriteConfirm) {
        let action = 'continue';
        try {
          if (typeof window.api?.confirmExportOverwrite === 'function') {
            const r = await window.api.confirmExportOverwrite({
              start: existing[0],
              end: existing[existing.length - 1],
              count: existing.length,
              names: existing.slice(0, 3).join(', ') + (existing.length > 3 ? '…' : '')
            });
            action = r && r.action === 'overwrite' ? 'overwrite' : 'continue';
          } else {
            const okOverwrite = window.confirm(
              t('frameExport.confirmOverwriteNames', {
                names: existing.slice(0, 3).join(', ') + (existing.length > 3 ? '…' : ''),
                count: existing.length
              })
            );
            action = okOverwrite ? 'overwrite' : 'continue';
          }
        } catch (_) {
          action = 'continue';
        }
        if (action !== 'overwrite') {
          return { ok: true, written: 0, skipped: true };
        }
      }
      overwrite = true;
    }

    if (!silent) {
      setFrameGeneratorProgress({
        visible: true,
        pct: 2,
        message: t('frameGenerator.progressNextNumber')
      });
    }
    if (!silent) updateStatus(5, t('status.nextFrameNumber'));

    let written = 0;
    const writtenNames = [];
    let lastWriteError = '';
    let cropFailed = false;
    try {
      const enc = getExportEncoding();
      const canvasToPngBuffer = (canvas) => canvasToExportBuffer(canvas, enc);

      const writeFrameFile = async (fileName, pngBuffer) => {
        if (window.api?.writeFrameBuffer) {
          return await window.api.writeFrameBuffer(folder, fileName, pngBuffer, enc.ext);
        }
        // Fallback: data-URL (oudere preload)
        const bytes = new Uint8Array(pngBuffer);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        const dataUrl = 'data:' + enc.mime + ';base64,' + btoa(binary);
        if (window.api?.writeFrame) {
          return await window.api.writeFrame(folder, 'frame', 1, dataUrl, enc.ext, fileName);
        }
        if (window.api?.writeFramePng) {
          return await window.api.writeFramePng(folder, 'frame', 1, dataUrl, fileName);
        }
        throw new Error(t('errors.apiUnavailable'));
      };
      for (let i = 0; i < n; i++) {
        let canvas = cropFrameAtIndexForExport(exportStrip, previewStrip, i);
        if (!canvas) {
          cropFailed = true;
          continue;
        }
        if (outDims) {
          canvas = scaleCanvasToSize(canvas, outDims.w, outDims.h, outDims.allowUpscale !== false);
        }
        let pngBuffer;
        try {
          pngBuffer = await canvasToPngBuffer(canvas);
        } catch (encErr) {
          lastWriteError = encErr?.message || String(encErr);
          disposeCanvas(canvas);
          continue;
        }
        disposeCanvas(canvas);
        const fileName = fileNames[i] || fileNames[0];
        const result = await writeFrameFile(fileName, pngBuffer);
        if (result?.ok) {
          written++;
          writtenNames.push(result.fileName || fileName);
          if (!suppressPreview && window.api?.sendOutputPreviewImage) {
            /* preview optioneel; buffer→dataURL is zwaar, sla over bij silent */
          }
        } else if (result?.error) {
          lastWriteError = String(result.error);
        }
        if (!silent) {
          const barPct = 5 + Math.round((95 * (i + 1)) / n);
          setFrameGeneratorProgress({
            visible: true,
            pct: barPct,
            message: t('frameGenerator.progressCurrentScanNamed', {
              current: i + 1,
              total: n,
              name: fileName
            })
          });
          updateStatus(10 + Math.round((80 * (i + 1)) / n), t('status.exportFrameNamed', { name: fileName }));
        }
        await yieldToEventLoop();
      }
      if (written < 1) {
        const msg = lastWriteError
          ? t('frameExport.saveFailed', { message: lastWriteError })
          : cropFailed
            ? t('frameExport.cropFailed')
            : t('frameExport.nothingWritten');
        if (!silent) alert(msg);
        return { ok: false, error: msg, written: 0 };
      }
      rememberExportRangeForCurrentScan(folder, pathStem(pathBasename(scanPath)), 1, written);
      const statusMsg = t(overwrite ? 'frameExport.overwrittenNamed' : 'frameExport.savedNamed', {
        count: written,
        folder,
        name: writtenNames[0] || fileNames[0]
      });
      if (!silent) alert(statusMsg);
      else updateStatus(100, statusMsg);
      return { ok: true, written, overwritten: overwrite, fileNames: writtenNames };
    } catch (e) {
      const msg = t('frameExport.saveFailed', { message: e?.message || e });
      if (!silent) alert(msg);
      return { ok: false, error: msg };
    } finally {
      if (!silent) {
        setFrameGeneratorProgress({ visible: false });
        updateStatus(0, t('status.operationEmpty'));
      }
    }
  } finally {
    releaseStripCanvasPair(pair);
    assistSampleCache = null;
    exportScanBusy = false;
    await yieldToEventLoop();
  }
}

/** Eerdere export-range voor huidige scan (zelfde map + basisnaam). */
function getPriorExportRangeForCurrentScan(folder, baseName) {
  const lintPath = getState().path;
  if (!lintPath) return null;
  const saved = getLintStateForPath(lintPath);
  if (!saved) return null;
  const start = Math.round(Number(saved.exportStartIndex));
  const count = Math.round(Number(saved.exportFrameCount));
  if (!Number.isFinite(start) || start < 1 || !Number.isFinite(count) || count < 1) return null;
  if (saved.exportFolder && String(saved.exportFolder) !== String(folder)) return null;
  if (saved.exportBaseName && String(saved.exportBaseName) !== String(baseName || 'frame')) return null;
  return { start, count };
}

function rememberExportRangeForCurrentScan(folder, baseName, startIndex, frameCount) {
  const lintPath = getState().path;
  if (!lintPath) return;
  const snap = getLintStateSnapshot();
  setLintStateForPath(lintPath, {
    ...snap,
    exportStartIndex: Math.max(1, Math.round(Number(startIndex) || 1)),
    exportFrameCount: Math.max(1, Math.round(Number(frameCount) || 1)),
    exportFolder: folder || null,
    exportBaseName: baseName || 'frame'
  });
  queueAutoSave();
}

/** Voert frame-export uit voor een lijst scanpaden. Bestandsnaam = originele scanstam. */
async function exportPaths(paths, options = null) {
  const opts = options && typeof options === 'object' ? options : {};
  const suppressPreview = opts.suppressPreview === true;
  const folder = getState().exportFolderPath;
  const pauseSec = 0;
  const appSettings = await window.api?.getAppSettings?.().catch(() => null);
  const outDims = getExportOutputDimensions(appSettings);
  const enc = getExportEncoding();
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const total = paths.length;
  const resume = normalizeExportBatchResumeState(opts.resumeState);
  let scanStart = 0;
  let frameStart = 1;
  if (resume && resume.mode === 'all-scans') {
    if (typeof resume.scanPath === 'string' && resume.scanPath) {
      const byPath = paths.indexOf(resume.scanPath);
      scanStart = byPath >= 0 ? byPath : Math.max(0, Math.min(total - 1, resume.scanIndex || 0));
    } else {
      scanStart = Math.max(0, Math.min(total - 1, resume.scanIndex || 0));
    }
    frameStart = Math.max(1, resume.frameIndex || 1);
  }
  let writtenTotal = 0;
  let processedFrames = 0;
  const runStartedAtMs = Date.now();
  let totalFramesToProcess = 0;
  for (let i = scanStart; i < total; i++) {
    const frameCount = Math.max(1, getScanFrameCountByPath(paths[i]));
    const startFrame = i === scanStart ? Math.max(1, frameStart) : 1;
    totalFramesToProcess += Math.max(0, frameCount - startFrame + 1);
  }
  setFrameGeneratorProgress({ visible: true, pct: 1, message: t('frameGenerator.progressNextNumber') });
  for (let scanIdx = scanStart; scanIdx < total; scanIdx++) {
    const scanPath = paths[scanIdx];
    const stopBeforeScan = await waitForBatchRunGate(
      () => ({
        mode: 'all-scans',
        scanIndex: scanIdx,
        scanPath,
        frameIndex: 1
      }),
      t('frameGenerator.batchPausedStatus')
    );
    if (stopBeforeScan) return { written: writtenTotal, stopped: true };
    const sameFolderErr = assertExportFolderNotInput(folder, scanPath);
    if (sameFolderErr) throw new Error(sameFolderErr);
    setFrameGeneratorProgress({
      visible: true,
      pct: Math.min(8, Math.round((100 * scanIdx) / Math.max(1, total * 2))),
      message: withBatchProgressStats(
        t('frameGenerator.progressLoadingScan', { current: scanIdx + 1, total }),
        { startedAtMs: runStartedAtMs, processedFrames, totalFrames: totalFramesToProcess }
      )
    });
    updateStatus(
      5 + Math.round((70 * scanIdx) / total),
      t('status.scanLoadProject', { current: scanIdx + 1, total })
    );
    const ok = await loadScanByPath(scanPath, { skipPreviewRefresh: suppressPreview });
    if (!ok) continue;
    const pair = getStripCanvasPairForExport();
    if (!pair) continue;
    try {
      const { preview: previewStrip, export: exportStrip } = pair;
      const n = Math.max(1, getState().numFrames);
      const fileNames = getExportFileNamesForScan(scanPath, n);
      const remainingScans = total - scanIdx - 1;
      const estimatedTotalFrames = writtenTotal + n + remainingScans * n;
      const frameFromThisScan = scanIdx === scanStart ? Math.max(1, frameStart) : 1;
      for (let i = frameFromThisScan - 1; i < n; i++) {
        const shouldStop = await waitForBatchRunGate(
          () => ({
            mode: 'all-scans',
            scanIndex: scanIdx,
            scanPath,
            frameIndex: i + 1
          }),
          t('frameGenerator.batchPausedStatus')
        );
        if (shouldStop) {
          return { written: writtenTotal, stopped: true };
        }
        let canvas = cropFrameAtIndexForExport(exportStrip, previewStrip, i);
        if (!canvas) {
          processedFrames++;
          continue;
        }
        if (outDims) {
          const scaled = scaleCanvasToSize(canvas, outDims.w, outDims.h, outDims.allowUpscale !== false);
          if (scaled !== canvas) disposeCanvas(canvas);
          canvas = scaled;
        }
        const fileName = fileNames[i] || fileNames[0];
        let result = null;
        try {
          const pngBuffer = await canvasToExportBuffer(canvas, enc);
          disposeCanvas(canvas);
          if (window.api?.writeFrameBuffer) {
            result = await window.api.writeFrameBuffer(folder, fileName, pngBuffer, enc.ext);
          } else if (window.api?.writeFrame) {
            const bytes = new Uint8Array(pngBuffer);
            let binary = '';
            const chunk = 0x8000;
            for (let bi = 0; bi < bytes.length; bi += chunk) {
              binary += String.fromCharCode.apply(null, bytes.subarray(bi, bi + chunk));
            }
            result = await window.api.writeFrame(
              folder,
              'frame',
              1,
              'data:' + enc.mime + ';base64,' + btoa(binary),
              enc.ext,
              fileName
            );
          } else if (window.api?.writeFramePng) {
            const bytes = new Uint8Array(pngBuffer);
            let binary = '';
            const chunk = 0x8000;
            for (let bi = 0; bi < bytes.length; bi += chunk) {
              binary += String.fromCharCode.apply(null, bytes.subarray(bi, bi + chunk));
            }
            result = await window.api.writeFramePng(
              folder,
              'frame',
              1,
              'data:' + enc.mime + ';base64,' + btoa(binary),
              fileName
            );
          } else {
            throw new Error(t('errors.apiUnavailable'));
          }
        } catch (_) {
          disposeCanvas(canvas);
          result = { ok: false };
        }
        if (result?.ok) writtenTotal++;
        processedFrames++;
        const done = processedFrames;
        const barPct = Math.min(99, Math.round((100 * done) / Math.max(1, totalFramesToProcess || estimatedTotalFrames)));
        setFrameGeneratorProgress({
          visible: true,
          pct: barPct,
          message: withBatchProgressStats(
            t('frameGenerator.progressWriting', {
              scan: scanIdx + 1,
              totalScans: total,
              frame: i + 1,
              framesInScan: n
            }),
            { startedAtMs: runStartedAtMs, processedFrames, totalFrames: totalFramesToProcess || estimatedTotalFrames }
          )
        });
        await yieldToEventLoop();
      }
      rememberExportRangeForCurrentScan(folder, pathStem(pathBasename(scanPath)), 1, n);
      if (scanIdx === scanStart) frameStart = 1;
    } finally {
      releaseStripCanvasPair(pair);
      assistSampleCache = null;
    }
    if (pauseSec > 0 && scanIdx < total - 1) {
      const est = Math.max(1, writtenTotal + (total - scanIdx - 1) * Math.max(1, getState().numFrames));
      setFrameGeneratorProgress({
        visible: true,
        pct: Math.min(99, Math.round((100 * writtenTotal) / est)),
        message: withBatchProgressStats(
          t('frameGenerator.progressPause', { seconds: pauseSec, scan: scanIdx + 1 }),
          { startedAtMs: runStartedAtMs, processedFrames, totalFrames: totalFramesToProcess || est }
        )
      });
      updateStatus(80, t('status.exportPause', { seconds: pauseSec, scan: scanIdx + 1 }));
      await delay(pauseSec * 1000);
    }
  }
  return { written: writtenTotal, stopped: false };
}

function readExportScanRangeInputs() {
  const maxFrames = getProjectTotalFrameCountEstimate();
  const fromVal = Math.floor(Number(el(ids.exportScanFrom)?.value));
  const toVal = Math.floor(Number(el(ids.exportScanTo)?.value));
  if (!Number.isFinite(fromVal) || fromVal < 1 || !Number.isFinite(toVal) || toVal < 1) {
    alert(t('frameExport.rangeInputInvalid'));
    return null;
  }
  const max = maxFrames > 0 ? maxFrames : Number.POSITIVE_INFINITY;
  const from = Math.min(max, fromVal);
  const to = Math.min(max, toVal);
  if (from > to) {
    alert(t('frameExport.rangeInvalid'));
    return null;
  }
  return { from, to };
}

async function jumpToRangeStartScan(range) {
  if (!range) return false;
  const paths = await getProjectScanPaths();
  if (!paths.length) {
    alert(t('scanNav.noScans'));
    return false;
  }
  const map = buildGlobalFrameMap(paths);
  const targetPos = resolveGlobalFramePosition(range.from, map.rows);
  if (!targetPos?.scanPath) {
    alert(t('frameExport.batchRangeOutOfBounds'));
    return false;
  }
  // Bewaar de reeds ingestelde rastergeometrie vóór het laden, zodat we niet
  // terugvallen op een niet-ingestelde grootte wanneer het doelbereik (nog) geen
  // eigen referentie heeft. Dit voorkomt dat het raster bij bereik-navigatie
  // "terugspringt" naar een default grootte (bv. bij bereik 2, terwijl bereik 1/3 wel goed staan).
  const preservedGrid = getGridGeometrySnapshot();
  const loaded = await loadScanByPath(targetPos.scanPath, scanNavigationGridOptions());
  if (!loaded) return false;
  setActiveFrameIndex(Math.max(0, targetPos.frameInScan - 1));
  if (applyRangeReferenceSnapshotForRange(range, targetPos.scanPath)) {
    // Bij een opgeslagen referentie blijft de startframe-positie leidend.
    setActiveFrameIndex(Math.max(0, targetPos.frameInScan - 1));
  } else if (preservedGrid) {
    // Geen opgeslagen referentie voor dit bereik: behoud de huidige rastergeometrie
    // i.p.v. de (mogelijk niet-ingestelde) geometrie van de doelscan.
    applyGridGeometrySnapshot(preservedGrid);
  }
  setDirty();
  updateUI();
  refreshPreviews();
  updateStatus(0, t('frameGenerator.batchRangeJumped', { from: range.from, to: range.to }));
  return true;
}

function computeRangeInsertIndex() {
  if (exportScanBatchEditIndex >= 0) return exportScanBatchEditIndex;
  if (exportScanBatchInsertMode === 'insert-above') {
    return exportScanBatchSelectedIndex >= 0 ? exportScanBatchSelectedIndex : 0;
  }
  if (exportScanBatchInsertMode === 'insert-below') {
    return exportScanBatchSelectedIndex >= 0
      ? Math.min(exportScanBatchRanges.length, exportScanBatchSelectedIndex + 1)
      : exportScanBatchRanges.length;
  }
  return exportScanBatchRanges.length;
}

function saveExportScanBatchRangesAndRefresh() {
  const max = getProjectTotalFrameCountEstimate();
  exportScanBatchRanges = normalizeExportScanBatchRanges(exportScanBatchRanges, max > 0 ? max : Number.POSITIVE_INFINITY);
  if (exportScanBatchAutoMerge !== false) {
    exportScanBatchRanges = sortAndMergeExportScanBatchRanges(exportScanBatchRanges);
  }
  persistExportScanBatchRanges();
  autoRangeReferenceSignatures = {};
  renderExportScanBatchRangeList();
}

async function onBatchRangeEditMode() {
  if (exportScanBatchSelectedIndex < 0 || exportScanBatchSelectedIndex >= exportScanBatchRanges.length) {
    alert(t('frameExport.batchRangeSelectFirst'));
    return;
  }
  const picked = exportScanBatchRanges[exportScanBatchSelectedIndex];
  exportScanBatchEditIndex = exportScanBatchSelectedIndex;
  setExportBatchInsertMode('edit');
  setExportRangeInputs(picked.from, picked.to);
  await jumpToRangeStartScan(picked);
}

function onBatchRangeInsertAboveMode() {
  exportScanBatchEditIndex = -1;
  setExportBatchInsertMode('insert-above');
  renderExportScanBatchRangeList();
}

function onBatchRangeInsertBelowMode() {
  exportScanBatchEditIndex = -1;
  setExportBatchInsertMode('insert-below');
  renderExportScanBatchRangeList();
}

function onToggleBatchAutoMerge() {
  exportScanBatchAutoMerge = el(ids.exportBatchAutoMerge)?.checked !== false;
  saveExportScanBatchRangesAndRefresh();
}

function onToggleBatchWrapNav() {
  exportScanBatchWrapNav = el(ids.exportBatchWrapNav)?.checked === true;
  persistExportScanBatchRanges();
  updateUI();
}

function onToggleBatchDisablePreview() {
  exportBatchDisablePreview = el(ids.exportBatchDisablePreview)?.checked === true;
  persistExportScanBatchRanges();
  updateUI();
}

function applyImportedBatchRanges(ranges, sourceLabel, invalidLineNumbers = [], dataLineCount = 0, templateDetected = false) {
  exportScanBatchRanges = normalizeExportScanBatchRanges(
    Array.isArray(ranges) ? ranges : [],
    Number.POSITIVE_INFINITY
  );
  if (exportScanBatchAutoMerge !== false) {
    exportScanBatchRanges = sortAndMergeExportScanBatchRanges(exportScanBatchRanges);
  }
  exportScanBatchSelectedIndex = exportScanBatchRanges.length ? 0 : -1;
  exportScanBatchEditIndex = -1;
  setExportBatchInsertMode('append');
  saveExportScanBatchRangesAndRefresh();
  if (exportScanBatchRanges.length) {
    const first = exportScanBatchRanges[0];
    setExportRangeInputs(first.from, first.to);
    updateStatus(0, t('frameGenerator.batchRangeImportDone', { count: exportScanBatchRanges.length, source: sourceLabel || t('frameGenerator.batchRangeImportSourceFile') }));
    if (templateDetected) {
      alert(t('frameGenerator.batchRangeTemplateWarning'));
    }
    const invalidCount = Array.isArray(invalidLineNumbers) ? invalidLineNumbers.length : 0;
    if (invalidCount > 0) {
      const linesShort = invalidLineNumbers.slice(0, 8).join(', ');
      const more = invalidCount > 8 ? ` +${invalidCount - 8}` : '';
      alert(t('frameGenerator.batchRangeImportPartialWarning', {
        loaded: exportScanBatchRanges.length,
        invalid: invalidCount,
        lines: `${linesShort}${more}`,
        total: Math.max(0, Math.floor(Number(dataLineCount) || 0))
      }));
    }
  } else {
    updateStatus(0, t('frameExport.batchRangeListEmpty'));
  }
}

async function onImportBatchRangeList() {
  if (!window.api?.importBatchRangeListFile) return;
  const result = await window.api.importBatchRangeListFile();
  if (!result || result.canceled) return;
  if (!result.ok) {
    alert(result.error || t('frameGenerator.batchRangeImportFailed'));
    return;
  }
  applyImportedBatchRanges(
    result.ranges,
    result.path || t('frameGenerator.batchRangeImportSourceFile'),
    result.invalidLineNumbers,
    result.dataLineCount,
    result.templateDetected
  );
}

async function onOpenBatchRangeNotepadList() {
  if (!window.api?.openBatchRangeListInNotepad) return;
  const result = await window.api.openBatchRangeListInNotepad();
  if (!result?.ok) {
    alert(result?.error || t('frameGenerator.batchRangeNotepadOpenFailed'));
    return;
  }
  updateStatus(0, t('frameGenerator.batchRangeNotepadOpened', { path: result.path || '' }));
}

async function onReimportBatchRangeFromNotepad() {
  if (!window.api?.reimportBatchRangeListFromNotepad) return;
  const result = await window.api.reimportBatchRangeListFromNotepad();
  if (!result || result.canceled) return;
  if (!result.ok) {
    alert(result.error || t('frameGenerator.batchRangeReimportFailed'));
    return;
  }
  applyImportedBatchRanges(
    result.ranges,
    result.path || t('frameGenerator.batchRangeImportSourceNotepad'),
    result.invalidLineNumbers,
    result.dataLineCount,
    result.templateDetected
  );
}

async function onResumeStoppedBatchRun() {
  const resume = normalizeExportBatchResumeState(exportBatchResumeState);
  if (!resume) {
    alert(t('frameGenerator.batchResumeHintNone'));
    return;
  }
  if (resume.mode === 'all-scans') {
    await onExportBatch({ resumeState: resume });
    return;
  }
  if (resume.mode === 'range-list') {
    await onRunBatchRangeList({ resumeState: resume });
    return;
  }
  alert(t('frameGenerator.batchResumeHintNone'));
}

async function onGoToPreviousBatchRange() {
  // Serialiseer met scan-navigatie: voorkomt dat een trage bereik-sprong (schijf-I/O)
  // overlapt met andere navigatie. Overlappende loadScanByPath-calls sloegen de
  // rastergeometrie op onder het verkeerde scanpad → "grid settings veranderd" + knoppen
  // die "niets doen" doordat de UI vastliep op gestapelde laadacties.
  if (stripNavigateBusy || exportScanBusy) return;
  stripNavigateBusy = true;
  try {
    await onGoToPreviousBatchRangeBody();
  } finally {
    stripNavigateBusy = false;
  }
}

async function onGoToPreviousBatchRangeBody() {
  persistCurrentRangeReferenceSnapshot();
  if (!exportScanBatchRanges.length) {
    alert(t('frameExport.batchRangeListEmpty'));
    return;
  }
  if (exportScanBatchSelectedIndex < 0) {
    exportScanBatchSelectedIndex = exportScanBatchWrapNav === true && exportScanBatchRanges.length > 1
      ? exportScanBatchRanges.length - 1
      : 0;
  } else if (exportScanBatchSelectedIndex <= 0) {
    if (exportScanBatchWrapNav === true && exportScanBatchRanges.length > 1) {
      exportScanBatchSelectedIndex = exportScanBatchRanges.length - 1;
    } else {
      updateStatus(0, t('frameGenerator.noPreviousBatchRange'));
      return;
    }
  } else {
    exportScanBatchSelectedIndex -= 1;
  }
  renderExportScanBatchRangeList();
  await jumpToRangeStartScan(exportScanBatchRanges[exportScanBatchSelectedIndex]);
}

async function onGoToNextBatchRange() {
  if (stripNavigateBusy || exportScanBusy) return;
  stripNavigateBusy = true;
  try {
    await onGoToNextBatchRangeBody();
  } finally {
    stripNavigateBusy = false;
  }
}

// Spring rechtstreeks naar een bereik op nummer (1-gebaseerd), vanuit "Ga naar Bereik nr".
async function onGoToBatchRangeByNumber(index1) {
  if (stripNavigateBusy || exportScanBusy) return;
  stripNavigateBusy = true;
  try {
    persistCurrentRangeReferenceSnapshot();
    if (!exportScanBatchRanges.length) {
      alert(t('frameExport.batchRangeListEmpty'));
      return;
    }
    const n = Math.floor(Number(index1));
    if (!Number.isFinite(n) || n < 1 || n > exportScanBatchRanges.length) {
      alert(t('frameExport.batchRangeGotoInvalid', { max: exportScanBatchRanges.length }));
      return;
    }
    exportScanBatchSelectedIndex = n - 1;
    renderExportScanBatchRangeList();
    await jumpToRangeStartScan(exportScanBatchRanges[exportScanBatchSelectedIndex]);
  } finally {
    stripNavigateBusy = false;
  }
}

async function onGoToNextBatchRangeBody() {
  persistCurrentRangeReferenceSnapshot();
  if (!exportScanBatchRanges.length) {
    alert(t('frameExport.batchRangeListEmpty'));
    return;
  }
  if (exportScanBatchSelectedIndex < 0) exportScanBatchSelectedIndex = 0;
  else if (exportScanBatchSelectedIndex >= exportScanBatchRanges.length - 1) {
    if (exportScanBatchWrapNav === true && exportScanBatchRanges.length > 1) {
      exportScanBatchSelectedIndex = 0;
    } else {
      updateStatus(0, t('frameGenerator.noNextBatchRange'));
      return;
    }
  } else {
    exportScanBatchSelectedIndex += 1;
  }
  renderExportScanBatchRangeList();
  await jumpToRangeStartScan(exportScanBatchRanges[exportScanBatchSelectedIndex]);
}

function onBatchRangeRemoveSelected() {
  if (exportScanBatchSelectedIndex < 0 || exportScanBatchSelectedIndex >= exportScanBatchRanges.length) {
    alert(t('frameExport.batchRangeSelectFirst'));
    return;
  }
  exportScanBatchRanges.splice(exportScanBatchSelectedIndex, 1);
  exportScanBatchEditIndex = -1;
  if (exportScanBatchSelectedIndex >= exportScanBatchRanges.length) {
    exportScanBatchSelectedIndex = exportScanBatchRanges.length - 1;
  }
  setExportBatchInsertMode('append');
  saveExportScanBatchRangesAndRefresh();
}

function onBatchRangeClearAll() {
  if (!exportScanBatchRanges.length) return;
  if (!window.confirm(t('frameExport.batchRangeClearConfirm'))) return;
  exportScanBatchRanges = [];
  exportScanBatchSelectedIndex = -1;
  exportScanBatchEditIndex = -1;
  setExportBatchInsertMode('append');
  saveExportScanBatchRangesAndRefresh();
}

async function onAddOrUpdateBatchRange() {
  const range = readExportScanRangeInputs();
  if (!range) return;
  const insertAt = computeRangeInsertIndex();
  if (exportScanBatchEditIndex >= 0) {
    exportScanBatchRanges[insertAt] = range;
    exportScanBatchSelectedIndex = insertAt;
    exportScanBatchEditIndex = -1;
    setExportBatchInsertMode('append');
  } else {
    exportScanBatchRanges.splice(insertAt, 0, range);
    exportScanBatchSelectedIndex = insertAt;
  }
  saveExportScanBatchRangesAndRefresh();
  await jumpToRangeStartScan(range);
}

async function onRunBatchRangeList(options = null) {
  if (!beginBatchRun('range-list')) {
    alert(t('frameGenerator.batchAlreadyRunning'));
    return;
  }
  const opts = options && typeof options === 'object' ? options : {};
  const suppressPreview = opts.suppressPreview === true || exportBatchDisablePreview === true;
  const resume = normalizeExportBatchResumeState(opts.resumeState);
  const folder = getState().exportFolderPath;
  if (!folder) {
    endBatchRun();
    alert(t('frameExport.pickFolderFirst'));
    return;
  }
  if (!exportScanBatchRanges.length) {
    endBatchRun();
    alert(t('frameExport.batchRangeListEmpty'));
    return;
  }
  const paths = await getProjectScanPaths();
  if (!paths.length) {
    endBatchRun();
    alert(t('frameExport.noScansInProject'));
    return;
  }
  const map = buildGlobalFrameMap(paths);
  if (map.totalFrames < 1) {
    endBatchRun();
    alert(t('frameExport.noScansInProject'));
    return;
  }
  let writtenTotal = 0;
  let stopped = false;
  try {
    // Als gebruiker direct exporteert na kalibreren (zonder range-switch), snapshot toch bewaren.
    persistCurrentRangeReferenceSnapshot(exportScanBatchSelectedIndex >= 0 ? exportScanBatchSelectedIndex : 0);
    let startRangeIndex = 0;
    let startGlobalFrame = 1;
    if (resume && resume.mode === 'range-list') {
      startRangeIndex = Math.max(0, Math.min(exportScanBatchRanges.length - 1, resume.rangeIndex || 0));
      startGlobalFrame = Math.max(1, resume.nextGlobalFrame || 1);
      updateStatus(0, t('frameGenerator.batchResumedStatus'));
    } else {
      clearExportBatchResumeState();
    }
    let totalFramesToProcess = 0;
    for (let i = startRangeIndex; i < exportScanBatchRanges.length; i++) {
      const r = exportScanBatchRanges[i];
      const rawFrom = i === startRangeIndex ? Math.max(r.from, startGlobalFrame) : r.from;
      const from = Math.max(1, Math.min(map.totalFrames, rawFrom));
      const to = Math.max(1, Math.min(map.totalFrames, r.to));
      if (from <= to) totalFramesToProcess += Math.max(0, to - from + 1);
    }
    let processedFrames = 0;
    const runStartedAtMs = Date.now();
    for (let i = startRangeIndex; i < exportScanBatchRanges.length; i++) {
      const range = exportScanBatchRanges[i];
      const rawFrom = i === startRangeIndex ? Math.max(range.from, startGlobalFrame) : range.from;
      const from = Math.max(1, Math.min(map.totalFrames, rawFrom));
      const to = Math.max(1, Math.min(map.totalFrames, range.to));
      if (from > to) continue;
      const stopBeforeRange = await waitForBatchRunGate(
        () => ({
          mode: 'range-list',
          rangeIndex: i,
          nextGlobalFrame: from
        }),
        t('frameGenerator.batchPausedStatus')
      );
      if (stopBeforeRange) {
        stopped = true;
        updateStatus(0, t('frameGenerator.batchStoppedStatus'));
        return;
      }
      updateStatus(
        5,
        t('frameGenerator.batchRangeRunningStatus', {
          current: i + 1,
          total: exportScanBatchRanges.length,
          from,
          to
        })
      );
      const startPos = resolveGlobalFramePosition(from, map.rows);
      const fixedReferenceSnapshot = getRangeReferenceSnapshotForRange(range, startPos?.scanPath || '');
      const rangeResult = await exportGlobalFrameRange(
        paths,
        map,
        from,
        to,
        i,
        exportScanBatchRanges.length,
        fixedReferenceSnapshot,
        suppressPreview,
        { startedAtMs: runStartedAtMs, totalFrames: totalFramesToProcess, processedBefore: processedFrames }
      );
      writtenTotal += Number(rangeResult?.written) || 0;
      processedFrames += Number(rangeResult?.processed) || 0;
      if (rangeResult?.stopped) {
        stopped = true;
        updateStatus(0, t('frameGenerator.batchStoppedStatus'));
        return;
      }
    }
    clearExportBatchResumeState();
    if (writtenTotal > 0) {
      alert(t('frameExport.batchRangeListDone', { count: writtenTotal, ranges: exportScanBatchRanges.length, folder }));
    } else {
      alert(t('frameExport.nothingWritten'));
    }
  } catch (e) {
    alert(t('frameExport.batchFailed', { message: e?.message || e }));
  } finally {
    endBatchRun();
    setFrameGeneratorProgress({ visible: false });
    if (!stopped) updateStatus(0, t('status.operationEmpty'));
  }
}

async function exportGlobalFrameRange(paths, frameMap, fromFrame, toFrame, rangeIdx, rangeTotal, fixedReferenceSnapshot = null, suppressPreview = false, progressCtx = null) {
  const folder = getState().exportFolderPath;
  const appSettings = await window.api?.getAppSettings?.().catch(() => null);
  const outDims = getExportOutputDimensions(appSettings);
  const enc = getExportEncoding();
  const startPos = resolveGlobalFramePosition(fromFrame, frameMap.rows);
  const endPos = resolveGlobalFramePosition(toFrame, frameMap.rows);
  if (!startPos || !endPos) return 0;
  let writtenTotal = 0;
  const spanFrames = Math.max(1, toFrame - fromFrame + 1);
  let processedInRange = 0;

  for (let scanIdx = startPos.scanIndex; scanIdx <= endPos.scanIndex; scanIdx++) {
    const scanPath = paths[scanIdx];
    if (!scanPath) continue;
    const sameFolderErr = assertExportFolderNotInput(folder, scanPath);
    if (sameFolderErr) throw new Error(sameFolderErr);
    // Een handmatig (per scan) ingesteld raster heeft voorrang op de range-referentie.
    // Bepaal vóór het laden of deze scan een eigen opgeslagen rasterinstelling heeft.
    const hasOwnGridForScan = !!getLintStateForPath(scanPath);
    // preserveGrid=false → laadt het eigen opgeslagen raster van de scan (incl. per-frame tweaks).
    const ok = await loadScanByPath(scanPath, { ...scanNavigationGridOptions(), preserveGrid: false, skipPreviewRefresh: suppressPreview });
    if (!ok) continue;
    // Alleen terugvallen op de range-referentie voor scans zonder eigen raster.
    if (!hasOwnGridForScan && fixedReferenceSnapshot) {
      applyLintState(fixedReferenceSnapshot);
    }
    const pair = getStripCanvasPairForExport();
    if (!pair) continue;
    try {
      const { preview: previewStrip, export: exportStrip } = pair;
      const n = Math.max(1, getState().numFrames);
      const fileNames = getExportFileNamesForScan(scanPath, n);
      const localStart = scanIdx === startPos.scanIndex ? startPos.frameInScan : 1;
      const localEnd = scanIdx === endPos.scanIndex ? endPos.frameInScan : n;
      for (let i = Math.max(1, localStart); i <= Math.min(n, localEnd); i++) {
        const currentGlobalFrame = frameMap.rows[scanIdx]
          ? frameMap.rows[scanIdx].start + (i - 1)
          : (fromFrame + processedInRange);
        const shouldStop = await waitForBatchRunGate(
          () => ({
            mode: 'range-list',
            rangeIndex: rangeIdx,
            nextGlobalFrame: currentGlobalFrame
          }),
          t('frameGenerator.batchPausedStatus')
        );
        if (shouldStop) {
          return { written: writtenTotal, stopped: true, nextGlobalFrame: currentGlobalFrame, processed: processedInRange };
        }
        let canvas = cropFrameAtIndexForExport(exportStrip, previewStrip, i - 1);
        if (!canvas) {
          processedInRange++;
          continue;
        }
        if (outDims) {
          const scaled = scaleCanvasToSize(canvas, outDims.w, outDims.h, outDims.allowUpscale !== false);
          if (scaled !== canvas) disposeCanvas(canvas);
          canvas = scaled;
        }
        let result = null;
        try {
          const pngBuffer = await canvasToExportBuffer(canvas, enc);
          disposeCanvas(canvas);
          const fileName = fileNames[Math.max(0, i - 1)] || fileNames[0];
          if (window.api?.writeFrameBuffer) {
            result = await window.api.writeFrameBuffer(folder, fileName, pngBuffer, enc.ext);
          } else if (window.api?.writeFrame) {
            const bytes = new Uint8Array(pngBuffer);
            let binary = '';
            const chunk = 0x8000;
            for (let bi = 0; bi < bytes.length; bi += chunk) {
              binary += String.fromCharCode.apply(null, bytes.subarray(bi, bi + chunk));
            }
            result = await window.api.writeFrame(folder, 'frame', 1, 'data:' + enc.mime + ';base64,' + btoa(binary), enc.ext, fileName);
          } else if (window.api?.writeFramePng) {
            const bytes = new Uint8Array(pngBuffer);
            let binary = '';
            const chunk = 0x8000;
            for (let bi = 0; bi < bytes.length; bi += chunk) {
              binary += String.fromCharCode.apply(null, bytes.subarray(bi, bi + chunk));
            }
            result = await window.api.writeFramePng(folder, 'frame', 1, 'data:' + enc.mime + ';base64,' + btoa(binary), fileName);
          } else {
            throw new Error(t('errors.apiUnavailable'));
          }
        } catch (_) {
          disposeCanvas(canvas);
          result = { ok: false };
        }
        if (result?.ok) writtenTotal++;
        processedInRange++;
        const processedTotal = Math.max(
          0,
          Math.floor(Number(progressCtx?.processedBefore) || 0) + processedInRange
        );
        const totalFrames = Math.max(1, Math.floor(Number(progressCtx?.totalFrames) || spanFrames));
        const pct = Math.min(99, Math.round((processedTotal * 100) / totalFrames));
        setFrameGeneratorProgress({
          visible: true,
          pct,
          message: withBatchProgressStats(
            t('frameGenerator.batchRangeProgressFrame', {
              currentRange: rangeIdx + 1,
              totalRanges: rangeTotal,
              frame: fromFrame + processedInRange - 1,
              from: fromFrame,
              to: toFrame
            }),
            {
              startedAtMs: Number(progressCtx?.startedAtMs) || Date.now(),
              processedFrames: processedTotal,
              totalFrames
            }
          )
        });
        await yieldToEventLoop();
      }
    } finally {
      releaseStripCanvasPair(pair);
      assistSampleCache = null;
    }
  }
  return { written: writtenTotal, stopped: false, nextGlobalFrame: toFrame + 1, processed: processedInRange };
}

/** Batch: alle scanlints laden, frames uitsnijden met originele bestandsnamen. */
async function onExportBatch(options = null) {
  if (!beginBatchRun('all-scans')) {
    alert(t('frameGenerator.batchAlreadyRunning'));
    return;
  }
  const opts = options && typeof options === 'object' ? options : {};
  const resume = normalizeExportBatchResumeState(opts.resumeState);
  const suppressPreview = opts.suppressPreview === true || exportBatchDisablePreview === true;
  const folder = getState().exportFolderPath;
  if (!folder) {
    endBatchRun();
    alert(t('frameExport.pickFolderFirst'));
    return;
  }
  const paths = await getProjectScanPaths();
  if (!paths.length) {
    endBatchRun();
    alert(t('frameExport.noScansInProject'));
    return;
  }
  if (resume && resume.mode === 'all-scans') {
    updateStatus(0, t('frameGenerator.batchResumedStatus'));
  } else {
    clearExportBatchResumeState();
  }
  updateStatus(5, t('status.batchStart'));
  let stopped = false;
  try {
    const result = await exportPaths(paths, { resumeState: resume, suppressPreview });
    const written = Number(result?.written) || 0;
    stopped = !!result?.stopped;
    if (stopped) {
      updateStatus(0, t('frameGenerator.batchStoppedStatus'));
      return;
    }
    clearExportBatchResumeState();
    if (written > 0) alert(t('frameExport.batchDone', { count: written, folder }));
    else alert(t('frameExport.nothingWritten'));
  } catch (e) {
    alert(t('frameExport.batchFailed', { message: e?.message || e }));
  } finally {
    endBatchRun();
    setFrameGeneratorProgress({ visible: false });
    if (!stopped) updateStatus(0, t('status.operationEmpty'));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
