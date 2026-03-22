/**
 * UI-binding – koppelt DOM aan state en preview. Enige module die getElementById gebruikt.
 */
import { getState, setStrip, setRotation90, setFineRotation, setNumFrames, setActiveFrameIndex, setZoomFrames, setFramePreviewVisibleFrames, setStripPreviewMaxDim, setExportFolderPath, setExportBaseName, setExportPauseSeconds, setGridOffset, setGridOffsetXMargins, setGridOffsetYOnly, setGridOffsetYBottom, setDirty, setFlipHorizontal, setFlipVertical, setTimecodeFps, setFilmFormat, setFilmPolarity, setTiltPivot, setOutputFormat, setScanDpi, setArrowStepPx, setArrowStepShiftPx, getLintStateSnapshot, getGridGeometrySnapshot, applyGridGeometrySnapshot, setLintStateForPath, updateProjectScanInfos, applyLintState, setGridVerticalAnchorMode, setGridVerticalPivotCustomK, setGridSplitLowerPanCanvas, setGridPanelLinkVerticalAnchor } from './state.js';
import { loadImage, getStripCanvas, getStripCanvasDimensions } from './strip-loader.js';
import {
  getFrameDimensions,
  getEffectiveGridOffsetX,
  getDefaultGridOffsetX,
  cropFrameAtIndex,
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
  flipH: 'f2f-flip-h',
  flipV: 'f2f-flip-v',
  filename: 'f2f-filename',
  orientLabel: 'f2f-orient',
  rotate90: 'f2f-rotate90',
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
  prevScan: 'f2f-prev-scan',
  nextScan: 'f2f-next-scan',
  goToScan: 'f2f-go-to-scan',
  loadLint: 'f2f-load-lint',
  openStrip: 'f2f-open-strip',
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
  settingCustomResWrap: 'f2f-setting-custom-res-wrap',
  settingCustomW: 'f2f-setting-custom-w',
  settingCustomH: 'f2f-setting-custom-h',
  settingPreviewRes: 'f2f-setting-preview-res',
  settingDarkMode: 'f2f-setting-dark-mode',
  settingWindowArrangement: 'f2f-setting-window-arrangement',
  settingArrowStepPx: 'f2f-setting-arrow-step-px',
  settingArrowStepShiftPx: 'f2f-setting-arrow-step-shift-px',
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
      projectDirty.textContent = ' (niet opgeslagen)';
    }
    if (firstStep) firstStep.classList.add('hidden');
    if (lintPanel) lintPanel.classList.remove('hidden');
  } else {
    if (projectInfo) projectInfo.textContent = 'Geen project geopend';
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
  if (el(ids.orientLabel)) el(ids.orientLabel).textContent = s.orientLabel || '—';
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
    scanCountEl.textContent = hasProject() && total > 0 ? `Scans in project: ${total}` : '—';
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
  if (el(ids.flipH)) el(ids.flipH).checked = !!s.flipHorizontal;
  if (el(ids.flipV)) el(ids.flipV).checked = !!s.flipVertical;
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
      applySavedLintState(lintPath);
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
    applySavedLintState(lintPath);
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
  if (!Number.isNaN(n)) setActiveFrameIndex(n - 1);
  syncGridSplitLowerPanClamp();
  setDirty();
  updateUI();
  refreshPreviewsGridOnly();
}

function onPrevFrame() {
  setActiveFrameIndex(getState().activeFrameIndex - 1);
  syncGridSplitLowerPanClamp();
  setDirty();
  updateUI();
  refreshPreviewsGridOnly();
}

function onNextFrame() {
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

function onFlipH() {
  setFlipHorizontal(el(ids.flipH)?.checked);
  setDirty();
  updateUI();
  refreshPreviews();
}

function onFlipV() {
  setFlipVertical(el(ids.flipV)?.checked);
  setDirty();
  updateUI();
  refreshPreviews();
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

const OUTPUT_RES_DIMENSIONS = { sd: [1280, 720], hd: [1920, 1080], uhd: [3840, 2160] };

function getOutputDimensionsFromSettings(settings) {
  if (!settings || settings.outputResolution === 'original') return null;
  if (settings.outputResolution === 'custom') {
    const w = Math.max(1, Number(settings.customOutputWidth) || 1920);
    const h = Math.max(1, Number(settings.customOutputHeight) || 1080);
    return { w, h };
  }
  const dims = OUTPUT_RES_DIMENSIONS[settings.outputResolution];
  if (!dims) return null;
  return { w: dims[0], h: dims[1] };
}

function scaleCanvasToSize(sourceCanvas, targetW, targetH) {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  if (sw < 1 || sh < 1 || targetW < 1 || targetH < 1) return sourceCanvas;
  const scale = Math.min(targetW / sw, targetH / sh, 1);
  const outW = Math.round(sw * scale);
  const outH = Math.round(sh * scale);
  if (outW === sw && outH === sh) return sourceCanvas;
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

function applyTheme(darkMode) {
  if (document.body) {
    document.body.classList.toggle('theme-light', !darkMode);
  }
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
    set(ids.settingOutputRes, s.outputResolution || 'original');
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
    set(ids.settingWindowArrangement, s.windowArrangement || 'left-center-right');
    const arrowPx = (s.arrowStepPx != null && Number(s.arrowStepPx) >= 1) ? Math.min(10, Number(s.arrowStepPx)) : 1;
    const arrowShiftPx = (s.arrowStepShiftPx != null && Number(s.arrowStepShiftPx) >= 10) ? Math.min(100, Number(s.arrowStepShiftPx)) : 10;
    set(ids.settingArrowStepPx, String(arrowPx));
    set(ids.settingArrowStepShiftPx, String(arrowShiftPx));
    applyTheme(s.darkMode);
    setArrowStepPx(arrowPx);
    setArrowStepShiftPx(arrowShiftPx);
    const wrap = el(ids.settingCustomResWrap);
    if (wrap) wrap.classList.toggle('hidden', s.outputResolution !== 'custom');
    updateUI();
  } catch (_) {}
}

async function saveAppSettings() {
  const outRes = el(ids.settingOutputRes)?.value || 'original';
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
    windowArrangement: el(ids.settingWindowArrangement)?.value || 'left-center-right',
    arrowStepPx: arrowPx,
    arrowStepShiftPx: arrowShiftPx
  };
  await window.api?.setAppSettings?.(settings);
  applyTheme(settings.darkMode);
  setScanDpi(settings.scanDpi);
  setOutputFormat(settings.outputFormat);
  setStripPreviewMaxDim(settings.stripPreviewRes);
  setArrowStepPx(settings.arrowStepPx);
  setArrowStepShiftPx(settings.arrowStepShiftPx);
  updateUI();
  if (getState().image) refreshPreviews();
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
    window.api?.notifyStripPresetsUpdated?.();
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
}

async function onStripPresetDoDelete(id) {
  if (!id) {
    alert('Selecteer eerst een preset.');
    return;
  }
  if (!confirm('Deze preset definitief wissen?')) return;
  if (!window.api?.presetDelete) return;
  await window.api.presetDelete(id);
  window.api?.notifyStripPresetsUpdated?.();
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

async function onRefreshScanList() {
  if (!hasProject()) return;
  const meta = getProjectMeta();
  const location = meta?.location;
  if (!location) return;
  updateStatus(50, 'Scanlijst vernieuwen…');
  try {
    const infos = await window.api?.getScanInfos?.(location);
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
  if (!path) return;
  updateStatus(50, 'Scanlints tellen…');
  let infos;
  try {
    infos = await window.api?.getScanInfos?.(path);
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
    /* pivotActive: tijdelijk laatste frame (k=n) of rand — split uit; d bewaren voor terugkeren naar middenframes */
    if ((s.gridVerticalAnchorMode || 'bottomFixed') === 'pivotActive') {
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

  let top = Number(s.gridOffsetY) || 0;
  let bottom = Number.isFinite(Number(s.gridOffsetYBottom)) ? Math.round(s.gridOffsetYBottom) : 0;

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
 * Anders = rigide pan zoals Hand in niet-split-modus.
 */
function onStripVerticalFixedBottomStep(deltaDisplay) {
  const d = Number(deltaDisplay) || 0;
  if (d === 0) return;

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

  let stepC = Math.round(d * scaleY);
  if (stepC === 0) stepC = d > 0 ? 1 : -1;

  const curTop = Number(s.gridOffsetY) || 0;
  const bottom = Number.isFinite(Number(s.gridOffsetYBottom)) ? Math.round(s.gridOffsetYBottom) : 0;
  const mode = s.gridVerticalAnchorMode || 'bottomFixed';
  const link = panelUsesVerticalAnchorLink();
  /*
   * Koppeling uit: Duw altijd rigide. Aan + Onderkant raster: Y-onder vast (Duw). Aan + pivotActive met lijn op strip-onder: idem. Anders: rigide.
   */
  const c =
    !link
      ? applyRigidVerticalPanStepCanvas(frameHeight, n, curTop, bottom, stepC)
      : mode === 'bottomFixed' || pivotActiveAnchorsStripBottom()
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
  el(ids.flipH)?.addEventListener('change', onFlipH);
  el(ids.flipV)?.addEventListener('change', onFlipV);
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
  el(ids.settingOutputRes)?.addEventListener('change', function () {
    const wrap = el(ids.settingCustomResWrap);
    if (wrap) wrap.classList.toggle('hidden', el(ids.settingOutputRes)?.value !== 'custom');
  });
  el(ids.arrangeWindowsBtn)?.addEventListener('click', onArrangeWindows);
  el(ids.settingsSaveBtn)?.addEventListener('click', saveAppSettings);
  el(ids.rotate90)?.addEventListener('click', onRotate90);
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
  el(ids.openStrip)?.addEventListener('click', onOpenStrip);

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
  window.api?.onOutputPreviewClosed?.(() => {});
  window.api?.onFrameGridOffsetUpdate?.(onFrameGridOffsetFromPreview);
  window.api?.onSetGridOffsetAbsolute?.(onSetGridOffsetAbsolute);
  window.api?.onFramePreviewJump?.(onFramePreviewJump);
  window.api?.onSetActiveFrame?.(onSetActiveFrameFromPreview);
  window.api?.onResetGrid?.(resetGridToDefault);
  window.api?.onStatusFromStrip?.(function (d) { updateStatus(d?.percent, d?.operation); });
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
    onStripVerticalFixedBottomStep(p.delta != null ? Number(p.delta) : 0);
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

/** Exporteert alle frames van de huidige scan naar de doelmap. Nummering 000001–999999, geen overschrijven. Uitvoerresolutie uit instellingen. */
async function onExportCurrentScan() {
  const folder = getState().exportFolderPath;
  if (!folder) {
    alert('Kies eerst een doelmap (Frame uitsnijden en bewaren).');
    return;
  }
  const stripCanvas = getStripCanvas();
  if (!stripCanvas) {
    alert('Geen scanlint geladen.');
    return;
  }
  const s = getState();
  const n = Math.max(1, s.numFrames);
  const baseName = s.exportBaseName || 'frame';
  const ext = (s.outputFormat || 'png').toLowerCase().replace(/^\./, '');
  const appSettings = await window.api?.getAppSettings?.().catch(() => null);
  const outDims = appSettings ? getOutputDimensionsFromSettings(appSettings) : null;
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
      let canvas = cropFrameAtIndex(stripCanvas, i);
      if (!canvas) continue;
      if (outDims) canvas = scaleCanvasToSize(canvas, outDims.w, outDims.h);
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

/** Voert frame-export uit voor een lijst scanpaden. Nummering loopt door vanaf laatste in uitvoermap. Uitvoerresolutie uit instellingen. */
async function exportPaths(paths) {
  const folder = getState().exportFolderPath;
  const baseName = getState().exportBaseName || 'frame';
  const ext = (getState().outputFormat || 'png').toLowerCase().replace(/^\./, '');
  const pauseSec = Math.max(0, getState().exportPauseSeconds || 0);
  const appSettings = await window.api?.getAppSettings?.().catch(() => null);
  const outDims = appSettings ? getOutputDimensionsFromSettings(appSettings) : null;
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
    const stripCanvas = getStripCanvas();
    if (!stripCanvas) continue;
    const n = Math.max(1, getState().numFrames);
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    for (let i = 0; i < n; i++) {
      let canvas = cropFrameAtIndex(stripCanvas, i);
      if (!canvas) continue;
      if (outDims) canvas = scaleCanvasToSize(canvas, outDims.w, outDims.h);
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
