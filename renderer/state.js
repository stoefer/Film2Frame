/**
 * App state – single source of truth. Alle wijzigingen via setters zodat we later
 * persistence of undo kunnen toevoegen.
 */
import {
  MAX_FRAMES,
  MIN_FRAMES,
  ZOOM_MIN,
  ZOOM_MAX,
  FINE_ROTATION_MIN,
  FINE_ROTATION_MAX,
  DEFAULT_FRAMES_PER_STRIP,
  DEFAULT_STRIP_PREVIEW_MAX_DIM
} from './constants.js';

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
  /** Onderrand offset (pixels). Samen met gridOffsetY bepaalt de verticale positie van het raster op het lint. */
  gridOffsetYBottom: 0,
  /**
   * Strip-preview: referentielijn (gele lijn). bottomFixed = heel raster schuift tegelijk.
   * pivotMiddleUpper: k≈ceil(n/2), flexibel boven lijn; pivotMiddleLower: k≈floor(n/2), flexibel onder lijn (bij oneven n wijkt k 1 rij).
   */
  gridVerticalAnchorMode: 'bottomFixed',
  /** Bij pivotCustom: lijnindex 0=boven raster … n=onder raster */
  gridVerticalPivotCustomK: 1,
  /**
   * Split-pan in canvas-px: bij pivotMiddleUpper e.d. verdeelt d het bovenblok (tot lijn k); bij pivotMiddleLower het onderblok.
   * Randcel bij de split past in hoogte; de andere helft blijft visueel gelijk per rij (star band).
   */
  gridSplitLowerPanCanvas: 0,
  /**
   * Bij split-referentie (0 < k < n): vaste band — per cel onder lijn k (pivotMiddleUpper e.d.), of per cel boven lijn k (pivotMiddleLower: star bovenblok).
   * De flexibele helft reageert op split-pan (gridSplitLowerPanCanvas).
   */
  gridFrozenLowerCellHeightPx: null,
  /**
   * pivotActive en pivotCustom: split-pan d per referentielijn-index k (string "1"…"n−1").
   * Eén globale gridSplitLowerPanCanvas hoort bij het huidige k; zonder map ging die waarde bij wissel actief frame of custom-lijn verloren.
   */
  gridSplitLowerPanByPivotK: null,
  /**
   * Scanlint-preview rechter paneel: als true gebruiken Hand ▲▼, Duw en Shift+Duw de referentielijn/fixatiepunten
   * (split-pan, vaste onderrand bij Onderkant raster). Uit = eenvoudig rigide gedrag voor die knoppen.
   */
  gridPanelLinkVerticalAnchor: true,
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
  stripPreviewMaxDim: DEFAULT_STRIP_PREVIEW_MAX_DIM,
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
  arrowStepShiftPx: 10,
  /** Pad naar uitvoerbestand voor MP4-export (bijv. C:\output\video.mp4). */
  videoOutputPath: null,
  /** Map met frames voor video-export (leeg = gebruik projectscans). */
  videoFramesFolderPath: null
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

/**
 * @param {string} path
 * @param {HTMLImageElement|null} image
 * @param {{ preserveLintGrid?: boolean }} [options] — bij true: fijne rotatie en spiegeling behouden; raster/frames bleven al in state (project-scan wissel).
 */
export function setStrip(path, image, options = {}) {
  const preserveLintGrid = options.preserveLintGrid === true;
  state.path = path;
  state.image = image;
  state.naturalWidth = image ? (image.naturalWidth || image.width) : 0;
  state.naturalHeight = image ? (image.naturalHeight || image.height) : 0;
  if (!preserveLintGrid) {
    state.rotation90 = 0;
    state.fineRotationDeg = 0;
    state.activeFrameIndex = 0;
    state.flipHorizontal = false;
    state.flipVertical = false;
  } else {
    state.activeFrameIndex = 0;
  }
  // Horizontale scans (breedte > hoogte) altijd verticaal inladen: 90° draaiing toepassen
  if (state.naturalWidth > state.naturalHeight) {
    state.orientLabel = 'Horizontaal (auto: draai 90°)';
    state.rotation90 = 90;
  } else {
    state.orientLabel = 'Verticaal';
    state.rotation90 = 0;
  }
}

export function setRotation90(deg) {
  state.rotation90 = ((state.rotation90 + deg) % 360 + 360) % 360;
  if (state.orientLabel === 'Verticaal') state.orientLabel = 'Horizontaal (gedraaid)';
  else if (state.orientLabel === 'Horizontaal (auto: draai 90°)') state.orientLabel = 'Verticaal (gedraaid)';
  else state.orientLabel = state.rotation90 === 90 ? 'Horizontaal (gedraaid)' : 'Verticaal (gedraaid)';
}

export function setFineRotation(deg) {
  const v = Number(deg);
  if (!Number.isFinite(v)) return;
  const rounded = Math.round(v * 1000) / 1000;
  state.fineRotationDeg = Math.max(FINE_ROTATION_MIN, Math.min(FINE_ROTATION_MAX, rounded));
}

export function setNumFrames(n) {
  state.numFrames = clampNumFrames(n);
  state.activeFrameIndex = clampActiveIndex(state.activeFrameIndex);
  const nf = Math.max(1, state.numFrames);
  state.gridVerticalPivotCustomK = Math.max(0, Math.min(nf, state.gridVerticalPivotCustomK));
  state.gridSplitLowerPanCanvas = 0;
  state.gridFrozenLowerCellHeightPx = null;
  state.gridSplitLowerPanByPivotK = null;
}

function ensurePivotSplitMap() {
  if (!state.gridSplitLowerPanByPivotK || typeof state.gridSplitLowerPanByPivotK !== 'object') {
    state.gridSplitLowerPanByPivotK = {};
  }
}

function resolveSplitPanPivotKFromState() {
  const mode = state.gridVerticalAnchorMode || 'bottomFixed';
  const n = Math.max(1, state.numFrames || 1);
  if (mode === 'pivotActive') {
    return Math.max(0, Math.min(n, (state.activeFrameIndex || 0) + 1));
  }
  if (mode === 'pivotCustom') {
    return Math.max(0, Math.min(n, Math.round(Number(state.gridVerticalPivotCustomK) || 0)));
  }
  return -1;
}

/** Na laden snapshot/preset: canvas-split gelijk trekken met map voor huidig k (pivotActive / pivotCustom). */
export function syncPivotActiveSplitCanvasFromMap() {
  const mode = state.gridVerticalAnchorMode || 'bottomFixed';
  if (mode !== 'pivotActive' && mode !== 'pivotCustom') return;
  const n = Math.max(1, state.numFrames || 1);
  const k = resolveSplitPanPivotKFromState();
  /* k === n: geen split in raster, maar canvas-waarde uit map houden i.p.v. vroeg afbreken. */
  if (k <= 0 || k > n) return;
  if (!state.gridSplitLowerPanByPivotK || typeof state.gridSplitLowerPanByPivotK !== 'object') {
    const cur = Math.round(Number(state.gridSplitLowerPanCanvas) || 0);
    if (cur !== 0) {
      ensurePivotSplitMap();
      state.gridSplitLowerPanByPivotK[String(k)] = cur;
    }
    return;
  }
  const st = state.gridSplitLowerPanByPivotK[String(k)];
  if (st != null && Number.isFinite(Number(st))) {
    state.gridSplitLowerPanCanvas = Math.round(Number(st));
  }
}

export function setActiveFrameIndex(i) {
  const newIdx = clampActiveIndex(i);
  const mode = state.gridVerticalAnchorMode || 'bottomFixed';
  const n = Math.max(1, state.numFrames || 1);

  if (mode === 'pivotActive') {
    const kOld = Math.max(0, Math.min(n, (state.activeFrameIndex ?? 0) + 1));
    const kNew = Math.max(0, Math.min(n, newIdx + 1));
    if (kOld > 0 && kOld < n) {
      ensurePivotSplitMap();
      state.gridSplitLowerPanByPivotK[String(kOld)] = Math.round(Number(state.gridSplitLowerPanCanvas) || 0);
    }
    state.activeFrameIndex = newIdx;
    if (kNew > 0 && kNew < n) {
      ensurePivotSplitMap();
      const raw = state.gridSplitLowerPanByPivotK[String(kNew)];
      state.gridSplitLowerPanCanvas =
        raw != null && Number.isFinite(Number(raw)) ? Math.round(Number(raw)) : 0;
    }
    return;
  }

  state.activeFrameIndex = newIdx;
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

export function setVideoOutputPath(p) {
  state.videoOutputPath = p != null ? String(p) : null;
}

export function setVideoFramesFolderPath(p) {
  state.videoFramesFolderPath = p != null ? String(p) : null;
}

export function setGridOffset(x, y) {
  state.gridOffsetX = Number(x) || 0;
  const yy = Number(y);
  state.gridOffsetY = Number.isFinite(yy) ? Math.round(yy) : 0;
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
  state.gridOffsetYBottom = Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
}

/** Alleen Y; wijzigt asymmetrische X-marges niet. */
export function setGridOffsetYOnly(y) {
  const yy = Number(y);
  state.gridOffsetY = Number.isFinite(yy) ? Math.round(yy) : 0;
}

const VERTICAL_ANCHOR_MODES = new Set([
  'bottomFixed',
  'pivotTop',
  'pivotActive',
  'pivotMiddleUpper',
  'pivotMiddleLower',
  'pivotCustom'
]);

export function setGridVerticalAnchorMode(mode) {
  let m = typeof mode === 'string' ? mode.trim() : 'bottomFixed';
  if (m === 'pivotMiddle') m = 'pivotMiddleUpper';
  if (VERTICAL_ANCHOR_MODES.has(m)) {
    const prev = state.gridVerticalAnchorMode || 'bottomFixed';
    state.gridVerticalAnchorMode = m;
    if (m === 'bottomFixed') {
      state.gridSplitLowerPanCanvas = 0;
      state.gridFrozenLowerCellHeightPx = null;
      state.gridSplitLowerPanByPivotK = null;
    } else if (prev !== m && (m === 'pivotMiddleUpper' || m === 'pivotMiddleLower')) {
      /* Schone start: oude d (b.v. stap 10) en frozen veroorzaken sprong + verkeerde bandhoogte. */
      state.gridSplitLowerPanCanvas = 0;
      state.gridFrozenLowerCellHeightPx = null;
    } else if (
      prev !== m &&
      (prev === 'pivotMiddleUpper' || prev === 'pivotMiddleLower')
    ) {
      state.gridFrozenLowerCellHeightPx = null;
    }
  }
}

export function setGridSplitLowerPanCanvas(delta) {
  const v = Math.round(Number(delta) || 0);
  state.gridSplitLowerPanCanvas = v;
  const mode = state.gridVerticalAnchorMode || 'bottomFixed';
  if (mode === 'pivotActive' || mode === 'pivotCustom') {
    const n = Math.max(1, state.numFrames || 1);
    const k = resolveSplitPanPivotKFromState();
    if (k > 0 && k < n) {
      ensurePivotSplitMap();
      state.gridSplitLowerPanByPivotK[String(k)] = v;
    }
  }
}

/** Minimale frozen lower hoogte (gelijk aan GRID_MIN_SIZE_PX in grid.js). */
const GRID_FROZEN_LOWER_MIN_PX = 20;

export function setGridFrozenLowerCellHeightPx(value) {
  if (value == null) {
    state.gridFrozenLowerCellHeightPx = null;
    return;
  }
  const v = Number(value);
  if (!Number.isFinite(v)) {
    state.gridFrozenLowerCellHeightPx = null;
    return;
  }
  state.gridFrozenLowerCellHeightPx = Math.max(GRID_FROZEN_LOWER_MIN_PX, Math.round(v * 1000) / 1000);
}

export function setGridPanelLinkVerticalAnchor(value) {
  state.gridPanelLinkVerticalAnchor = value !== false;
}

/**
 * @param {number} k
 * @param {{ skipSplitHandoff?: boolean }} [options] skipSplitHandoff: preset/snapshot laden — geen bewaren/ophalen uit map
 */
export function setGridVerticalPivotCustomK(k, options = {}) {
  const skipSplitHandoff = options && options.skipSplitHandoff === true;
  const v = Math.round(Number(k) || 0);
  const n = Math.max(1, state.numFrames || 1);
  const clampedNew = Math.max(0, Math.min(n, v));
  const mode = state.gridVerticalAnchorMode || 'bottomFixed';

  if (!skipSplitHandoff && mode === 'pivotCustom') {
    const kOld = Math.max(0, Math.min(n, Math.round(Number(state.gridVerticalPivotCustomK) || 0)));
    if (kOld > 0 && kOld < n) {
      ensurePivotSplitMap();
      state.gridSplitLowerPanByPivotK[String(kOld)] = Math.round(Number(state.gridSplitLowerPanCanvas) || 0);
    }
    state.gridVerticalPivotCustomK = clampedNew;
    const kNew = state.gridVerticalPivotCustomK;
    if (kNew > 0 && kNew < n) {
      ensurePivotSplitMap();
      const raw = state.gridSplitLowerPanByPivotK[String(kNew)];
      state.gridSplitLowerPanCanvas =
        raw != null && Number.isFinite(Number(raw)) ? Math.round(Number(raw)) : 0;
    }
    return;
  }

  state.gridVerticalPivotCustomK = clampedNew;
}

/** Zet raster naar standaard: 75% breedte scanlint, geen verticale offset. */
export function resetGridToDefault() {
  state.gridOffsetX = 0;
  state.gridOffsetXAsymmetric = false;
  state.gridOffsetXLeft = null;
  state.gridOffsetXRight = null;
  state.gridOffsetY = 0;
  state.gridOffsetYBottom = 0;
  state.gridVerticalAnchorMode = 'bottomFixed';
  state.gridVerticalPivotCustomK = 1;
  state.gridSplitLowerPanCanvas = 0;
  state.gridFrozenLowerCellHeightPx = null;
  state.gridSplitLowerPanByPivotK = null;
  state.gridPanelLinkVerticalAnchor = true;
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

/** Welke scanlint-preset (id) hoort bij dit project; null = geen keuze. */
export function setStripPresetId(id) {
  if (!state.projectMeta) return;
  const v = id != null && typeof id === 'string' && id.trim() !== '' ? id.trim() : null;
  state.projectMeta.stripPresetId = v;
  state.isDirty = true;
}

export function setProject(projectPath, meta) {
  state.projectPath = projectPath;
  state.projectMeta = meta ? {
    ...meta,
    lintStates: Array.isArray(meta.lintStates) ? [...meta.lintStates] : [],
    scanInfos: Array.isArray(meta.scanInfos) ? [...meta.scanInfos] : [],
    stripPresetId:
      meta.stripPresetId != null && typeof meta.stripPresetId === 'string' && meta.stripPresetId.trim() !== ''
        ? meta.stripPresetId.trim()
        : null
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
    gridVerticalAnchorMode: state.gridVerticalAnchorMode,
    gridVerticalPivotCustomK: state.gridVerticalPivotCustomK,
    gridSplitLowerPanCanvas: state.gridSplitLowerPanCanvas,
    gridSplitLowerPanByPivotK:
      state.gridSplitLowerPanByPivotK && typeof state.gridSplitLowerPanByPivotK === 'object'
        ? { ...state.gridSplitLowerPanByPivotK }
        : null,
    gridFrozenLowerCellHeightPx: state.gridFrozenLowerCellHeightPx,
    gridPanelLinkVerticalAnchor: state.gridPanelLinkVerticalAnchor !== false,
    orientLabel: state.orientLabel,
    flipHorizontal: state.flipHorizontal,
    flipVertical: state.flipVertical,
    filmFormat: state.filmFormat,
    filmPolarity: state.filmPolarity,
    tiltPivot: state.tiltPivot
  };
}

/** Alleen raster-geometrie voor Overlay grid-presets (geen rotatie, flip, formaat, …). */
export function getGridGeometrySnapshot() {
  const s = getState();
  return {
    numFrames: s.numFrames,
    gridOffsetX: s.gridOffsetX,
    gridOffsetXAsymmetric: s.gridOffsetXAsymmetric,
    gridOffsetXLeft: s.gridOffsetXLeft,
    gridOffsetXRight: s.gridOffsetXRight,
    gridOffsetY: s.gridOffsetY,
    gridOffsetYBottom: s.gridOffsetYBottom,
    gridVerticalAnchorMode: s.gridVerticalAnchorMode,
    gridVerticalPivotCustomK: s.gridVerticalPivotCustomK,
    gridSplitLowerPanCanvas: s.gridSplitLowerPanCanvas,
    gridSplitLowerPanByPivotK:
      (s.gridVerticalAnchorMode === 'pivotActive' || s.gridVerticalAnchorMode === 'pivotCustom') &&
      s.gridSplitLowerPanByPivotK &&
      typeof s.gridSplitLowerPanByPivotK === 'object'
        ? { ...s.gridSplitLowerPanByPivotK }
        : null,
    gridFrozenLowerCellHeightPx: s.gridFrozenLowerCellHeightPx,
    gridPanelLinkVerticalAnchor: s.gridPanelLinkVerticalAnchor !== false
  };
}

/**
 * Past alleen raster-geometrie toe (preset laden). Volgorde: frames → X/Y → onderrand → referentie/split.
 */
export function applyGridGeometrySnapshot(grid) {
  if (!grid || typeof grid !== 'object') return;
  if (grid.numFrames != null) setNumFrames(grid.numFrames);

  if (grid.gridOffsetXAsymmetric === true && grid.gridOffsetXLeft != null && grid.gridOffsetXRight != null) {
    setGridOffsetXMargins(grid.gridOffsetXLeft, grid.gridOffsetXRight);
    const yy = Number(grid.gridOffsetY);
    setGridOffsetYOnly(Number.isFinite(yy) ? Math.round(yy) : 0);
  } else {
    const x = grid.gridOffsetX != null ? Number(grid.gridOffsetX) : 0;
    const y = grid.gridOffsetY != null ? Number(grid.gridOffsetY) : 0;
    setGridOffset(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0);
  }

  if (grid.gridOffsetYBottom != null) {
    const vb = Number(grid.gridOffsetYBottom);
    setGridOffsetYBottom(Number.isFinite(vb) ? vb : 0);
  }

  if (grid.gridVerticalAnchorMode != null) {
    setGridVerticalAnchorMode(grid.gridVerticalAnchorMode);
  }
  if (grid.gridVerticalPivotCustomK != null) {
    setGridVerticalPivotCustomK(grid.gridVerticalPivotCustomK, { skipSplitHandoff: true });
  }
  const anchorAfter = state.gridVerticalAnchorMode || 'bottomFixed';
  if (
    grid.gridSplitLowerPanByPivotK != null &&
    typeof grid.gridSplitLowerPanByPivotK === 'object' &&
    (anchorAfter === 'pivotActive' || anchorAfter === 'pivotCustom')
  ) {
    state.gridSplitLowerPanByPivotK = {};
    for (const [key, val] of Object.entries(grid.gridSplitLowerPanByPivotK)) {
      const t = Math.round(Number(val));
      if (Number.isFinite(t)) state.gridSplitLowerPanByPivotK[key] = t;
    }
  }
  if (grid.gridSplitLowerPanCanvas != null) {
    setGridSplitLowerPanCanvas(grid.gridSplitLowerPanCanvas);
  }
  if (grid.gridFrozenLowerCellHeightPx != null) {
    setGridFrozenLowerCellHeightPx(grid.gridFrozenLowerCellHeightPx);
  }
  if (grid.gridPanelLinkVerticalAnchor != null) {
    setGridPanelLinkVerticalAnchor(!!grid.gridPanelLinkVerticalAnchor);
  }
  syncPivotActiveSplitCanvasFromMap();
}

export function applyLintState(snapshot) {
  if (!snapshot) return;
  if (snapshot.rotation90 != null) state.rotation90 = snapshot.rotation90;
  if (snapshot.fineRotationDeg != null) setFineRotation(snapshot.fineRotationDeg);
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
  if (snapshot.gridOffsetY != null) {
    const vy = Number(snapshot.gridOffsetY);
    state.gridOffsetY = Number.isFinite(vy) ? Math.round(vy) : 0;
  }
  if (snapshot.gridOffsetYBottom != null) {
    const vb = Number(snapshot.gridOffsetYBottom);
    state.gridOffsetYBottom = Number.isFinite(vb) ? Math.max(0, Math.round(vb)) : 0;
  } else state.gridOffsetYBottom = 0;
  if (snapshot.gridVerticalAnchorMode != null) {
    const raw = String(snapshot.gridVerticalAnchorMode).trim();
    const gm = raw === 'pivotMiddle' ? 'pivotMiddleUpper' : raw;
    if (VERTICAL_ANCHOR_MODES.has(gm)) state.gridVerticalAnchorMode = gm;
  }
  if (snapshot.gridVerticalPivotCustomK != null) {
    const pk = Math.round(Number(snapshot.gridVerticalPivotCustomK) || 0);
    const n = Math.max(1, state.numFrames || 1);
    state.gridVerticalPivotCustomK = Math.max(0, Math.min(n, pk));
  }
  const lintAnchor = state.gridVerticalAnchorMode || 'bottomFixed';
  if (
    snapshot.gridSplitLowerPanByPivotK != null &&
    typeof snapshot.gridSplitLowerPanByPivotK === 'object' &&
    (lintAnchor === 'pivotActive' || lintAnchor === 'pivotCustom')
  ) {
    state.gridSplitLowerPanByPivotK = {};
    for (const [key, val] of Object.entries(snapshot.gridSplitLowerPanByPivotK)) {
      const t = Math.round(Number(val));
      if (Number.isFinite(t)) state.gridSplitLowerPanByPivotK[key] = t;
    }
  } else {
    state.gridSplitLowerPanByPivotK = null;
  }
  if (snapshot.gridSplitLowerPanCanvas != null) {
    setGridSplitLowerPanCanvas(Math.round(Number(snapshot.gridSplitLowerPanCanvas)) || 0);
  }
  if (snapshot.gridFrozenLowerCellHeightPx != null && Number.isFinite(Number(snapshot.gridFrozenLowerCellHeightPx))) {
    setGridFrozenLowerCellHeightPx(snapshot.gridFrozenLowerCellHeightPx);
  } else {
    setGridFrozenLowerCellHeightPx(null);
  }
  if (snapshot.gridPanelLinkVerticalAnchor != null) {
    state.gridPanelLinkVerticalAnchor = !!snapshot.gridPanelLinkVerticalAnchor;
  }
  if (snapshot.orientLabel != null) state.orientLabel = snapshot.orientLabel;
  if (snapshot.flipHorizontal != null) state.flipHorizontal = !!snapshot.flipHorizontal;
  if (snapshot.flipVertical != null) state.flipVertical = !!snapshot.flipVertical;
  if (snapshot.filmFormat != null) state.filmFormat = snapshot.filmFormat;
  if (snapshot.filmPolarity != null) state.filmPolarity = snapshot.filmPolarity;
  if (snapshot.tiltPivot != null) state.tiltPivot = snapshot.tiltPivot;
  syncPivotActiveSplitCanvasFromMap();
}

function findLintState(lintPath) {
  return state.lintStates.find(s => s.path === lintPath);
}

export function getLintStateForPath(lintPath) {
  return findLintState(lintPath) || null;
}

/** Velden die per scanlint in project.json worden bewaard (zonder `path`). */
const LINT_STATE_COMPARE_KEYS = [
  'rotation90',
  'fineRotationDeg',
  'numFrames',
  'activeFrameIndex',
  'zoomFrames',
  'gridOffsetX',
  'gridOffsetXAsymmetric',
  'gridOffsetXLeft',
  'gridOffsetXRight',
  'gridOffsetY',
  'gridOffsetYBottom',
  'gridVerticalAnchorMode',
  'gridVerticalPivotCustomK',
  'gridSplitLowerPanCanvas',
  'gridSplitLowerPanByPivotK',
  'gridFrozenLowerCellHeightPx',
  'gridPanelLinkVerticalAnchor',
  'orientLabel',
  'flipHorizontal',
  'flipVertical',
  'filmFormat',
  'filmPolarity',
  'tiltPivot'
];

function lintStateFieldEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') return !!a === !!b;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  if (typeof a === 'object' && typeof b === 'object' && a && b && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length) return false;
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return false;
    return ka.every((k) => lintStateFieldEqual(Number(a[k]), Number(b[k])));
  }
  return false;
}

function lintStateEntriesSemanticEqual(stored, incoming) {
  if (!stored || !incoming) return false;
  for (const k of LINT_STATE_COMPARE_KEYS) {
    if (!lintStateFieldEqual(stored[k], incoming[k])) return false;
  }
  return true;
}

export function setLintStateForPath(lintPath, snapshot) {
  const idx = state.lintStates.findIndex(s => s.path === lintPath);
  const entry = { ...snapshot, path: lintPath };
  const prev = idx >= 0 ? state.lintStates[idx] : null;
  if (prev && lintStateEntriesSemanticEqual(prev, entry)) {
    return;
  }
  if (idx >= 0) state.lintStates[idx] = entry;
  else state.lintStates.push(entry);
  state.isDirty = true;
}
