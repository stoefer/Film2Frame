/**
 * App state – single source of truth. Alle wijzigingen via setters zodat we later
 * persistence of undo kunnen toevoegen.
 */
import { MAX_FRAMES, MIN_FRAMES, ZOOM_MIN, ZOOM_MAX, FINE_ROTATION_MIN, FINE_ROTATION_MAX, DEFAULT_FRAMES_PER_STRIP } from './constants.js';

const state = {
  path: null,
  image: null,
  naturalWidth: 0,
  naturalHeight: 0,
  rotation90: 0,
  fineRotationDeg: 0,
  numFrames: DEFAULT_FRAMES_PER_STRIP,
  /** Filmformaat: '16mm-double' | '16mm-single' | 'super16' | '8mm' | 'super8' | '9.5mm' | '35mm' */
  filmFormat: '16mm-double',
  /** positief | negatief */
  filmPolarity: 'positief',
  /** Kantelpunt voor fijne rotatie: top-left, center, bottom-right, etc. */
  tiltPivot: 'center',
  activeFrameIndex: 0,
  zoomFrames: 1,
  gridOffsetX: 0,
  /** Asymmetrische rasterzijden (scanlint): true = linker/rechter marge los in canvas-px. */
  gridOffsetXAsymmetric: false,
  gridOffsetXLeft: null,
  gridOffsetXRight: null,
  gridOffsetY: 0,
  /** Onderrand offset (pixels). Als gezet blijft onderlijn van grid vast bij verticaal duwen/rekken. */
  gridOffsetYBottom: 0,
  orientLabel: '',
  flipHorizontal: false,
  flipVertical: false,
  projectPath: null,
  projectMeta: null,
  isDirty: false,
  lintStates: [],
  /** Tijdcode: frames per seconde (12–30), standaard 24. */
  timecodeFps: 24,
  /** Aantal frames in frame-voorbekijk (1 = één frame, 2–5 = meerdere bij uitzoomen). */
  framePreviewVisibleFrames: 1,
  /** Max. zijde (px) van scanlint-preview; hoger = scherpere preview voor nauwkeurige rasterplaatsing. */
  stripPreviewMaxDim: 1536,
  /** Doelmap voor frame-export (uitsnijden en bewaren). */
  exportFolderPath: null,
  /** Basis bestandsnaam voor geëxporteerde frames (nummering wordt automatisch toegevoegd). */
  exportBaseName: 'frame',
  /** Pauze in seconden na elke scan bij batch-export (0 = geen pauze). */
  exportPauseSeconds: 0,
  /** Uitvoerformaat: png | jpg */
  outputFormat: 'png',
  /** Scan-DPI (voor projectinstellingen). */
  scanDpi: 4800,
  /** Pijltjesstap (px) voor raster in scanlint-preview (1–10). */
  arrowStepPx: 1,
  /** Pijltjesstap met Shift (px) voor raster in scanlint-preview (10–100). */
  arrowStepShiftPx: 10
};

function clampNumFrames(n) {
  return Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, n));
}

function clampActiveIndex(i) {
  return Math.max(0, Math.min(state.numFrames - 1, i));
}

export function getState() {
  return state;
}

export function setStrip(path, image) {
  state.path = path;
  state.image = image;
  state.naturalWidth = image ? (image.naturalWidth || image.width) : 0;
  state.naturalHeight = image ? (image.naturalHeight || image.height) : 0;
  state.rotation90 = 0;
  state.fineRotationDeg = 0;
  state.activeFrameIndex = 0;
  state.flipHorizontal = false;
  state.flipVertical = false;
  // Horizontale scans (breedte > hoogte) altijd verticaal inladen: 90° draaiing toepassen
  if (state.naturalWidth > state.naturalHeight) {
    state.orientLabel = 'Horizontaal (auto: draai 90°)';
    state.rotation90 = 90;
  } else {
    state.orientLabel = 'Verticaal';
  }
}

export function setRotation90(deg) {
  state.rotation90 = ((state.rotation90 + deg) % 360 + 360) % 360;
  if (state.orientLabel === 'Verticaal') state.orientLabel = 'Horizontaal (gedraaid)';
  else if (state.orientLabel === 'Horizontaal (auto: draai 90°)') state.orientLabel = 'Verticaal (gedraaid)';
  else state.orientLabel = state.rotation90 === 90 ? 'Horizontaal (gedraaid)' : 'Verticaal (gedraaid)';
}

export function setFineRotation(deg) {
  state.fineRotationDeg = Math.max(FINE_ROTATION_MIN, Math.min(FINE_ROTATION_MAX, deg));
}

export function setNumFrames(n) {
  state.numFrames = clampNumFrames(n);
  state.activeFrameIndex = clampActiveIndex(state.activeFrameIndex);
}

export function setActiveFrameIndex(i) {
  state.activeFrameIndex = clampActiveIndex(i);
}

export function setZoomFrames(z) {
  state.zoomFrames = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

export function setFramePreviewVisibleFrames(n) {
  state.framePreviewVisibleFrames = Math.max(1, Math.min(5, Math.round(Number(n)) || 1));
}

export function setStripPreviewMaxDim(maxDim) {
  const v = Number(maxDim);
  if (!Number.isFinite(v) || v < 512) return;
  state.stripPreviewMaxDim = Math.min(8192, Math.round(v));
}

export function setExportFolderPath(p) {
  state.exportFolderPath = p != null ? String(p) : null;
}

export function setExportBaseName(name) {
  state.exportBaseName = name != null ? String(name).trim() || 'frame' : 'frame';
}

export function setExportPauseSeconds(s) {
  const v = Number(s);
  state.exportPauseSeconds = Number.isFinite(v) && v >= 0 ? Math.min(300, Math.round(v)) : 0;
}

export function setOutputFormat(format) {
  if (format === 'png' || format === 'jpg' || format === 'jpeg') state.outputFormat = format === 'jpeg' ? 'jpg' : format;
}

export function setScanDpi(dpi) {
  const v = Number(dpi);
  if (Number.isFinite(v) && v >= 300) state.scanDpi = Math.min(9600, Math.round(v));
}

export function setArrowStepPx(px) {
  const v = Number(px);
  if (Number.isFinite(v)) state.arrowStepPx = Math.max(1, Math.min(10, Math.round(v)));
}

export function setArrowStepShiftPx(px) {
  const v = Number(px);
  if (Number.isFinite(v)) state.arrowStepShiftPx = Math.max(10, Math.min(100, Math.round(v)));
}

export function setGridOffset(x, y) {
  state.gridOffsetX = Number(x) || 0;
  state.gridOffsetY = Number(y) || 0;
  state.gridOffsetXAsymmetric = false;
  state.gridOffsetXLeft = null;
  state.gridOffsetXRight = null;
}

/** Zet linker/rechter marge in canvas-pixels (asymmetrisch raster). */
export function setGridOffsetXMargins(left, right) {
  state.gridOffsetXAsymmetric = true;
  state.gridOffsetXLeft = Math.max(0, Math.round(Number(left) || 0));
  state.gridOffsetXRight = Math.max(0, Math.round(Number(right) || 0));
  state.gridOffsetX = 0;
}

export function setGridOffsetYBottom(bottom) {
  const v = Number(bottom);
  state.gridOffsetYBottom = Number.isFinite(v) ? Math.round(v) : 0;
}

/** Alleen Y; wijzigt asymmetrische X-marges niet. */
export function setGridOffsetYOnly(y) {
  state.gridOffsetY = Number(y) || 0;
}

/** Zet raster naar standaard: 75% breedte scanlint, geen verticale offset. */
export function resetGridToDefault() {
  state.gridOffsetX = 0;
  state.gridOffsetXAsymmetric = false;
  state.gridOffsetXLeft = null;
  state.gridOffsetXRight = null;
  state.gridOffsetY = 0;
  state.gridOffsetYBottom = 0;
}

export function setFlipHorizontal(value) {
  state.flipHorizontal = !!value;
}

export function setFlipVertical(value) {
  state.flipVertical = !!value;
}

export function setFilmFormat(value) {
  if (value && typeof value === 'string') state.filmFormat = value;
}

export function setFilmPolarity(value) {
  if (value === 'positief' || value === 'negatief') state.filmPolarity = value;
}

export function setTiltPivot(value) {
  if (value && typeof value === 'string') state.tiltPivot = value;
}

export function setTimecodeFps(fps) {
  const v = Number(fps);
  if (!Number.isFinite(v)) return;
  state.timecodeFps = Math.max(12, Math.min(60, Math.round(v)));
}

export function updateProjectScanInfos(scanInfos) {
  if (!state.projectMeta) return;
  state.projectMeta.scanInfos = Array.isArray(scanInfos) ? [...scanInfos] : [];
  state.projectMeta.numberOfScans = state.projectMeta.scanInfos.length;
}

export function setProject(projectPath, meta) {
  state.projectPath = projectPath;
  state.projectMeta = meta ? {
    ...meta,
    lintStates: Array.isArray(meta.lintStates) ? [...meta.lintStates] : [],
    scanInfos: Array.isArray(meta.scanInfos) ? [...meta.scanInfos] : []
  } : null;
  state.isDirty = false;
  state.lintStates = state.projectMeta?.lintStates ? [...state.projectMeta.lintStates] : [];
  if (meta?.framesPerLint != null) state.numFrames = clampNumFrames(meta.framesPerLint);
  if (meta?.filmFormat != null) state.filmFormat = meta.filmFormat;
  if (meta?.filmPolarity != null) state.filmPolarity = meta.filmPolarity;
  if (meta?.outputFolder != null) state.exportFolderPath = meta.outputFolder;
  if (meta?.outputFormat != null) state.outputFormat = meta.outputFormat;
  if (meta?.scanDpi != null) state.scanDpi = meta.scanDpi;
}

export function clearProject() {
  state.projectPath = null;
  state.projectMeta = null;
  state.isDirty = false;
  state.lintStates = [];
  state.path = null;
  state.image = null;
  state.naturalWidth = 0;
  state.naturalHeight = 0;
  state.orientLabel = '';
}

export function setDirty() {
  state.isDirty = true;
}

export function clearDirty() {
  state.isDirty = false;
}

export function setLintStatesFromLoaded(states) {
  state.lintStates = Array.isArray(states) ? states.map(s => ({ ...s })) : [];
}

export function getLintStateSnapshot() {
  return {
    path: state.path,
    rotation90: state.rotation90,
    fineRotationDeg: state.fineRotationDeg,
    numFrames: state.numFrames,
    activeFrameIndex: state.activeFrameIndex,
    zoomFrames: state.zoomFrames,
    gridOffsetX: state.gridOffsetX,
    gridOffsetXAsymmetric: state.gridOffsetXAsymmetric,
    gridOffsetXLeft: state.gridOffsetXLeft,
    gridOffsetXRight: state.gridOffsetXRight,
    gridOffsetY: state.gridOffsetY,
    gridOffsetYBottom: state.gridOffsetYBottom,
    orientLabel: state.orientLabel,
    flipHorizontal: state.flipHorizontal,
    flipVertical: state.flipVertical,
    filmFormat: state.filmFormat,
    filmPolarity: state.filmPolarity,
    tiltPivot: state.tiltPivot
  };
}

export function applyLintState(snapshot) {
  if (!snapshot) return;
  if (snapshot.rotation90 != null) state.rotation90 = snapshot.rotation90;
  if (snapshot.fineRotationDeg != null) state.fineRotationDeg = snapshot.fineRotationDeg;
  if (snapshot.numFrames != null) state.numFrames = clampNumFrames(snapshot.numFrames);
  if (snapshot.activeFrameIndex != null) state.activeFrameIndex = clampActiveIndex(snapshot.activeFrameIndex);
  if (snapshot.zoomFrames != null) state.zoomFrames = snapshot.zoomFrames;
  if (snapshot.gridOffsetX != null) state.gridOffsetX = Number(snapshot.gridOffsetX) || 0;
  if (snapshot.gridOffsetXAsymmetric === true && snapshot.gridOffsetXLeft != null && snapshot.gridOffsetXRight != null) {
    state.gridOffsetXAsymmetric = true;
    state.gridOffsetXLeft = Math.max(0, Math.round(Number(snapshot.gridOffsetXLeft) || 0));
    state.gridOffsetXRight = Math.max(0, Math.round(Number(snapshot.gridOffsetXRight) || 0));
    state.gridOffsetX = 0;
  } else {
    state.gridOffsetXAsymmetric = false;
    state.gridOffsetXLeft = null;
    state.gridOffsetXRight = null;
  }
  if (snapshot.gridOffsetY != null) state.gridOffsetY = Number(snapshot.gridOffsetY) || 0;
  if (snapshot.gridOffsetYBottom != null) {
    const vb = Number(snapshot.gridOffsetYBottom);
    state.gridOffsetYBottom = Number.isFinite(vb) ? Math.round(vb) : 0;
  } else state.gridOffsetYBottom = 0;
  if (snapshot.orientLabel != null) state.orientLabel = snapshot.orientLabel;
  if (snapshot.flipHorizontal != null) state.flipHorizontal = !!snapshot.flipHorizontal;
  if (snapshot.flipVertical != null) state.flipVertical = !!snapshot.flipVertical;
  if (snapshot.filmFormat != null) state.filmFormat = snapshot.filmFormat;
  if (snapshot.filmPolarity != null) state.filmPolarity = snapshot.filmPolarity;
  if (snapshot.tiltPivot != null) state.tiltPivot = snapshot.tiltPivot;
}

function findLintState(lintPath) {
  return state.lintStates.find(s => s.path === lintPath);
}

export function getLintStateForPath(lintPath) {
  return findLintState(lintPath) || null;
}

export function setLintStateForPath(lintPath, snapshot) {
  const idx = state.lintStates.findIndex(s => s.path === lintPath);
  const entry = { ...snapshot, path: lintPath };
  if (idx >= 0) state.lintStates[idx] = entry;
  else state.lintStates.push(entry);
  state.isDirty = true;
}
