/**
 * UI-binding – koppelt DOM aan state en preview. Enige module die getElementById gebruikt.
 */
import { getState, setStrip, setRotation90, setFineRotation, setNumFrames, setActiveFrameIndex, setPixelEditorActiveFrameIndex, setZoomFrames, setFramePreviewVisibleFrames, setStripPreviewMaxDim, setExportFolderPath, setExportBaseName, setExportPauseSeconds, setVideoOutputPath,
  setVideoFramesFolderPath, setGridOffset, setGridOffsetXMargins, setGridOffsetYOnly, setGridOffsetYBottom, setDirty, setFlipHorizontal, setFlipVertical, setTimecodeFps, setFilmFormat, setFilmPolarity, setTiltPivot, setOutputFormat, setScanDpi, setArrowStepPx, setArrowStepShiftPx, setPreserveGridOnScanNav, setPixelEditorOutputFolder, setPixelEditorSourceFolder, setPixelEditorExternalScan, clearPixelEditorExternalScan, getLintStateSnapshot, getGridGeometrySnapshot, applyGridGeometrySnapshot, setLintStateForPath, updateProjectScanInfos, applyLintState, setGridVerticalAnchorMode, setGridVerticalPivotCustomK, setGridSplitLowerPanCanvas, setGridPanelLinkVerticalAnchor, setStripPresetId, resetGridToDefault as resetGridStateToDefault, getLintStateForPath, applyAutoOrientationFromNaturalSize } from './state.js';
import { loadImage, getStripCanvas, getStripCanvasDimensions, getStripCanvasPairForExport } from './strip-loader.js';
import {
  getFrameDimensions,
  getEffectiveGridOffsetX,
  getDefaultGridOffsetX,
  cropFrameAtIndexForExport,
  clampGridMarginsCanvas,
  clampGridVerticalMarginsCanvas,
  getEffectiveGridMargins,
  applyRigidVerticalPanStepCanvas,
  applyBottomAnchoredVerticalPanStepCanvas,
  rigidVerticalPanToBoundaryCanvas,
  bottomAnchoredVerticalPanToBoundaryCanvas,
  getMinGridOffsetYCanvas,
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
import {
  installPixelEditorBridgeInMainWindow,
  refreshFramePixelEditor,
  clearPixelEditorUndoHistory,
  hasVisiblePixelEditorPaintAt,
  getPixelEditorExternalExportCanvas
} from './frame-pixel-editor.js';
import { restoreFramePaintOverlaysFromSerialized } from './frame-pixel-overlay-persist.js';
import { hasProject, getProjectMeta, getProjectPath, isDirty, createProject, openProject, openProjectFromFile, openProjectByPath, saveProject, deleteProject, closeCurrentProject, applySavedLintState, pickResumeLintPath, persistCurrentLintStateInProject } from './project.js';
import { getFromCache, prefetch, clearCache } from './strip-cache.js';
import { normalizeOutputResolutionId, RESOLUTION_ID_TO_DIMS } from './output-resolution.js';

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

/** Gooit bij video-export stoppen (renderer-tak: frames schrijven). */
const VIDEO_EXPORT_STOP_ERROR = 'VIDEO_EXPORT_STOP';
let videoExportStopRequested = false;

/** Geeft Chromium tijd om te tekenen en IPC af te handelen (voorkomt vastlopende UI en strip-preview “bezig”). */
function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Bij video-export: geen project.json na elke scan (te zwaar); één save in finally van onExportVideo. */
const LOAD_SCAN_FOR_VIDEO_EXPORT = { skipPersistAfterLoad: true };

const ids = {
  projectInfo: 'project-info',
  projectDirty: 'project-dirty',
  locale: 'f2f-locale',
  buildVersion: 'f2f-build-version',
  projectFirstStep: 'project-first-step',
  projectStats: 'project-stats',
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
  exportCurrent: 'f2f-export-current',
  exportBatch: 'f2f-export-batch',
  frameGeneratorProgressWrap: 'f2f-frame-generator-progress-wrap',
  frameGeneratorProgressBarhost: 'f2f-frame-generator-progress-barhost',
  frameGeneratorProgressBar: 'f2f-frame-generator-progress-bar',
  frameGeneratorProgressPct: 'f2f-frame-generator-progress-pct',
  frameGeneratorProgressLabel: 'f2f-frame-generator-progress-label',
  pickPixelEditorFolder: 'f2f-pixel-editor-pick-folder',
  pickPixelEditorSourceFolder: 'f2f-pixel-editor-pick-source-folder',
  clearPixelEditorSourceFolder: 'f2f-pixel-editor-clear-source-folder',
  pixelEditorSourcePrev: 'f2f-pixel-editor-source-prev',
  pixelEditorSourceNext: 'f2f-pixel-editor-source-next',
  pixelEditorOutputPath: 'f2f-pixel-editor-output-path',
  pixelEditorSourcePath: 'f2f-pixel-editor-source-path',
  pixelEditorPrevFrame: 'f2f-pixel-editor-prev-frame',
  pixelEditorNextFrame: 'f2f-pixel-editor-next-frame',
  pixelEditorGotoFrame: 'f2f-pixel-editor-goto-frame',
  pixelEditorGotoFrameGo: 'f2f-pixel-editor-goto-frame-go',
  pixelEditorFrameCaption: 'f2f-pixel-editor-frame-caption',
  pickFramesFolder: 'f2f-pick-frames-folder',
  videoFramesFolderPath: 'f2f-video-frames-folder-path',
  videoFormat: 'f2f-video-format',
  pickVideoOutput: 'f2f-pick-video-output',
  videoOutputPath: 'f2f-video-output-path',
  videoFps: 'f2f-video-fps',
  videoScanFrom: 'f2f-video-scan-from',
  videoScanTo: 'f2f-video-scan-to',
  videoUniformFit: 'f2f-video-uniform-fit',
  exportVideo: 'f2f-export-video',
  videoExportStop: 'f2f-video-export-stop',
  videoExportProgressWrap: 'f2f-video-export-progress-wrap',
  videoExportProgressBarhost: 'f2f-video-export-progress-barhost',
  videoExportProgressBar: 'f2f-video-export-progress-bar',
  videoExportProgressPct: 'f2f-video-export-progress-pct',
  videoExportProgress: 'f2f-video-export-progress',
  prevScan: 'f2f-prev-scan',
  nextScan: 'f2f-next-scan',
  goToScan: 'f2f-go-to-scan',
  loadLint: 'f2f-load-lint',
  openStrip: 'f2f-open-strip',
  openAlignPreview: 'f2f-open-align-preview',
  openOutputPreview: 'f2f-open-output-preview',
  openPixelEditor: 'f2f-open-pixel-editor',
  closeStrip: 'f2f-close-strip',
  filmFormat: 'f2f-film-format',
  polarityPos: 'f2f-polarity-pos',
  polarityNeg: 'f2f-polarity-neg',
  tiltPivot: 'f2f-tilt-pivot',
  outputFormat: 'f2f-output-format',
  infoDimensions: 'f2f-info-dimensions',
  infoDpi: 'f2f-info-dpi',
  infoFilm: 'f2f-info-film',
  projectStarten: 'f2f-project-starten',
  exportOutputRes: 'f2f-export-output-res',
  videoOutputRes: 'f2f-video-output-res',
  openSettings: 'f2f-open-settings',
  buildVersion: 'f2f-build-version',
  aboutBtn: 'f2f-about-btn',
  aboutOverlay: 'f2f-about-overlay',
  aboutVersion: 'f2f-about-version',
  aboutClose: 'f2f-about-close'
};

function el(id) { return document.getElementById(id); }

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
  const framesPerScan = Number(meta.framesPerLint) || getState().numFrames || 0;
  const totalFrames = scanCount * framesPerScan;
  const fps = Math.max(12, Math.min(30, getState().timecodeFps || 24));
  if (scanCountEl) scanCountEl.textContent = String(scanCount);
  if (framesPerScanEl) framesPerScanEl.textContent = String(framesPerScan);
  if (totalFramesEl) totalFramesEl.textContent = String(totalFrames);
  if (timecodeEl) timecodeEl.textContent = framesToTimecode(totalFrames, fps);
  if (fpsEl && fpsEl.value !== String(fps)) fpsEl.value = String(fps);
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
  const pixelGoto = el(ids.pixelEditorGotoFrame);
  if (pixelGoto) {
    pixelGoto.max = String(n);
    if (document.activeElement !== pixelGoto) {
      pixelGoto.value = String(s.pixelEditorActiveFrameIndex + 1);
    }
  }
  const capEl = el(ids.pixelEditorFrameCaption);
  if (capEl) {
    if (!s.path || !s.image) {
      capEl.textContent = '—';
    } else {
      const dispPath = s.pixelEditorExternalPath || s.path;
      const stripName = dispPath ? dispPath.replace(/^.*[/\\]/, '') : '—';
      const fi = Math.max(0, Math.min(n - 1, s.pixelEditorActiveFrameIndex || 0)) + 1;
      capEl.textContent = t('pixelEditor.frameDisplayCaption', { strip: stripName, index: fi, total: n });
      capEl.title = s.path ? `${s.path} (${fi}/${n})` : '';
    }
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
  if (el(ids.pixelEditorOutputPath)) {
    const pp = s.pixelEditorOutputFolder;
    el(ids.pixelEditorOutputPath).textContent = pp ? (pp.length > 50 ? '...' + pp.slice(-47) : pp) : '—';
  }
  if (el(ids.pixelEditorSourcePath)) {
    const sp = s.pixelEditorSourceFolder;
    el(ids.pixelEditorSourcePath).textContent = sp ? (sp.length > 50 ? '...' + sp.slice(-47) : sp) : '—';
  }
  el(ids.clearPixelEditorSourceFolder)?.classList.toggle('hidden', !s.pixelEditorSourceFolder);
  const srcNav = isPixelEditorSourceFolderActive();
  el(ids.pixelEditorSourcePrev)?.classList.toggle('hidden', !srcNav);
  el(ids.pixelEditorSourceNext)?.classList.toggle('hidden', !srcNav);
  if (el(ids.exportBaseName)) el(ids.exportBaseName).value = s.exportBaseName || 'frame';
  if (el(ids.exportPause)) el(ids.exportPause).value = String(s.exportPauseSeconds ?? 0);
  const scanCountEl = el(ids.exportScanCount);
  if (scanCountEl) {
    const meta = getProjectMeta();
    const total = (Array.isArray(meta?.scanInfos) && meta.scanInfos.length) ? meta.scanInfos.length : (Number(meta?.numberOfScans) || 0);
    scanCountEl.textContent = hasProject() && total > 0 ? t('frameGenerator.scansInProject', { total }) : t('frameGenerator.scanCountPlaceholder');
  }
  const fromEl = el(ids.exportScanFrom);
  const toEl = el(ids.exportScanTo);
  if (fromEl && toEl) {
    const meta = getProjectMeta();
    const total = (Array.isArray(meta?.scanInfos) && meta.scanInfos.length) ? meta.scanInfos.length : (Number(meta?.numberOfScans) || 0);
    const maxScan = Math.max(1, total);
    fromEl.max = String(maxScan);
    toEl.max = String(maxScan);
    if (total > 0 && (Number(toEl.value) || 0) > maxScan) toEl.value = String(maxScan);
    if (total > 0 && (Number(fromEl.value) || 0) > maxScan) fromEl.value = String(maxScan);
  }
  if (el(ids.videoOutputPath)) el(ids.videoOutputPath).textContent = s.videoOutputPath ? (s.videoOutputPath.length > 50 ? '...' + s.videoOutputPath.slice(-47) : s.videoOutputPath) : '—';
  if (el(ids.videoFramesFolderPath)) el(ids.videoFramesFolderPath).textContent = s.videoFramesFolderPath ? (s.videoFramesFolderPath.length > 50 ? '...' + s.videoFramesFolderPath.slice(-47) : s.videoFramesFolderPath) : '—';
  const videoFromEl = el(ids.videoScanFrom);
  const videoToEl = el(ids.videoScanTo);
  if (videoFromEl && videoToEl) {
    const meta = getProjectMeta();
    const total = (Array.isArray(meta?.scanInfos) && meta.scanInfos.length) ? meta.scanInfos.length : (Number(meta?.numberOfScans) || 0);
    const maxScan = Math.max(1, total);
    videoFromEl.max = String(maxScan);
    videoToEl.max = String(maxScan);
    if (total > 0 && (Number(videoToEl.value) || 0) > maxScan) videoToEl.value = String(maxScan);
    if (total > 0 && (Number(videoFromEl.value) || 0) > maxScan) videoFromEl.value = String(maxScan);
  }
  const filmFormatEl = el(ids.filmFormat);
  if (filmFormatEl && filmFormatEl.value !== s.filmFormat) filmFormatEl.value = s.filmFormat || '16mm-double';
  if (el(ids.polarityPos)) el(ids.polarityPos).checked = s.filmPolarity === 'positief';
  if (el(ids.polarityNeg)) el(ids.polarityNeg).checked = s.filmPolarity === 'negatief';
  const tiltPivotEl = el(ids.tiltPivot);
  if (tiltPivotEl && tiltPivotEl.value !== s.tiltPivot) tiltPivotEl.value = s.tiltPivot || 'center';
  const outputFormatEl = el(ids.outputFormat);
  if (outputFormatEl && outputFormatEl.value !== s.outputFormat) outputFormatEl.value = s.outputFormat || 'png';
  const formatPresetIds = ['f2f-preset-16mm-double', 'f2f-preset-16mm-single', 'f2f-preset-super16', 'f2f-preset-8mm', 'f2f-preset-super8', 'f2f-preset-9.5mm', 'f2f-preset-35mm'];
  formatPresetIds.forEach(id => el(id)?.classList.remove('active'));
  const activePresetId = 'f2f-preset-' + (s.filmFormat || '16mm-double');
  el(activePresetId)?.classList.add('active');
  updateInfoPanel();
  updateProjectUI();
}

function updateInfoPanel() {
  const s = getState();
  const dimEl = el(ids.infoDimensions);
  const dpiEl = el(ids.infoDpi);
  const filmEl = el(ids.infoFilm);
  if (dimEl) {
    if (s.naturalWidth && s.naturalHeight) {
      dimEl.textContent = `${s.naturalWidth} × ${s.naturalHeight} px`;
    } else {
      dimEl.textContent = '—';
    }
  }
  if (dpiEl) dpiEl.textContent = s.scanDpi ? `${s.scanDpi} DPI` : '—';
  if (filmEl) {
    const formatLabels = { '16mm-double': '16mm dubbel', '16mm-single': '16mm enkel', 'super16': 'Super 16mm', '8mm': '8mm', 'super8': 'Super 8', '9.5mm': '9,5mm', '35mm': '35mm' };
    const label = formatLabels[s.filmFormat] || s.filmFormat || '—';
    filmEl.textContent = `${label}, ${s.filmPolarity || 'positief'}`;
  }
}

function isPixelEditorSourceFolderActive() {
  const p = getState().pixelEditorSourceFolder;
  return p != null && String(p).trim() !== '';
}

/** Geordende lijst scanpaden van het project (RASTER SETUP / scanlint) — niet de pixel-editor-bronmap. */
async function getProjectScanPaths() {
  const meta = getProjectMeta();
  if (!meta) return [];
  if (Array.isArray(meta.scanInfos) && meta.scanInfos.length) {
    return meta.scanInfos.map(s => s.path);
  }
  const location = meta.location;
  if (!location || !window.api?.listFolderImages) return [];
  return await window.api.listFolderImages(location);
}

/** Na succesvol laden: project.json bijwerken (lintStates + huidige scan) zodat rasterwijzigingen niet verloren gaan. */
async function persistProjectAfterLintLoad() {
  if (!hasProject()) return;
  try {
    await saveProject();
  } catch (_) {}
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
 * @param {{ preserveGrid?: boolean, skipPersistAfterLoad?: boolean }} [opts] — skipPersistAfterLoad: geen saveProject aan het eind (batch/video).
 */
async function loadScanByPath(lintPath, opts = {}) {
  if (!lintPath || !window.api?.getFileUrl) return false;
  const s = getState();
  const preserveGrid = opts.preserveGrid === true;
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
     * Zonder deze stap: bij A → B → A bleef het raster van A gelijk aan wat in geheugen zat na B
     * (alleen geclampt op A), niet de laatst opgeslagen lintState voor A — daardoor leek afstelling "vergeten".
     * Bestaat er geen snapshot voor dit pad (eerste bezoek), dan blijft doorgeven + clampen zoals voorheen.
     */
    const savedTarget = lintPath ? getLintStateForPath(lintPath) : null;
    if (savedTarget) {
      applyLintState(savedTarget);
    }
    clampCurrentGridToStrip();
    syncGridSplitLowerPanClamp();
    setDirty();
    await restoreFramePaintOverlaysFromSerialized(null);
  }
  updateUI();
  refreshPreviews();
  if (paths.length) prefetch(paths, idx, lintPath, (p) => window.api.getFileUrl(p), getState);
  if (!opts.skipPersistAfterLoad) {
    await persistProjectAfterLintLoad();
  }
  return true;
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
  await loadScanByPath(paths[prevIndex], scanNavigationGridOptions());
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
  await loadScanByPath(paths[nextIndex], scanNavigationGridOptions());
}

/**
 * Vanuit scanlint-preview: eerst huidige lint + project naar schijf, daarna vorige/volgende scan of spring naar index.
 */
async function onStripNavigateScan(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const index1 = p.index != null ? Math.floor(Number(p.index)) : NaN;
  const direction = p.direction === 'next' ? 'next' : p.direction === 'prev' ? 'prev' : '';
  const isGoto = Number.isFinite(index1) && index1 >= 1;
  if (!isGoto && direction !== 'prev' && direction !== 'next') return;
  if (!hasProject()) {
    alert(t('scanNav.stripNavigateNeedContext'));
    return;
  }
  {
    const s = getState();
    if (s.path) {
      const snapshot = getLintStateSnapshot();
      if (snapshot) setLintStateForPath(s.path, snapshot);
    }
    let saveResult;
    try {
      saveResult = await saveProject();
    } catch (_) {
      saveResult = { ok: false, error: t('errors.saveUnknown') };
    }
    if (!saveResult.ok) {
      alert(saveResult.error || t('errors.saveBeforeSwitchFailed'));
      return;
    }
  }
  const paths = await getProjectScanPaths();
  if (!paths.length) {
    alert(t('scanNav.noScans'));
    return;
  }
  if (isGoto) {
    if (index1 < 1 || index1 > paths.length) {
      alert(t('scanNav.goToScanInvalid', { max: paths.length }));
      return;
    }
    await loadScanByPath(paths[index1 - 1], scanNavigationGridOptions());
    return;
  }
  const current = getState().path;
  const idx = current ? paths.indexOf(current) : -1;
  const targetIndex =
    direction === 'prev'
      ? (idx <= 0 ? paths.length - 1 : idx - 1)
      : (idx < 0 ? 0 : (idx >= paths.length - 1 ? 0 : idx + 1));
  await loadScanByPath(paths[targetIndex], scanNavigationGridOptions());
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
  syncGridSplitLowerPanClamp();
  setActiveFrameIndex(getState().activeFrameIndex - 1);
  syncGridSplitLowerPanClamp();
  setDirty();
  updateUI();
  refreshPreviewsGridOnly();
}

function onNextFrame() {
  syncGridSplitLowerPanClamp();
  setActiveFrameIndex(getState().activeFrameIndex + 1);
  syncGridSplitLowerPanClamp();
  setDirty();
  updateUI();
  refreshPreviewsGridOnly();
}

async function saveCurrentPixelEditorFrameToOutputFolder() {
  const s = getState();
  const fi = s.pixelEditorActiveFrameIndex;
  if (!hasVisiblePixelEditorPaintAt(fi)) return { ok: true, skipped: true };
  const folder = s.pixelEditorOutputFolder;
  if (!folder) {
    alert(t('pixelEditor.needOutputFolder'));
    return { ok: false };
  }
  let canvas;
  if (s.pixelEditorExternalPath && s.pixelEditorExternalImage) {
    canvas = getPixelEditorExternalExportCanvas();
  } else {
    const pair = getStripCanvasPairForExport();
    if (!pair) {
      alert(t('pixelEditor.noScanLoaded'));
      return { ok: false };
    }
    const { preview: previewStrip, export: exportStrip } = pair;
    canvas = cropFrameAtIndexForExport(exportStrip, previewStrip, fi);
  }
  if (!canvas) return { ok: false };
  const dataUrl = canvas.toDataURL('image/png');
  const path = s.path || '';
  const base = path.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '') || 'strip';
  const safeBase = base.replace(/[/\\:*?"<>|]/g, '_');
  const idx = fi + 1;
  try {
    const result = window.api?.writeFrame
      ? await window.api.writeFrame(folder, `${safeBase}_pix`, idx, dataUrl, 'png')
      : await window.api?.writeFramePng?.(folder, `${safeBase}_pix`, idx, dataUrl);
    if (!result || !result.ok) {
      alert(
        t('pixelEditor.saveFailed', {
          message: (result && result.error) || (window.api?.writeFrame || window.api?.writeFramePng ? '—' : 'API')
        })
      );
      return { ok: false };
    }
  } catch (e) {
    alert(t('pixelEditor.saveFailed', { message: e?.message || String(e) }));
    return { ok: false };
  }
  return { ok: true };
}

async function onPixelEditorPrevFrame() {
  const r = await saveCurrentPixelEditorFrameToOutputFolder();
  if (!r.ok) return;
  setPixelEditorActiveFrameIndex(getState().pixelEditorActiveFrameIndex - 1);
  updateUI();
  refreshPreviewsGridOnly();
}

async function onPixelEditorNextFrame() {
  const r = await saveCurrentPixelEditorFrameToOutputFolder();
  if (!r.ok) return;
  setPixelEditorActiveFrameIndex(getState().pixelEditorActiveFrameIndex + 1);
  updateUI();
  refreshPreviewsGridOnly();
}

async function onPixelEditorGoToFrameWithValue(frameOneBased) {
  const maxFrames = Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, getState().numFrames || 1));
  const raw = Number(frameOneBased);
  if (!Number.isFinite(raw) || raw < 1 || raw > maxFrames) {
    alert(t('pixelEditor.goToFrameInvalid', { max: maxFrames }));
    return { ok: false };
  }
  const r = await saveCurrentPixelEditorFrameToOutputFolder();
  if (!r.ok) return { ok: false };
  setPixelEditorActiveFrameIndex(raw - 1);
  updateUI();
  refreshPreviewsGridOnly();
  return { ok: true };
}

async function onPickPixelEditorOutputFolder() {
  const folder = await window.api?.selectPixelEditorOutputFolder?.();
  if (folder) {
    setPixelEditorOutputFolder(folder);
    updateUI();
  }
}

/** Lijst beelden in pixel-editor-bronmap (los van project-scanlijst). */
async function getPixelEditorSourceScanPaths() {
  const src = getState().pixelEditorSourceFolder;
  if (src == null || String(src).trim() === '' || !window.api?.listFolderImages) return [];
  const list = await window.api.listFolderImages(src);
  return Array.isArray(list) ? list : [];
}

async function loadPixelEditorExternalImagePath(absPath) {
  if (!absPath || !window.api?.getFileUrl) return false;
  updateStatus(40, t('status.imageLoading'));
  let img;
  try {
    const fileUrl = await window.api.getFileUrl(absPath);
    img = await loadImage(absPath, fileUrl);
  } finally {
    updateStatus(0, t('status.operationEmpty'));
  }
  if (!img) {
    alert(t('pixelEditor.externalLoadFailed'));
    return false;
  }
  setPixelEditorExternalScan(absPath, img);
  setPixelEditorActiveFrameIndex(0);
  updateUI();
  refreshFramePixelEditor();
  return true;
}

async function onPickPixelEditorSourceFolder() {
  const folder = await window.api?.selectFolder?.({
    title: t('pixelEditor.sourceFolderDialogTitle'),
    type: 'fileLocation'
  });
  if (!folder) return;
  clearPixelEditorUndoHistory();
  setPixelEditorSourceFolder(folder);
  updateUI();
  if (!window.api?.listFolderImages) return;
  const paths = await window.api.listFolderImages(folder);
  if (!paths?.length) {
    alert(t('pixelEditor.sourceFolderEmpty'));
    clearPixelEditorExternalScan();
    refreshFramePixelEditor();
    return;
  }
  await loadPixelEditorExternalImagePath(paths[0]);
}

function onClearPixelEditorSourceFolder() {
  clearPixelEditorExternalScan();
  clearPixelEditorUndoHistory();
  setPixelEditorSourceFolder(null);
  updateUI();
  refreshFramePixelEditor();
}

async function onPixelEditorSourcePrevFile() {
  const r = await saveCurrentPixelEditorFrameToOutputFolder();
  if (!r.ok) return;
  const paths = await getPixelEditorSourceScanPaths();
  if (!paths.length) return;
  const cur = getState().pixelEditorExternalPath;
  let idx = cur ? paths.indexOf(cur) : 0;
  if (idx < 0) idx = 0;
  const prev = idx <= 0 ? paths.length - 1 : idx - 1;
  await loadPixelEditorExternalImagePath(paths[prev]);
}

async function onPixelEditorSourceNextFile() {
  const r = await saveCurrentPixelEditorFrameToOutputFolder();
  if (!r.ok) return;
  const paths = await getPixelEditorSourceScanPaths();
  if (!paths.length) return;
  const cur = getState().pixelEditorExternalPath;
  let idx = cur ? paths.indexOf(cur) : 0;
  if (idx < 0) idx = 0;
  const next = idx >= paths.length - 1 ? 0 : idx + 1;
  await loadPixelEditorExternalImagePath(paths[next]);
}

async function onPixelEditorGoToFrame() {
  const raw = parseInt(el(ids.pixelEditorGotoFrame)?.value, 10);
  await onPixelEditorGoToFrameWithValue(raw);
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

function onWidthNarrow() {
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
}

async function onOpenOutputPreview() {
  if (window.api?.openOutputPreview) await window.api.openOutputPreview();
}

function syncOutputResolutionSelects(sourceEl) {
  const v = sourceEl && sourceEl.value != null ? sourceEl.value : 'original';
  const norm = normalizeOutputResolutionId(v);
  const exportSel = el(ids.exportOutputRes);
  const videoSel = el(ids.videoOutputRes);
  if (exportSel && exportSel !== sourceEl) exportSel.value = norm;
  if (videoSel && videoSel !== sourceEl) videoSel.value = norm;
}

/**
 * Doelafmetingen voor export: leest actieve keuze (Frame generator of Instellingen), daarna prefs.
 * @returns {{ w: number, h: number, allowUpscale: boolean } | null} null = geen schaling (native rasterpixels)
 */
function getExportOutputDimensions(appSettings) {
  const rawId =
    el(ids.videoOutputRes)?.value ||
    el(ids.exportOutputRes)?.value ||
    appSettings?.outputResolution ||
    'original';
  const id = normalizeOutputResolutionId(rawId);
  if (id === 'original') return null;
  if (id === 'custom') {
    const w = Math.max(1, Number(appSettings?.customOutputWidth) || 1920);
    const h = Math.max(1, Number(appSettings?.customOutputHeight) || 1080);
    return { w, h, allowUpscale: true };
  }
  const dims = RESOLUTION_ID_TO_DIMS[id];
  if (!dims) return null;
  return { w: dims[0], h: dims[1], allowUpscale: true };
}

/**
 * Schaal proportioneel tot target volledig bedekt is; midden bijsnijden (geen zwarte randen).
 * Zelfde logica als object-fit: cover.
 */
function scaleCanvasToCover(sourceCanvas, targetW, targetH) {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  if (sw < 1 || sh < 1 || targetW < 1 || targetH < 1) return sourceCanvas;
  const scale = Math.max(targetW / sw, targetH / sh);
  const scaledW = Math.max(targetW, Math.ceil(sw * scale));
  const scaledH = Math.max(targetH, Math.ceil(sh * scale));
  const tmp = document.createElement('canvas');
  tmp.width = scaledW;
  tmp.height = scaledH;
  const tctx = tmp.getContext('2d');
  if (tctx.imageSmoothingEnabled !== undefined) tctx.imageSmoothingEnabled = true;
  if (tctx.imageSmoothingQuality) tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(sourceCanvas, 0, 0, sw, sh, 0, 0, scaledW, scaledH);
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d');
  const sx = Math.floor((scaledW - targetW) / 2);
  const sy = Math.floor((scaledH - targetH) / 2);
  ctx.drawImage(tmp, sx, sy, targetW, targetH, 0, 0, targetW, targetH);
  return out;
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
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, targetW, targetH);
  const dx = Math.round((targetW - outW) / 2);
  const dy = Math.round((targetH - outH) / 2);
  if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = true;
  if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, sw, sh, dx, dy, outW, outH);
  return out;
}

/** Even afmeting voor codecs (o.a. H.264 yuv420p). */
function videoDimensionEven(n) {
  const x = Math.max(2, Math.floor(Number(n) || 0));
  return x + (x % 2);
}

/**
 * Zet elk frame op dezelfde pixelmaat (zwart gecentreerd). Nodig voor ffmpeg wanneer uitsneden per scan/rij verschillen.
 */
function padCanvasToVideoUniformSize(canvas, targetW, targetH) {
  const w = canvas.width;
  const h = canvas.height;
  if (w < 1 || h < 1 || targetW < 1 || targetH < 1) return canvas;
  if (w === targetW && h === targetH) return canvas;
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(canvas, Math.round((targetW - w) / 2), Math.round((targetH - h) / 2));
  return out;
}

/** Codecs (H.264/HEVC yuv420p) willen meestal even breedte/hoogte. */
function ensureVideoEvenCanvas(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  if (w < 1 || h < 1) return canvas;
  if (w % 2 === 0 && h % 2 === 0) return canvas;
  const out = document.createElement('canvas');
  out.width = w + (w % 2);
  out.height = h + (h % 2);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

function applyTheme(darkMode) {
  if (document.body) {
    document.body.classList.toggle('theme-light', !darkMode);
  }
}

async function loadAppSettings() {
  try {
    const s = await window.api?.getAppSettings?.();
    if (!s || typeof s !== 'object') return;
    const outNorm = normalizeOutputResolutionId(s.outputResolution);
    if (el(ids.exportOutputRes)) el(ids.exportOutputRes).value = outNorm;
    if (el(ids.videoOutputRes)) el(ids.videoOutputRes).value = outNorm;
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
    if (el(ids.videoUniformFit)) {
      el(ids.videoUniformFit).value = s.videoExportUniformFit === 'cover' ? 'cover' : 'pad';
    }
    applyTheme(s.darkMode);
    const arrowPx = (s.arrowStepPx != null && Number(s.arrowStepPx) >= 1) ? Math.min(10, Number(s.arrowStepPx)) : 1;
    const arrowShiftPx = (s.arrowStepShiftPx != null && Number(s.arrowStepShiftPx) >= 10) ? Math.min(100, Number(s.arrowStepShiftPx)) : 10;
    setArrowStepPx(arrowPx);
    setArrowStepShiftPx(arrowShiftPx);
    setScanDpi(Number(s.scanDpi) || 4800);
    setOutputFormat(s.outputFormat === 'jpg' || s.outputFormat === 'jpeg' ? 'jpg' : 'png');
    updateUI();
    if (getState().image) refreshPreviews();
  } catch (_) {}
}

function initSubPanelCollapse() {
  document.querySelectorAll('.sub-panel-collapse-btn').forEach((btn) => {
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

function buildPresetPayloadFromState() {
  const s = getState();
  return {
    ...getLintStateSnapshot(),
    filmFormat: s.filmFormat,
    filmPolarity: s.filmPolarity,
    numFrames: s.numFrames,
    outputFormat: s.outputFormat,
    scanDpi: s.scanDpi
  };
}

async function savePresetWithName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    alert(t('stripPreset.nameRequired'));
    return { ok: false };
  }
  if (!window.api?.presetSave) return { ok: false };
  const data = buildPresetPayloadFromState();
  const result = await window.api.presetSave(trimmed, data);
  if (result?.ok) {
    if (result.preset?.id) setStripPresetId(result.preset.id);
    window.api?.notifyStripPresetsUpdated?.();
    refreshPreviews();
  } else if (result?.error) alert(result.error);
  return result || { ok: false };
}

async function applyLoadedPresetData(data) {
  if (!data) {
    alert(t('stripPreset.notFound'));
    return;
  }
  applyLintState(data);
  await restoreFramePaintOverlaysFromSerialized(null);
  if (data.filmFormat) setFilmFormat(data.filmFormat);
  if (data.filmPolarity) setFilmPolarity(data.filmPolarity);
  if (data.numFrames != null) setNumFrames(data.numFrames);
  if (data.outputFormat) setOutputFormat(data.outputFormat);
  if (data.scanDpi != null) setScanDpi(data.scanDpi);
  setDirty();
  updateUI();
  refreshPreviews();
  refreshFramePixelEditor();
}

async function onStripPresetDoSave(name) {
  await savePresetWithName(typeof name === 'string' ? name : '');
}

async function onStripPresetDoLoad(id) {
  if (!id || !window.api?.presetLoad) return;
  const data = await window.api.presetLoad(id);
  await applyLoadedPresetData(data);
  setStripPresetId(id);
  refreshPreviews();
}

async function onStripPresetDoDelete(id) {
  if (!id) {
    alert(t('stripPreset.selectFirst'));
    return;
  }
  if (!confirm(t('stripPreset.confirmDelete'))) return;
  if (!window.api?.presetDelete) return;
  await window.api.presetDelete(id);
  const meta = getProjectMeta();
  if (meta?.stripPresetId != null && String(meta.stripPresetId) === String(id)) {
    setStripPresetId(null);
  }
  window.api?.notifyStripPresetsUpdated?.();
  refreshPreviews();
}

async function refreshGridPresetList() {
  const sel = el(ids.gridPresetList);
  if (!sel || !window.api?.gridPresetsList) return;
  try {
    const list = await window.api.gridPresetsList();
    const cur = sel.value;
    sel.innerHTML =
      `<option value="">${escapeHtml(t('overlay.gridPresetListPlaceholder'))}</option>` +
      (Array.isArray(list)
        ? list
            .map((p) => {
              const id = escapeHtml(String(p.id || ''));
              const name = escapeHtml(String(p.name || ''));
              return `<option value="${id}">${name}</option>`;
            })
            .join('')
        : '');
    if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
  } catch (_) {}
}

async function onGridPresetSaveClick() {
  const name = el(ids.gridPresetName)?.value?.trim() || '';
  if (!name) {
    alert(t('gridPreset.nameRequired'));
    return;
  }
  if (!window.api?.gridPresetSave) return;
  const grid = getGridGeometrySnapshot();
  const result = await window.api.gridPresetSave(name, grid);
  if (result?.ok) {
    if (el(ids.gridPresetName)) el(ids.gridPresetName).value = '';
    await refreshGridPresetList();
    if (result.preset?.id && el(ids.gridPresetList)) el(ids.gridPresetList).value = result.preset.id;
  } else if (result?.error) alert(result.error);
}

async function onGridPresetLoadClick() {
  const sel = el(ids.gridPresetList);
  const id = sel?.value;
  if (!id) {
    alert(t('gridPreset.selectFirst'));
    return;
  }
  if (!window.api?.gridPresetLoad) return;
  const grid = await window.api.gridPresetLoad(id);
  if (!grid || typeof grid !== 'object') {
    alert(t('gridPreset.notFound'));
    return;
  }
  applyGridGeometrySnapshot(grid);
  syncGridSplitLowerPanClamp();
  setDirty();
  updateUI();
  refreshPreviews();
}

async function onGridPresetDeleteClick() {
  const id = el(ids.gridPresetList)?.value;
  if (!id) {
    alert(t('gridPreset.selectToDelete'));
    return;
  }
  if (!confirm(t('gridPreset.confirmDelete'))) return;
  if (!window.api?.gridPresetDelete) return;
  await window.api.gridPresetDelete(id);
  await refreshGridPresetList();
}

/** Voortgang scanlint-map → zelfde percentage als modal (toolbar “Belasting”). */
function scanInfosProgressToStatus(d) {
  const current = Number(d?.current) || 0;
  const total = Number(d?.total) || 0;
  if (total > 0) {
    updateStatus(Math.round((100 * current) / total), t('status.scanStripProgress', { current, total }));
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

async function onPickLocation() {
  const folder = await window.api?.selectFolder?.({ title: t('project.pickFileLocationTitle'), type: 'fileLocation' });
  if (folder) {
    const locEl = el(ids.locationPath);
    if (locEl) {
      locEl.setAttribute('data-path', folder);
      locEl.textContent = folder.length > 45 ? '...' + folder.slice(-42) : folder;
    }
    await updateScanCountAndOrient(folder);
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

async function onCreateProject() {
  const projectFolderPath = el(ids.projectFolderPath)?.getAttribute('data-path')?.trim();
  let locationPath = el(ids.locationPath)?.getAttribute('data-path')?.trim();
  if (!projectFolderPath) { alert(t('project.pickFolderFirst')); return; }
  const name = (el(ids.projectName)?.value || '').trim() || undefined;
  const framesPerLint = parseInt(el(ids.projectFrames)?.value, 10);
  const countPath = locationPath || projectFolderPath;
  if (countPath) {
    await updateScanCountAndOrient(countPath);
  }
  const scanCountVal = el(ids.scanCount)?.value?.trim();
  const numberOfScans = scanCountVal ? parseInt(scanCountVal, 10) : undefined;
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
    scanInfos: lastScanInfos.length ? lastScanInfos : undefined,
    filmFormat: s.filmFormat || '16mm-double',
    filmPolarity: s.filmPolarity || 'positief',
    outputFolder: s.exportFolderPath || null,
    outputFormat: s.outputFormat || 'png',
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

function onShowNewProjectForm() {
  el(ids.newProjectForm)?.classList.remove('hidden');
  el(ids.showNewProjectForm)?.classList.add('hidden');
}

function onNewProjectClick() {
  el(ids.projectFirstStep)?.classList.remove('hidden');
  onShowNewProjectForm();
}

async function reloadPixelEditorSourceAfterProjectOpen() {
  const folder = getState().pixelEditorSourceFolder;
  if (!folder || !window.api?.listFolderImages) return;
  const paths = await window.api.listFolderImages(folder);
  if (paths?.length) await loadPixelEditorExternalImagePath(paths[0]);
}

async function finishOpenProject(result) {
  if (!result.ok) {
    if (result.error) alert(result.error);
    return;
  }
  clearCache();
  updateProjectUI();
  const paths = await getProjectScanPaths();
  const toLoad = pickResumeLintPath(paths, getState().lintStates, result.project?.currentLintPath ?? getProjectMeta()?.currentLintPath);
  if (toLoad) await loadScanByPath(toLoad);
  await reloadPixelEditorSourceAfterProjectOpen();
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
  updateProjectUI();
  updateUI();
  const paths = await getProjectScanPaths();
  const toLoad = pickResumeLintPath(paths, getState().lintStates, result.project?.currentLintPath ?? getProjectMeta()?.currentLintPath);
  if (toLoad) await loadScanByPath(toLoad);
  await reloadPixelEditorSourceAfterProjectOpen();
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
    updateProjectUI();
    updateUI();
    refreshPreviews();
  } else if (result.error) alert(result.error);
}

async function onCloseProjectClick() {
  if (!hasProject()) return;
  if (isDirty() && !confirm(t('project.closeProjectConfirm'))) return;
  clearCache();
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

async function onOpenAlignPreview() {
  try {
    if (window.api?.openAlignPreview) {
      const r = await window.api.openAlignPreview();
      if (r && !r.ok && r.error) console.warn(t('errors.logAlignWindow', { error: r.error }));
    }
  } catch (_) {}
  refreshPreviews();
}

async function onOpenPixelEditor() {
  try {
    const focusR = await window.api?.focusPixelEditorWindow?.();
    if (focusR?.ok) return;
    if (window.api?.openPixelEditorWindow) {
      const r = await window.api.openPixelEditorWindow();
      if (r && !r.ok && r.error) console.warn(t('errors.logPixelEditor', { error: r.error }));
    }
  } catch (_) {}
}

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
    if (window.api?.openStripPreview) await window.api.openStripPreview();
  } catch (_) {}
  refreshPreviews();
}

function onFrameGridOffsetFromPreview(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  let deltaX = p.deltaX != null ? Number(p.deltaX) : 0;
  const deltaY = p.deltaY != null ? Number(p.deltaY) : 0;
  const tool = p.tool || 'hand';

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
    /* Horizontaal: altijd verschuiven (L+ = verbreden linkerkant, L− = versmallen; R−/R+ spiegel), nooit symmetrische gridOffsetX — dat verbreedt/versmalt alleen. */
    const nFrames = Math.max(1, s.numFrames || 1);
    if (dx !== 0) {
      const m = getEffectiveGridMargins(frameWidth);
      const c = clampGridMarginsCanvas(frameWidth, m.left + dx, m.right - dx);
      setGridOffsetXMargins(c.left, c.right);
    }
    if (dy !== 0) {
      /* Hand ▲▼: altijd heel raster (T/B); split-pan blijft voor T±/B±/Duw. Anders “doen” de knoppen niets bij 2≤k<n als d op clamp zit. */
      const cv = applyRigidVerticalPanStepCanvas(
        frameHeight,
        nFrames,
        s.gridOffsetY || 0,
        s.gridOffsetYBottom ?? 0,
        dy
      );
      setGridOffsetYOnly(cv.top);
      setGridOffsetYBottom(cv.bottom);
      syncGridSplitLowerPanClamp();
    }
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
  const p = payload && typeof payload === 'object' ? payload : {};
  const edge = p.edge === 'right' ? 'right' : 'left';
  const deltaDisplay = p.delta != null ? Number(p.delta) : 0;
  if (deltaDisplay === 0) return;

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
}

function onStripAdjustHeightEdge(payload) {
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
}

function onStripVerticalRigidPanBoundaryFromPreview(towardCompress) {
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
  const s = getState();
  const n = Math.max(1, s.numFrames);
  const newX = clampGridOffsetX(frameWidth, p.gridOffsetX != null ? Number(p.gridOffsetX) : s.gridOffsetX);
  const wantY = p.gridOffsetY != null ? Number(p.gridOffsetY) : (s.gridOffsetY || 0);
  const wantYB = p.gridOffsetYBottom != null ? Number(p.gridOffsetYBottom) : (s.gridOffsetYBottom ?? 0);
  const cv = clampGridVerticalMarginsCanvas(frameHeight, n, wantY, wantYB);
  setGridOffset(newX, cv.top);
  setGridOffsetYBottom(cv.bottom);
  syncGridSplitLowerPanClamp();
  setDirty();
  updateUI();
  if (canvas) {
    const dim = getScaledDimensions(canvas);
    if (dim && dim.width >= 1 && dim.height >= 1 && canvas.height > 0) {
      const scale = dim.height / canvas.height;
      refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale, newX, canvas.width));
    } else {
      refreshPreviewsGridOnly();
    }
  } else {
    refreshPreviewsGridOnly();
  }
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
  el(ids.refreshScanList)?.addEventListener('click', onRefreshScanList);
  el(ids.timecodeFps)?.addEventListener('change', onTimecodeFpsChange);
  el(ids.timecodeFps)?.addEventListener('input', onTimecodeFpsChange);
  el(ids.createProject)?.addEventListener('click', onCreateProject);
  el(ids.cancelNewProject)?.addEventListener('click', onCancelNewProject);
  el(ids.prevScan)?.addEventListener('click', onPrevScan);
  el(ids.nextScan)?.addEventListener('click', onNextScan);
  el(ids.goToScan)?.addEventListener('click', onGoToScan);
  el(ids.loadLint)?.addEventListener('click', onLoadLint);
  el(ids.filmFormat)?.addEventListener('change', onFilmFormatChange);
  el(ids.polarityPos)?.addEventListener('change', onPolarityChange);
  el(ids.polarityNeg)?.addEventListener('change', onPolarityChange);
  el(ids.tiltPivot)?.addEventListener('change', onTiltPivotChange);
  el(ids.outputFormat)?.addEventListener('change', onOutputFormatChange);
  el(ids.openOutputPreview)?.addEventListener('click', onOpenOutputPreview);
  el(ids.openSettings)?.addEventListener('click', () => {
    void window.api?.openSettingsWindow?.();
  });
  initSubPanelCollapse();
  function onOutputResolutionChange(ev) {
    syncOutputResolutionSelects(ev?.target || el(ids.exportOutputRes));
  }
  el(ids.exportOutputRes)?.addEventListener('change', onOutputResolutionChange);
  el(ids.videoOutputRes)?.addEventListener('change', onOutputResolutionChange);
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
  el(ids.preset16mmDouble)?.addEventListener('click', () => applyFilmFormatQuickPreset('16mm-double'));
  el(ids.preset16mmSingle)?.addEventListener('click', () => applyFilmFormatQuickPreset('16mm-single'));
  el(ids.presetSuper16)?.addEventListener('click', () => applyFilmFormatQuickPreset('super16'));
  el('f2f-preset-8mm')?.addEventListener('click', () => applyFilmFormatQuickPreset('8mm'));
  el('f2f-preset-super8')?.addEventListener('click', () => applyFilmFormatQuickPreset('super8'));
  el('f2f-preset-9.5mm')?.addEventListener('click', () => applyFilmFormatQuickPreset('9.5mm'));
  el('f2f-preset-35mm')?.addEventListener('click', () => applyFilmFormatQuickPreset('35mm'));
    el(ids.applyGridFromMm)?.addEventListener('click', applyGridFromMm);
    el(ids.applyGridFromPx)?.addEventListener('click', applyGridFromPxInputs);
    el(ids.captureGridRefPx)?.addEventListener('click', fillGridPxFieldsFromCurrentCell);
  el(ids.gridPresetSave)?.addEventListener('click', () => onGridPresetSaveClick().catch(() => {}));
  el(ids.gridPresetLoad)?.addEventListener('click', () => onGridPresetLoadClick().catch(() => {}));
  el(ids.gridPresetDelete)?.addEventListener('click', () => onGridPresetDeleteClick().catch(() => {}));
  el(ids.workflowSingleFrame)?.addEventListener('click', onWorkflowSingleFrameClick);
  el(ids.workflowApplyStarter)?.addEventListener('click', onWorkflowApplyStarterClick);
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
  el(ids.pickPixelEditorFolder)?.addEventListener('click', () => onPickPixelEditorOutputFolder().catch(() => {}));
  el(ids.pickPixelEditorSourceFolder)?.addEventListener('click', () => onPickPixelEditorSourceFolder().catch(() => {}));
  el(ids.clearPixelEditorSourceFolder)?.addEventListener('click', onClearPixelEditorSourceFolder);
  el(ids.pixelEditorSourcePrev)?.addEventListener('click', () => void onPixelEditorSourcePrevFile());
  el(ids.pixelEditorSourceNext)?.addEventListener('click', () => void onPixelEditorSourceNextFile());
  el(ids.pixelEditorPrevFrame)?.addEventListener('click', () => void onPixelEditorPrevFrame());
  el(ids.pixelEditorNextFrame)?.addEventListener('click', () => void onPixelEditorNextFrame());
  el(ids.pixelEditorGotoFrameGo)?.addEventListener('click', () => void onPixelEditorGoToFrame());
  el(ids.pixelEditorGotoFrame)?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void onPixelEditorGoToFrame();
    }
  });
  el(ids.openPixelEditor)?.addEventListener('click', () => onOpenPixelEditor().catch(() => {}));
  el(ids.exportBaseName)?.addEventListener('change', function () { setExportBaseName(el(ids.exportBaseName)?.value); });
  el(ids.exportBaseName)?.addEventListener('input', function () { setExportBaseName(el(ids.exportBaseName)?.value); });
  el(ids.exportPause)?.addEventListener('change', function () { setExportPauseSeconds(el(ids.exportPause)?.value); });
  el(ids.exportCurrent)?.addEventListener('click', onExportCurrentScan);
  el(ids.exportBatch)?.addEventListener('click', onExportBatch);
  el(ids.exportBatchRange)?.addEventListener('click', onExportBatchRange);
  el(ids.pickFramesFolder)?.addEventListener('click', onPickFramesFolder);
  el(ids.pickVideoOutput)?.addEventListener('click', onPickVideoOutput);
  el(ids.exportVideo)?.addEventListener('click', onExportVideo);
  el(ids.videoExportStop)?.addEventListener('click', onVideoExportStop);
  el(ids.videoUniformFit)?.addEventListener('change', () => {
    persistVideoExportUniformFit().catch(() => {});
  });
  el(ids.openStrip)?.addEventListener('click', onOpenStrip);
  el(ids.openAlignPreview)?.addEventListener('click', () => onOpenAlignPreview().catch(() => {}));

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

async function init() {
  installPixelEditorBridgeInMainWindow(() => {
    refreshPreviews();
  });
  window.__f2fPixelEditorMainUi = async (action, payload) => {
    switch (action) {
      case 'pickOutputFolder':
        await onPickPixelEditorOutputFolder();
        return { ok: true };
      case 'pickSourceFolder':
        await onPickPixelEditorSourceFolder();
        return { ok: true };
      case 'clearSourceFolder':
        onClearPixelEditorSourceFolder();
        return { ok: true };
      case 'sourcePrev':
        await onPixelEditorSourcePrevFile();
        return { ok: true };
      case 'sourceNext':
        await onPixelEditorSourceNextFile();
        return { ok: true };
      case 'prevFrame':
        await onPixelEditorPrevFrame();
        return { ok: true };
      case 'nextFrame':
        await onPixelEditorNextFrame();
        return { ok: true };
      case 'gotoFrame':
        return onPixelEditorGoToFrameWithValue(payload?.frameOneBased);
      default:
        return { ok: false, error: 'unknown-action' };
    }
  };

  bind();
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
        }
      });
    }
  }
  registerQuitSaveHandler();
  refreshGridPresetList().catch(() => {});
  updateUI();
  if (!hasProject()) {
    el(ids.lintPanel)?.classList.add('hidden');
    el(ids.projectFirstStep)?.classList.remove('hidden');
    const lastPath = await window.api?.getLastProjectPath?.();
    if (lastPath) {
      try {
        const result = await openProjectByPath(lastPath);
        if (result?.ok) {
          clearCache();
          updateProjectUI();
          updateUI();
          const paths = await getProjectScanPaths();
          const toLoad = pickResumeLintPath(paths, getState().lintStates, result.project?.currentLintPath ?? getProjectMeta()?.currentLintPath);
          if (toLoad) await loadScanByPath(toLoad);
          await reloadPixelEditorSourceAfterProjectOpen();
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
  window.api?.onStripPreviewClosed?.(refreshPreviews);
  window.api?.onStripPreviewReady?.(() => {
    refreshPreviews();
    setTimeout(() => refreshPreviews(), 400);
  });
  window.api?.onAlignPreviewReady?.(() => {
    refreshPreviews();
    setTimeout(() => refreshPreviews(), 400);
  });
  window.api?.onOutputPreviewClosed?.(() => {});
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
  window.api?.onStripPresetDoSave?.(onStripPresetDoSave);
  window.api?.onStripPresetDoLoad?.(onStripPresetDoLoad);
  window.api?.onStripPresetDoDelete?.(onStripPresetDoDelete);
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

/**
 * Raster aanpassen op basis van metrische maten (mm) en px/mm.
 * Berekent offset en aantal frames zodat de celgrootte zo dicht mogelijk bij de opgegeven mm ligt.
 */
function applyGridFromMm() {
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

async function onPickFramesFolder() {
  const defaultPath = getState().exportFolderPath;
  const folder = await window.api?.selectFolder?.({ defaultPath, title: t('videoExport.framesFolderDialogTitle') });
  if (folder) {
    setVideoFramesFolderPath(folder);
    updateUI();
  }
}

async function onPickVideoOutput() {
  const formatId = el(ids.videoFormat)?.value || 'h264';
  const filePath = await window.api?.selectVideoOutputFile?.(formatId);
  if (filePath) {
    setVideoOutputPath(filePath);
    updateUI();
  }
}

function getVideoUniformFit() {
  return el(ids.videoUniformFit)?.value === 'cover' ? 'cover' : 'pad';
}

async function persistVideoExportUniformFit() {
  const v = getVideoUniformFit();
  try {
    const s = await window.api?.getAppSettings?.();
    if (!s || typeof s !== 'object') return;
    await window.api?.setAppSettings?.({ ...s, videoExportUniformFit: v });
  } catch (_) {}
}

function onVideoExportStop() {
  videoExportStopRequested = true;
  window.api?.cancelVideoExport?.();
}

/** Exporteert frames naar MP4 via ffmpeg. Gebruikt map met frames indien gekozen, anders projectscans. */
async function onExportVideo() {
  const outputPath = getState().videoOutputPath;
  if (!outputPath) {
    alert(t('videoExport.pickFileFirst'));
    return;
  }
  const fps = Math.max(1, Math.min(60, parseInt(el(ids.videoFps)?.value, 10) || 24));
  const framesFolder = getState().videoFramesFolderPath;
  if (!framesFolder) {
    const paths = await getProjectScanPaths();
    if (!paths.length) {
      alert(t('videoExport.noScans'));
      return;
    }
  }

  const progressWrap = el(ids.videoExportProgressWrap);
  const progressEl = el(ids.videoExportProgress);
  const progressBar = el(ids.videoExportProgressBar);
  const progressBarhost = el(ids.videoExportProgressBarhost);
  const progressPctEl = el(ids.videoExportProgressPct);
  const stopBtn = el(ids.videoExportStop);
  /** Statustekst, voortgangsbalk in paneel + titelbalk-load (0–100). */
  const setProgress = (msg, percent) => {
    const label = msg === '' || msg == null ? '' : String(msg);
    if (progressEl) progressEl.textContent = label || '—';
    if (percent != null && Number.isFinite(Number(percent))) {
      const p = Math.max(0, Math.min(100, Math.round(Number(percent))));
      if (progressBar) progressBar.style.width = p + '%';
      if (progressPctEl) progressPctEl.textContent = p + '%';
      if (progressBarhost) {
        progressBarhost.setAttribute('aria-valuenow', String(p));
        progressBarhost.setAttribute('aria-label', label || t('videoExport.sectionTitle'));
      }
      updateStatus(p, label || '—');
    } else if (msg === '' || msg == null) {
      if (progressBar) progressBar.style.width = '0%';
      if (progressPctEl) progressPctEl.textContent = '0%';
      if (progressBarhost) {
        progressBarhost.setAttribute('aria-valuenow', '0');
        progressBarhost.setAttribute('aria-label', t('videoExport.sectionTitle'));
      }
    }
  };
  /** Encoder gebruikt dit bereik (map-export vs projectframes). */
  const loadCtx = { encodeBase: 40, encodeSpan: 55 };

  let videoTempFolder = null;
  await window.api?.prepareVideoExport?.();
  videoExportStopRequested = false;
  window.api?.onVideoExportProgress?.(({ phase, detail }) => {
    if (phase === 'copy' && detail && typeof detail === 'object' && detail.total > 0) {
      const cur = Math.max(0, Number(detail.current) || 0);
      const tot = detail.total;
      const p = 5 + Math.round(35 * (cur / tot));
      setProgress(t('videoExport.progressCopy') + ` (${cur}/${tot})`, p);
    }
    if (phase === 'encoding') {
      const baseMsg = t('videoExport.progressEncoding');
      if (detail && typeof detail === 'object' && detail.total > 0 && detail.current > 0) {
        const cur = Math.min(Number(detail.current), Number(detail.total));
        const tot = Number(detail.total);
        const p = loadCtx.encodeBase + Math.round(loadCtx.encodeSpan * (cur / tot));
        setProgress(baseMsg + ` (${cur}/${tot})`, p);
      } else {
        const mid = loadCtx.encodeBase + Math.round(loadCtx.encodeSpan * 0.55);
        setProgress(baseMsg, mid);
      }
    }
    if (phase === 'done') setProgress(t('videoExport.progressDone'), 100);
  });

  const assertNotStopped = () => {
    if (videoExportStopRequested) throw new Error(VIDEO_EXPORT_STOP_ERROR);
  };

  try {
    if (progressWrap) progressWrap.classList.remove('hidden');
    if (stopBtn) stopBtn.classList.remove('hidden');
    await yieldToEventLoop();
    setProgress(t('videoExport.sectionTitle'), 2);

    if (framesFolder) {
      loadCtx.encodeBase = 40;
      loadCtx.encodeSpan = 55;
      setProgress(t('videoExport.progressCopy'), 8);
      const formatId = el(ids.videoFormat)?.value || 'h264';
      const uniformFit = getVideoUniformFit();
      const result = await window.api?.createVideoFromFolder?.({
        folderPath: framesFolder,
        outputPath,
        fps,
        formatId,
        uniformFit
      });
      if (result?.cancelled) {
        setProgress(t('videoExport.cancelled'), 0);
        return;
      }
      if (result?.ok) {
        alert(t('videoExport.success', { path: outputPath }));
      } else {
        throw new Error(result?.error || t('ipc.errorVideoFailed'));
      }
      return;
    }

    const paths = await getProjectScanPaths();
    const fromVal = parseInt(el(ids.videoScanFrom)?.value, 10);
    const toVal = parseInt(el(ids.videoScanTo)?.value, 10);
    const from = Number.isFinite(fromVal) && fromVal >= 1 ? fromVal : 1;
    const to = Number.isFinite(toVal) && toVal >= 1 ? toVal : 1;
    const fromIdx = Math.min(from, to);
    const toIdx = Math.max(from, to);
    const scanPaths = paths.slice(fromIdx - 1, toIdx);
    if (!scanPaths.length) {
      alert(t('videoExport.noScansInRange'));
      return;
    }

    setProgress(t('videoExport.progressFrames'), 4);
    const tempFolder = await window.api?.getTempVideoFolder?.();
    if (!tempFolder) throw new Error(t('videoExport.tempFolderFailed'));
    videoTempFolder = tempFolder;
    const appSettings = await window.api?.getAppSettings?.().catch(() => null);
    const outDims = getExportOutputDimensions(appSettings);
    const uniformFit = getVideoUniformFit();
    const total = scanPaths.length;
    const framesPerStrip = Math.max(1, getState().numFrames);
    const totalFramesToWrite = total * framesPerStrip;
    const writeFrame = window.api?.writeFrame || window.api?.writeFramePng;

    let videoUniformW = 0;
    let videoUniformH = 0;
    if (!outDims) {
      setProgress(t('videoExport.progressMeasure'), 6);
      let maxW = 0;
      let maxH = 0;
      for (let scanIdx = 0; scanIdx < total; scanIdx++) {
        assertNotStopped();
        const measurePct = 6 + Math.round(19 * ((scanIdx + 1) / total));
        setProgress(t('videoExport.progressScan', { current: scanIdx + 1, total }), measurePct);
        const ok = await loadScanByPath(scanPaths[scanIdx], LOAD_SCAN_FOR_VIDEO_EXPORT);
        if (!ok) continue;
        const pair = getStripCanvasPairForExport();
        if (!pair) continue;
        const { preview: previewStrip, export: exportStrip } = pair;
        const n = Math.max(1, getState().numFrames);
        for (let i = 0; i < n; i++) {
          const c = cropFrameAtIndexForExport(exportStrip, previewStrip, i);
          if (!c) continue;
          maxW = Math.max(maxW, c.width);
          maxH = Math.max(maxH, c.height);
        }
        await yieldToEventLoop();
      }
      assertNotStopped();
      if (maxW < 1 || maxH < 1) {
        throw new Error(t('videoExport.noFramesExtracted'));
      }
      videoUniformW = videoDimensionEven(maxW);
      videoUniformH = videoDimensionEven(maxH);
    }

    const extractLo = outDims ? 5 : 28;
    const extractHi = 80;
    const extractSpan = extractHi - extractLo;
    let frameIndex = 1;
    let framesWritten = 0;
    for (let scanIdx = 0; scanIdx < total; scanIdx++) {
      assertNotStopped();
      const ok = await loadScanByPath(scanPaths[scanIdx], LOAD_SCAN_FOR_VIDEO_EXPORT);
      if (!ok) continue;
      const pair = getStripCanvasPairForExport();
      if (!pair) continue;
      const { preview: previewStrip, export: exportStrip } = pair;
      const n = Math.max(1, getState().numFrames);
      for (let i = 0; i < n; i++) {
        assertNotStopped();
        let canvas = cropFrameAtIndexForExport(exportStrip, previewStrip, i);
        if (!canvas) continue;
        if (outDims) {
          canvas =
            uniformFit === 'cover'
              ? scaleCanvasToCover(canvas, outDims.w, outDims.h)
              : scaleCanvasToSize(canvas, outDims.w, outDims.h, outDims.allowUpscale !== false);
        } else if (uniformFit === 'cover') {
          canvas = scaleCanvasToCover(canvas, videoUniformW, videoUniformH);
        } else {
          canvas = padCanvasToVideoUniformSize(canvas, videoUniformW, videoUniformH);
        }
        canvas = ensureVideoEvenCanvas(canvas);
        const dataUrl = canvas.toDataURL('image/png');
        if (writeFrame) {
          await window.api.writeFrame(tempFolder, 'frame', frameIndex, dataUrl, 'png');
        } else {
          await window.api?.writeFramePng?.(tempFolder, 'frame', frameIndex, dataUrl);
        }
        frameIndex++;
        framesWritten++;
        if (totalFramesToWrite > 0 && (framesWritten % 4 === 0 || framesWritten === totalFramesToWrite)) {
          const wPct = extractLo + Math.round((extractSpan * framesWritten) / totalFramesToWrite);
          setProgress(
            t('videoExport.progressScan', { current: scanIdx + 1, total }) +
              ` · ${t('videoExport.progressFrames')} ${framesWritten}/${totalFramesToWrite}`,
            wPct
          );
        }
        if ((frameIndex - 1) % 8 === 0) await yieldToEventLoop();
      }
      await yieldToEventLoop();
    }
    assertNotStopped();
    if (frameIndex <= 1) {
      throw new Error(t('videoExport.noFramesExtracted'));
    }
    loadCtx.encodeBase = 82;
    loadCtx.encodeSpan = 16;
    setProgress(t('videoExport.progressEncoding'), 82);
    const formatId = el(ids.videoFormat)?.value || 'h264';
    const result = await window.api?.createVideoFromFrames?.({ tempFolder, outputPath, fps, formatId });
    if (result?.cancelled) {
      setProgress(t('videoExport.cancelled'), 0);
      return;
    }
    if (result?.ok) {
      alert(t('videoExport.success', { path: outputPath }));
    } else {
      throw new Error(result?.error || t('ipc.errorVideoFailed'));
    }
  } catch (e) {
    if (e?.message === VIDEO_EXPORT_STOP_ERROR) {
      setProgress(t('videoExport.cancelled'), 0);
    } else {
      alert(t('videoExport.error') + ': ' + (e?.message || e));
    }
  } finally {
    window.api?.clearVideoExportProgressListener?.();
    if (stopBtn) stopBtn.classList.add('hidden');
    if (progressWrap) progressWrap.classList.add('hidden');
    setProgress('');
    updateStatus(0, t('status.operationEmpty'));
    if (videoTempFolder) {
      await window.api?.removeTempVideoFolder?.(videoTempFolder).catch(() => {});
    }
    if (hasProject()) {
      try {
        await persistProjectAfterLintLoad();
      } catch (_) {}
    }
    await yieldToEventLoop();
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

/** Exporteert alle frames van de huidige scan naar de doelmap. Nummering 000001–999999, geen overschrijven. Uitsnede uit volle strip (tot EXPORT_STRIP_MAX_DIM); daarna optioneel schalen via instellingen (SD/HD/UHD/custom). */
async function onExportCurrentScan() {
  const folder = getState().exportFolderPath;
  if (!folder) {
    alert(t('frameExport.pickFolderFirst'));
    return;
  }
  const pair = getStripCanvasPairForExport();
  if (!pair) {
    alert(t('frameExport.noStripLoaded'));
    return;
  }
  const { preview: previewStrip, export: exportStrip } = pair;
  const s = getState();
  const n = Math.max(1, s.numFrames);
  const baseName = s.exportBaseName || 'frame';
  const ext = (s.outputFormat || 'png').toLowerCase().replace(/^\./, '');
  const appSettings = await window.api?.getAppSettings?.().catch(() => null);
  const outDims = getExportOutputDimensions(appSettings);
  setFrameGeneratorProgress({
    visible: true,
    pct: 2,
    message: t('frameGenerator.progressNextNumber')
  });
  updateStatus(5, t('status.nextFrameNumber'));
  let startIndex = 1;
  try {
    if (window.api?.getNextFrameNumber) {
      startIndex = await window.api.getNextFrameNumber({ outputFolder: folder, baseName, ext });
    }
  } catch (_) {}
  let written = 0;
  try {
    const writeFrame = window.api?.writeFrame || window.api?.writeFramePng;
    for (let i = 0; i < n; i++) {
      let canvas = cropFrameAtIndexForExport(exportStrip, previewStrip, i);
      if (!canvas) continue;
      if (outDims) {
        canvas = scaleCanvasToSize(canvas, outDims.w, outDims.h, outDims.allowUpscale !== false);
      }
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
      const dataUrl = canvas.toDataURL(mime);
      const idx = startIndex + i;
      const result = writeFrame
        ? await window.api.writeFrame(folder, baseName, idx, dataUrl, ext)
        : await window.api?.writeFramePng?.(folder, baseName, idx, dataUrl);
      if (result?.ok) {
        written++;
        if (window.api?.sendOutputPreviewImage) window.api.sendOutputPreviewImage(dataUrl);
      }
      const barPct = 5 + Math.round((95 * (i + 1)) / n);
      setFrameGeneratorProgress({
        visible: true,
        pct: barPct,
        message: t('frameGenerator.progressCurrentScan', { current: i + 1, total: n, index: idx })
      });
      updateStatus(10 + Math.round((80 * (i + 1)) / n), t('status.exportFrameIndex', { index: idx }));
    }
    if (written > 0) {
      alert(
        t('frameExport.savedCount', {
          count: written,
          folder,
          start: String(startIndex).padStart(6, '0')
        })
      );
    }
  } catch (e) {
    alert(t('frameExport.saveFailed', { message: e?.message || e }));
  } finally {
    setFrameGeneratorProgress({ visible: false });
    updateStatus(0, t('status.operationEmpty'));
  }
}

/** Voert frame-export uit voor een lijst scanpaden. Nummering loopt door vanaf laatste in uitvoermap. Uitsnede uit volle strip; daarna optioneel uit instellingen schalen. */
async function exportPaths(paths) {
  const folder = getState().exportFolderPath;
  const baseName = getState().exportBaseName || 'frame';
  const ext = (getState().outputFormat || 'png').toLowerCase().replace(/^\./, '');
  const pauseSec = Math.max(0, getState().exportPauseSeconds || 0);
  const appSettings = await window.api?.getAppSettings?.().catch(() => null);
  const outDims = getExportOutputDimensions(appSettings);
  let fileNumber = 0;
  let startIndex = 1;
  setFrameGeneratorProgress({ visible: true, pct: 1, message: t('frameGenerator.progressNextNumber') });
  try {
    if (window.api?.getNextFrameNumber) {
      startIndex = await window.api.getNextFrameNumber({ outputFolder: folder, baseName, ext });
    }
  } catch (_) {}
  fileNumber = startIndex - 1;
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const total = paths.length;
  const writeFrame = window.api?.writeFrame || window.api?.writeFramePng;
  let completedFrameCount = 0;
  for (let scanIdx = 0; scanIdx < total; scanIdx++) {
    setFrameGeneratorProgress({
      visible: true,
      pct: Math.min(8, Math.round((100 * scanIdx) / Math.max(1, total * 2))),
      message: t('frameGenerator.progressLoadingScan', { current: scanIdx + 1, total })
    });
    updateStatus(
      5 + Math.round((70 * scanIdx) / total),
      t('status.scanLoadProject', { current: scanIdx + 1, total })
    );
    const ok = await loadScanByPath(paths[scanIdx]);
    if (!ok) continue;
    const pair = getStripCanvasPairForExport();
    if (!pair) continue;
    const { preview: previewStrip, export: exportStrip } = pair;
    const n = Math.max(1, getState().numFrames);
    const remainingScans = total - scanIdx - 1;
    const estimatedTotalFrames = completedFrameCount + n + remainingScans * n;
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    for (let i = 0; i < n; i++) {
      let canvas = cropFrameAtIndexForExport(exportStrip, previewStrip, i);
      if (!canvas) continue;
      if (outDims) {
        canvas = scaleCanvasToSize(canvas, outDims.w, outDims.h, outDims.allowUpscale !== false);
      }
      fileNumber++;
      const dataUrl = canvas.toDataURL(mime);
      if (writeFrame) {
        await window.api.writeFrame(folder, baseName, fileNumber, dataUrl, ext);
      } else {
        await window.api?.writeFramePng?.(folder, baseName, fileNumber, dataUrl);
      }
      if (window.api?.sendOutputPreviewImage) window.api.sendOutputPreviewImage(dataUrl);
      const done = completedFrameCount + i + 1;
      const barPct = Math.min(99, Math.round((100 * done) / Math.max(1, estimatedTotalFrames)));
      setFrameGeneratorProgress({
        visible: true,
        pct: barPct,
        message: t('frameGenerator.progressWriting', {
          scan: scanIdx + 1,
          totalScans: total,
          frame: i + 1,
          framesInScan: n
        })
      });
    }
    completedFrameCount += n;
    if (pauseSec > 0 && scanIdx < total - 1) {
      setFrameGeneratorProgress({
        visible: true,
        pct: Math.min(99, Math.round((100 * completedFrameCount) / Math.max(1, estimatedTotalFrames))),
        message: t('frameGenerator.progressPause', { seconds: pauseSec, scan: scanIdx + 1 })
      });
      updateStatus(80, t('status.exportPause', { seconds: pauseSec, scan: scanIdx + 1 }));
      await delay(pauseSec * 1000);
    }
  }
  return fileNumber;
}

/** Batch: alle scanlints laden, frames uitsnijden met globale nummering, optionele pauze tussen scans. */
async function onExportBatch() {
  const folder = getState().exportFolderPath;
  if (!folder) {
    alert(t('frameExport.pickFolderFirst'));
    return;
  }
  const paths = await getProjectScanPaths();
  if (!paths.length) {
    alert(t('frameExport.noScansInProject'));
    return;
  }
  updateStatus(5, t('status.batchStart'));
  try {
    const fileNumber = await exportPaths(paths);
    if (fileNumber > 0) alert(t('frameExport.batchDone', { count: fileNumber, folder }));
  } catch (e) {
    alert(t('frameExport.batchFailed', { message: e?.message || e }));
  } finally {
    setFrameGeneratorProgress({ visible: false });
    updateStatus(0, t('status.operationEmpty'));
  }
}

/** Bewaar alleen frames van scans in het gekozen bereik (Van scan … tot scan). */
async function onExportBatchRange() {
  const folder = getState().exportFolderPath;
  if (!folder) {
    alert(t('frameExport.pickFolderFirst'));
    return;
  }
  const paths = await getProjectScanPaths();
  if (!paths.length) {
    alert(t('frameExport.noScansInProject'));
    return;
  }
  const fromVal = parseInt(el(ids.exportScanFrom)?.value, 10);
  const toVal = parseInt(el(ids.exportScanTo)?.value, 10);
  const from = Number.isFinite(fromVal) && fromVal >= 1 ? fromVal : 1;
  const to = Number.isFinite(toVal) && toVal >= 1 ? toVal : paths.length;
  if (from > to) {
    alert(t('frameExport.rangeInvalid'));
    return;
  }
  const pathsToUse = paths.slice(from - 1, to);
  if (!pathsToUse.length) {
    alert(t('frameExport.noScansInRange'));
    return;
  }
  updateStatus(
    5,
    t('status.exportScanRangeOverview', { from, to, count: pathsToUse.length })
  );
  try {
    const fileNumber = await exportPaths(pathsToUse);
    if (fileNumber > 0) {
      alert(t('frameExport.rangeSaved', { count: fileNumber, from, to, folder }));
    }
  } catch (e) {
    alert(t('frameExport.saveFailed', { message: e?.message || e }));
  } finally {
    setFrameGeneratorProgress({ visible: false });
    updateStatus(0, t('status.operationEmpty'));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
