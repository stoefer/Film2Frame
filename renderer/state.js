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
  /** Alleen pixel-editor: welk frame wordt getoond/geschilderd; raster (scanlint) gebruikt activeFrameIndex. */
  pixelEditorActiveFrameIndex: 0,
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
   * Alleen Lijn # (pivotCustom). Waarde altijd 'pivotCustom'; oude projecten met bottomFixed worden bij laden naar k=n gemigreerd.
   */
  gridVerticalAnchorMode: 'pivotCustom',
  /** Lijnindex 0 = boven raster … n = onderkant raster (start = n = default aantal frames). */
  gridVerticalPivotCustomK: DEFAULT_FRAMES_PER_STRIP,
  /** Split-pan in canvas-px: verdeling in het bovenblok tot lijn k (0 < k < n). */
  gridSplitLowerPanCanvas: 0,
  /** Bij 0 < k < n: vaste band onder lijn k; flexibel blok erboven reageert op split-pan. */
  gridFrozenLowerCellHeightPx: null,
  /**
   * pivotCustom: split-pan d per k (string "1"…"n−1"). Globale gridSplitLowerPanCanvas hoort bij huidige k.
   */
  gridSplitLowerPanByPivotK: null,
  /**
   * Scanlint-preview rechter paneel: als true gebruiken Hand ▲▼, Duw en Shift+Duw de referentielijn/fixatiepunten
   * (split-pan; bij lijn k=n + koppel: vaste onderrand bij Duw). Uit = rigide gedrag voor die knoppen.
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
  /** Doelmap voor PNG’s van de pixel-editor (Vorige/Volgende frame). */
  pixelEditorOutputFolder: null,
  /** Optionele bronmap met scanbeelden (alleen pixel-editor; wijzigt niet de project-strip voor RASTER SETUP). */
  pixelEditorSourceFolder: null,
  /** Actief extern bestand in de pixel-editor (alleen sessie; niet in project.json). */
  pixelEditorExternalPath: null,
  /** @type {HTMLImageElement|null} */
  pixelEditorExternalImage: null,
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
  /** Vorige/Volgende scan in project: raster behouden i.p.v. opgeslagen lintState laden (instelling). */
  preserveGridOnScanNav: true,
  /** Pad naar uitvoerbestand voor MP4-export (bijv. C:\output\video.mp4). */
  videoOutputPath: null,
  /** Map met frames voor video-export (leeg = gebruik projectscans). */
  videoFramesFolderPath: null,
  /**
   * Pixel-editor overlays per frame-index: Map<number, { stripW, stripH, x, y, w, h, canvas }>.
   * Canvas is w×h, composited op strip op (x,y) in ruwe strip-pixels.
   */
  framePaintOverlays: new Map()
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
 * Zet grove rotatie + label op basis van bronpixels (breed vs hoog) en aantal frames per lint.
 * Bij 1 frame: geen auto-90° — de langste pixelzijde is de horizontale as van het scanlint.
 * @param {number} [frameCount] — optioneel; anders state.numFrames
 */
export function applyAutoOrientationFromNaturalSize(frameCount) {
  const w = state.naturalWidth;
  const h = state.naturalHeight;
  if (!w || !h) return;
  const n =
    frameCount != null && Number.isFinite(Number(frameCount))
      ? clampNumFrames(Number(frameCount))
      : Math.max(1, state.numFrames || 1);
  if (n === 1) {
    state.rotation90 = 0;
    state.orientLabel = w > h ? 'Horizontaal (1 frame)' : 'Verticaal (1 frame)';
    return;
  }
  if (w > h) {
    state.orientLabel = 'Horizontaal (auto: draai 90°)';
    state.rotation90 = 90;
  } else {
    state.orientLabel = 'Verticaal';
    state.rotation90 = 0;
  }
}

export function clearFramePaintOverlays() {
  state.framePaintOverlays.clear();
}

/**
 * @param {string} path
 * @param {HTMLImageElement|null} image
 * @param {{ preserveLintGrid?: boolean, autoOrientNumFrames?: number }} [options] — bij true: raster/offsets behouden (project-scan wissel zonder lint-state te herladen). Spiegel H/V blijft altijd staan tot de gebruiker ze wijzigt of applyLintState ze uit een opgeslagen scan zet. autoOrientNumFrames: frame-aantal voor 1-frame vs multi-frame auto-draai (setStrip-moment vóór applySavedLintState).
 */
export function setStrip(path, image, options = {}) {
  const preserveLintGrid = options.preserveLintGrid === true;
  state.path = path;
  state.image = image;
  state.framePaintOverlays.clear();
  state.naturalWidth = image ? (image.naturalWidth || image.width) : 0;
  state.naturalHeight = image ? (image.naturalHeight || image.height) : 0;
  if (!preserveLintGrid) {
    state.fineRotationDeg = 0;
    state.activeFrameIndex = 0;
    state.pixelEditorActiveFrameIndex = 0;
  } else {
    state.activeFrameIndex = 0;
    state.pixelEditorActiveFrameIndex = 0;
    /* Bij scanwissel met behouden raster: fijne rotatie en oriëntatie niet wissen. */
  }
  // Alleen zonder preserve: auto-oriëntatie op nieuwe pixels (anders overschrijft dit rotatie/label per scan).
  if (!preserveLintGrid) {
    applyAutoOrientationFromNaturalSize(options.autoOrientNumFrames);
  }
}

export function setRotation90(deg) {
  state.framePaintOverlays.clear();
  state.rotation90 = ((state.rotation90 + deg) % 360 + 360) % 360;
  const baseVert = state.orientLabel === 'Verticaal' || state.orientLabel === 'Verticaal (1 frame)';
  const baseHorizAuto =
    state.orientLabel === 'Horizontaal (auto: draai 90°)' || state.orientLabel === 'Horizontaal (1 frame)';
  if (baseVert) state.orientLabel = 'Horizontaal (gedraaid)';
  else if (baseHorizAuto) state.orientLabel = 'Verticaal (gedraaid)';
  else state.orientLabel = state.rotation90 === 90 ? 'Horizontaal (gedraaid)' : 'Verticaal (gedraaid)';
}

export function setFineRotation(deg) {
  const v = Number(deg);
  if (!Number.isFinite(v)) return;
  const rounded = Math.round(v * 1000) / 1000;
  state.fineRotationDeg = Math.max(FINE_ROTATION_MIN, Math.min(FINE_ROTATION_MAX, rounded));
}

export function setNumFrames(n) {
  state.framePaintOverlays.clear();
  state.numFrames = clampNumFrames(n);
  state.activeFrameIndex = clampActiveIndex(state.activeFrameIndex);
  state.pixelEditorActiveFrameIndex = clampActiveIndex(state.pixelEditorActiveFrameIndex);
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
  const n = Math.max(1, state.numFrames || 1);
  return Math.max(0, Math.min(n, Math.round(Number(state.gridVerticalPivotCustomK) || 0)));
}

/** Na laden snapshot/preset: canvas-split gelijk trekken met map voor huidig k. */
export function syncPivotCustomSplitCanvasFromMap() {
  const n = Math.max(1, state.numFrames || 1);
  const k = resolveSplitPanPivotKFromState();
  /* Alleen k met split-pan (zelfde als usesSplitLowerVerticalPan). */
  if (k < 2 || k >= n) return;
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
  const v = clampActiveIndex(i);
  state.activeFrameIndex = v;
  state.pixelEditorActiveFrameIndex = v;
}

/** Alleen voor de pixel-editor; wijzigt niet welk frame in RASTER SETUP / scanlint actief is. */
export function setPixelEditorActiveFrameIndex(i) {
  state.pixelEditorActiveFrameIndex = clampActiveIndex(i);
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

export function setPixelEditorOutputFolder(p) {
  state.pixelEditorOutputFolder = p != null && String(p).trim() !== '' ? String(p) : null;
  state.isDirty = true;
}

export function setPixelEditorSourceFolder(p) {
  state.pixelEditorSourceFolder = p != null && String(p).trim() !== '' ? String(p) : null;
  state.isDirty = true;
}

export function setPixelEditorExternalScan(path, image) {
  state.pixelEditorExternalPath =
    path != null && String(path).trim() !== '' ? String(path) : null;
  state.pixelEditorExternalImage = image && image.naturalWidth ? image : null;
}

export function clearPixelEditorExternalScan() {
  state.pixelEditorExternalPath = null;
  state.pixelEditorExternalImage = null;
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

export function setPreserveGridOnScanNav(value) {
  state.preserveGridOnScanNav = value !== false;
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

/** Verwijderde referentiemodi / oude onderkant-modus → zelfde als Lijn # met k = n. */
const LEGACY_VERTICAL_ANCHOR_TO_BOTTOM = new Set([
  'pivotTop',
  'pivotActive',
  'pivotMiddleUpper',
  'pivotMiddleLower',
  'pivotMiddle'
]);

/** True als opgeslagen modus “onderkant raster” was (migreren naar k = n, split wissen). */
export function snapshotVerticalAnchorWasBottomFixed(mode) {
  if (mode == null) return false;
  const m = String(mode).trim();
  return m === 'bottomFixed' || LEGACY_VERTICAL_ANCHOR_TO_BOTTOM.has(m);
}

/**
 * Alleen nog pivotCustom in state. bottomFixed (of legacy-onderkant) zet k = n en wist split.
 */
export function setGridVerticalAnchorMode(mode) {
  let m = typeof mode === 'string' ? mode.trim() : 'pivotCustom';
  if (LEGACY_VERTICAL_ANCHOR_TO_BOTTOM.has(m)) m = 'bottomFixed';
  const n = Math.max(1, state.numFrames || 1);

  if (m === 'bottomFixed') {
    state.gridVerticalAnchorMode = 'pivotCustom';
    state.gridVerticalPivotCustomK = n;
    state.gridSplitLowerPanCanvas = 0;
    state.gridFrozenLowerCellHeightPx = null;
    state.gridSplitLowerPanByPivotK = null;
    return;
  }

  state.gridVerticalAnchorMode = 'pivotCustom';
}

export function setGridSplitLowerPanCanvas(delta) {
  const v = Math.round(Number(delta) || 0);
  state.gridSplitLowerPanCanvas = v;
  const n = Math.max(1, state.numFrames || 1);
  const k = resolveSplitPanPivotKFromState();
  if (k > 1 && k < n) {
    ensurePivotSplitMap();
    state.gridSplitLowerPanByPivotK[String(k)] = v;
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

  if (!skipSplitHandoff) {
    const kOld = Math.max(0, Math.min(n, Math.round(Number(state.gridVerticalPivotCustomK) || 0)));
    if (kOld > 1 && kOld < n) {
      ensurePivotSplitMap();
      state.gridSplitLowerPanByPivotK[String(kOld)] = Math.round(Number(state.gridSplitLowerPanCanvas) || 0);
    }
    state.gridVerticalPivotCustomK = clampedNew;
    const kNew = state.gridVerticalPivotCustomK;
    if (kNew > 1 && kNew < n) {
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
  state.gridVerticalAnchorMode = 'pivotCustom';
  {
    const n = Math.max(1, state.numFrames || 1);
    state.gridVerticalPivotCustomK = n;
  }
  state.gridSplitLowerPanCanvas = 0;
  state.gridFrozenLowerCellHeightPx = null;
  state.gridSplitLowerPanByPivotK = null;
  state.gridPanelLinkVerticalAnchor = true;
}

export function setFlipHorizontal(value) {
  state.framePaintOverlays.clear();
  state.flipHorizontal = !!value;
}

export function setFlipVertical(value) {
  state.framePaintOverlays.clear();
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

function stripFramePaintFromLintEntry(e) {
  if (!e || typeof e !== 'object') return e;
  const { framePaintOverlays: _fp, ...rest } = e;
  return rest;
}

export function setProject(projectPath, meta) {
  clearPixelEditorExternalScan();
  const rawLint = meta && Array.isArray(meta.lintStates) ? meta.lintStates : [];
  const lintSanitized = rawLint.map(stripFramePaintFromLintEntry);
  state.projectPath = projectPath;
  state.projectMeta = meta
    ? {
        ...meta,
        lintStates: lintSanitized,
        scanInfos: Array.isArray(meta.scanInfos) ? [...meta.scanInfos] : [],
        stripPresetId:
          meta.stripPresetId != null && typeof meta.stripPresetId === 'string' && meta.stripPresetId.trim() !== ''
            ? meta.stripPresetId.trim()
            : null
      }
    : null;
  state.isDirty = false;
  state.lintStates = lintSanitized.length ? [...lintSanitized] : [];
  if (meta?.framesPerLint != null) state.numFrames = clampNumFrames(meta.framesPerLint);
  if (meta?.filmFormat != null) state.filmFormat = meta.filmFormat;
  if (meta?.filmPolarity != null) state.filmPolarity = meta.filmPolarity;
  if (meta?.outputFolder != null) state.exportFolderPath = meta.outputFolder;
  if (meta?.outputFormat != null) state.outputFormat = meta.outputFormat;
  if (meta?.scanDpi != null) state.scanDpi = meta.scanDpi;
  state.pixelEditorOutputFolder =
    meta?.pixelEditorOutputFolder != null && String(meta.pixelEditorOutputFolder).trim() !== ''
      ? String(meta.pixelEditorOutputFolder)
      : null;
  state.pixelEditorSourceFolder =
    meta?.pixelEditorSourceFolder != null && String(meta.pixelEditorSourceFolder).trim() !== ''
      ? String(meta.pixelEditorSourceFolder)
      : null;
}

export function clearProject() {
  state.projectPath = null;
  state.projectMeta = null;
  state.isDirty = false;
  state.lintStates = [];
  state.pixelEditorOutputFolder = null;
  state.pixelEditorSourceFolder = null;
  state.pixelEditorExternalPath = null;
  state.pixelEditorExternalImage = null;
  state.framePaintOverlays.clear();
  state.path = null;
  state.image = null;
  state.naturalWidth = 0;
  state.naturalHeight = 0;
  state.orientLabel = '';
}

/**
 * Project sluiten zonder map te wissen: project + geladen lint wissen, strip/werkruimte naar koude defaults.
 * DPI, outputformaat en frames per lint worden daarna in de UI meestal opnieuw uit Instellingen gezet.
 */
export function resetWorkspaceAfterCloseProject() {
  clearProject();
  state.rotation90 = 0;
  state.fineRotationDeg = 0;
  state.numFrames = DEFAULT_FRAMES_PER_STRIP;
  state.filmFormat = '16mm-double';
  state.filmPolarity = 'positief';
  state.tiltPivot = 'center';
  state.activeFrameIndex = 0;
  state.pixelEditorActiveFrameIndex = 0;
  state.zoomFrames = ZOOM_MIN;
  state.flipHorizontal = false;
  state.flipVertical = false;
  state.timecodeFps = 24;
  state.framePreviewVisibleFrames = 1;
  state.exportBaseName = 'frame';
  state.exportPauseSeconds = 0;
  state.videoOutputPath = null;
  state.videoFramesFolderPath = null;
  state.exportFolderPath = null;
  state.pixelEditorOutputFolder = null;
  state.pixelEditorSourceFolder = null;
  state.pixelEditorExternalPath = null;
  state.pixelEditorExternalImage = null;
  resetGridToDefault();
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
      s.gridSplitLowerPanByPivotK && typeof s.gridSplitLowerPanByPivotK === 'object'
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

  const gridAnchorMode =
    grid.gridVerticalAnchorMode != null ? String(grid.gridVerticalAnchorMode).trim() : null;
  if (gridAnchorMode != null) {
    setGridVerticalAnchorMode(grid.gridVerticalAnchorMode);
  }
  if (!snapshotVerticalAnchorWasBottomFixed(gridAnchorMode) && grid.gridVerticalPivotCustomK != null) {
    setGridVerticalPivotCustomK(grid.gridVerticalPivotCustomK, { skipSplitHandoff: true });
  }
  if (
    !snapshotVerticalAnchorWasBottomFixed(gridAnchorMode) &&
    grid.gridSplitLowerPanByPivotK != null &&
    typeof grid.gridSplitLowerPanByPivotK === 'object'
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
  syncPivotCustomSplitCanvasFromMap();
}

export function applyLintState(snapshot) {
  if (!snapshot) return;
  if (snapshot.rotation90 != null) state.rotation90 = snapshot.rotation90;
  if (snapshot.fineRotationDeg != null) setFineRotation(snapshot.fineRotationDeg);
  if (snapshot.numFrames != null) state.numFrames = clampNumFrames(snapshot.numFrames);
  if (snapshot.activeFrameIndex != null) {
    state.activeFrameIndex = clampActiveIndex(snapshot.activeFrameIndex);
    state.pixelEditorActiveFrameIndex = state.activeFrameIndex;
  }
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
  const snapAnchorMode =
    snapshot.gridVerticalAnchorMode != null ? String(snapshot.gridVerticalAnchorMode).trim() : null;
  if (snapAnchorMode != null) {
    setGridVerticalAnchorMode(snapAnchorMode);
  }
  if (!snapshotVerticalAnchorWasBottomFixed(snapAnchorMode) && snapshot.gridVerticalPivotCustomK != null) {
    const pk = Math.round(Number(snapshot.gridVerticalPivotCustomK) || 0);
    const n = Math.max(1, state.numFrames || 1);
    state.gridVerticalPivotCustomK = Math.max(0, Math.min(n, pk));
  }
  if (
    !snapshotVerticalAnchorWasBottomFixed(snapAnchorMode) &&
    snapshot.gridSplitLowerPanByPivotK != null &&
    typeof snapshot.gridSplitLowerPanByPivotK === 'object'
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
  syncPivotCustomSplitCanvasFromMap();
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
  const entry = stripFramePaintFromLintEntry({ ...snapshot, path: lintPath });
  const prev = idx >= 0 ? state.lintStates[idx] : null;
  if (prev && lintStateEntriesSemanticEqual(prev, entry)) {
    return;
  }
  if (idx >= 0) state.lintStates[idx] = entry;
  else state.lintStates.push(entry);
  state.isDirty = true;
}
