/**
 * UI-binding – koppelt DOM aan state en preview. Enige module die getElementById gebruikt.
 */
import { getState, setStrip, setRotation90, setFineRotation, setNumFrames, setActiveFrameIndex, setZoomFrames, setFramePreviewVisibleFrames, setStripPreviewMaxDim, setExportFolderPath, setExportBaseName, setExportPauseSeconds, setVideoOutputPath,
  setVideoFramesFolderPath, setGridOffset, setGridOffsetXMargins, setGridOffsetYOnly, setGridOffsetYBottom, setDirty, setFlipHorizontal, setFlipVertical, setTimecodeFps, setFilmFormat, setFilmPolarity, setTiltPivot, setOutputFormat, setScanDpi, setArrowStepPx, setArrowStepShiftPx, getLintStateSnapshot, getGridGeometrySnapshot, applyGridGeometrySnapshot, setLintStateForPath, updateProjectScanInfos, applyLintState, setGridVerticalAnchorMode, setGridVerticalPivotCustomK, setGridSplitLowerPanCanvas, setGridPanelLinkVerticalAnchor, setStripPresetId } from './state.js';
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
  handVerticalUsesSplitPan,
  panelUsesVerticalAnchorLink,
  pivotActiveAnchorsStripBottom,
  resolveVerticalPivotKFromState,
  applySplitLowerPanStepCanvas,
  splitLowerPanToBoundaryCanvas,
  clampGridSplitLowerPanCanvas,
  ensurePivotFrozenLowerCellHeight
} from './grid.js';
import { refreshPreviews, refreshPreviewsGridOnly, getScaledDimensions, getScaledDimensionsFromSize, buildGridPayload } from './preview.js';
import { hasProject, getProjectMeta, getProjectPath, isDirty, createProject, openProject, openProjectByPath, saveProject, deleteProject, applySavedLintState, pickResumeLintPath, persistCurrentLintStateInProject } from './project.js';
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
  DEFAULT_STRIP_PREVIEW_MAX_DIM
} from './constants.js';

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
  saveProject: 'f2f-save-project',
  deleteProject: 'f2f-delete-project',
  filename: 'f2f-filename',
  fineRotation: 'f2f-fine-rotation',
  fineRotationValue: 'f2f-fine-value',
  fineMinusCoarse: 'f2f-fine-minus-coarse',
  fineMinusFine: 'f2f-fine-minus-fine',
  finePlusFine: 'f2f-fine-plus-fine',
  finePlusCoarse: 'f2f-fine-plus-coarse',
  numFrames: 'f2f-num-frames',
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
  pickFramesFolder: 'f2f-pick-frames-folder',
  videoFramesFolderPath: 'f2f-video-frames-folder-path',
  videoFormat: 'f2f-video-format',
  pickVideoOutput: 'f2f-pick-video-output',
  videoOutputPath: 'f2f-video-output-path',
  videoFps: 'f2f-video-fps',
  videoScanFrom: 'f2f-video-scan-from',
  videoScanTo: 'f2f-video-scan-to',
  exportVideo: 'f2f-export-video',
  videoExportProgressWrap: 'f2f-video-export-progress-wrap',
  videoExportProgress: 'f2f-video-export-progress',
  prevScan: 'f2f-prev-scan',
  nextScan: 'f2f-next-scan',
  goToScan: 'f2f-go-to-scan',
  loadLint: 'f2f-load-lint',
  openStrip: 'f2f-open-strip',
  openAlignPreview: 'f2f-open-align-preview',
  openOutputPreview: 'f2f-open-output-preview',
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
  settingsToggle: 'f2f-settings-toggle',
  settingsContent: 'f2f-settings-content',
  settingDpi: 'f2f-setting-dpi',
  settingDefaultFrames: 'f2f-setting-default-frames',
  settingOutputFormat: 'f2f-setting-output-format',
  settingOutputRes: 'f2f-setting-output-res',
  exportOutputRes: 'f2f-export-output-res',
  settingCustomResWrap: 'f2f-setting-custom-res-wrap',
  settingCustomW: 'f2f-setting-custom-w',
  settingCustomH: 'f2f-setting-custom-h',
  settingPreviewRes: 'f2f-setting-preview-res',
  settingDarkMode: 'f2f-setting-dark-mode',
  settingWindowArrangement: 'f2f-setting-window-arrangement',
  settingArrangeOnStartup: 'f2f-setting-arrange-on-startup',
  arrangeGrid: 'f2f-arrange-grid',
  arrangeGridHsu: 'f2f-arrange-grid-hsu',
  settingArrowStepPx: 'f2f-setting-arrow-step-px',
  settingArrowStepShiftPx: 'f2f-setting-arrow-step-shift-px',
  stripShortcutsTbody: 'f2f-strip-shortcuts-tbody',
  stripShortcutsResetAll: 'f2f-strip-shortcuts-reset-all',
  arrangeWindowsBtn: 'f2f-arrange-windows',
  buildVersion: 'f2f-build-version',
  aboutBtn: 'f2f-about-btn',
  aboutOverlay: 'f2f-about-overlay',
  aboutVersion: 'f2f-about-version',
  aboutClose: 'f2f-about-close',
  settingsSaveBtn: 'f2f-settings-save'
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

/** Geeft de geordende lijst scanpaden van het huidige project (scanInfos of map). */
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

/** Opties voor loadScanByPath: preserveGrid = raster/frames/fijne rotatie van vorige lint behouden (Volgende/Vorige/Ga naar in project). */
const PRESERVE_GRID_ON_SCAN_NAV = { preserveGrid: true };

/** Slaat huidige lint-state op (bij wissel) en laadt de scan op het gegeven pad. Gebruikt strip-cache (vorige/volgende). */
async function loadScanByPath(lintPath, opts = {}) {
  if (!lintPath || !window.api?.getFileUrl) return false;
  const preserveGrid = opts.preserveGrid === true;
  const s = getState();
  if (hasProject() && s.path) {
    const snapshot = getLintStateSnapshot();
    if (snapshot) setLintStateForPath(s.path, snapshot);
  }

  const paths = hasProject() ? await getProjectScanPaths() : [];
  const idx = paths.length ? Math.max(0, paths.indexOf(lintPath)) : 0;

  const stripOpts = preserveGrid ? { preserveLintGrid: true } : {};

  let img = getFromCache(lintPath);
  if (img) {
    setStrip(lintPath, img, stripOpts);
    if (hasProject() && !preserveGrid) {
      await applySavedLintState(lintPath);
    }
    if (preserveGrid) {
      clampCurrentGridToStrip();
      setDirty();
    }
    updateUI();
    refreshPreviews();
    if (paths.length) prefetch(paths, idx, lintPath, (p) => window.api.getFileUrl(p), getState);
    await persistProjectAfterLintLoad();
    return true;
  }

  updateStatus(60, 'Scan laden…');
  try {
    const fileUrl = await window.api.getFileUrl(lintPath);
    img = await loadImage(lintPath, fileUrl);
  } finally {
    updateStatus(0, '—');
  }
  if (!img) {
    alert('Scan laden mislukt. Controleer of het bestand een geldige afbeelding is.');
    return false;
  }
  setStrip(lintPath, img, stripOpts);
  if (hasProject() && !preserveGrid) {
    await applySavedLintState(lintPath);
  }
  if (preserveGrid) {
    clampCurrentGridToStrip();
    setDirty();
  }
  updateUI();
  refreshPreviews();
  if (paths.length) prefetch(paths, idx, lintPath, (p) => window.api.getFileUrl(p), getState);
  await persistProjectAfterLintLoad();
  return true;
}

async function onLoadLint() {
  if (typeof window.api?.selectScanFile !== 'function') return;
  updateStatus(20, 'Bestand kiezen…');
  let lintPath;
  try {
    lintPath = await window.api.selectScanFile();
  } finally {
    updateStatus(0, '—');
  }
  if (!lintPath) return;
  await loadScanByPath(lintPath);
}

async function onPrevScan() {
  if (!hasProject()) return;
  const paths = await getProjectScanPaths();
  if (!paths.length) return;
  const current = getState().path;
  const idx = current ? paths.indexOf(current) : -1;
  const prevIndex = idx <= 0 ? paths.length - 1 : idx - 1;
  await loadScanByPath(paths[prevIndex], PRESERVE_GRID_ON_SCAN_NAV);
}

async function onNextScan() {
  if (!hasProject()) return;
  const paths = await getProjectScanPaths();
  if (!paths.length) return;
  const current = getState().path;
  const idx = current ? paths.indexOf(current) : -1;
  const nextIndex = idx < 0 ? 0 : (idx >= paths.length - 1 ? 0 : idx + 1);
  await loadScanByPath(paths[nextIndex], PRESERVE_GRID_ON_SCAN_NAV);
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
    alert('Geen project geopend. Open eerst een project in het hoofdvenster.');
    return;
  }
  const s = getState();
  if (s.path) {
    const snapshot = getLintStateSnapshot();
    if (snapshot) setLintStateForPath(s.path, snapshot);
  }
  let saveResult;
  try {
    saveResult = await saveProject();
  } catch (_) {
    saveResult = { ok: false, error: 'Onbekende fout bij opslaan' };
  }
  if (!saveResult.ok) {
    alert(saveResult.error || 'Project opslaan mislukt. De scanlint wordt niet gewisseld.');
    return;
  }
  const paths = await getProjectScanPaths();
  if (!paths.length) {
    alert('Geen scanlints in dit project.');
    return;
  }
  if (isGoto) {
    if (index1 < 1 || index1 > paths.length) {
      alert(`Voer een getal tussen 1 en ${paths.length} in.`);
      return;
    }
    await loadScanByPath(paths[index1 - 1], PRESERVE_GRID_ON_SCAN_NAV);
    return;
  }
  const current = getState().path;
  const idx = current ? paths.indexOf(current) : -1;
  const targetIndex =
    direction === 'prev'
      ? (idx <= 0 ? paths.length - 1 : idx - 1)
      : (idx < 0 ? 0 : (idx >= paths.length - 1 ? 0 : idx + 1));
  await loadScanByPath(paths[targetIndex], PRESERVE_GRID_ON_SCAN_NAV);
}

async function onGoToScan() {
  if (!hasProject()) return;
  const paths = await getProjectScanPaths();
  if (!paths.length) {
    alert('Geen scanlints in dit project.');
    return;
  }
  const num = window.prompt(`Ga naar scanlint (1–${paths.length}):`, '1');
  if (num === null || num === '') return;
  const index = parseInt(num, 10);
  if (!Number.isFinite(index) || index < 1 || index > paths.length) {
    alert(`Voer een getal tussen 1 en ${paths.length} in.`);
    return;
  }
  await loadScanByPath(paths[index - 1], PRESERVE_GRID_ON_SCAN_NAV);
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
  if (!Number.isNaN(n)) setNumFrames(n);
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

/** Vaste doelformaten voor frame-export (ook omhoog schalen van kleine rasteruitsnedes). */
const RESOLUTION_ID_TO_DIMS = {
  sd: [1280, 720],
  hd: [1920, 1080],
  uhd: [3840, 2160],
  r1024x768: [1024, 768],
  r1280x720: [1280, 720],
  r1280x960: [1280, 960],
  r1600x1200: [1600, 1200],
  r1920x1080: [1920, 1080],
  r2560x1440: [2560, 1440],
  r3840x2160: [3840, 2160]
};

const VALID_OUTPUT_RESOLUTION_IDS = new Set([
  'original',
  'custom',
  'sd',
  'hd',
  'uhd',
  ...Object.keys(RESOLUTION_ID_TO_DIMS)
]);

/** Oude voorkeuren (sd/hd/uhd) mappen naar expliciete presets. */
function normalizeOutputResolutionId(raw) {
  const r = String(raw || 'original').trim();
  const legacy = { sd: 'r1280x720', hd: 'r1920x1080', uhd: 'r3840x2160' };
  const id = legacy[r] || r;
  return VALID_OUTPUT_RESOLUTION_IDS.has(id) ? id : 'original';
}

function syncOutputResolutionSelects(sourceEl) {
  const v = sourceEl && sourceEl.value != null ? sourceEl.value : 'original';
  const norm = normalizeOutputResolutionId(v);
  const setting = el(ids.settingOutputRes);
  const exportSel = el(ids.exportOutputRes);
  if (setting && setting !== sourceEl) setting.value = norm;
  if (exportSel && exportSel !== sourceEl) exportSel.value = norm;
  const wrap = el(ids.settingCustomResWrap);
  if (wrap) wrap.classList.toggle('hidden', norm !== 'custom');
}

/**
 * Doelafmetingen voor export: leest actieve keuze (Frame generator of Instellingen), daarna prefs.
 * @returns {{ w: number, h: number, allowUpscale: boolean } | null} null = geen schaling (native rasterpixels)
 */
function getExportOutputDimensions(appSettings) {
  const rawId =
    el(ids.exportOutputRes)?.value ||
    el(ids.settingOutputRes)?.value ||
    appSettings?.outputResolution ||
    'original';
  const id = normalizeOutputResolutionId(rawId);
  if (id === 'original') return null;
  if (id === 'custom') {
    const w = Math.max(
      1,
      Number(el(ids.settingCustomW)?.value || appSettings?.customOutputWidth) || 1920
    );
    const h = Math.max(
      1,
      Number(el(ids.settingCustomH)?.value || appSettings?.customOutputHeight) || 1080
    );
    return { w, h, allowUpscale: true };
  }
  const dims = RESOLUTION_ID_TO_DIMS[id];
  if (!dims) return null;
  return { w: dims[0], h: dims[1], allowUpscale: true };
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

/** Scanlint-preview: instelbare sneltoetsen (Instellingen). */
let stripShortcutCaptureCleanup = null;

function stripCodeToLabel(code) {
  if (!code) return '';
  const map = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    NumpadMultiply: 'Num *',
    NumpadDivide: 'Num /',
    PageUp: 'Page ↑',
    PageDown: 'Page ↓',
    Home: 'Home',
    Space: 'Spatie',
    Enter: 'Enter',
    Escape: 'Esc',
    Tab: 'Tab',
    Backquote: '`',
    BracketLeft: '[',
    BracketRight: ']'
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

function formatStripBindingDisplay(b) {
  if (!b || !b.code) return '— (geen)';
  const parts = [];
  if (b.ctrl) parts.push('Ctrl');
  if (b.meta) parts.push('Win');
  if (b.alt) parts.push('Alt');
  if (b.shift) parts.push('Shift');
  parts.push(stripCodeToLabel(b.code));
  return parts.join('+');
}

function updateStripShortcutRowBinding(tr, binding) {
  const cell = tr.querySelector('.strip-sc-display');
  if (!cell) return;
  tr._stripBinding =
    binding === null || binding === undefined ? null : { ...binding };
  cell.textContent =
    tr._stripBinding && tr._stripBinding.code
      ? formatStripBindingDisplay(tr._stripBinding)
      : '— (geen)';
}

function startStripShortcutCapture(tr) {
  if (stripShortcutCaptureCleanup) stripShortcutCaptureCleanup();
  document.body.classList.add('f2f-strip-sc-capturing');
  tr.classList.add('strip-sc-row-capturing');
  function cleanup() {
    document.body.classList.remove('f2f-strip-sc-capturing');
    tr.classList.remove('strip-sc-row-capturing');
    window.removeEventListener('keydown', onKeyDown, true);
    stripShortcutCaptureCleanup = null;
  }
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
      return;
    }
    const ignoreKeys = ['Shift', 'Control', 'Alt', 'Meta'];
    if (ignoreKeys.includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const b = {
      code: e.code,
      ctrl: !!e.ctrlKey,
      shift: !!e.shiftKey,
      alt: !!e.altKey,
      meta: !!e.metaKey
    };
    if (!b.code) {
      cleanup();
      return;
    }
    updateStripShortcutRowBinding(tr, b);
    cleanup();
  }
  stripShortcutCaptureCleanup = cleanup;
  window.addEventListener('keydown', onKeyDown, true);
}

async function buildStripShortcutsSettingsTable() {
  const tbody = el(ids.stripShortcutsTbody);
  if (!tbody || !window.api?.getStripShortcutConfig) return;
  let cfg;
  try {
    cfg = await window.api.getStripShortcutConfig();
  } catch (_) {
    return;
  }
  if (!cfg || !Array.isArray(cfg.actions)) return;
  tbody.innerHTML = '';
  cfg.actions.forEach((a) => {
    const tr = document.createElement('tr');
    tr.dataset.actionId = a.id;
    const td0 = document.createElement('td');
    td0.textContent = a.label || a.id;
    const td1 = document.createElement('td');
    td1.className = 'strip-sc-display';
    const td2 = document.createElement('td');
    td2.className = 'strip-sc-btns';
    const btnCh = document.createElement('button');
    btnCh.type = 'button';
    btnCh.className = 'btn btn-secondary small';
    btnCh.textContent = 'Wijzig…';
    const btnCl = document.createElement('button');
    btnCl.type = 'button';
    btnCl.className = 'btn btn-secondary small';
    btnCl.textContent = 'Wissen';
    btnCh.addEventListener('click', () => startStripShortcutCapture(tr));
    btnCl.addEventListener('click', () => updateStripShortcutRowBinding(tr, null));
    td2.appendChild(btnCh);
    td2.appendChild(document.createTextNode(' '));
    td2.appendChild(btnCl);
    tr.appendChild(td0);
    tr.appendChild(td1);
    tr.appendChild(td2);
    tbody.appendChild(tr);
    const b = cfg.bindings && cfg.bindings[a.id];
    if (b && b.code) {
      updateStripShortcutRowBinding(tr, { ...b });
    } else {
      updateStripShortcutRowBinding(tr, null);
    }
  });
}

function collectStripShortcutsFromSettingsUI() {
  const out = {};
  const tbody = el(ids.stripShortcutsTbody);
  if (!tbody) return out;
  tbody.querySelectorAll('tr[data-action-id]').forEach((tr) => {
    const id = tr.dataset.actionId;
    if (!id) return;
    out[id] = tr._stripBinding == null || !tr._stripBinding.code ? null : { ...tr._stripBinding };
  });
  return out;
}

async function resetAllStripShortcutsToDefaults() {
  const tbody = el(ids.stripShortcutsTbody);
  if (!tbody || !window.api?.getStripShortcutConfig) return;
  let cfg;
  try {
    cfg = await window.api.getStripShortcutConfig();
  } catch (_) {
    return;
  }
  if (!cfg || !Array.isArray(cfg.actions)) return;
  tbody.querySelectorAll('tr[data-action-id]').forEach((tr) => {
    const id = tr.dataset.actionId;
    const a = cfg.actions.find((x) => x.id === id);
    const def = a && a.default && a.default.code ? { ...a.default } : null;
    updateStripShortcutRowBinding(tr, def);
  });
}

function applyTheme(darkMode) {
  if (document.body) {
    document.body.classList.toggle('theme-light', !darkMode);
  }
}

/** Sync hidden input + actieve cel in het 3×3-schikkingraster. */
function syncArrangementGridUI(layout) {
  const canonical = layout && typeof layout === 'string' ? layout.trim() : 'horiz-osm';
  const hidden = el(ids.settingWindowArrangement);
  if (hidden) hidden.value = canonical || 'horiz-osm';
  [ids.arrangeGrid, ids.arrangeGridHsu].forEach((gridId) => {
    const grid = el(gridId);
    if (grid) {
      grid.querySelectorAll('.f2f-arrange-cell').forEach((btn) => {
        const d = btn.getAttribute('data-layout');
        btn.classList.toggle('f2f-arrange-cell--active', d === canonical);
      });
    }
  });
}

async function loadAppSettings() {
  try {
    const s = await window.api?.getAppSettings?.();
    if (!s || typeof s !== 'object') return;
    const set = (id, value, type = 'value') => {
      const el_ = el(id);
      if (!el_) return;
      if (type === 'value') el_.value = value;
      else if (type === 'checked') el_.checked = !!value;
    };
    set(ids.settingDpi, String(s.scanDpi));
    set(ids.settingDefaultFrames, String(s.defaultFramesPerStrip));
    set(ids.settingOutputFormat, s.outputFormat || 'png');
    const outNorm = normalizeOutputResolutionId(s.outputResolution);
    set(ids.settingOutputRes, outNorm);
    if (el(ids.exportOutputRes)) el(ids.exportOutputRes).value = outNorm;
    set(ids.settingCustomW, String(s.customOutputWidth || 1920));
    set(ids.settingCustomH, String(s.customOutputHeight || 1080));
    const previewRes = Math.max(512, Math.min(8192, Number(s.stripPreviewRes) || DEFAULT_STRIP_PREVIEW_MAX_DIM));
    set(ids.settingPreviewRes, String(previewRes));
    setStripPreviewMaxDim(previewRes);
    const stripResMain = el(ids.stripPreviewRes);
    if (stripResMain) {
      const closest = STRIP_PREVIEW_MAX_DIM_OPTIONS.includes(previewRes)
        ? previewRes
        : STRIP_PREVIEW_MAX_DIM_OPTIONS.reduce((a, b) => (Math.abs(a - previewRes) <= Math.abs(b - previewRes) ? a : b));
      stripResMain.value = String(closest);
    }
    set(ids.settingDarkMode, s.darkMode, 'checked');
    syncArrangementGridUI(s.windowArrangement || 'horiz-osm');
    set(ids.settingArrangeOnStartup, !!s.arrangeWindowsOnStartup, 'checked');
    const arrowPx = (s.arrowStepPx != null && Number(s.arrowStepPx) >= 1) ? Math.min(10, Number(s.arrowStepPx)) : 1;
    const arrowShiftPx = (s.arrowStepShiftPx != null && Number(s.arrowStepShiftPx) >= 10) ? Math.min(100, Number(s.arrowStepShiftPx)) : 10;
    set(ids.settingArrowStepPx, String(arrowPx));
    set(ids.settingArrowStepShiftPx, String(arrowShiftPx));
    applyTheme(s.darkMode);
    setArrowStepPx(arrowPx);
    setArrowStepShiftPx(arrowShiftPx);
    const wrap = el(ids.settingCustomResWrap);
    if (wrap) wrap.classList.toggle('hidden', outNorm !== 'custom');
    await buildStripShortcutsSettingsTable();
    updateUI();
  } catch (_) {}
}

async function saveAppSettings() {
  const outRes = normalizeOutputResolutionId(
    el(ids.exportOutputRes)?.value || el(ids.settingOutputRes)?.value || 'original'
  );
  if (el(ids.settingOutputRes)) el(ids.settingOutputRes).value = outRes;
  if (el(ids.exportOutputRes)) el(ids.exportOutputRes).value = outRes;
  const arrowPx = Math.max(1, Math.min(10, parseInt(el(ids.settingArrowStepPx)?.value, 10) || 1));
  const arrowShiftPx = Math.max(10, Math.min(100, parseInt(el(ids.settingArrowStepShiftPx)?.value, 10) || 10));
  const settings = {
    scanDpi: parseInt(el(ids.settingDpi)?.value, 10) || 4800,
    defaultFramesPerStrip: parseInt(el(ids.settingDefaultFrames)?.value, 10) || 30,
    outputFormat: el(ids.settingOutputFormat)?.value || 'png',
    outputResolution: outRes,
    customOutputWidth: parseInt(el(ids.settingCustomW)?.value, 10) || 1920,
    customOutputHeight: parseInt(el(ids.settingCustomH)?.value, 10) || 1080,
    stripPreviewRes: parseInt(el(ids.settingPreviewRes)?.value, 10) || DEFAULT_STRIP_PREVIEW_MAX_DIM,
    darkMode: !!el(ids.settingDarkMode)?.checked,
    windowArrangement: el(ids.settingWindowArrangement)?.value || 'horiz-osm',
    arrangeWindowsOnStartup: !!el(ids.settingArrangeOnStartup)?.checked,
    arrowStepPx: arrowPx,
    arrowStepShiftPx: arrowShiftPx
  };
  const tbodySc = el(ids.stripShortcutsTbody);
  if (tbodySc && tbodySc.querySelector('tr[data-action-id]')) {
    settings.stripPreviewShortcuts = collectStripShortcutsFromSettingsUI();
  }
  await window.api?.setAppSettings?.(settings);
  applyTheme(settings.darkMode);
  setScanDpi(settings.scanDpi);
  setOutputFormat(settings.outputFormat);
  setStripPreviewMaxDim(settings.stripPreviewRes);
  setArrowStepPx(settings.arrowStepPx);
  setArrowStepShiftPx(settings.arrowStepShiftPx);
  updateUI();
  if (getState().image) refreshPreviews();
  /* Direct de gekozen paneelschikking toepassen (zelfde als knop Vensters schikken). */
  if (window.api?.arrangeWindows) {
    try {
      await window.api.arrangeWindows();
    } catch (_) {}
  }
}

function toggleSettingsPanel() {
  const content = el(ids.settingsContent);
  const btn = el(ids.settingsToggle);
  if (!content || !btn) return;
  content.classList.toggle('hidden');
  const open = !content.classList.contains('hidden');
  btn.setAttribute('aria-expanded', String(open));
  btn.classList.toggle('active', open);
}

async function onArrangeWindows() {
  if (window.api?.arrangeWindows) await window.api.arrangeWindows();
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
    alert('Geef een naam voor de preset.');
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
    alert('Preset niet gevonden.');
    return;
  }
  applyLintState(data);
  if (data.filmFormat) setFilmFormat(data.filmFormat);
  if (data.filmPolarity) setFilmPolarity(data.filmPolarity);
  if (data.numFrames != null) setNumFrames(data.numFrames);
  if (data.outputFormat) setOutputFormat(data.outputFormat);
  if (data.scanDpi != null) setScanDpi(data.scanDpi);
  setDirty();
  updateUI();
  refreshPreviews();
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
    alert('Selecteer eerst een preset.');
    return;
  }
  if (!confirm('Deze preset definitief wissen?')) return;
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
      '<option value="">— Raster-preset —</option>' +
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
    alert('Geef een naam voor het raster-preset.');
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
    alert('Kies eerst een raster-preset.');
    return;
  }
  if (!window.api?.gridPresetLoad) return;
  const grid = await window.api.gridPresetLoad(id);
  if (!grid || typeof grid !== 'object') {
    alert('Preset niet gevonden.');
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
    alert('Kies eerst een preset.');
    return;
  }
  if (!confirm('Dit raster-preset definitief wissen?')) return;
  if (!window.api?.gridPresetDelete) return;
  await window.api.gridPresetDelete(id);
  await refreshGridPresetList();
}

/** Voortgang scanlint-map → zelfde percentage als modal (toolbar “Belasting”). */
function scanInfosProgressToStatus(d) {
  const current = Number(d?.current) || 0;
  const total = Number(d?.total) || 0;
  if (total > 0) {
    updateStatus(Math.round((100 * current) / total), `Scanlint ${current} / ${total}`);
  }
}

async function onRefreshScanList() {
  if (!hasProject()) return;
  const meta = getProjectMeta();
  const location = meta?.location;
  if (!location || !window.api?.getScanInfos) return;
  try {
    const infos = await getScanInfosWithProgressOverlay(
      location,
      window.api.getScanInfos.bind(window.api),
      scanInfosProgressToStatus
    );
    if (Array.isArray(infos)) {
      updateProjectScanInfos(infos);
      setDirty();
      updateProjectUI();
    }
  } finally {
    updateStatus(0, '—');
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
  const folder = await window.api?.selectFolder?.({ title: 'Kies projectmap', type: 'projectFolder' });
  if (folder && el(ids.projectFolderPath)) {
    el(ids.projectFolderPath).setAttribute('data-path', folder);
    el(ids.projectFolderPath).textContent = folder.length > 45 ? '...' + folder.slice(-42) : folder;
  }
}

let lastScanInfos = [];

async function onPickLocation() {
  const folder = await window.api?.selectFolder?.({ title: 'Kies bestandslocatie (map met scanlints)', type: 'fileLocation' });
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
  let infos;
  try {
    infos = await getScanInfosWithProgressOverlay(
      path,
      window.api.getScanInfos.bind(window.api),
      scanInfosProgressToStatus
    );
  } finally {
    updateStatus(0, '—');
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
  if (!projectFolderPath) { alert('Kies eerst een projectmap.'); return; }
  const name = (el(ids.projectName)?.value || '').trim() || undefined;
  const framesPerLint = parseInt(el(ids.projectFrames)?.value, 10);
  const countPath = locationPath || projectFolderPath;
  if (countPath) {
    await updateScanCountAndOrient(countPath);
  }
  const scanCountVal = el(ids.scanCount)?.value?.trim();
  const numberOfScans = scanCountVal ? parseInt(scanCountVal, 10) : undefined;
  updateStatus(30, 'Project aanmaken…');
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
    updateStatus(0, '—');
  }
  if (result.ok) {
    el(ids.newProjectForm)?.classList.add('hidden');
    el(ids.showNewProjectForm)?.classList.remove('hidden');
    updateProjectUI();
  } else {
    alert(result.error || 'Project aanmaken mislukt');
  }
}

function onCancelNewProject() {
  el(ids.newProjectForm)?.classList.add('hidden');
  el(ids.showNewProjectForm)?.classList.remove('hidden');
}

function onShowNewProjectForm() {
  el(ids.newProjectForm)?.classList.remove('hidden');
  el(ids.showNewProjectForm)?.classList.add('hidden');
}

async function onOpenProjectClick() {
  updateStatus(50, 'Project openen…');
  let result;
  try {
    result = await openProject();
  } finally {
    updateStatus(0, '—');
  }
  if (!result.ok) {
    if (result.error) alert(result.error);
    return;
  }
  clearCache();
  updateProjectUI();
  const paths = await getProjectScanPaths();
  const toLoad = pickResumeLintPath(paths, getState().lintStates, result.project?.currentLintPath ?? getProjectMeta()?.currentLintPath);
  if (toLoad) await loadScanByPath(toLoad);
}

async function onProjectStartenClick() {
  if (hasProject()) return;
  const lastPath = await window.api?.getLastProjectPath?.();
  if (!lastPath) {
    alert('Geen laatst gebruikt project. Maak een nieuw project of open een bestaand project.');
    return;
  }
  updateStatus(50, 'Project starten…');
  let result;
  try {
    result = await openProjectByPath(lastPath);
  } finally {
    updateStatus(0, '—');
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
}

async function onSaveProjectClick() {
  updateStatus(50, 'Project bewaren…');
  let result;
  try {
    result = await saveProject();
  } finally {
    updateStatus(0, '—');
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

function onNewProjectClick() {
  if (hasProject()) return;
  onShowNewProjectForm();
}

/** Houdt gridSplitLowerPanCanvas binnen clamp; zet op 0 als referentie-modus geen split gebruikt. */
function syncGridSplitLowerPanClamp() {
  const s = getState();
  if (!usesSplitLowerVerticalPan()) {
    /* pivotActive / pivotCustom: k=n of k=0 — geen split; d niet op 0 zetten, map blijft per lijn geldig */
    const m = s.gridVerticalAnchorMode || 'bottomFixed';
    if (m === 'pivotActive' || m === 'pivotCustom') {
      return;
    }
    setGridSplitLowerPanCanvas(0);
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
  setGridSplitLowerPanCanvas(d);
}

/** Midden-boven/onder + koppeling: alleen split, geen Y-marges (anders schuift de referentielijn op het lint). */
function isMiddleSplitVerticalRefWithLink() {
  const s = getState();
  const mode = s.gridVerticalAnchorMode || 'bottomFixed';
  return (
    panelUsesVerticalAnchorLink() &&
    usesSplitLowerVerticalPan() &&
    (mode === 'pivotMiddleUpper' || mode === 'pivotMiddleLower')
  );
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
      if (r && !r.ok && r.error) console.warn('[Film2Frame] Uitlijning-venster:', r.error);
    }
  } catch (_) {}
  refreshPreviews();
}

async function onOpenStrip() {
  const s = getState();
  if (!s.image && hasProject()) {
    const paths = await getProjectScanPaths();
    const resume = paths.length
      ? pickResumeLintPath(paths, getState().lintStates, getProjectMeta()?.currentLintPath)
      : null;
    if (resume) {
      updateStatus(50, 'Scanlint laden…');
      try {
        await loadScanByPath(resume);
      } finally {
        updateStatus(0, '—');
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
      if (handVerticalUsesSplitPan()) {
        const k = resolveVerticalPivotKFromState();
        const d = applySplitLowerPanStepCanvas(
          frameHeight,
          nFrames,
          s.gridOffsetY || 0,
          s.gridOffsetYBottom ?? 0,
          k,
          s.gridSplitLowerPanCanvas,
          dy
        );
        setGridSplitLowerPanCanvas(d);
      } else {
        setGridSplitLowerPanCanvas(0);
        /* Alleen pivotActive + actief onderste frame: lijn = strip-onder; anders zou rigide pan de lijn op de film verschuiven. */
        const useBottomAnchored =
          panelUsesVerticalAnchorLink() && pivotActiveAnchorsStripBottom();
        const cv = useBottomAnchored
          ? applyBottomAnchoredVerticalPanStepCanvas(
              frameHeight,
              nFrames,
              s.gridOffsetY || 0,
              s.gridOffsetYBottom ?? 0,
              dy
            )
          : applyRigidVerticalPanStepCanvas(
              frameHeight,
              nFrames,
              s.gridOffsetY || 0,
              s.gridOffsetYBottom ?? 0,
              dy
            );
        setGridOffsetYOnly(cv.top);
        setGridOffsetYBottom(cv.bottom);
      }
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
    const gridPayload = buildGridPayload(dim.width, dim.height, scale, overrideX);
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
    refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale));
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
      refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale));
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
    refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale));
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
  if (handVerticalUsesSplitPan()) {
    const k = resolveVerticalPivotKFromState();
    const d = splitLowerPanToBoundaryCanvas(frameHeight, n, top, bottom, k, !!towardCompress);
    setGridSplitLowerPanCanvas(d);
  } else {
    setGridSplitLowerPanCanvas(0);
    const mode = s.gridVerticalAnchorMode || 'bottomFixed';
    const link = panelUsesVerticalAnchorLink();
    const c =
      link && (mode === 'bottomFixed' || pivotActiveAnchorsStripBottom())
        ? bottomAnchoredVerticalPanToBoundaryCanvas(frameHeight, n, top, bottom, !!towardCompress)
        : rigidVerticalPanToBoundaryCanvas(frameHeight, n, top, bottom, !!towardCompress);
    setGridOffsetYOnly(c.top);
    setGridOffsetYBottom(c.bottom);
  }
  setDirty();
  updateUI();
  let dim = null;
  if (canvas) dim = getScaledDimensions(canvas);
  if (canvas && dim && dim.width >= 1 && dim.height >= 1 && canvas.height > 0) {
    const scale = dim.height / canvas.height;
    refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale));
  } else {
    refreshPreviewsGridOnly();
  }
}

/**
 * Duw Omhoog/Omlaag: bij referentie Onderkant raster = onder vast, alleen Y-boven (celhoogte varieert).
 * Bij midden-boven / midden-onder mét koppeling: alleen split-pan (zelfde inner en middenlijn op strip-Y).
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
  const mode = s.gridVerticalAnchorMode || 'bottomFixed';
  const link = panelUsesVerticalAnchorLink();

  /*
   * Midden-boven / midden-onder + koppeling: geen Y-marges wijzigen — dat verschuift de middenlijn op het lint.
   * Duw = zelfde als Hand split: alleen gridSplitLowerPanCanvas binnen het flexibele blok.
   */
  const middleSplitDuw =
    link &&
    usesSplitLowerVerticalPan() &&
    (mode === 'pivotMiddleUpper' || mode === 'pivotMiddleLower');

  const mag = Math.max(1, Math.round(Math.abs(d) * scaleY));
  let stepC;
  if (duwKind) {
    /* Strip: positieve stap + soort — zelfde teken als vroeger (+ = Omlaag/compress, − = Omhoog/stretch). */
    stepC = duwKind === 'compress' ? mag : -mag;
  } else {
    stepC = Math.round(d * scaleY);
    if (stepC === 0) stepC = d > 0 ? 1 : -1;
  }

  if (middleSplitDuw) {
    applyMiddleSplitPanFromStripControls(frameHeight, n, curTop, bottom, stepC);
    setDirty();
    updateUI();
    if (canvas && dim && dim.width >= 1 && dim.height >= 1 && canvas.height > 0) {
      const scale = dim.height / canvas.height;
      refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale));
    } else {
      refreshPreviewsGridOnly();
    }
    return;
  }

  /*
   * Koppeling uit: Duw altijd rigide.
   * Koppeling aan: Y-onder vast + Y-boven (inner varieert) bij Onderkant raster, pivot-onder, of overige split (actief/custom).
   * Anders (o.a. pivotTop k=0): rigide pan.
   */
  const useBottomAnchoredDuw =
    link &&
    (mode === 'bottomFixed' ||
      pivotActiveAnchorsStripBottom() ||
      usesSplitLowerVerticalPan());
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
    refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale));
  } else {
    refreshPreviewsGridOnly();
  }
}

function onStripVerticalAnchorFromPreview(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  if (typeof p.mode === 'string') setGridVerticalAnchorMode(p.mode);
  if (p.customK != null) setGridVerticalPivotCustomK(p.customK);
  syncGridSplitLowerPanClamp();
  setDirty();
  updateUI();
  const canvas = getStripCanvas();
  if (canvas) {
    const dim = getScaledDimensions(canvas);
    if (dim && dim.width >= 1 && dim.height >= 1 && canvas.height > 0) {
      const scale = dim.height / canvas.height;
      refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale));
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
      refreshPreviewsGridOnly(buildGridPayload(dim.width, dim.height, scale, newX));
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
  el(ids.saveProject)?.addEventListener('click', onSaveProjectClick);
  el(ids.deleteProject)?.addEventListener('click', onDeleteProjectClick);
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
  el(ids.settingsToggle)?.addEventListener('click', toggleSettingsPanel);
  function onOutputResolutionChange(ev) {
    syncOutputResolutionSelects(ev?.target || el(ids.settingOutputRes));
  }
  el(ids.settingOutputRes)?.addEventListener('change', onOutputResolutionChange);
  el(ids.exportOutputRes)?.addEventListener('change', onOutputResolutionChange);
  el(ids.arrangeWindowsBtn)?.addEventListener('click', onArrangeWindows);
  function onArrangeGridPick(e) {
    const btn = e.target.closest('.f2f-arrange-cell');
    if (!btn || !btn.dataset.layout) return;
    syncArrangementGridUI(btn.dataset.layout);
  }
  el(ids.arrangeGrid)?.addEventListener('click', onArrangeGridPick);
  el(ids.arrangeGridHsu)?.addEventListener('click', onArrangeGridPick);
  el(ids.settingsSaveBtn)?.addEventListener('click', saveAppSettings);
  el(ids.stripShortcutsResetAll)?.addEventListener('click', () => {
    resetAllStripShortcutsToDefaults();
  });
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
  el(ids.preset16mmDouble)?.addEventListener('click', () => applyGridOffsetPreset('16mm-double'));
  el(ids.preset16mmSingle)?.addEventListener('click', () => applyGridOffsetPreset('16mm-single'));
  el(ids.presetSuper16)?.addEventListener('click', () => applyGridOffsetPreset('super16'));
  el('f2f-preset-8mm')?.addEventListener('click', () => applyGridOffsetPreset('8mm'));
  el('f2f-preset-super8')?.addEventListener('click', () => applyGridOffsetPreset('super8'));
  el('f2f-preset-9.5mm')?.addEventListener('click', () => applyGridOffsetPreset('9.5mm'));
  el('f2f-preset-35mm')?.addEventListener('click', () => applyGridOffsetPreset('35mm'));
  el(ids.applyGridFromMm)?.addEventListener('click', applyGridFromMm);
  el(ids.gridPresetSave)?.addEventListener('click', () => onGridPresetSaveClick().catch(() => {}));
  el(ids.gridPresetLoad)?.addEventListener('click', () => onGridPresetLoadClick().catch(() => {}));
  el(ids.gridPresetDelete)?.addEventListener('click', () => onGridPresetDeleteClick().catch(() => {}));
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
  el(ids.exportPause)?.addEventListener('change', function () { setExportPauseSeconds(el(ids.exportPause)?.value); });
  el(ids.exportCurrent)?.addEventListener('click', onExportCurrentScan);
  el(ids.exportBatch)?.addEventListener('click', onExportBatch);
  el(ids.exportBatchRange)?.addEventListener('click', onExportBatchRange);
  el(ids.pickFramesFolder)?.addEventListener('click', onPickFramesFolder);
  el(ids.pickVideoOutput)?.addEventListener('click', onPickVideoOutput);
  el(ids.exportVideo)?.addEventListener('click', onExportVideo);
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
        console.error('[Film2Frame] Automatisch bewaren bij afsluiten mislukt:', err);
      } finally {
        window.api?.sendQuitSaveComplete?.();
      }
    })();
  });
}

async function init() {
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
        }
      } catch (_) {}
    }
  }
  syncArrangementGridUI(el(ids.settingWindowArrangement)?.value || 'horiz-osm');
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
    setGridPanelLinkVerticalAnchor(!!p.link);
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
  const totalGridHeight = numFrames * frameHeightPx;
  let gridOffsetX = Math.max(0, Math.round((stripWidth - frameWidthPx) / 2));
  let gridOffsetY = 0;
  let gridOffsetYBottom = 0;
  if (totalGridHeight <= stripHeight) {
    gridOffsetYBottom = Math.max(0, stripHeight - totalGridHeight);
  }
  /* Anders: totalGridHeight > stripHeight → offsets 0,0; celhoogte wordt stripHeight/numFrames */
  setNumFrames(numFrames);
  setGridOffset(gridOffsetX, gridOffsetY);
  setGridOffsetYBottom(gridOffsetYBottom);
  setDirty();
  updateUI();
  refreshPreviewsGridOnly();
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

/** Exporteert frames naar MP4 via ffmpeg. Gebruikt map met frames indien gekozen, anders projectscans. */
async function onExportVideo() {
  const outputPath = getState().videoOutputPath;
  if (!outputPath) {
    alert(t('videoExport.pickFileFirst'));
    return;
  }
  const fps = Math.max(1, Math.min(60, parseInt(el(ids.videoFps)?.value, 10) || 24));
  const progressWrap = el(ids.videoExportProgressWrap);
  const progressEl = el(ids.videoExportProgress);
  if (progressWrap) progressWrap.classList.remove('hidden');
  const setProgress = (msg) => { if (progressEl) progressEl.textContent = msg || '—'; };
  try {
    const framesFolder = getState().videoFramesFolderPath;
    if (framesFolder) {
      setProgress(t('videoExport.progressCopy'));
      window.api?.onVideoExportProgress?.(({ phase }) => {
        if (phase === 'copy') setProgress(t('videoExport.progressCopy'));
        if (phase === 'encoding') setProgress(t('videoExport.progressEncoding'));
        if (phase === 'done') setProgress(t('videoExport.progressDone'));
      });
      const formatId = el(ids.videoFormat)?.value || 'h264';
      const result = await window.api?.createVideoFromFolder?.({ folderPath: framesFolder, outputPath, fps, formatId });
      if (result?.ok) {
        setProgress('');
        alert(t('videoExport.success', { path: outputPath }));
      } else throw new Error(result?.error || 'Video maken mislukt');
      return;
    }
    const paths = await getProjectScanPaths();
    if (!paths.length) {
      alert(t('videoExport.noScans'));
      return;
    }
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
    setProgress(t('videoExport.progressFrames'));
    const tempFolder = await window.api?.getTempVideoFolder?.();
    if (!tempFolder) throw new Error('Tijdelijke map maken mislukt');
    const appSettings = await window.api?.getAppSettings?.().catch(() => null);
    const outDims = getExportOutputDimensions(appSettings);
    const total = scanPaths.length;
    let frameIndex = 1;
    const writeFrame = window.api?.writeFrame || window.api?.writeFramePng;
    for (let scanIdx = 0; scanIdx < total; scanIdx++) {
      setProgress(t('videoExport.progressScan', { current: scanIdx + 1, total }));
      const ok = await loadScanByPath(scanPaths[scanIdx]);
      if (!ok) continue;
      const pair = getStripCanvasPairForExport();
      if (!pair) continue;
      const { preview: previewStrip, export: exportStrip } = pair;
      const n = Math.max(1, getState().numFrames);
      for (let i = 0; i < n; i++) {
        let canvas = cropFrameAtIndexForExport(exportStrip, previewStrip, i);
        if (!canvas) continue;
        if (outDims) {
          canvas = scaleCanvasToSize(canvas, outDims.w, outDims.h, outDims.allowUpscale !== false);
        }
        const dataUrl = canvas.toDataURL('image/png');
        if (writeFrame) {
          await window.api.writeFrame(tempFolder, 'frame', frameIndex, dataUrl, 'png');
        } else {
          await window.api?.writeFramePng?.(tempFolder, 'frame', frameIndex, dataUrl);
        }
        frameIndex++;
      }
    }
    if (frameIndex <= 1) {
      throw new Error(t('videoExport.noFramesExtracted'));
    }
    setProgress(t('videoExport.progressEncoding'));
    window.api?.onVideoExportProgress?.(({ phase }) => {
      if (phase === 'encoding') setProgress(t('videoExport.progressEncoding'));
      if (phase === 'done') setProgress(t('videoExport.progressDone'));
    });
    const formatId = el(ids.videoFormat)?.value || 'h264';
    const result = await window.api?.createVideoFromFrames?.({ tempFolder, outputPath, fps, formatId });
    if (result?.ok) {
      setProgress('');
      alert(t('videoExport.success', { path: outputPath }));
    } else {
      throw new Error(result?.error || 'Video maken mislukt');
    }
  } catch (e) {
    alert(t('videoExport.error') + ': ' + (e?.message || e));
  } finally {
    if (progressWrap) progressWrap.classList.add('hidden');
    setProgress('');
  }
}

/** Exporteert alle frames van de huidige scan naar de doelmap. Nummering 000001–999999, geen overschrijven. Uitsnede uit volle strip (tot EXPORT_STRIP_MAX_DIM); daarna optioneel schalen via instellingen (SD/HD/UHD/custom). */
async function onExportCurrentScan() {
  const folder = getState().exportFolderPath;
  if (!folder) {
    alert('Kies eerst een doelmap (Frame uitsnijden en bewaren).');
    return;
  }
  const pair = getStripCanvasPairForExport();
  if (!pair) {
    alert('Geen scanlint geladen.');
    return;
  }
  const { preview: previewStrip, export: exportStrip } = pair;
  const s = getState();
  const n = Math.max(1, s.numFrames);
  const baseName = s.exportBaseName || 'frame';
  const ext = (s.outputFormat || 'png').toLowerCase().replace(/^\./, '');
  const appSettings = await window.api?.getAppSettings?.().catch(() => null);
  const outDims = getExportOutputDimensions(appSettings);
  updateStatus(5, 'Volgende framenummer ophalen…');
  let startIndex = 1;
  try {
    if (window.api?.getNextFrameNumber) {
      startIndex = await window.api.getNextFrameNumber({ outputFolder: folder, baseName, ext });
    }
  } catch (_) {}
  updateStatus(10, 'Frames bewaren…');
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
      updateStatus(10 + Math.round((80 * (i + 1)) / n), `Frame ${idx}…`);
    }
    updateStatus(0, '—');
    if (written > 0) alert(`${written} frame(s) bewaard in ${folder} (vanaf ${String(startIndex).padStart(6, '0')})`);
  } catch (e) {
    updateStatus(0, '—');
    alert('Bewaren mislukt: ' + (e?.message || e));
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
  try {
    if (window.api?.getNextFrameNumber) {
      startIndex = await window.api.getNextFrameNumber({ outputFolder: folder, baseName, ext });
    }
  } catch (_) {}
  fileNumber = startIndex - 1;
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const total = paths.length;
  const writeFrame = window.api?.writeFrame || window.api?.writeFramePng;
  for (let scanIdx = 0; scanIdx < total; scanIdx++) {
    updateStatus(5 + Math.round((70 * scanIdx) / total), `Scan ${scanIdx + 1}/${total} laden…`);
    const ok = await loadScanByPath(paths[scanIdx]);
    if (!ok) continue;
    const pair = getStripCanvasPairForExport();
    if (!pair) continue;
    const { preview: previewStrip, export: exportStrip } = pair;
    const n = Math.max(1, getState().numFrames);
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
    }
    if (pauseSec > 0 && scanIdx < total - 1) {
      updateStatus(80, `Pauze ${pauseSec}s (scan ${scanIdx + 1} klaar)…`);
      await delay(pauseSec * 1000);
    }
  }
  return fileNumber;
}

/** Batch: alle scanlints laden, frames uitsnijden met globale nummering, optionele pauze tussen scans. */
async function onExportBatch() {
  const folder = getState().exportFolderPath;
  if (!folder) {
    alert('Kies eerst een doelmap (Frame uitsnijden en bewaren).');
    return;
  }
  const paths = await getProjectScanPaths();
  if (!paths.length) {
    alert('Geen scanlints in dit project. Open een project met scanlints.');
    return;
  }
  updateStatus(5, 'Batch start…');
  try {
    const fileNumber = await exportPaths(paths);
    updateStatus(0, '—');
    if (fileNumber > 0) alert(`Batch klaar: ${fileNumber} frame(s) bewaard in ${folder}`);
  } catch (e) {
    updateStatus(0, '—');
    alert('Batch mislukt: ' + (e?.message || e));
  }
}

/** Bewaar alleen frames van scans in het gekozen bereik (Van scan … tot scan). */
async function onExportBatchRange() {
  const folder = getState().exportFolderPath;
  if (!folder) {
    alert('Kies eerst een doelmap (Frame uitsnijden en bewaren).');
    return;
  }
  const paths = await getProjectScanPaths();
  if (!paths.length) {
    alert('Geen scanlints in dit project. Open een project met scanlints.');
    return;
  }
  const fromVal = parseInt(el(ids.exportScanFrom)?.value, 10);
  const toVal = parseInt(el(ids.exportScanTo)?.value, 10);
  const from = Number.isFinite(fromVal) && fromVal >= 1 ? fromVal : 1;
  const to = Number.isFinite(toVal) && toVal >= 1 ? toVal : paths.length;
  if (from > to) {
    alert('Van scan moet kleiner of gelijk zijn aan tot scan.');
    return;
  }
  const pathsToUse = paths.slice(from - 1, to);
  if (!pathsToUse.length) {
    alert('Geen scans in dit bereik.');
    return;
  }
  updateStatus(5, `Scans ${from}–${to} (${pathsToUse.length} scan(s))…`);
  try {
    const fileNumber = await exportPaths(pathsToUse);
    updateStatus(0, '—');
    if (fileNumber > 0) alert(`${fileNumber} frame(s) bewaard (scans ${from}–${to}) in ${folder}`);
  } catch (e) {
    updateStatus(0, '—');
    alert('Bewaren mislukt: ' + (e?.message || e));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
