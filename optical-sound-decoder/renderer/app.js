import {
  applyFadeToRegion,
  applyMuteRegions,
  buildRotatedCanvas,
  decodeStrip,
  decodeTimeAlongAxis,
  encodeFloat32WavMono,
  encodePcm16WavMono,
  limitRegionPeak,
  normalizePeak,
  resampleCubicHermite,
  suppressImpulseClicks,
  MAX_ROTATED_CANVAS_SIDE,
  FINE_ROTATION_MAX_DEG
} from './decode.js';

const $ = (id) => document.getElementById(id);

/** Hoogte golfvorm onder de strip (px); tijdas horizontaal = zelfde als verticaal op strip */
const WAVEFORM_H = 132;

function getWaveformHeight() {
  const sel = els.selZoom?.value || 'p100';
  const m = /^p(\d+)$/.exec(sel);
  if (!m) return WAVEFORM_H;
  const pct = Math.max(25, Math.min(1000, parseInt(m[1], 10)));
  return Math.max(96, Math.min(720, Math.round(WAVEFORM_H * (pct / 100))));
}

const els = {
  fileList: $('file-list'),
  rngFileListWindow: $('rng-file-list-window'),
  lblFileListWindow: $('lbl-file-list-window'),
  viewCanvas: $('view-canvas'),
  waveformCanvas: $('waveform-canvas'),
  canvasWrap: $('canvas-wrap'),
  status: $('status-text'),
  statusExport: $('status-export-text'),
  busyOverlay: $('busy-overlay'),
  busyMessage: $('busy-message'),
  busyProgressBar: $('busy-progress-bar'),
  btnBusyCancel: $('btn-busy-cancel'),
  metaHint: $('meta-hint'),
  frames: $('inp-frames'),
  fps: $('inp-fps'),
  rotation: $('inp-rotation'),
  btnMirrorH: $('btn-mirror-h'),
  btnMirrorV: $('btn-mirror-v'),
  rngFineRot: $('rng-fine-rot'),
  lblFineRot: $('lbl-fine-rot'),
  btnFineRotMinus: $('btn-fine-rot-minus'),
  btnFineRotPlus: $('btn-fine-rot-plus'),
  decodeMode: $('inp-decode-mode'),
  invert: $('inp-invert'),
  hp: $('inp-hp'),
  appFontSize: $('inp-app-font-size'),
  btnAppFontDown: $('btn-app-font-down'),
  btnAppFontUp: $('btn-app-font-up'),
  exportSr: $('inp-export-sr'),
  exportFormat: $('inp-export-format'),
  opticalEq: $('inp-optical-eq'),
  declick: $('inp-declick'),
  joinMuteMs: $('inp-join-mute-ms'),
  joinFadeMs: $('inp-join-fade-ms'),
  joinDePop: $('inp-join-depop'),
  btnJoinPresetSoft: $('btn-join-preset-soft'),
  btnJoinPresetMedium: $('btn-join-preset-medium'),
  btnJoinPresetStrong: $('btn-join-preset-strong'),
  lblJoinPresetState: $('lbl-join-preset-state'),
  inpJoinPresetName: $('inp-join-preset-name'),
  selJoinPreset: $('sel-join-preset'),
  btnJoinPresetSave: $('btn-join-preset-save'),
  btnJoinPresetLoad: $('btn-join-preset-load'),
  btnJoinPresetDelete: $('btn-join-preset-delete'),
  smooth: $('inp-smooth'),
  normalize: $('inp-normalize'),
  rngOutputGain: $('rng-output-gain'),
  lblOutputGain: $('lbl-output-gain'),
  rngPreviewGain: $('rng-preview-gain'),
  lblPreviewGain: $('lbl-preview-gain'),
  inpPreviewLoop: $('inp-preview-loop'),
  selBatchScope: $('sel-batch-scope'),
  selBatchRotation: $('sel-batch-rotation'),
  rngYStart: $('rng-y-start'),
  rngYEnd: $('rng-y-end'),
  rngXLeft: $('rng-x-left'),
  rngXRight: $('rng-x-right'),
  lblYStart: $('lbl-y-start'),
  lblYEnd: $('lbl-y-end'),
  lblXLeft: $('lbl-x-left'),
  lblXRight: $('lbl-x-right'),
  inpGoto: $('inp-goto'),
  lblOutputFolder: $('lbl-output-folder'),
  btnOpenOutputFolder: $('btn-open-output-folder'),
  inpExportName: $('inp-export-name'),
  inpLastExportPath: $('inp-last-export-path'),
  btnPickAudacity: $('btn-pick-audacity'),
  btnOpenInAudacity: $('btn-open-in-audacity'),
  lblAudacityPath: $('lbl-audacity-path'),
  inpOpenAudacityAfterExport: $('inp-open-audacity-after-export'),
  audacityWarning: $('audacity-warning'),
  btnShortcuts: $('btn-shortcuts'),
  shortcutsModal: $('shortcuts-modal'),
  btnShortcutsClose: $('btn-shortcuts-close'),
  btnShortcutsReset: $('btn-shortcuts-reset'),
  shortcutsList: $('shortcuts-list'),
  shortcutsConflict: $('shortcuts-conflict'),
  selTemplate: $('sel-template'),
  inpTemplateName: $('inp-template-name'),
  selZoom: $('sel-zoom'),
  infoScanCount: $('info-scan-count'),
  infoFrames: $('info-frames'),
  infoPerScanTime: $('info-per-scan-time'),
  infoTotalTime: $('info-total-time'),
  infoCurrent: $('info-current'),
  inpMuteMarkMode: $('inp-mute-mark-mode'),
  inpEditMarkMode: $('inp-edit-mark-mode'),
  inpMuteFadeMs: $('inp-mute-fade-ms'),
  btnMuteFadeDown: $('btn-mute-fade-down'),
  btnMuteFadeUp: $('btn-mute-fade-up'),
  btnMuteClearAll: $('btn-mute-clear-all'),
  muteRegionList: $('mute-region-list'),
  editRegionList: $('edit-region-list'),
  btnEditUndo: $('btn-edit-undo'),
  btnEditRedo: $('btn-edit-redo'),
  btnEditResetLint: $('btn-edit-reset-lint'),
  btnEditResetAll: $('btn-edit-reset-all'),
  btnEditFadeIn: $('btn-edit-fade-in'),
  btnEditFadeOut: $('btn-edit-fade-out'),
  btnEditFadeBoth: $('btn-edit-fade-both'),
  btnEditFadeToggle: $('btn-edit-fade-toggle'),
  inpEditLimiterPeak: $('inp-edit-limiter-peak'),
  btnEditLimiterApply: $('btn-edit-limiter-apply'),
  btnEditClearZone: $('btn-edit-clear-zone'),
  btnExportOne: $('btn-export-one'),
  btnExportSelection: $('btn-export-selection'),
  btnExportSelectionFolder: $('btn-export-selection-folder'),
  btnExportAll: $('btn-export-all'),
  btnExportMergeFolder: $('btn-export-merge-folder'),
  btnExportStop: $('btn-export-stop'),
  btnLoadAudio: $('btn-load-audio'),
  btnUnloadAudio: $('btn-unload-audio'),
  btnJoinPrev: $('btn-join-prev'),
  btnJoinNext: $('btn-join-next'),
  inpAudioFile: $('inp-audio-file')
};

/** @type {string[]} */
let paths = [];

let busyDepth = 0;

/** @type {Map<string, { rotation?: number, region?: object, decodeMode?: string, mirrorH?: boolean, mirrorV?: boolean, fineRotationDeg?: number, muteRegions?: { t0: number, t1: number }[], editRegion?: { t0: number, t1: number }|undefined, editFadeMode?: 'in'|'out'|'both'|'off', editFadeMs?: number, limiterPeak?: number }>} */
const scanStateByPath = new Map();

let outputFolderPath = null;
let audacityPath = null;
let currentExportAbortController = null;
let shortcutCaptureActionId = null;

const DEFAULT_SHORTCUTS = {
  decodePreview: 'Ctrl+D',
  previewQueue: 'Ctrl+Q',
  stopPreview: 'Ctrl+.',
  prevScan: 'Alt+ArrowLeft',
  nextScan: 'Alt+ArrowRight',
  exportOne: 'Ctrl+1',
  exportSelection: 'Ctrl+2',
  exportSelectionFolder: 'Ctrl+3',
  exportAll: 'Ctrl+4',
  exportAllFolder: 'Ctrl+5',
  stopExport: 'Ctrl+Shift+.'
};

const SHORTCUT_ACTIONS = [
  ['decodePreview', 'Decoderen en beluisteren'],
  ['previewQueue', 'Speel wachtrij'],
  ['stopPreview', 'Stop afspelen'],
  ['prevScan', 'Vorige scan'],
  ['nextScan', 'Volgende scan'],
  ['exportOne', 'Export huidige strip'],
  ['exportSelection', 'Export selectie samenvoegen'],
  ['exportSelectionFolder', 'Export selectie naar uitvoermap'],
  ['exportAll', 'Export alle strips samenvoegen'],
  ['exportAllFolder', 'Export alle strips naar uitvoermap'],
  ['stopExport', 'Stop export']
];

let shortcutBindings = { ...DEFAULT_SHORTCUTS };

const MIN_REGION_FRAC = 0.002;

const MUTE_FADE_MS_MIN = 1;
const MUTE_FADE_MS_MAX = 500;
const MUTE_FADE_MS_DEFAULT = 15;
const MIN_MUTE_REGION_FRAC = 0.0005;

/** @type {{ f0: number, f1: number }|null} */
let muteWaveDrag = null;
/** @type {{ f0: number, f1: number }|null} */
let editWaveDrag = null;
const EDIT_LIMITER_MIN = 0.05;
const EDIT_LIMITER_MAX = 1;
const UNDO_LIMIT = 120;
/** @type {{ region: object, scanState: any }[]} */
let currentLintUndoStack = [];
/** @type {{ region: object, scanState: any }[]} */
let currentLintRedoStack = [];

function clampMuteFadeMs(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return MUTE_FADE_MS_DEFAULT;
  return Math.max(MUTE_FADE_MS_MIN, Math.min(MUTE_FADE_MS_MAX, Math.round(n)));
}

function readMuteFadeMs() {
  return clampMuteFadeMs(els.inpMuteFadeMs?.value ?? MUTE_FADE_MS_DEFAULT);
}

function clampLimiterPeak(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.8;
  return Math.max(EDIT_LIMITER_MIN, Math.min(EDIT_LIMITER_MAX, n));
}

function readLimiterPeak() {
  return clampLimiterPeak(els.inpEditLimiterPeak?.value ?? 0.8);
}

function readJoinMuteMs() {
  const n = Number(els.joinMuteMs?.value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function readJoinFadeMs() {
  const n = Number(els.joinFadeMs?.value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function readJoinDePopStrength() {
  return ['off', 'light', 'medium', 'strong', 'extreme'].includes(els.joinDePop?.value) ? els.joinDePop.value : 'off';
}

function setJoinPresetButtonsActive() {
  const mute = readJoinMuteMs();
  const fade = readJoinFadeMs();
  const depop = readJoinDePopStrength();
  let matchedLabel = 'Aangepast';
  const presets = [
    [els.btnJoinPresetSoft, mute === 3 && fade === 2 && depop === 'light', 'Zacht'],
    [els.btnJoinPresetMedium, mute === 5 && fade === 3 && depop === 'medium', 'Normaal'],
    [els.btnJoinPresetStrong, mute === 8 && fade === 5 && depop === 'strong', 'Sterk']
  ];
  for (const [btn, on, label] of presets) {
    if (!btn) continue;
    btn.classList.toggle('small-btn--on', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) matchedLabel = label;
  }
  if (els.lblJoinPresetState) els.lblJoinPresetState.textContent = matchedLabel;
}

function applyJoinTransitionPreset(kind) {
  const preset =
    kind === 'soft'
      ? { muteMs: 3, fadeMs: 2, dePop: 'light', label: 'Zacht' }
      : kind === 'strong'
        ? { muteMs: 8, fadeMs: 5, dePop: 'strong', label: 'Sterk' }
        : { muteMs: 5, fadeMs: 3, dePop: 'medium', label: 'Normaal' };
  if (els.joinMuteMs) els.joinMuteMs.value = String(preset.muteMs);
  if (els.joinFadeMs) els.joinFadeMs.value = String(preset.fadeMs);
  if (els.joinDePop) els.joinDePop.value = preset.dePop;
  setJoinPresetButtonsActive();
  scheduleSaveSession();
  els.status.textContent = `Overgangspreset ${preset.label}: ${preset.muteMs} ms stilte, ${preset.fadeMs} ms fade, de-pop ${preset.dePop}.`;
}

function readJoinPresetPayload() {
  return {
    joinMuteMs: readJoinMuteMs(),
    joinFadeMs: readJoinFadeMs(),
    joinDePopStrength: readJoinDePopStrength()
  };
}

function clampAppFontSize(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 14;
  return Math.max(11, Math.min(20, Math.round(n)));
}

function applyAppFontSize(sizePx) {
  const px = clampAppFontSize(sizePx);
  if (els.appFontSize) els.appFontSize.value = String(px);
  document.body.style.fontSize = `${px}px`;
}

function updateAudacityUi() {
  if (els.lblAudacityPath) els.lblAudacityPath.textContent = audacityPath || '—';
  if (els.btnOpenInAudacity) {
    const lastPath = typeof els.inpLastExportPath?.value === 'string' ? els.inpLastExportPath.value : '';
    els.btnOpenInAudacity.disabled = !audacityPath || !lastPath || lastPath === '—';
  }
  if (els.audacityWarning) {
    const showWarning = !!els.inpOpenAudacityAfterExport?.checked && !audacityPath;
    els.audacityWarning.hidden = !showWarning;
  }
}

function adjustAppFontSize(delta) {
  const cur = clampAppFontSize(els.appFontSize?.value ?? 14);
  applyAppFontSize(cur + delta);
  scheduleSaveSession();
}

function isMuteMarkMode() {
  return !!els.inpMuteMarkMode?.checked;
}

function isEditMarkMode() {
  return !!els.inpEditMarkMode?.checked;
}

function syncMuteWaveformPointerStyle() {
  const wc = els.waveformCanvas;
  if (!wc) return;
  if (isEditMarkMode()) {
    wc.classList.add('waveform-canvas--mute-mode');
    wc.title = 'Sleep op de golfvorm om een bewerkingszone te markeren';
  } else if (isMuteMarkMode()) {
    wc.classList.add('waveform-canvas--mute-mode');
    wc.title = 'Sleep op de golfvorm om een stiltezone te markeren';
  } else {
    wc.classList.remove('waveform-canvas--mute-mode');
    wc.title = '';
  }
}

/** @param {{ t0: number, t1: number }} r */
function clampMuteRegionPair(t0, t1) {
  let a = Number(t0);
  let b = Number(t1);
  if (!Number.isFinite(a)) a = 0;
  if (!Number.isFinite(b)) b = 0;
  if (a > b) [a, b] = [b, a];
  a = Math.max(0, Math.min(1, a));
  b = Math.max(0, Math.min(1, b));
  if (b - a < MIN_MUTE_REGION_FRAC) return null;
  return { t0: a, t1: b };
}

function normalizeMuteRegions(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const c = clampMuteRegionPair(raw?.t0, raw?.t1);
    if (c) out.push(c);
  }
  return out;
}

function getMuteRegionsForPath(p) {
  const st = scanStateByPath.get(p);
  return normalizeMuteRegions(st?.muteRegions || []);
}

function cloneCurrentLintSnapshot() {
  const p = currentEditablePath();
  if (!p) return null;
  const st = ensureScanState(p);
  return {
    region: { ...bandFrac },
    scanState: JSON.parse(JSON.stringify(st))
  };
}

function pushUndoSnapshotForCurrentLint() {
  const snap = cloneCurrentLintSnapshot();
  if (!snap) return;
  currentLintUndoStack.push(snap);
  if (currentLintUndoStack.length > UNDO_LIMIT) currentLintUndoStack.shift();
  currentLintRedoStack = [];
}

function applyUndoSnapshot(snap) {
  const p = currentEditablePath();
  if (!snap || !p) return;
  bandFrac = clampRegionFrac(snap.region || defaultRegion());
  scanStateByPath.set(p, { ...(snap.scanState || {}) });
  if (loadedAudioState) {
    scheduleSaveSession();
    refreshPreviewAfterMuteEdit();
    return;
  }
  if (currentImage) {
    const st = ensureScanState(p);
    if (st.rotation == null) st.rotation = suggestRotationDeg(currentImage);
    loadRegionForPath(p);
    syncPerLintPanelsFromPath(p);
    rebuildWorkCanvas();
  }
  syncSlidersFromBand();
  syncPerLintPanelsFromPath(p);
  syncMirrorButtonsFromPath(p);
  syncFineRotUIFromState();
  scheduleSaveSession();
  refreshPreviewAfterMuteEdit();
}

function undoCurrentLintEdit() {
  const snap = currentLintUndoStack.pop();
  if (!snap) {
    els.status.textContent = 'Geen undo-stap meer voor dit lint.';
    return;
  }
  const cur = cloneCurrentLintSnapshot();
  if (cur) currentLintRedoStack.push(cur);
  applyUndoSnapshot(snap);
  els.status.textContent = `Undo toegepast op ${currentEditableLabel()}.`;
}

function redoCurrentLintEdit() {
  const snap = currentLintRedoStack.pop();
  if (!snap) {
    els.status.textContent = 'Geen redo-stap meer voor dit lint.';
    return;
  }
  const cur = cloneCurrentLintSnapshot();
  if (cur) currentLintUndoStack.push(cur);
  applyUndoSnapshot(snap);
  els.status.textContent = `Redo toegepast op ${currentEditableLabel()}.`;
}

function clearUndoForCurrentLint() {
  currentLintUndoStack = [];
  currentLintRedoStack = [];
}

function pickOrientationState(st) {
  return {
    rotation: typeof st?.rotation === 'number' ? st.rotation : undefined,
    mirrorH: !!st?.mirrorH,
    mirrorV: !!st?.mirrorV,
    fineRotationDeg:
      typeof st?.fineRotationDeg === 'number' && Number.isFinite(st.fineRotationDeg)
        ? clampFineRotationDeg(st.fineRotationDeg)
        : undefined
  };
}

function resetCurrentLintState() {
  const p = currentEditablePath();
  if (!p) return;
  pushUndoSnapshotForCurrentLint();
  const keep = pickOrientationState(scanStateByPath.get(p));
  scanStateByPath.set(p, { ...keep });
  if (loadedAudioState) {
    clearUndoForCurrentLint();
    scheduleSaveSession();
    refreshPreviewAfterMuteEdit();
    els.status.textContent = `Bewerkingen gewist: ${currentEditableLabel()}.`;
    return;
  }
  const st = ensureScanState(p);
  if (st.rotation == null && currentImage) st.rotation = suggestRotationDeg(currentImage);
  loadRegionForPath(p);
  clearUndoForCurrentLint();
  syncPerLintPanelsFromPath(p);
  syncMirrorButtonsFromPath(p);
  syncFineRotUIFromState();
  cachedPreview = null;
  stopPreviewPlayback();
  rebuildWorkCanvas();
  renderFileList({ scrollToCurrent: false });
  scheduleSaveSession();
  refreshPreviewAfterMuteEdit();
  els.status.textContent = `Lint reset (rotatie/spiegel/fijn behouden): ${basename(p)}.`;
}

function resetAllLintEdits() {
  if (paths.length < 1) return;
  const keepByPath = new Map();
  for (const p of paths) {
    keepByPath.set(p, pickOrientationState(scanStateByPath.get(p)));
  }
  scanStateByPath.clear();
  for (const p of paths) {
    const keep = keepByPath.get(p) || {};
    if (
      keep.rotation != null ||
      keep.mirrorH != null ||
      keep.mirrorV != null ||
      keep.fineRotationDeg != null
    ) {
      scanStateByPath.set(p, { ...keep });
    }
  }
  clearUndoForCurrentLint();
  cachedPreview = null;
  stopPreviewPlayback();
  if (currentIndex >= 0 && paths[currentIndex]) {
    const p = paths[currentIndex];
    const st = ensureScanState(p);
    if (st.rotation == null && currentImage) st.rotation = suggestRotationDeg(currentImage);
    loadRegionForPath(p);
    syncPerLintPanelsFromPath(p);
    syncMirrorButtonsFromPath(p);
    syncFineRotUIFromState();
    rebuildWorkCanvas();
  }
  renderFileList({ scrollToCurrent: false });
  scheduleSaveSession();
  refreshPreviewAfterMuteEdit();
  els.status.textContent = 'Alle lintbewerkingen gewist (rotatie/spiegel/fijn behouden).';
}

function getEditRegionForPath(p) {
  const st = scanStateByPath.get(p);
  return clampMuteRegionPair(st?.editRegion?.t0, st?.editRegion?.t1);
}

function getEditFadeModeForPath(p) {
  const st = scanStateByPath.get(p);
  const mode = st?.editFadeMode;
  return mode === 'in' || mode === 'out' || mode === 'both' || mode === 'off' ? mode : 'off';
}

function getEditFadeMsForPath(p) {
  const st = scanStateByPath.get(p);
  return clampMuteFadeMs(st?.editFadeMs ?? readMuteFadeMs());
}

function getLimiterPeakForPath(p) {
  const st = scanStateByPath.get(p);
  return clampLimiterPeak(st?.limiterPeak ?? readLimiterPeak());
}

function applyStoredMuteToSamples(samples, sampleRate, path) {
  if (!path || !samples?.length) return samples;
  const regions = getMuteRegionsForPath(path);
  let out = regions.length > 0 ? applyMuteRegions(samples, sampleRate, regions, readMuteFadeMs()) : Float32Array.from(samples);
  const editRegion = getEditRegionForPath(path);
  if (editRegion) {
    const fadeMode = getEditFadeModeForPath(path);
    if (fadeMode !== 'off') {
      out = applyFadeToRegion(out, sampleRate, editRegion, getEditFadeMsForPath(path), {
        fadeIn: fadeMode === 'in' || fadeMode === 'both',
        fadeOut: fadeMode === 'out' || fadeMode === 'both'
      });
    }
    out = limitRegionPeak(out, editRegion, getLimiterPeakForPath(path));
  }
  return out;
}

function defaultRegion() {
  return { x0: 0.7, x1: 0.995, y0: 0, y1: 1 };
}

function ensureScanState(p) {
  if (!scanStateByPath.has(p)) {
    scanStateByPath.set(p, {});
  }
  return scanStateByPath.get(p);
}

function getRotation(path) {
  const st = scanStateByPath.get(path);
  return st?.rotation;
}

function setRotation(path, deg) {
  const st = ensureScanState(path);
  st.rotation = deg;
}

function clampFineRotationDeg(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-FINE_ROTATION_MAX_DEG, Math.min(FINE_ROTATION_MAX_DEG, n));
}

const OUTPUT_GAIN_MIN = 0.25;
const OUTPUT_GAIN_MAX = 10;

/** Max. aantal gelijktijdig geselecteerde linten (Shift-bereik / Ctrl) */
const MAX_SCAN_SELECTION = 32;

function clampOutputGain(x) {
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(OUTPUT_GAIN_MIN, Math.min(OUTPUT_GAIN_MAX, n));
}

function updateOutputGainLabel() {
  if (!els.lblOutputGain || !els.rngOutputGain) return;
  const g = clampOutputGain(Number(els.rngOutputGain.value) / 100);
  els.lblOutputGain.textContent = `${g.toFixed(2).replace('.', ',')}×`;
}

const PREVIEW_MONITOR_GAIN_MIN = 0.25;
const PREVIEW_MONITOR_GAIN_MAX = 8;

function getPreviewMonitorGain() {
  const v = Number(els.rngPreviewGain?.value) / 100;
  if (!Number.isFinite(v)) return 2;
  return Math.max(PREVIEW_MONITOR_GAIN_MIN, Math.min(PREVIEW_MONITOR_GAIN_MAX, v));
}

function updatePreviewGainLabel() {
  if (!els.lblPreviewGain || !els.rngPreviewGain) return;
  const g = getPreviewMonitorGain();
  els.lblPreviewGain.textContent = `${g.toFixed(2).replace('.', ',')}×`;
}

function buildLoadedAudioPlaceholderCanvas(fileName) {
  const c = document.createElement('canvas');
  c.width = 1600;
  c.height = 220;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#141922');
  grad.addColorStop(1, '#0d0f12');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(72, 188, 255, 0.32)';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, c.width - 32, c.height - 32);
  ctx.fillStyle = '#d8e8ff';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('Geladen audio', 40, 78);
  ctx.fillStyle = '#9fb2c8';
  ctx.font = '20px sans-serif';
  ctx.fillText(fileName || 'audio', 40, 118);
  ctx.fillText('Golfvorm onderaan kan nu bewerkt en beluisterd worden.', 40, 156);
  return c;
}

function getLoadedAudioEditedPreviewData() {
  if (!loadedAudioState?.originalSamples?.length || !loadedAudioState.sampleRate) return null;
  const key = loadedAudioState.sourceKey;
  const samples = applyStoredMuteToSamples(loadedAudioState.originalSamples, loadedAudioState.sampleRate, key);
  return {
    samples,
    durationSec: samples.length / loadedAudioState.sampleRate,
    exportSampleRate: loadedAudioState.sampleRate,
    joinMarkers: Array.isArray(loadedAudioState.joinMarkers) ? loadedAudioState.joinMarkers.slice() : []
  };
}

function buildJoinMarkersFromMeta(meta) {
  const stripCount = Number(meta?.stripCount);
  const sr = Number(meta?.exportSampleRateHz || meta?.sourceSampleRateHz);
  const perStripSec = Number(meta?.framesPerStripAssumed) / Number(meta?.filmFps);
  if (!Number.isFinite(stripCount) || stripCount < 2 || !Number.isFinite(sr) || sr <= 0 || !Number.isFinite(perStripSec) || perStripSec <= 0) {
    return [];
  }
  const joinMuteMs = Math.max(0, Number(meta?.joinMuteMs) || 0);
  const joinMuteSec = joinMuteMs / 1000;
  const totalSec = Number(meta?.durationSeconds);
  const out = [];
  let cursor = 0;
  for (let i = 0; i < stripCount - 1; i++) {
    cursor += perStripSec;
    const frac = totalSec > 0 ? cursor / totalSec : 0;
    out.push(Math.max(0, Math.min(1, frac)));
    cursor += joinMuteSec;
  }
  return out;
}

async function readJoinMarkersForLoadedAudio(filePath) {
  if (!filePath) return [];
  const metaPath = String(filePath).replace(/\.(wav|mp3)$/i, '') + '-sync.json';
  const raw = await window.osdApi.readTextFile(metaPath);
  if (!raw) return [];
  try {
    return buildJoinMarkersFromMeta(JSON.parse(raw));
  } catch {
    return [];
  }
}

function syncJoinMarkerButtons() {
  const markers = cachedPreview?.joinMarkers || loadedAudioState?.joinMarkers || [];
  const enabled = markers.length > 0;
  if (els.btnJoinPrev) els.btnJoinPrev.disabled = !enabled;
  if (els.btnJoinNext) els.btnJoinNext.disabled = !enabled;
}

function focusJoinMarker(index) {
  const markers = cachedPreview?.joinMarkers || loadedAudioState?.joinMarkers || [];
  if (!markers.length || index < 0 || index >= markers.length) return;
  selectedJoinMarkerIndex = index;
  previewPlayheadFrac = markers[index];
  const wrap = els.canvasWrap;
  const layout = getWaveformDrawLayout();
  if (wrap && layout) {
    const x = layout.waveX0 + markers[index] * layout.waveW;
    wrap.scrollLeft = Math.max(0, x - wrap.clientWidth * 0.5);
  }
  drawView();
}

function stepJoinMarker(delta) {
  const markers = cachedPreview?.joinMarkers || loadedAudioState?.joinMarkers || [];
  if (!markers.length) {
    els.status.textContent = 'Geen join-markers beschikbaar.';
    return;
  }
  let next = selectedJoinMarkerIndex;
  if (next < 0) next = delta > 0 ? 0 : markers.length - 1;
  else next = Math.max(0, Math.min(markers.length - 1, next + delta));
  focusJoinMarker(next);
  els.status.textContent = `Join ${next + 1}/${markers.length}`;
}

function showLoadedAudioSource() {
  if (!loadedAudioState) return;
  lastScanIndexBeforeLoadedAudio = currentIndex;
  stopPreviewPlayback();
  selectedJoinMarkerIndex = loadedAudioState.joinMarkers?.length ? 0 : -1;
  currentImage = null;
  currentIndex = -1;
  fileListShiftAnchor = -1;
  bandFrac = { x0: 0, x1: 1, y0: 0, y1: 1 };
  clearUndoForCurrentLint();
  rebuildWorkCanvas();
  const preview = getLoadedAudioEditedPreviewData();
  cachedPreview = preview
    ? {
        samples: Float32Array.from(preview.samples),
        durationSec: preview.durationSec,
        exportSampleRate: preview.exportSampleRate,
        band: { x0: 0, x1: workCanvas.width, y0: 0, y1: workCanvas.height },
        workW: workCanvas.width,
        workH: workCanvas.height,
        timeAlong: 'x',
        joinMarkers: preview.joinMarkers || []
      }
    : null;
  syncSlidersFromBand();
  renderFileList({ scrollToCurrent: false });
  updateGotoMax();
  updateInfoPanel();
  renderMuteRegionList();
  renderEditRegionList();
  syncMuteWaveformPointerStyle();
  syncJoinMarkerButtons();
  drawView();
}

function unloadLoadedAudio(opts = {}) {
  if (!loadedAudioState) return;
  loadedAudioState = null;
  selectedJoinMarkerIndex = -1;
  cachedPreview = null;
  stopPreviewPlayback();
  if (els.inpAudioFile) els.inpAudioFile.value = '';
  renderMuteRegionList();
  renderEditRegionList();
  const restoreIndex = lastScanIndexBeforeLoadedAudio >= 0 && paths[lastScanIndexBeforeLoadedAudio]
    ? lastScanIndexBeforeLoadedAudio
    : (paths[0] ? 0 : -1);
  lastScanIndexBeforeLoadedAudio = -1;
  if (restoreIndex >= 0) {
    loadPathAt(restoreIndex, { skipNeighborCopy: true }).catch(console.error);
  } else {
    workCanvas = null;
    drawView();
  }
  if (!opts.quiet) els.status.textContent = 'Geladen audio gesloten.';
  syncJoinMarkerButtons();
}

async function loadAudioFromFile(file) {
  if (!file) return;
  if (!audioCtx) audioCtx = new AudioContext();
  const raw = await file.arrayBuffer();
  const decoded = await audioCtx.decodeAudioData(raw.slice(0));
  if (!decoded?.length || !decoded.sampleRate) throw new Error('Audio decoderen mislukt.');
  const mono = new Float32Array(decoded.length);
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const src = decoded.getChannelData(ch);
    for (let i = 0; i < decoded.length; i++) mono[i] += src[i] / decoded.numberOfChannels;
  }
  const sourceKey = `${LOADED_AUDIO_KEY}:${file.name}:${file.size}:${file.lastModified}`;
  const sourcePath = typeof file.path === 'string' ? file.path : file.name;
  const joinMarkers = await readJoinMarkersForLoadedAudio(sourcePath);
  loadedAudioState = {
    sourceKey,
    sourcePath,
    fileName: file.name,
    originalSamples: mono,
    sampleRate: decoded.sampleRate,
    durationSec: decoded.duration,
    joinMarkers
  };
  showLoadedAudioSource();
  els.status.textContent = `Audio geladen: ${file.name}`;
}

function waitForUiPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function showBusyOverlay(message, progress = null) {
  busyDepth++;
  if (els.busyOverlay) els.busyOverlay.classList.remove('busy-overlay--hidden');
  if (els.busyMessage) els.busyMessage.textContent = message || 'Bezig…';
  if (els.busyProgressBar) {
    const pct = Number(progress);
    els.busyProgressBar.style.width = Number.isFinite(pct) ? `${Math.max(0, Math.min(100, pct))}%` : '14%';
  }
}

function updateBusyOverlay(message, progress = null) {
  if (els.busyMessage && message) els.busyMessage.textContent = message;
  if (els.busyProgressBar) {
    const pct = Number(progress);
    els.busyProgressBar.style.width = Number.isFinite(pct) ? `${Math.max(0, Math.min(100, pct))}%` : '14%';
  }
}

function hideBusyOverlay() {
  busyDepth = Math.max(0, busyDepth - 1);
  if (busyDepth > 0) return;
  if (els.busyOverlay) els.busyOverlay.classList.add('busy-overlay--hidden');
  if (els.busyProgressBar) els.busyProgressBar.style.width = '0%';
}

async function runWithBusyOverlay(message, work, opts = {}) {
  showBusyOverlay(message, opts.progress ?? null);
  await waitForUiPaint();
  try {
    return await work({
      setMessage: (next, progress = null) => updateBusyOverlay(next, progress),
      setProgress: (progress) => updateBusyOverlay(null, progress)
    });
  } finally {
    hideBusyOverlay();
  }
}

function isPreviewLoopEnabled() {
  return !!els.inpPreviewLoop?.checked;
}

/** Indices voor bulk-acties: selectie, anders alleen huidige lint */
function getBatchPathIndices() {
  const scope = els.selBatchScope?.value || 'selection';
  if (scope === 'all') return paths.map((_, i) => i);
  if (fileListSelection.size > 0) return [...fileListSelection].sort((a, b) => a - b);
  if (currentIndex >= 0) return [currentIndex];
  return [];
}

/** Beperkt Shift-bereik tot MAX_SCAN_SELECTION opeenvolgende indices */
function indicesForShiftRange(anchor, endIdx) {
  const a = Math.min(anchor, endIdx);
  const b = Math.max(anchor, endIdx);
  const out = [];
  for (let j = a; j <= b; j++) {
    if (out.length >= MAX_SCAN_SELECTION) break;
    out.push(j);
  }
  if (b - a + 1 > MAX_SCAN_SELECTION) {
    els.status.textContent = `Selectie beperkt tot ${MAX_SCAN_SELECTION} linten (Shift-bereik ingekort).`;
  }
  return out;
}

function getWorkCanvasOptsForPath(path) {
  const st = scanStateByPath.get(path);
  return {
    mirrorH: !!st?.mirrorH,
    mirrorV: !!st?.mirrorV,
    fineRotationDeg: clampFineRotationDeg(st?.fineRotationDeg)
  };
}

function updateFineRotLabel() {
  const el = els.rngFineRot;
  if (!els.lblFineRot || !el) return;
  const v = clampFineRotationDeg(Number(el.value));
  els.lblFineRot.textContent = `${v.toFixed(2).replace('.', ',')}°`;
}

/** Indices waarvoor rotatie/spiegel/fijn/modus geldt: selectie, anders alleen de geladen lint */
function getPerLintEditTargets() {
  if (fileListSelection.size > 0) return [...fileListSelection].sort((a, b) => a - b);
  if (currentIndex >= 0) return [currentIndex];
  return [];
}

function targetsIncludeCurrentLoaded(targets) {
  return currentIndex >= 0 && targets.includes(currentIndex);
}

function syncFineRotUIFromState() {
  const el = els.rngFineRot;
  if (!el) return;
  const path = getPerLintUiPath();
  if (!path) {
    el.value = '0';
    updateFineRotLabel();
    return;
  }
  const st = ensureScanState(path);
  st.fineRotationDeg = clampFineRotationDeg(st.fineRotationDeg);
  el.value = String(st.fineRotationDeg);
  updateFineRotLabel();
}

function applyFineRotFromUI() {
  if (!els.rngFineRot) return;
  const targets = getPerLintEditTargets();
  if (targets.length === 0) return;
  if (targetsIncludeCurrentLoaded(targets)) pushUndoSnapshotForCurrentLint();
  const v = clampFineRotationDeg(Number(els.rngFineRot.value));
  for (const i of targets) {
    ensureScanState(paths[i]).fineRotationDeg = v;
  }
  els.rngFineRot.value = String(v);
  updateFineRotLabel();
  renderFileList({ scrollToCurrent: false });
  scheduleSaveSession();
  if (targetsIncludeCurrentLoaded(targets)) {
    cachedPreview = null;
    stopPreviewPlayback();
    rebuildWorkCanvas();
  }
}

function nudgeFineRot(deltaDeg) {
  if (!els.rngFineRot) return;
  const cur = clampFineRotationDeg(Number(els.rngFineRot.value));
  const next = clampFineRotationDeg(cur + deltaDeg);
  els.rngFineRot.value = String(next);
  applyFineRotFromUI();
}

/** Pad waarvan de instellingenpanelen de waarden tonen (laatste lijstanker of geladen lint) */
function getPerLintUiPath() {
  if (fileListShiftAnchor >= 0 && paths[fileListShiftAnchor]) return paths[fileListShiftAnchor];
  if (currentIndex >= 0 && paths[currentIndex]) return paths[currentIndex];
  return null;
}

function syncMirrorButtonsFromPath(path) {
  const mh = els.btnMirrorH;
  const mv = els.btnMirrorV;
  if (!mh && !mv) return;
  if (!path) {
    if (mh) {
      mh.classList.remove('mirror-btn--on');
      mh.setAttribute('aria-pressed', 'false');
    }
    if (mv) {
      mv.classList.remove('mirror-btn--on');
      mv.setAttribute('aria-pressed', 'false');
    }
    return;
  }
  const st = ensureScanState(path);
  if (mh) {
    mh.classList.toggle('mirror-btn--on', !!st.mirrorH);
    mh.setAttribute('aria-pressed', st.mirrorH ? 'true' : 'false');
  }
  if (mv) {
    mv.classList.toggle('mirror-btn--on', !!st.mirrorV);
    mv.setAttribute('aria-pressed', st.mirrorV ? 'true' : 'false');
  }
}

function syncMirrorButtonsFromState() {
  syncMirrorButtonsFromPath(getPerLintUiPath());
}

/** Zonder beeld te laden: panelen tonen staat van dit pad; band-sliders blijven van de geladen lint */
function syncPerLintPanelsFromPath(path) {
  if (!path) return;
  const st = ensureScanState(path);
  const rotVal = getRotation(path);
  els.rotation.value = String(rotVal != null ? rotVal : 0);
  els.decodeMode.value = st.decodeMode === 'area' ? 'area' : 'density';
  const el = els.rngFineRot;
  if (el) {
    st.fineRotationDeg = clampFineRotationDeg(st.fineRotationDeg);
    el.value = String(st.fineRotationDeg);
    updateFineRotLabel();
  }
  syncMirrorButtonsFromPath(path);
}

function getRegionForPath(path) {
  const st = scanStateByPath.get(path);
  if (st?.region) return clampRegionFrac(st.region);
  return defaultRegion();
}

let sliderSyncing = false;
let currentIndex = -1;
/** Tijdens uitgestelde sessiestart: welke rij visueel “actief” is tot loadPathAt klaar is */
let pendingSessionRowHighlight = -1;
/** @type {HTMLImageElement|null} */
let currentImage = null;
/** @type {HTMLCanvasElement|null} */
let workCanvas = null;

let bandFrac = defaultRegion();
/** @type { null | { kind: 'rect'; x0: number; y0: number; x1: number; y1: number } | { kind: 'trimY'; edge: 'y0' | 'y1' } | { kind: 'trimX'; edge: 'x0' | 'x1' } } */
let drag = null;

/** Geselecteerde indices in de bestandslijst (Ctrl/Cmd+klik, Shift+bereik) */
const fileListSelection = new Set();
let fileListShiftAnchor = -1;

let previewAudioSource = null;
let previewStartAudioTime = 0;
let previewDurationSec = 0;
let previewRaf = null;
/** @type {number|null} */
let previewPlayheadFrac = null;
/** @type {{ samples: Float32Array, durationSec: number, exportSampleRate: number, band: { x0: number, x1: number, y0: number, y1: number }, workW: number, workH: number, timeAlong: 'x' | 'y', joinMarkers?: number[] } | null} */
let cachedPreview = null;
const LOADED_AUDIO_KEY = '__loaded_audio__';
/** @type {{ sourceKey: string, sourcePath: string, fileName: string, originalSamples: Float32Array, sampleRate: number, durationSec: number, joinMarkers?: number[] } | null} */
let loadedAudioState = null;
let lastScanIndexBeforeLoadedAudio = -1;
let selectedJoinMarkerIndex = -1;

function hasLoadedAudio() {
  return !!loadedAudioState;
}

function currentEditablePath() {
  if (loadedAudioState?.sourceKey) return loadedAudioState.sourceKey;
  return currentIndex >= 0 && paths[currentIndex] ? paths[currentIndex] : null;
}

function currentEditableLabel() {
  if (loadedAudioState?.fileName) return loadedAudioState.fileName;
  return currentIndex >= 0 && paths[currentIndex] ? basename(paths[currentIndex]) : 'bron';
}

function getWrapInnerSize() {
  const wrap = els.canvasWrap;
  if (!wrap) return { iw: 800, ih: 400 };
  const pad = 8;
  return {
    iw: Math.max(80, wrap.clientWidth - pad),
    ih: Math.max(80, wrap.clientHeight - pad)
  };
}

function computeViewDisplaySize(workW, workH) {
  if (workW < 1 || workH < 1) return { dw: 1, dh: 1 };
  const { iw, ih } = getWrapInnerSize();
  const sel = els.selZoom?.value || 'p100';
  if (sel === 'fit-width') {
    const dw = iw;
    const dh = Math.max(1, (workH * iw) / workW);
    return { dw: Math.round(dw), dh: Math.round(dh) };
  }
  if (sel === 'fit-height') {
    const dh = ih;
    const dw = Math.max(1, (workW * ih) / workH);
    return { dw: Math.round(dw), dh: Math.round(dh) };
  }
  const m = /^p(\d+)$/.exec(sel);
  const pct = m ? Math.max(25, Math.min(1000, parseInt(m[1], 10))) : 100;
  const baseScale = Math.min(1, iw / workW);
  const scale = baseScale * (pct / 100);
  return {
    dw: Math.max(1, Math.round(workW * scale)),
    dh: Math.max(1, Math.round(workH * scale))
  };
}

function scrollStripBegin() {
  const w = els.canvasWrap;
  if (!w) return;
  w.scrollLeft = 0;
  w.scrollTop = 0;
}

function scrollStripMiddle() {
  const w = els.canvasWrap;
  if (!w) return;
  w.scrollLeft = Math.max(0, (w.scrollWidth - w.clientWidth) / 2);
  w.scrollTop = Math.max(0, (w.scrollHeight - w.clientHeight) / 2);
}

function scrollStripEnd() {
  const w = els.canvasWrap;
  if (!w) return;
  w.scrollLeft = Math.max(0, w.scrollWidth - w.clientWidth);
  w.scrollTop = Math.max(0, w.scrollHeight - w.clientHeight);
}

function formatTimeSecMs(seconds) {
  const s = seconds;
  const whole = Math.floor(s);
  const ms = Math.round((s - whole) * 1000);
  const secStr = s.toFixed(3).replace('.', ',');
  return `${secStr} s · ${ms} ms`;
}

function formatTotalMinSec(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds - m * 60;
  const sInt = Math.floor(s);
  const ms = Math.round((s - sInt) * 1000);
  return `${m} min ${sInt} s${ms > 0 ? ` ${ms} ms` : ''}`;
}

function updateInfoPanel() {
  const scanEl = els.infoScanCount;
  if (!scanEl) return;
  const n = paths.length;
  els.infoScanCount.textContent = n ? String(n) : '—';
  if (!els.infoFrames || !els.infoPerScanTime || !els.infoTotalTime || !els.infoCurrent) return;
  if (loadedAudioState) {
    els.infoFrames.textContent = 'audio';
    els.infoPerScanTime.textContent = formatTimeSecMs(loadedAudioState.durationSec);
    els.infoTotalTime.textContent = formatTotalMinSec(loadedAudioState.durationSec);
    els.infoCurrent.textContent = `Audio · ${loadedAudioState.fileName} · ${loadedAudioState.sampleRate} Hz`;
    return;
  }
  if (n === 0) {
    els.infoFrames.textContent = '—';
    els.infoPerScanTime.textContent = '—';
    els.infoTotalTime.textContent = '—';
    els.infoCurrent.textContent = '—';
    return;
  }
  const frames = Math.max(1, Math.min(40, Number(els.frames.value) || 31));
  const fps = Number(els.fps.value) || 24;
  els.infoFrames.textContent = String(frames);
  const secPer = frames / fps;
  els.infoPerScanTime.textContent = formatTimeSecMs(secPer);
  const totalSec = n * secPer;
  els.infoTotalTime.textContent = formatTotalMinSec(totalSec);
  if (currentIndex >= 0 && paths[currentIndex] && currentImage && workCanvas) {
    const p = paths[currentIndex];
    const nw = currentImage.naturalWidth;
    const nh = currentImage.naturalHeight;
    const dm = els.decodeMode?.value === 'area' ? 'oppervlakte' : 'dichtheid';
    els.infoCurrent.textContent = `${currentIndex + 1}/${n} · ${basename(p)} · bron ${nw}×${nh} px · werk ${workCanvas.width}×${workCanvas.height} px · ${dm}`;
  } else if (pendingSessionRowHighlight >= 0 && paths[pendingSessionRowHighlight]) {
    const ph = paths[pendingSessionRowHighlight];
    els.infoCurrent.textContent = `${pendingSessionRowHighlight + 1}/${n} · ${basename(ph)} — bezig met laden…`;
  } else if (currentIndex >= 0 && paths[currentIndex]) {
    els.infoCurrent.textContent = `${currentIndex + 1}/${n} · ${basename(paths[currentIndex])}`;
  } else {
    els.infoCurrent.textContent = '—';
  }
}

function goPrevScan() {
  if (currentIndex <= 0) return;
  loadPathAt(currentIndex - 1).catch(console.error);
}

function goNextScan() {
  if (currentIndex < 0 || currentIndex >= paths.length - 1) return;
  loadPathAt(currentIndex + 1).catch(console.error);
}

function normalizeShortcutString(value) {
  if (!value || typeof value !== 'string') return '';
  return value.split('+').map((part) => part.trim()).filter(Boolean).join('+');
}

function getShortcutDisplayLabel(id) {
  const entry = SHORTCUT_ACTIONS.find(([actionId]) => actionId === id);
  return entry ? entry[1] : id;
}

function formatShortcutEvent(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let key = e.key;
  if (!key) return '';
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return parts.join('+');
  parts.push(key);
  return normalizeShortcutString(parts.join('+'));
}

function currentShortcutConflicts() {
  const grouped = new Map();
  for (const [actionId] of SHORTCUT_ACTIONS) {
    const sc = normalizeShortcutString(shortcutBindings[actionId]);
    if (!sc) continue;
    if (!grouped.has(sc)) grouped.set(sc, []);
    grouped.get(sc).push(actionId);
  }
  return [...grouped.entries()].filter(([, ids]) => ids.length > 1);
}

function updateShortcutConflictWarning() {
  if (!els.shortcutsConflict) return;
  const conflicts = currentShortcutConflicts();
  if (conflicts.length === 0) {
    els.shortcutsConflict.textContent = '';
    return;
  }
  const [shortcut, ids] = conflicts[0];
  els.shortcutsConflict.textContent =
    `Let op: ${shortcut} is dubbel toegekend aan ${ids.map(getShortcutDisplayLabel).join(' en ')}.`;
}

function renderShortcutEditor() {
  if (!els.shortcutsList) return;
  els.shortcutsList.innerHTML = '';
  for (const [actionId, label] of SHORTCUT_ACTIONS) {
    const lbl = document.createElement('label');
    lbl.className = 'shortcut-row-label';
    lbl.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.readOnly = true;
    inp.dataset.actionId = actionId;
    inp.className = 'shortcut-input';
    const isCapturing = shortcutCaptureActionId === actionId;
    inp.value = isCapturing ? 'Druk nu een toetscombinatie…' : (shortcutBindings[actionId] || '');
    inp.placeholder = isCapturing ? '' : 'Geen';
    const beginCapture = () => {
      shortcutCaptureActionId = actionId;
      renderShortcutEditor();
      const activeInput = els.shortcutsList?.querySelector(`[data-action-id="${actionId}"]`);
      activeInput?.focus();
      activeInput?.select();
    };
    inp.addEventListener('click', beginCapture);
    inp.addEventListener('focus', () => {
      if (shortcutCaptureActionId !== actionId) beginCapture();
    });
    inp.addEventListener('keydown', (e) => {
      e.preventDefault();
      if (e.key === 'Escape') {
        shortcutCaptureActionId = null;
        renderShortcutEditor();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        shortcutBindings[actionId] = '';
        shortcutCaptureActionId = null;
        renderShortcutEditor();
        scheduleSaveSession();
        return;
      }
      const sc = formatShortcutEvent(e);
      if (!sc) return;
      shortcutBindings[actionId] = sc;
      shortcutCaptureActionId = null;
      renderShortcutEditor();
      scheduleSaveSession();
    });
    if (isCapturing) inp.classList.add('shortcut-input--capture');
    els.shortcutsList.append(lbl, inp);
  }
  updateShortcutConflictWarning();
}

function openShortcutsModal() {
  if (!els.shortcutsModal) return;
  renderShortcutEditor();
  els.shortcutsModal.classList.remove('modal-overlay--hidden');
  els.shortcutsModal.setAttribute('aria-hidden', 'false');
}

function closeShortcutsModal() {
  if (!els.shortcutsModal) return;
  shortcutCaptureActionId = null;
  els.shortcutsModal.classList.add('modal-overlay--hidden');
  els.shortcutsModal.setAttribute('aria-hidden', 'true');
}

function isTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const t = el.tagName.toLowerCase();
  if (t === 'input' || t === 'textarea' || t === 'select') return true;
  return el.isContentEditable;
}

let saveSessionTimer = null;
function scheduleSaveSession() {
  if (saveSessionTimer) clearTimeout(saveSessionTimer);
  saveSessionTimer = setTimeout(() => {
    saveSessionTimer = null;
    persistSessionToDisk();
  }, 450);
}

function readGlobalForSave() {
  return {
    frames: Math.max(1, Math.min(40, Number(els.frames.value) || 31)),
    filmFps: Number(els.fps.value) || 24,
    appFontSize: clampAppFontSize(els.appFontSize?.value ?? 14),
    decodeMode: els.decodeMode.value === 'area' ? 'area' : 'density',
    invert: !!els.invert.checked,
    highpassHz: Math.max(0, Number(els.hp.value) || 0),
    exportSampleRate: Number(els.exportSr.value) || 48000,
    opticalEqPreset: typeof els.opticalEq?.value === 'string' ? els.opticalEq.value : 'off',
    deClickStrength: typeof els.declick?.value === 'string' ? els.declick.value : 'off',
    joinMuteMs: readJoinMuteMs(),
    joinFadeMs: readJoinFadeMs(),
    joinDePopStrength: readJoinDePopStrength(),
    applySmooth: !!els.smooth.checked,
    normalize: !!els.normalize.checked,
    outputGain: clampOutputGain(Number(els.rngOutputGain?.value) / 100),
    previewMonitorGain: getPreviewMonitorGain(),
    previewLoop: !!els.inpPreviewLoop?.checked,
    exportFormat: els.exportFormat.value === 'mp3' ? 'mp3' : 'wav',
    exportBaseName: typeof els.inpExportName?.value === 'string' ? els.inpExportName.value.trim() : '',
    audacityPath: typeof audacityPath === 'string' ? audacityPath : '',
    openAudacityAfterExport: !!els.inpOpenAudacityAfterExport?.checked,
    shortcuts: { ...shortcutBindings },
    viewZoom: els.selZoom?.value || 'p100',
    muteFadeMs: readMuteFadeMs()
  };
}

function applyGlobalSettings(g) {
  if (!g || typeof g !== 'object') return;
  if (g.frames != null) els.frames.value = String(Math.max(1, Math.min(40, Number(g.frames) || 31)));
  if (g.filmFps != null) els.fps.value = String(g.filmFps);
  applyAppFontSize(g.appFontSize ?? 14);
  if (g.decodeMode === 'area' || g.decodeMode === 'density') els.decodeMode.value = g.decodeMode;
  if (typeof g.invert === 'boolean') els.invert.checked = g.invert;
  if (g.highpassHz != null) els.hp.value = String(g.highpassHz);
  if (g.exportSampleRate != null) els.exportSr.value = String(g.exportSampleRate);
  if (['off', 'mild', 'academy', 'noise-cut', 'voice'].includes(g.opticalEqPreset) && els.opticalEq) {
    els.opticalEq.value = g.opticalEqPreset;
  }
  if (['off', 'light', 'medium', 'strong'].includes(g.deClickStrength) && els.declick) {
    els.declick.value = g.deClickStrength;
  }
  if (g.joinMuteMs != null && els.joinMuteMs) {
    els.joinMuteMs.value = String(Math.max(0, Math.min(100, Math.round(Number(g.joinMuteMs) || 0))));
  }
  if (g.joinFadeMs != null && els.joinFadeMs) {
    els.joinFadeMs.value = String(Math.max(0, Math.min(100, Math.round(Number(g.joinFadeMs) || 0))));
  }
  if (['off', 'light', 'medium', 'strong', 'extreme'].includes(g.joinDePopStrength) && els.joinDePop) {
    els.joinDePop.value = g.joinDePopStrength;
  }
  audacityPath = typeof g.audacityPath === 'string' && g.audacityPath ? g.audacityPath : null;
  if (typeof g.openAudacityAfterExport === 'boolean' && els.inpOpenAudacityAfterExport) {
    els.inpOpenAudacityAfterExport.checked = g.openAudacityAfterExport;
  }
  updateAudacityUi();
  setJoinPresetButtonsActive();
  if (typeof g.applySmooth === 'boolean') els.smooth.checked = g.applySmooth;
  if (typeof g.normalize === 'boolean') els.normalize.checked = g.normalize;
  if (g.outputGain != null && els.rngOutputGain) {
    const v = Math.round(clampOutputGain(Number(g.outputGain)) * 100);
    const min = Number(els.rngOutputGain.min) || 25;
    const max = Number(els.rngOutputGain.max) || 1000;
    els.rngOutputGain.value = String(Math.max(min, Math.min(max, v)));
    updateOutputGainLabel();
  }
  if (typeof g.previewLoop === 'boolean' && els.inpPreviewLoop) {
    els.inpPreviewLoop.checked = g.previewLoop;
  }
  if (g.previewMonitorGain != null && els.rngPreviewGain) {
    const v = Math.round(
      Math.max(
        PREVIEW_MONITOR_GAIN_MIN,
        Math.min(PREVIEW_MONITOR_GAIN_MAX, Number(g.previewMonitorGain))
      ) * 100
    );
    const min = Number(els.rngPreviewGain.min) || 25;
    const max = Number(els.rngPreviewGain.max) || 800;
    els.rngPreviewGain.value = String(Math.max(min, Math.min(max, v)));
    updatePreviewGainLabel();
  }
  if (g.exportFormat === 'mp3' || g.exportFormat === 'wav') els.exportFormat.value = g.exportFormat;
  if (typeof g.exportBaseName === 'string' && els.inpExportName) els.inpExportName.value = g.exportBaseName;
  if (g.shortcuts && typeof g.shortcuts === 'object') shortcutBindings = { ...DEFAULT_SHORTCUTS, ...g.shortcuts };
  else shortcutBindings = { ...DEFAULT_SHORTCUTS };
  if (g.viewZoom && els.selZoom) {
    const v = g.viewZoom;
    if ([...els.selZoom.options].some((o) => o.value === v)) els.selZoom.value = v;
  }
  if (g.muteFadeMs != null && els.inpMuteFadeMs) {
    els.inpMuteFadeMs.value = String(clampMuteFadeMs(g.muteFadeMs));
  }
}

function buildPerScanPayload() {
  const o = {};
  for (const p of paths) {
    const st = scanStateByPath.get(p);
    if (!st) continue;
    o[p] = {
      rotation: st.rotation != null ? st.rotation : 0,
      region: st.region ? clampRegionFrac(st.region) : defaultRegion(),
      decodeMode: st.decodeMode === 'area' ? 'area' : 'density',
      mirrorH: !!st.mirrorH,
      mirrorV: !!st.mirrorV,
      fineRotationDeg: clampFineRotationDeg(st.fineRotationDeg),
      muteRegions: normalizeMuteRegions(st.muteRegions || []),
      editRegion: getEditRegionForPath(p) || undefined,
      editFadeMode: getEditFadeModeForPath(p),
      editFadeMs: getEditFadeMsForPath(p),
      limiterPeak: getLimiterPeakForPath(p)
    };
  }
  return o;
}

async function persistSessionToDisk() {
  const payload = {
    version: 9,
    paths: paths.slice(),
    currentIndex: Math.max(0, Math.min(paths.length - 1, currentIndex)),
    outputFolder: outputFolderPath,
    global: readGlobalForSave(),
    perScan: buildPerScanPayload()
  };
  try {
    await window.osdApi.saveSession(payload);
  } catch (e) {
    console.warn('sessie bewaren mislukt', e);
  }
}

async function restoreSession() {
  let s;
  try {
    s = await window.osdApi.loadSession();
  } catch {
    return;
  }
  if (!s || !Array.isArray(s.paths) || s.paths.length === 0) return;
  const existing = [];
  for (const p of s.paths) {
    if (await window.osdApi.fileExists(p)) existing.push(p);
  }
  if (existing.length === 0) return;
  paths = existing;
  fileListSelection.clear();
  fileListShiftAnchor = -1;
  scanStateByPath.clear();
  if (s.perScan && typeof s.perScan === 'object') {
    for (const p of paths) {
      const ent = s.perScan[p];
      if (!ent || typeof ent !== 'object') continue;
      scanStateByPath.set(p, {
        rotation: typeof ent.rotation === 'number' ? ent.rotation : undefined,
        region: ent.region ? clampRegionFrac(ent.region) : undefined,
        decodeMode: ent.decodeMode === 'area' ? 'area' : ent.decodeMode === 'density' ? 'density' : undefined,
        mirrorH: typeof ent.mirrorH === 'boolean' ? ent.mirrorH : undefined,
        mirrorV: typeof ent.mirrorV === 'boolean' ? ent.mirrorV : undefined,
        fineRotationDeg:
          typeof ent.fineRotationDeg === 'number' && Number.isFinite(ent.fineRotationDeg)
            ? ent.fineRotationDeg
            : undefined,
        muteRegions:
          Array.isArray(ent.muteRegions) && ent.muteRegions.length > 0
            ? normalizeMuteRegions(ent.muteRegions)
            : undefined,
        editRegion: clampMuteRegionPair(ent.editRegion?.t0, ent.editRegion?.t1) || undefined,
        editFadeMode:
          ent.editFadeMode === 'in' || ent.editFadeMode === 'out' || ent.editFadeMode === 'both' || ent.editFadeMode === 'off'
            ? ent.editFadeMode
            : undefined,
        editFadeMs:
          typeof ent.editFadeMs === 'number' && Number.isFinite(ent.editFadeMs) ? clampMuteFadeMs(ent.editFadeMs) : undefined,
        limiterPeak:
          typeof ent.limiterPeak === 'number' && Number.isFinite(ent.limiterPeak) ? clampLimiterPeak(ent.limiterPeak) : undefined
      });
    }
  }
  applyGlobalSettings(s.global || {});
  outputFolderPath = typeof s.outputFolder === 'string' && s.outputFolder ? s.outputFolder : null;
  updateOutputFolderLabel();
  await refreshTemplateSelect();
  await refreshJoinPresetSelect();
  const idx = Math.max(0, Math.min(existing.length - 1, Number(s.currentIndex) || 0));
  pendingSessionRowHighlight = idx;
  currentIndex = -1;
  currentImage = null;
  workCanvas = null;
  cachedPreview = null;
  stopPreviewPlayback();
  fileListShiftAnchor = idx;
  renderFileList({ scrollToCurrent: true });
  if (paths[idx]) syncPerLintPanelsFromPath(paths[idx]);
  updateGotoMax();
  updateInfoPanel();
  els.status.textContent = 'Bezig met laden…';
  scheduleAfterFirstPaint(() => {
    loadPathAt(idx, { skipNeighborCopy: true })
      .then(() => {
        const cur = els.status.textContent || '';
        if (!cur.includes('Sessie hersteld')) {
          els.status.textContent = `${cur} · Sessie hersteld`;
        }
      })
      .catch((e) => {
        els.status.textContent = e.message || String(e);
        pendingSessionRowHighlight = -1;
        renderFileList({ scrollToCurrent: false });
        updateInfoPanel();
      });
  });
}

function loadRegionForPath(p) {
  const st = ensureScanState(p);
  if (!st.region) st.region = { ...defaultRegion() };
  bandFrac = { ...st.region };
}

/** Instellingen van vorige lint → volgende (zelfde reeks): kader, rotatie, spiegel, fijn, modus */
function copyPerScanSettingsToNextStrip(fromPath, toPath) {
  const src = ensureScanState(fromPath);
  const dst = ensureScanState(toPath);
  if (src.region) {
    dst.region = { ...clampRegionFrac(src.region) };
  }
  if (src.rotation != null) dst.rotation = src.rotation;
  dst.mirrorH = !!src.mirrorH;
  dst.mirrorV = !!src.mirrorV;
  dst.fineRotationDeg = clampFineRotationDeg(src.fineRotationDeg);
  if (src.decodeMode === 'area' || src.decodeMode === 'density') {
    dst.decodeMode = src.decodeMode;
  }
}

function prepareSequentialScanState(pathIndices) {
  if (!Array.isArray(pathIndices) || pathIndices.length < 2) return;
  for (let step = 1; step < pathIndices.length; step++) {
    const prevIdx = pathIndices[step - 1];
    const curIdx = pathIndices[step];
    if (prevIdx < 0 || curIdx < 0 || prevIdx >= paths.length || curIdx >= paths.length) continue;
    const fromPath = paths[prevIdx];
    const toPath = paths[curIdx];
    if (!fromPath || !toPath) continue;
    copyPerScanSettingsToNextStrip(fromPath, toPath);
  }
}

function scheduleAfterFirstPaint(fn) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    });
  });
}

function persistRegionForCurrent() {
  if (currentIndex >= 0 && paths[currentIndex]) {
    ensureScanState(paths[currentIndex]).region = { ...bandFrac };
    scheduleSaveSession();
  }
}

function clampRegionFrac(r) {
  let { x0, x1, y0, y1 } = r;
  if (x0 > x1) [x0, x1] = [x1, x0];
  if (y0 > y1) [y0, y1] = [y1, y0];
  x0 = Math.max(0, Math.min(1, x0));
  x1 = Math.max(0, Math.min(1, x1));
  y0 = Math.max(0, Math.min(1, y0));
  y1 = Math.max(0, Math.min(1, y1));
  if (x1 - x0 < MIN_REGION_FRAC) {
    const m = (x0 + x1) / 2;
    x0 = Math.max(0, m - MIN_REGION_FRAC / 2);
    x1 = Math.min(1, x0 + MIN_REGION_FRAC);
    x0 = Math.max(0, x1 - MIN_REGION_FRAC);
  }
  if (y1 - y0 < MIN_REGION_FRAC) {
    const m = (y0 + y1) / 2;
    y0 = Math.max(0, m - MIN_REGION_FRAC / 2);
    y1 = Math.min(1, y0 + MIN_REGION_FRAC);
    y0 = Math.max(0, y1 - MIN_REGION_FRAC);
  }
  return { x0, x1, y0, y1 };
}

function formatPctNL(f) {
  return `${(f * 100).toFixed(1).replace('.', ',')}%`;
}

/** Tijas op werkcanvas: 0°/180° = y; 90°/270° = x — zelfde als decodeTimeAlongAxis */
function decodeTimeAlongFromUI() {
  if (loadedAudioState) return 'x';
  return decodeTimeAlongAxis(Number(els.rotation?.value) || 0);
}

function syncSlidersFromBand() {
  if (!els.rngYStart) return;
  sliderSyncing = true;
  const r = clampRegionFrac(bandFrac);
  bandFrac = r;
  const alongX = decodeTimeAlongFromUI() === 'x';
  if (alongX) {
    els.rngYStart.value = String(Math.round(r.x0 * 1000));
    els.rngYEnd.value = String(Math.round(r.x1 * 1000));
    els.rngXLeft.value = String(Math.round(r.y0 * 1000));
    els.rngXRight.value = String(Math.round(r.y1 * 1000));
    els.lblYStart.textContent = formatPctNL(r.x0);
    els.lblYEnd.textContent = formatPctNL(r.x1);
    els.lblXLeft.textContent = formatPctNL(r.y0);
    els.lblXRight.textContent = formatPctNL(r.y1);
  } else {
    els.rngYStart.value = String(Math.round(r.y0 * 1000));
    els.rngYEnd.value = String(Math.round(r.y1 * 1000));
    els.rngXLeft.value = String(Math.round(r.x0 * 1000));
    els.rngXRight.value = String(Math.round(r.x1 * 1000));
    els.lblYStart.textContent = formatPctNL(r.y0);
    els.lblYEnd.textContent = formatPctNL(r.y1);
    els.lblXLeft.textContent = formatPctNL(r.x0);
    els.lblXRight.textContent = formatPctNL(r.x1);
  }
  sliderSyncing = false;
}

function applySlidersToBand() {
  if (sliderSyncing || !els.rngYStart || !workCanvas) return;
  const f0 = Number(els.rngYStart.value) / 1000;
  const f1 = Number(els.rngYEnd.value) / 1000;
  const t0 = Number(els.rngXLeft.value) / 1000;
  const t1 = Number(els.rngXRight.value) / 1000;
  if (decodeTimeAlongFromUI() === 'x') {
    bandFrac = clampRegionFrac({ x0: f0, x1: f1, y0: t0, y1: t1 });
  } else {
    bandFrac = clampRegionFrac({ x0: t0, x1: t1, y0: f0, y1: f1 });
  }
  syncSlidersFromBand();
  persistRegionForCurrent();
  drawView();
}

function basename(p) {
  const s = p.replace(/\\/g, '/');
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}

function suggestRotationDeg(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  return w > h ? 90 : 0;
}

function workBandPixels() {
  if (!workCanvas) return { x0: 0, x1: 0, y0: 0, y1: 0 };
  const w = workCanvas.width;
  const h = workCanvas.height;
  return {
    x0: Math.round(bandFrac.x0 * w),
    x1: Math.round(bandFrac.x1 * w),
    y0: Math.round(bandFrac.y0 * h),
    y1: Math.round(bandFrac.y1 * h)
  };
}

function setBandFromWorkPixels(x0, y0, x1, y1) {
  if (!workCanvas) return;
  const w = workCanvas.width;
  const h = workCanvas.height;
  const xa0 = Math.max(0, Math.min(w - 1, Math.min(x0, x1)));
  const xa1 = Math.max(0, Math.min(w - 1, Math.max(x0, x1)));
  const ya0 = Math.max(0, Math.min(h - 1, Math.min(y0, y1)));
  const ya1 = Math.max(0, Math.min(h - 1, Math.max(y0, y1)));
  bandFrac = clampRegionFrac({
    x0: xa0 / w,
    x1: xa1 / w,
    y0: ya0 / h,
    y1: ya1 / h
  });
  syncSlidersFromBand();
}

/**
 * Groen kader op werkcanvas: pijlen passen breedte (rechterrand) en hoogte (onderrand) aan.
 * @param {'ArrowLeft'|'ArrowRight'|'ArrowUp'|'ArrowDown'} key
 * @param {boolean} shift — 10 px i.p.v. 1 px
 * @returns {boolean} true als er iets is gewijzigd
 */
function nudgeGreenBandByArrow(key, shift) {
  if (!workCanvas) return false;
  pushUndoSnapshotForCurrentLint();
  const step = shift ? 10 : 1;
  const w = workCanvas.width;
  const h = workCanvas.height;
  if (w < 2 || h < 2) return false;
  let x0 = bandFrac.x0 * w;
  let x1 = bandFrac.x1 * w;
  let y0 = bandFrac.y0 * h;
  let y1 = bandFrac.y1 * h;

  if (key === 'ArrowRight') x1 += step;
  else if (key === 'ArrowLeft') x1 -= step;
  else if (key === 'ArrowDown') y1 += step;
  else if (key === 'ArrowUp') y1 -= step;
  else return false;

  const xa0 = Math.max(0, Math.min(w - 1, Math.min(x0, x1)));
  const xa1 = Math.max(0, Math.min(w - 1, Math.max(x0, x1)));
  const ya0 = Math.max(0, Math.min(h - 1, Math.min(y0, y1)));
  const ya1 = Math.max(0, Math.min(h - 1, Math.max(y0, y1)));

  bandFrac = clampRegionFrac({
    x0: xa0 / w,
    x1: xa1 / w,
    y0: ya0 / h,
    y1: ya1 / h
  });
  syncSlidersFromBand();
  persistRegionForCurrent();
  drawView();
  return true;
}

/** Layout van de golfvorm t.o.v. view-canvas (zelfde als tekenlogica). */
function getWaveformDrawLayout() {
  const wc = els.waveformCanvas;
  const vc = els.viewCanvas;
  const cp = cachedPreview;
  if (!wc || !vc || vc.width < 1) return null;
  const w = vc.width;
  const dh = vc.height;
  const h = getWaveformHeight();
  const samples = cp?.samples;
  const n = samples?.length || 0;
  let waveX0 = 0;
  let waveW = w;
  if (n >= 2 && cp?.band && cp.workW > 0 && cp.workH > 0 && dh > 0) {
    const sx = w / cp.workW;
    const sy = dh / cp.workH;
    const b = cp.band;
    const px0 = b.x0 * sx;
    const pw = Math.max(1, (b.x1 - b.x0) * sx);
    const ph = Math.max(1, (b.y1 - b.y0) * sy);
    if (cp.timeAlong === 'x') {
      waveX0 = px0;
      waveW = pw;
    } else {
      waveW = ph;
      waveX0 = px0 + (pw - waveW) * 0.5;
      if (waveX0 < 0) waveX0 = 0;
      if (waveX0 + waveW > w) waveX0 = Math.max(0, w - waveW);
    }
  }
  return { w, h, dh, waveX0, waveW, n, samples, mid: h * 0.5, cp };
}

function fracFromWaveformClientX(clientX) {
  const layout = getWaveformDrawLayout();
  const wc = els.waveformCanvas;
  if (!layout || layout.n < 2 || !wc) return null;
  const rect = wc.getBoundingClientRect();
  const x = (clientX - rect.left) * (wc.width / rect.width);
  const f = (x - layout.waveX0) / layout.waveW;
  if (!Number.isFinite(f)) return null;
  return Math.max(0, Math.min(1, f));
}

function formatMuteRegionLabel(r, durationSec) {
  const p0 = (r.t0 * 100).toFixed(2).replace('.', ',');
  const p1 = (r.t1 * 100).toFixed(2).replace('.', ',');
  if (durationSec > 0) {
    const s0 = (r.t0 * durationSec).toFixed(3).replace('.', ',');
    const s1 = (r.t1 * durationSec).toFixed(3).replace('.', ',');
    return `${s0}–${s1} s (${p0}%–${p1}%)`;
  }
  return `${p0}% – ${p1}%`;
}

function setFadeModeButtons(mode) {
  const map = [
    [els.btnEditFadeIn, mode === 'in'],
    [els.btnEditFadeOut, mode === 'out'],
    [els.btnEditFadeBoth, mode === 'both'],
    [els.btnEditFadeToggle, mode !== 'off']
  ];
  for (const [btn, on] of map) {
    if (!btn) continue;
    btn.classList.toggle('small-btn--on', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  if (els.btnEditFadeToggle) {
    els.btnEditFadeToggle.textContent = mode === 'off' ? 'Fade uit' : 'Fade aan';
  }
}

function renderMuteRegionList() {
  const ul = els.muteRegionList;
  if (!ul) return;
  ul.replaceChildren();
  const p = currentEditablePath();
  if (!p) {
    const li = document.createElement('li');
    li.className = 'mute-region-list__empty';
    li.textContent = 'Geen lint geladen.';
    ul.appendChild(li);
    return;
  }
  const regions = getMuteRegionsForPath(p);
  const dur = cachedPreview?.durationSec ?? 0;
  if (regions.length === 0) {
    const li = document.createElement('li');
    li.className = 'mute-region-list__empty';
    li.textContent = 'Geen stiltezones. Vink modus aan en sleep op de golfvorm (na decoderen).';
    ul.appendChild(li);
    return;
  }
  regions.forEach((r, idx) => {
    const li = document.createElement('li');
    li.className = 'mute-region-list__item';
    const span = document.createElement('span');
    span.textContent = formatMuteRegionLabel(r, dur);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'small-btn mute-region-list__remove';
    btn.textContent = 'Verwijderen';
    btn.addEventListener('click', () => {
      const st = ensureScanState(p);
      const next = normalizeMuteRegions(st.muteRegions || []).filter((_, j) => j !== idx);
      st.muteRegions = next;
      refreshPreviewAfterMuteEdit();
    });
    li.appendChild(span);
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function renderEditRegionList() {
  const ul = els.editRegionList;
  if (!ul) return;
  ul.replaceChildren();
  const p = currentEditablePath();
  if (!p) {
    const li = document.createElement('li');
    li.className = 'mute-region-list__empty';
    li.textContent = 'Geen lint geladen.';
    ul.appendChild(li);
    setFadeModeButtons('off');
    return;
  }
  const region = getEditRegionForPath(p);
  if (els.inpEditLimiterPeak) els.inpEditLimiterPeak.value = String(getLimiterPeakForPath(p));
  setFadeModeButtons(getEditFadeModeForPath(p));
  if (!region) {
    const li = document.createElement('li');
    li.className = 'mute-region-list__empty';
    li.textContent = 'Geen bewerkingszone. Vink modus aan en sleep op de golfvorm.';
    ul.appendChild(li);
    return;
  }
  const li = document.createElement('li');
  li.className = 'mute-region-list__item';
  const span = document.createElement('span');
  span.textContent = `Zone: ${formatMuteRegionLabel(region, cachedPreview?.durationSec ?? 0)} · Fade ${getEditFadeModeForPath(p)} · ${getEditFadeMsForPath(p)} ms · Limiter ${getLimiterPeakForPath(p).toFixed(2).replace('.', ',')}`;
  li.appendChild(span);
  ul.appendChild(li);
}

function withCurrentLintEdit(mutator, statusText) {
  const p = currentEditablePath();
  if (!p) return;
  pushUndoSnapshotForCurrentLint();
  const st = ensureScanState(p);
  mutator(st);
  refreshPreviewAfterMuteEdit();
  if (statusText) els.status.textContent = statusText;
}

function setEditFadeMode(mode) {
  const p = currentEditablePath();
  if (!p || !getEditRegionForPath(p)) {
    els.status.textContent = 'Markeer eerst een bewerkingszone op de golfvorm.';
    return;
  }
  withCurrentLintEdit((st) => {
    st.editFadeMode = mode;
    st.editFadeMs = getEditFadeMsForPath(p);
  });
}

function toggleEditFadeEnabled() {
  const p = currentEditablePath();
  if (!p) return;
  const next = getEditFadeModeForPath(p) === 'off' ? 'both' : 'off';
  setEditFadeMode(next);
}

function adjustMuteFadeStep(deltaMs) {
  const next = clampMuteFadeMs(readMuteFadeMs() + deltaMs);
  if (els.inpMuteFadeMs) els.inpMuteFadeMs.value = String(next);
  if (currentIndex >= 0 && paths[currentIndex] && getEditRegionForPath(paths[currentIndex])) {
    withCurrentLintEdit((st) => {
      st.editFadeMs = next;
    });
    return;
  }
  scheduleSaveSession();
  refreshPreviewAfterMuteEdit();
}

function applyLimiterToEditZone() {
  const p = currentEditablePath();
  if (!p) return;
  if (!getEditRegionForPath(p)) {
    els.status.textContent = 'Markeer eerst een bewerkingszone op de golfvorm.';
    return;
  }
  const peak = readLimiterPeak();
  withCurrentLintEdit((st) => {
    st.limiterPeak = peak;
  }, `Limiter peak ingesteld op ${peak.toFixed(2).replace('.', ',')}.`);
}

function refreshPreviewAfterMuteEdit() {
  renderMuteRegionList();
  renderEditRegionList();
  scheduleSaveSession();
  if (loadedAudioState && cachedPreview) {
    const updated = getLoadedAudioEditedPreviewData();
    if (updated) {
      cachedPreview.samples = Float32Array.from(updated.samples);
      cachedPreview.durationSec = updated.durationSec;
      cachedPreview.exportSampleRate = updated.exportSampleRate;
      cachedPreview.band = { x0: 0, x1: workCanvas?.width || 1, y0: 0, y1: workCanvas?.height || 1 };
      cachedPreview.workW = workCanvas?.width || 1;
      cachedPreview.workH = workCanvas?.height || 1;
      cachedPreview.timeAlong = 'x';
      cachedPreview.joinMarkers = updated.joinMarkers || [];
    }
    syncMuteWaveformPointerStyle();
    syncJoinMarkerButtons();
    drawView();
    return;
  }
  if (!workCanvas || currentIndex < 0 || !cachedPreview) {
    syncMuteWaveformPointerStyle();
    drawView();
    return;
  }
  try {
    const { samples, durationSec, exportSampleRate } = runDecodeOnWorkCanvas();
    if (samples.length < 2) {
      drawView();
      return;
    }
    const band = workBandPixels();
    const rot = Number(els.rotation.value) || 0;
    cachedPreview.samples = Float32Array.from(samples);
    cachedPreview.durationSec = durationSec;
    cachedPreview.exportSampleRate = exportSampleRate;
    cachedPreview.band = { x0: band.x0, x1: band.x1, y0: band.y0, y1: band.y1 };
    cachedPreview.workW = workCanvas.width;
    cachedPreview.workH = workCanvas.height;
    cachedPreview.timeAlong = decodeTimeAlongAxis(rot);
  } catch (_) {
    /* */
  }
  syncMuteWaveformPointerStyle();
  drawView();
}

function onMuteWavePointerDown(e) {
  if (e.button !== 0) return;
  const f = fracFromWaveformClientX(e.clientX);
  if (f == null) return;
  if (isEditMarkMode()) {
    pushUndoSnapshotForCurrentLint();
    e.preventDefault();
    els.waveformCanvas.setPointerCapture(e.pointerId);
    editWaveDrag = { f0: f, f1: f };
    drawView();
    return;
  }
  if (!isMuteMarkMode()) return;
  pushUndoSnapshotForCurrentLint();
  e.preventDefault();
  els.waveformCanvas.setPointerCapture(e.pointerId);
  muteWaveDrag = { f0: f, f1: f };
  drawView();
}

function onMuteWavePointerMove(e) {
  if (editWaveDrag) {
    const f = fracFromWaveformClientX(e.clientX);
    if (f == null) return;
    editWaveDrag.f1 = f;
    drawView();
    return;
  }
  if (!muteWaveDrag) return;
  const f = fracFromWaveformClientX(e.clientX);
  if (f == null) return;
  muteWaveDrag.f1 = f;
  drawView();
}

function onMuteWavePointerUp(e) {
  if (editWaveDrag) {
    try {
      els.waveformCanvas.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* */
    }
    const f0 = editWaveDrag.f0;
    const f1 = editWaveDrag.f1;
    editWaveDrag = null;
    const p = currentEditablePath();
    if (!p) {
      drawView();
      return;
    }
    const r = clampMuteRegionPair(f0, f1);
    if (!r) {
      drawView();
      return;
    }
    const st = ensureScanState(p);
    st.editRegion = r;
    if (!st.editFadeMode) st.editFadeMode = 'both';
    if (!st.editFadeMs) st.editFadeMs = readMuteFadeMs();
    refreshPreviewAfterMuteEdit();
    return;
  }
  if (!muteWaveDrag) return;
  try {
    els.waveformCanvas.releasePointerCapture(e.pointerId);
  } catch (_) {
    /* */
  }
  const f0 = muteWaveDrag.f0;
  const f1 = muteWaveDrag.f1;
  muteWaveDrag = null;
  const p = currentEditablePath();
  if (!p) {
    drawView();
    return;
  }
  const r = clampMuteRegionPair(f0, f1);
  if (!r) {
    drawView();
    return;
  }
  const st = ensureScanState(p);
  const cur = normalizeMuteRegions(st.muteRegions || []);
  cur.push(r);
  st.muteRegions = cur;
  refreshPreviewAfterMuteEdit();
}

function drawWaveformView() {
  const wc = els.waveformCanvas;
  const vc = els.viewCanvas;
  if (!wc || !vc || vc.width < 1) return;
  const w = vc.width;
  const dh = vc.height;
  const h = getWaveformHeight();
  wc.width = w;
  wc.height = h;
  const ctx = wc.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#0d0f12';
  ctx.fillRect(0, 0, w, h);
  const mid = h * 0.5;
  ctx.strokeStyle = '#2d323c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();
  const layout = getWaveformDrawLayout();
  const samples = layout?.samples;
  if (!samples || samples.length < 2) return;
  const n = samples.length;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  const halfAmp = mid - 1;
  const ampScale = peak > 1e-8 ? halfAmp / peak : halfAmp;

  const { waveX0, waveW } = layout;

  const cols = Math.max(1, Math.floor(waveW));
  ctx.strokeStyle = 'rgba(72, 188, 255, 0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let xi = 0; xi < cols; xi++) {
    const t0 = (xi / cols) * n;
    const t1 = ((xi + 1) / cols) * n;
    let lo = 1;
    let hi = -1;
    const i0 = Math.max(0, Math.floor(t0));
    const i1 = Math.min(n - 1, Math.ceil(t1));
    for (let i = i0; i <= i1; i++) {
      const s = samples[i];
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    const y1 = mid - lo * ampScale;
    const y2 = mid - hi * ampScale;
    const x = waveX0 + xi + 0.5;
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
  }
  ctx.stroke();

  const joinMarkers = Array.isArray(layout?.cp?.joinMarkers) ? layout.cp.joinMarkers : [];
  joinMarkers.forEach((frac, idx) => {
    const x = waveX0 + frac * waveW;
    const active = idx === selectedJoinMarkerIndex;
    ctx.strokeStyle = active ? 'rgba(255, 120, 40, 0.98)' : 'rgba(255, 210, 80, 0.92)';
    ctx.lineWidth = active ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.fillStyle = active ? 'rgba(255, 120, 40, 0.98)' : 'rgba(255, 210, 80, 0.92)';
    ctx.fillRect(x - 2, 0, 4, 8);
  });

  const pathCur = currentEditablePath();
  if (pathCur) {
    for (const mr of getMuteRegionsForPath(pathCur)) {
      const x0 = waveX0 + mr.t0 * waveW;
      const x1 = waveX0 + mr.t1 * waveW;
      ctx.fillStyle = 'rgba(180, 80, 200, 0.22)';
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
    }
    const er = getEditRegionForPath(pathCur);
    if (er) {
      const x0 = waveX0 + er.t0 * waveW;
      const x1 = waveX0 + er.t1 * waveW;
      ctx.fillStyle = 'rgba(80, 220, 120, 0.18)';
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
      ctx.strokeStyle = 'rgba(80, 220, 120, 0.95)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, 0.5, Math.max(1, x1 - x0) - 1, h - 1);
    }
  }
  if (editWaveDrag && n >= 2) {
    const a = Math.min(editWaveDrag.f0, editWaveDrag.f1);
    const b = Math.max(editWaveDrag.f0, editWaveDrag.f1);
    const x0 = waveX0 + a * waveW;
    const x1 = waveX0 + b * waveW;
    ctx.fillStyle = 'rgba(80, 220, 120, 0.25)';
    ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
  }
  if (muteWaveDrag && n >= 2) {
    const a = Math.min(muteWaveDrag.f0, muteWaveDrag.f1);
    const b = Math.max(muteWaveDrag.f0, muteWaveDrag.f1);
    const x0 = waveX0 + a * waveW;
    const x1 = waveX0 + b * waveW;
    ctx.fillStyle = 'rgba(255, 200, 80, 0.28)';
    ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
    ctx.strokeStyle = 'rgba(255, 200, 80, 0.95)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, 0.5, Math.max(1, x1 - x0) - 1, h - 1);
  }

  if (previewPlayheadFrac != null) {
    const px = waveX0 + previewPlayheadFrac * waveW;
    ctx.strokeStyle = 'rgba(255, 40, 40, 0.98)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
  }
}

/** @type {AbortController|null} */
let currentPreviewAbort = null;
/** @type {GainNode|null} */
let previewMonitorGainNode = null;

function stopPreviewAudioOnly() {
  if (previewRaf != null) {
    cancelAnimationFrame(previewRaf);
    previewRaf = null;
  }
  if (previewAudioSource) {
    try {
      previewAudioSource.stop();
    } catch (_) {
      /* al gestopt */
    }
    previewAudioSource = null;
  }
  previewPlayheadFrac = null;
}

function stopPreviewPlayback() {
  if (currentPreviewAbort) {
    currentPreviewAbort.abort();
    currentPreviewAbort = null;
  }
  stopPreviewAudioOnly();
  drawView();
}

function ensurePreviewMonitorGain() {
  if (!audioCtx) return null;
  if (!previewMonitorGainNode) {
    previewMonitorGainNode = audioCtx.createGain();
    previewMonitorGainNode.connect(audioCtx.destination);
  }
  return previewMonitorGainNode;
}

function computeViewBandLayout() {
  if (!workCanvas) return null;
  const workW = workCanvas.width;
  const workH = workCanvas.height;
  const { dw, dh } = computeViewDisplaySize(workW, workH);
  const b = workBandPixels();
  const sx = dw / workCanvas.width;
  const sy = dh / workCanvas.height;
  return {
    dw,
    dh,
    px0: b.x0 * sx,
    py0: b.y0 * sy,
    pw: (b.x1 - b.x0) * sx,
    ph: (b.y1 - b.y0) * sy
  };
}

function startPreviewAnimationLoop() {
  const tick = () => {
    if (!previewAudioSource) {
      previewRaf = null;
      return;
    }
    previewRaf = requestAnimationFrame(tick);
    if (!audioCtx) return;
    const elapsed = audioCtx.currentTime - previewStartAudioTime;
    const frac = Math.max(0, Math.min(1, elapsed / previewDurationSec));
    previewPlayheadFrac = frac;
    drawView();
  };
  previewRaf = requestAnimationFrame(tick);
}

function drawWorkScaledToView(ctx, work, dw, dh) {
  const sw = work.width;
  const sh = work.height;
  if (sw < 1 || sh < 1) return;
  const useTiles = sw > 2048 || sh > 2048;
  if (!useTiles) {
    ctx.drawImage(work, 0, 0, sw, sh, 0, 0, dw, dh);
    return;
  }
  if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = true;
  const tileOutH = 512;
  let srcYNext = 0;
  for (let y = 0; y < dh; ) {
    const y1 = Math.min(dh, y + tileOutH);
    const srcY0 = srcYNext;
    let srcY1 = Math.ceil((y1 * sh) / dh);
    if (srcY1 <= srcY0) srcY1 = Math.min(sh, srcY0 + 1);
    if (srcY1 > sh) srcY1 = sh;
    srcYNext = srcY1;
    const shSlice = srcY1 - srcY0;
    const dhSlice = y1 - y;
    if (shSlice >= 1 && dhSlice >= 1) {
      ctx.drawImage(work, 0, srcY0, sw, shSlice, 0, y, dw, dhSlice);
    }
    y = y1;
  }
}

function drawView() {
  const vc = els.viewCanvas;
  const wrap = els.canvasWrap;
  if (!workCanvas || !wrap) return;

  const workW = workCanvas.width;
  const workH = workCanvas.height;
  const { dw, dh } = computeViewDisplaySize(workW, workH);

  vc.width = dw;
  vc.height = dh;
  const ctx = vc.getContext('2d');
  const upscale = dw > workW || dh > workH;
  const downscale = dw < workW || dh < workH;
  if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = upscale || downscale;
  drawWorkScaledToView(ctx, workCanvas, dw, dh);

  const b = workBandPixels();
  const sx = dw / workCanvas.width;
  const sy = dh / workCanvas.height;
  const px0 = b.x0 * sx;
  const py0 = b.y0 * sy;
  const pw = (b.x1 - b.x0) * sx;
  const ph = (b.y1 - b.y0) * sy;

  const timeAlong = decodeTimeAlongFromUI();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  if (px0 > 0) ctx.fillRect(0, 0, px0, dh);
  if (px0 + pw < dw) ctx.fillRect(px0 + pw, 0, dw - px0 - pw, dh);
  if (py0 > 0) ctx.fillRect(px0, 0, pw, py0);
  if (py0 + ph < dh) ctx.fillRect(px0, py0 + ph, pw, dh - py0 - ph);

  ctx.strokeStyle = 'rgba(255, 200, 80, 0.85)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(px0, py0, pw, ph);
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(0, 255, 160, 0.95)';
  ctx.lineWidth = 2;
  ctx.strokeRect(px0, py0, pw, ph);

  const triW = 10;
  const triH = 7;
  if (timeAlong === 'y') {
    const yFilmStart = py0;
    const yFilmEnd = py0 + ph;
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.98)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, yFilmStart);
    ctx.lineTo(dw, yFilmStart);
    ctx.stroke();
    ctx.fillStyle = 'rgba(120, 200, 255, 0.95)';
    ctx.beginPath();
    ctx.moveTo(0, yFilmStart);
    ctx.lineTo(triW, yFilmStart - triH);
    ctx.lineTo(triW, yFilmStart + triH);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 170, 100, 0.98)';
    ctx.beginPath();
    ctx.moveTo(0, yFilmEnd);
    ctx.lineTo(dw, yFilmEnd);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 170, 100, 0.92)';
    ctx.beginPath();
    ctx.moveTo(0, yFilmEnd);
    ctx.lineTo(triW, yFilmEnd - triH);
    ctx.lineTo(triW, yFilmEnd + triH);
    ctx.closePath();
    ctx.fill();
  } else {
    const xFilmStart = px0;
    const xFilmEnd = px0 + pw;
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.98)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xFilmStart, 0);
    ctx.lineTo(xFilmStart, dh);
    ctx.stroke();
    ctx.fillStyle = 'rgba(120, 200, 255, 0.95)';
    ctx.beginPath();
    ctx.moveTo(xFilmStart, 0);
    ctx.lineTo(xFilmStart - triH, triW);
    ctx.lineTo(xFilmStart + triH, triW);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 170, 100, 0.98)';
    ctx.beginPath();
    ctx.moveTo(xFilmEnd, 0);
    ctx.lineTo(xFilmEnd, dh);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 170, 100, 0.92)';
    ctx.beginPath();
    ctx.moveTo(xFilmEnd, 0);
    ctx.lineTo(xFilmEnd - triH, triW);
    ctx.lineTo(xFilmEnd + triH, triW);
    ctx.closePath();
    ctx.fill();
  }

  if (previewPlayheadFrac != null && cachedPreview) {
    const { band, workW: cw, workH: ch, timeAlong } = cachedPreview;
    const sx = dw / cw;
    const sy = dh / ch;
    const bx0 = band.x0 * sx;
    const by0 = band.y0 * sy;
    const bw = (band.x1 - band.x0) * sx;
    const bh = (band.y1 - band.y0) * sy;
    ctx.strokeStyle = 'rgba(255, 40, 40, 0.98)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    if (timeAlong === 'x') {
      const vx = bx0 + previewPlayheadFrac * bw;
      ctx.moveTo(vx, by0);
      ctx.lineTo(vx, by0 + bh);
    } else {
      const vy = band.y0 * sy + previewPlayheadFrac * (band.y1 - band.y0) * sy;
      ctx.moveTo(bx0, vy);
      ctx.lineTo(bx0 + bw, vy);
    }
    ctx.stroke();
  }

  drawWaveformView();
}

function viewToWork(vx, vy) {
  const vc = els.viewCanvas;
  if (!workCanvas) return { wx: 0, wy: 0 };
  const sx = workCanvas.width / vc.width;
  const sy = workCanvas.height / vc.height;
  return { wx: vx * sx, wy: vy * sy };
}

/**
 * @param {number} index
 * @param {{ forQueue?: boolean, skipNeighborCopy?: boolean }} [loadOpts] — forQueue: wachtrij; skipNeighborCopy: geen kopie vorige→deze (sessiestart)
 */
async function loadPathAt(index, loadOpts = {}) {
  const forQueue = !!loadOpts.forQueue;
  const skipNeighborCopy = !!loadOpts.skipNeighborCopy;
  if (index < 0 || index >= paths.length) return;
  if (loadedAudioState) loadedAudioState = null;

  const prevIdx = currentIndex;
  if (prevIdx >= 0 && paths[prevIdx] && prevIdx !== index) {
    persistRegionForCurrent();
  }
  if (
    !forQueue &&
    !skipNeighborCopy &&
    prevIdx >= 0 &&
    prevIdx !== index &&
    index === prevIdx + 1 &&
    paths[prevIdx] &&
    paths[index]
  ) {
    copyPerScanSettingsToNextStrip(paths[prevIdx], paths[index]);
  }

  cachedPreview = null;
  if (forQueue) {
    stopPreviewAudioOnly();
  } else {
    stopPreviewPlayback();
  }

  const p = paths[index];
  let img;
  try {
    const url = await window.osdApi.fileToUrl(p);
    img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Kan afbeelding niet laden'));
      img.src = url;
    });
  } catch (e) {
    pendingSessionRowHighlight = -1;
    renderFileList({ scrollToCurrent: false });
    updateInfoPanel();
    throw e;
  }

  currentImage = img;
  currentIndex = index;
  clearUndoForCurrentLint();
  fileListShiftAnchor = index;
  pendingSessionRowHighlight = -1;

  const st = ensureScanState(p);
  if (st.rotation == null) {
    st.rotation = suggestRotationDeg(img);
  }
  els.rotation.value = String(st.rotation);
  if (st.decodeMode == null) {
    st.decodeMode = els.decodeMode.value === 'area' ? 'area' : 'density';
  }
  els.decodeMode.value = st.decodeMode;

  if (typeof st.mirrorH !== 'boolean') st.mirrorH = false;
  if (typeof st.mirrorV !== 'boolean') st.mirrorV = false;
  st.fineRotationDeg = clampFineRotationDeg(st.fineRotationDeg);

  loadRegionForPath(p);
  rebuildWorkCanvas();
  syncSlidersFromBand();
  syncPerLintPanelsFromPath(p);
  renderFileList({ scrollToCurrent: true });
  updateGotoMax();
  updateWorkStatusLine();
  updateInfoPanel();
  scheduleSaveSession();
  renderMuteRegionList();
  renderEditRegionList();
  syncMuteWaveformPointerStyle();
}

function beginPathSetLoad(list, statusPrefix) {
  loadedAudioState = null;
  scanStateByPath.clear();
  paths = list;
  fileListSelection.clear();
  fileListShiftAnchor = -1;
  pendingSessionRowHighlight = 0;
  currentIndex = -1;
  currentImage = null;
  workCanvas = null;
  cachedPreview = null;
  stopPreviewPlayback();
  renderFileList({ scrollToCurrent: true });
  if (paths[0]) syncPerLintPanelsFromPath(paths[0]);
  updateGotoMax();
  updateInfoPanel();
  renderMuteRegionList();
  renderEditRegionList();
  syncMuteWaveformPointerStyle();
  els.status.textContent = `${statusPrefix}…`;
  scheduleAfterFirstPaint(() => {
    showBusyOverlay('Deze actie kan lang duren! Wees geduldig!', 12);
    updateBusyOverlay(`${statusPrefix}…`, 18);
    loadPathAt(0, { skipNeighborCopy: true })
      .then(() => {
        els.status.textContent = `${statusPrefix} klaar.`;
        hideBusyOverlay();
      })
      .catch((e) => {
        els.status.textContent = e.message || String(e);
        pendingSessionRowHighlight = -1;
        renderFileList({ scrollToCurrent: false });
        updateInfoPanel();
        hideBusyOverlay();
      });
  });
}

function selectAllFilesInList() {
  fileListSelection.clear();
  for (let i = 0; i < paths.length; i++) fileListSelection.add(i);
  fileListShiftAnchor = paths.length > 0 ? 0 : -1;
  if (paths[0]) syncPerLintPanelsFromPath(paths[0]);
  renderFileList({ scrollToCurrent: false });
  els.status.textContent =
    paths.length > 0
      ? `Alle ${paths.length} linten geselecteerd. Er is nog niets geladen of toegepast.`
      : 'Geen linten om te selecteren.';
}

function clearFileSelection() {
  fileListSelection.clear();
  fileListShiftAnchor = currentIndex >= 0 ? currentIndex : -1;
  renderFileList({ scrollToCurrent: false });
  els.status.textContent = 'Selectie gewist.';
}

function updateGotoMax() {
  if (!els.inpGoto) return;
  const n = Math.max(1, paths.length);
  els.inpGoto.max = String(n);
  let row = 1;
  if (currentIndex >= 0) row = currentIndex + 1;
  else if (pendingSessionRowHighlight >= 0) row = pendingSessionRowHighlight + 1;
  els.inpGoto.value = String(Math.min(n, Math.max(1, row)));
}

function updateWorkStatusLine() {
  if (loadedAudioState && workCanvas) {
    els.status.textContent = `Geladen audio: ${loadedAudioState.fileName} · ${loadedAudioState.sampleRate} Hz · ${loadedAudioState.durationSec.toFixed(3).replace('.', ',')} s`;
    return;
  }
  if (!currentImage || !workCanvas || currentIndex < 0 || !paths[currentIndex]) return;
  const p = paths[currentIndex];
  const nw = currentImage.naturalWidth;
  const nh = currentImage.naturalHeight;
  let msg = `${basename(p)} (${currentIndex + 1}/${paths.length}) — ${nw}×${nh} px → werk ${workCanvas.width}×${workCanvas.height} px`;
  if (workCanvas._osdCapped && workCanvas._osdLogicalCw) {
    msg += ` (uniform geschaald: logisch ${workCanvas._osdLogicalCw}×${workCanvas._osdLogicalCh} → max ${MAX_ROTATED_CANVAS_SIDE}px zijde)`;
  }
  els.status.textContent = msg;
}

function rebuildWorkCanvas() {
  if (loadedAudioState) {
    workCanvas = buildLoadedAudioPlaceholderCanvas(loadedAudioState.fileName);
    drawView();
    updateWorkStatusLine();
    updateInfoPanel();
    return;
  }
  if (!currentImage) return;
  const rot = Number(els.rotation.value) || 0;
  const buildOpts =
    currentIndex >= 0 && paths[currentIndex] ? getWorkCanvasOptsForPath(paths[currentIndex]) : {};
  workCanvas = buildRotatedCanvas(currentImage, rot, buildOpts);
  drawView();
  updateWorkStatusLine();
  updateInfoPanel();
}

function syncFileListSlider() {
  const wrap = document.getElementById('file-list-scroll-wrap');
  const el = els.rngFileListWindow;
  if (wrap) wrap.classList.add('file-list-scroll--hidden');
  if (!el) return;
  el.disabled = true;
  el.min = '0';
  el.max = '0';
  el.value = '0';
  if (els.lblFileListWindow) els.lblFileListWindow.textContent = '';
}

/**
 * @param {{ scrollToCurrent?: boolean }} [opts] — true na navigatie zodat de actieve lint in beeld blijft
 */
function renderFileList(opts = {}) {
  const n = paths.length;
  for (const i of [...fileListSelection]) {
    if (i < 0 || i >= n) fileListSelection.delete(i);
  }

  els.fileList.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const p = paths[i];
    const li = document.createElement('li');
    const stRow = ensureScanState(p);
    const rot = getRotation(p);
    const r = rot != null ? rot : '…';
    const mh = stRow.mirrorH ? 'H' : '';
    const mv = stRow.mirrorV ? 'V' : '';
    const mir = mh || mv ? ` ${mh}${mv}` : '';
    li.textContent = `${i + 1}. ${basename(p)} · ${r}°${mir}`;
    if (i === currentIndex) li.classList.add('active');
    else if (pendingSessionRowHighlight >= 0 && i === pendingSessionRowHighlight && currentIndex < 0) {
      li.classList.add('active', 'file-list--pending');
    }
    if (fileListSelection.has(i)) li.classList.add('selected');
    li.addEventListener('click', (ev) => {
      if (ev.button !== 0) return;
      if (ev.detail > 1) return;
      if (ev.ctrlKey || ev.metaKey) {
        if (fileListSelection.has(i)) {
          fileListSelection.delete(i);
        } else {
          if (fileListSelection.size >= MAX_SCAN_SELECTION) {
            els.status.textContent = `Maximaal ${MAX_SCAN_SELECTION} linten in selectie.`;
            renderFileList({ scrollToCurrent: false });
            return;
          }
          fileListSelection.add(i);
        }
        fileListShiftAnchor = i;
        syncPerLintPanelsFromPath(p);
        els.status.textContent = `${basename(p)} — selectie (dubbelklik om te laden).`;
        renderFileList({ scrollToCurrent: false });
        return;
      }
      if (ev.shiftKey && fileListShiftAnchor >= 0) {
        fileListSelection.clear();
        for (const j of indicesForShiftRange(fileListShiftAnchor, i)) {
          fileListSelection.add(j);
        }
        fileListShiftAnchor = i;
        syncPerLintPanelsFromPath(p);
        els.status.textContent = `Bereik geselecteerd (${fileListSelection.size} linten). Dubbelklik om één te laden.`;
        renderFileList({ scrollToCurrent: false });
        return;
      }
      fileListSelection.clear();
      fileListSelection.add(i);
      fileListShiftAnchor = i;
      syncPerLintPanelsFromPath(p);
      els.status.textContent = `${basename(p)} — geselecteerd (dubbelklik om in beeld te laden).`;
      renderFileList({ scrollToCurrent: false });
    });
    li.addEventListener('dblclick', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      loadPathAt(i).catch((e) => {
        els.status.textContent = e.message || String(e);
      });
    });
    els.fileList.appendChild(li);
  }
  syncFileListSlider();
}

function readParams() {
  const frames = Math.max(1, Math.min(40, Number(els.frames.value) || 31));
  els.frames.value = String(frames);
  const filmFps = Number(els.fps.value) || 24;
  const invert = els.invert.checked;
  const highpassHz = Math.max(0, Number(els.hp.value) || 0);
  const exportSampleRate = Number(els.exportSr.value) || 48000;
  const opticalEqPreset = ['off', 'mild', 'academy', 'noise-cut', 'voice'].includes(els.opticalEq?.value)
    ? els.opticalEq.value
    : 'off';
  const deClickStrength = ['off', 'light', 'medium', 'strong'].includes(els.declick?.value)
    ? els.declick.value
    : 'off';
  const applySmooth = els.smooth.checked;
  const normalize = els.normalize.checked;
  const decodeMode = els.decodeMode.value === 'area' ? 'area' : 'density';
  const outputGain = clampOutputGain(Number(els.rngOutputGain?.value) / 100);
  return { frames, filmFps, invert, highpassHz, exportSampleRate, opticalEqPreset, deClickStrength, applySmooth, normalize, decodeMode, outputGain };
}

function runDecodeOnWorkCanvas() {
  persistRegionForCurrent();
  const p = readParams();
  const band = workBandPixels();
  const rot = Number(els.rotation.value) || 0;
  const decoded = decodeStrip({
    canvas: workCanvas,
    band,
    framesOnStrip: p.frames,
    filmFps: p.filmFps,
    invert: p.invert,
    highpassHz: p.highpassHz,
    exportSampleRate: p.exportSampleRate,
    opticalEqPreset: p.opticalEqPreset,
    deClickStrength: p.deClickStrength,
    applySmooth: p.applySmooth,
    normalize: p.normalize,
    decodeMode: p.decodeMode,
    timeAlong: decodeTimeAlongAxis(rot),
    outputGain: p.outputGain
  });
  const pathCur = currentIndex >= 0 ? paths[currentIndex] : null;
  const samples = pathCur
    ? applyStoredMuteToSamples(decoded.samples, decoded.exportSampleRate, pathCur)
    : decoded.samples;
  return { ...decoded, samples };
}

async function decodePathToFloat(path, options = {}) {
  const { normalize: doNorm = true } = options;
  const url = await window.osdApi.fileToUrl(path);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('load'));
    img.src = url;
  });
  const st = ensureScanState(path);
  let rot = st.rotation;
  if (rot == null) {
    rot = suggestRotationDeg(img);
    st.rotation = rot;
  }
  const buildOpts = getWorkCanvasOptsForPath(path);
  const canvas = buildRotatedCanvas(img, rot, buildOpts);
  const w = canvas.width;
  const h = canvas.height;
  const reg = clampRegionFrac(getRegionForPath(path));
  const band = {
    x0: Math.round(reg.x0 * w),
    x1: Math.round(reg.x1 * w),
    y0: Math.round(reg.y0 * h),
    y1: Math.round(reg.y1 * h)
  };
  const dm = st.decodeMode === 'area' ? 'area' : 'density';
  const p = readParams();
  const decoded = decodeStrip({
    canvas,
    band,
    framesOnStrip: p.frames,
    filmFps: p.filmFps,
    invert: p.invert,
    highpassHz: p.highpassHz,
    exportSampleRate: p.exportSampleRate,
    opticalEqPreset: p.opticalEqPreset,
    deClickStrength: p.deClickStrength,
    applySmooth: p.applySmooth,
    normalize: doNorm && p.normalize,
    decodeMode: dm,
    timeAlong: decodeTimeAlongAxis(rot),
    outputGain: p.outputGain
  });
  const samples = applyStoredMuteToSamples(decoded.samples, decoded.exportSampleRate, path);
  return { ...decoded, samples };
}

let audioCtx = null;

/**
 * @param {AbortSignal} abortSignal
 * @returns {Promise<boolean>} true als er audio is afgespeeld
 */
async function runOnePreviewPlayback(abortSignal) {
  if (!workCanvas) return false;
  stopPreviewAudioOnly();

  const usingLoadedAudio = !!loadedAudioState;
  const band = usingLoadedAudio ? { x0: 0, x1: workCanvas.width, y0: 0, y1: workCanvas.height } : workBandPixels();
  const loadedPreview = usingLoadedAudio ? getLoadedAudioEditedPreviewData() : null;
  const { samples, nativeSampleRate, durationSec, exportSampleRate } = usingLoadedAudio
    ? {
        samples: loadedPreview?.samples || new Float32Array(0),
        nativeSampleRate: loadedAudioState?.sampleRate || 0,
        durationSec: loadedPreview?.durationSec || 0,
        exportSampleRate: loadedPreview?.exportSampleRate || 0
      }
    : runDecodeOnWorkCanvas();
  if (samples.length < 2) {
    els.status.textContent = 'Geen samples (band te klein?)';
    return false;
  }
  const p = readParams();
  els.metaHint.textContent = usingLoadedAudio
    ? `Bron: geladen audio · ${nativeSampleRate.toFixed(0)} Hz · Duur ${durationSec.toFixed(3)} s · ${samples.length} monsters · Voorbeluisteren ${getPreviewMonitorGain().toFixed(2).replace('.', ',')}×`
    : `Modus: ${p.decodeMode === 'area' ? 'oppervlakte' : 'dichtheid'} · EQ ${p.opticalEqPreset} · De-click ${p.deClickStrength} · Native ca. ${nativeSampleRate.toFixed(0)} Hz · Duur ${durationSec.toFixed(3)} s · Export ${exportSampleRate} Hz · ${samples.length} monsters · Decode ${p.outputGain.toFixed(2).replace('.', ',')}× · Voorbeluisteren ${getPreviewMonitorGain().toFixed(2).replace('.', ',')}× · Afspeel-SR = echte context`;

  cachedPreview = {
    samples: Float32Array.from(samples),
    durationSec,
    exportSampleRate,
    band: { x0: band.x0, x1: band.x1, y0: band.y0, y1: band.y1 },
    workW: workCanvas.width,
    workH: workCanvas.height,
    timeAlong: usingLoadedAudio ? 'x' : decodeTimeAlongAxis(Number(els.rotation.value) || 0)
  };
  drawView();

  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  const ctxSr = audioCtx.sampleRate;
  const playSamples =
    Math.abs(ctxSr - exportSampleRate) < 0.5 ? samples : resampleCubicHermite(samples, exportSampleRate, ctxSr);
  if (playSamples.length < 1) {
    els.status.textContent = 'Geen monsters na resample.';
    return false;
  }

  const buffer = audioCtx.createBuffer(1, playSamples.length, ctxSr);
  buffer.copyToChannel(playSamples, 0);
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  const gNode = ensurePreviewMonitorGain();
  if (!gNode) {
    els.status.textContent = 'Audio niet beschikbaar.';
    return false;
  }
  gNode.gain.value = getPreviewMonitorGain();
  src.connect(gNode);

  previewDurationSec = buffer.duration;
  previewStartAudioTime = audioCtx.currentTime;
  previewAudioSource = src;

  await new Promise((resolve, reject) => {
    const cleanupAbort = () => abortSignal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanupAbort();
      try {
        src.stop();
      } catch (_) {
        /* */
      }
      previewAudioSource = null;
      if (previewRaf != null) {
        cancelAnimationFrame(previewRaf);
        previewRaf = null;
      }
      previewPlayheadFrac = null;
      drawView();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (abortSignal.aborted) {
      cleanupAbort();
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    abortSignal.addEventListener('abort', onAbort);
    src.onended = () => {
      cleanupAbort();
      previewAudioSource = null;
      if (previewRaf != null) {
        cancelAnimationFrame(previewRaf);
        previewRaf = null;
      }
      previewPlayheadFrac = null;
      drawView();
      resolve();
    };
    try {
      src.start();
      startPreviewAnimationLoop();
    } catch (err) {
      cleanupAbort();
      previewAudioSource = null;
      reject(err);
    }
  });
  return true;
}

async function playPreview() {
  if (!workCanvas && !loadedAudioState) return;
  stopPreviewPlayback();
  currentPreviewAbort = new AbortController();
  const ac = currentPreviewAbort;
  try {
    do {
      ac.signal.throwIfAborted();
      const ok = await runOnePreviewPlayback(ac.signal);
      if (!ok) break;
    } while (isPreviewLoopEnabled() && !ac.signal.aborted);
  } catch (e) {
    if (e?.name !== 'AbortError') console.warn(e);
  } finally {
    if (currentPreviewAbort === ac) currentPreviewAbort = null;
  }
}

async function playPreviewQueue() {
  if (loadedAudioState) {
    return playPreview();
  }
  if (!paths.length) {
    els.status.textContent = 'Geen bestanden.';
    return;
  }
  stopPreviewPlayback();
  currentPreviewAbort = new AbortController();
  const ac = currentPreviewAbort;
  let indices =
    fileListSelection.size > 0
      ? [...fileListSelection].sort((a, b) => a - b)
      : currentIndex >= 0
        ? [currentIndex]
        : [0];
  indices = indices.filter((i) => i >= 0 && i < paths.length);
  if (indices.length === 0) {
    currentPreviewAbort = null;
    return;
  }
  const total = indices.length;
  try {
    let loopRound = 0;
    let finishedNonLoop = false;
    do {
      ac.signal.throwIfAborted();
      loopRound += 1;
      if (isPreviewLoopEnabled() && loopRound > 1) {
        els.status.textContent = `Wachtrij loop · ronde ${loopRound}…`;
      }
      let roundPlayed = false;
      for (let k = 0; k < total; k++) {
        ac.signal.throwIfAborted();
        const idx = indices[k];
        await loadPathAt(idx, { forQueue: true });
        ac.signal.throwIfAborted();
        els.status.textContent = `Wachtrij ${k + 1}/${total}: ${basename(paths[idx])}`;
        const ok = await runOnePreviewPlayback(ac.signal);
        if (ok) roundPlayed = true;
      }
      if (!roundPlayed) break;
      if (!isPreviewLoopEnabled() && total > 1 && !finishedNonLoop) {
        els.status.textContent = `Wachtrij klaar (${total} linten).`;
        finishedNonLoop = true;
      }
    } while (isPreviewLoopEnabled() && !ac.signal.aborted);
  } catch (e) {
    if (e?.name !== 'AbortError') console.warn(e);
  } finally {
    if (currentPreviewAbort === ac) currentPreviewAbort = null;
  }
}

function getExportFormat() {
  return els.exportFormat.value === 'mp3' ? 'mp3' : 'wav';
}

function syncDuplicateStatus() {
  if (!els.status || !els.statusExport) return;
  els.statusExport.textContent = els.status.textContent || '';
  els.statusExport.classList.toggle('status--export-running', els.status.classList.contains('status--export-running'));
}

function setLastExportPath(filePath) {
  if (els.inpLastExportPath) els.inpLastExportPath.value = filePath || '—';
  updateAudacityUi();
}

async function writeAudioFile(filePath, wavArrayBuffer, format) {
  const u8 = new Uint8Array(wavArrayBuffer);
  if (format === 'wav') {
    const r = await window.osdApi.writeWavFile(filePath, u8);
    if (!r.ok) throw new Error(r.error || 'WAV schrijven mislukt');
  } else {
    const okFfmpeg = await window.osdApi.ffmpegAvailable();
    if (!okFfmpeg) {
      throw new Error('MP3 vereist ffmpeg-static. Voer in de app-map uit: npm install');
    }
    const r = await window.osdApi.writeAudioExport({ filePath, buffer: u8, format: 'mp3' });
    if (!r.ok) throw new Error(r.error || 'MP3-export mislukt');
  }
  const exists = await window.osdApi.fileExists(filePath);
  if (!exists) throw new Error(`Export lijkt gelukt, maar bestand niet gevonden: ${filePath}`);
}

function sanitizeExportBaseName(name, fallback = 'optical-track') {
  const raw = (typeof name === 'string' ? name : '').trim();
  const safe = raw
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .trim();
  return safe || fallback;
}

function getExportBaseName(defaultBaseName) {
  const typedBase = sanitizeExportBaseName(els.inpExportName?.value, defaultBaseName);
  if (els.inpExportName) els.inpExportName.value = typedBase;
  return typedBase;
}

async function ensureUniqueExportPath(filePath, ext) {
  const normalizedExt = ext === 'mp3' ? 'mp3' : 'wav';
  const base = filePath.replace(new RegExp(`\\.${normalizedExt}$`, 'i'), '');
  let candidate = `${base}.${normalizedExt}`;
  let n = 2;
  while (await window.osdApi.fileExists(candidate)) {
    candidate = `${base}-${n}.${normalizedExt}`;
    n += 1;
  }
  return candidate;
}

async function pickOrBuildExportPath(defaultBaseName, fmt, options = {}) {
  const ext = fmt === 'mp3' ? 'mp3' : 'wav';
  const typedBase = getExportBaseName(defaultBaseName);
  if (options.useOutputFolder && outputFolderPath) {
    const built = await window.osdApi.buildExportPath({
      folderPath: outputFolderPath,
      baseName: typedBase,
      format: ext
    });
    return built || null;
  }
  return window.osdApi.saveAudioDialog({ suggestedName: `${typedBase}.${ext}`, format: fmt });
}

async function writeAudioFileToOutputFolder(baseName, wavArrayBuffer, format) {
  if (!outputFolderPath) throw new Error('Kies eerst een uitvoermap.');
  const probe = await window.osdApi.writeOutputFolderProbe({ folderPath: outputFolderPath });
  if (!probe?.ok) throw new Error(probe?.error || 'Schrijftest naar uitvoermap mislukt');
  setLastExportPath(probe.probePath || outputFolderPath);
  await window.osdApi.openFolder(outputFolderPath);
  const u8 = new Uint8Array(wavArrayBuffer);
  if (format === 'mp3') {
    const okFfmpeg = await window.osdApi.ffmpegAvailable();
    if (!okFfmpeg) {
      throw new Error('MP3 vereist ffmpeg-static. Voer in de app-map uit: npm install');
    }
  }
  const r = await window.osdApi.writeAudioToOutputFolder({
    folderPath: outputFolderPath,
    baseName,
    buffer: u8,
    format
  });
  if (!r?.ok || !r.filePath) throw new Error(r?.error || 'Export naar uitvoermap mislukt');
  const exists = await window.osdApi.fileExists(r.filePath);
  if (!exists) throw new Error(`Export lijkt gelukt, maar bestand niet gevonden: ${r.filePath}`);
  setLastExportPath(r.filePath);
  return r.filePath;
}

function encodeExportWav(samples, sampleRate, opts = {}) {
  try {
    return {
      buffer: encodeFloat32WavMono(samples, sampleRate),
      encodingLabel: 'WAV float',
      usedFallback: false
    };
  } catch (e) {
    if (!opts.allowPcm16Fallback) throw e;
    return {
      buffer: encodePcm16WavMono(samples, sampleRate),
      encodingLabel: 'WAV PCM16',
      usedFallback: true
    };
  }
}

function copyChunkWithEdgeFades(target, offset, chunk, fadeOutSamples = 0, fadeInSamples = 0) {
  const n = chunk.length;
  const fadeOutN = Math.max(0, Math.min(n, fadeOutSamples));
  const fadeInN = Math.max(0, Math.min(n, fadeInSamples));
  for (let i = 0; i < n; i++) {
    let g = 1;
    if (fadeInN > 0 && i < fadeInN) {
      g = Math.min(g, (i + 1) / fadeInN);
    }
    if (fadeOutN > 0 && i >= n - fadeOutN) {
      g = Math.min(g, (n - i) / fadeOutN);
    }
    target[offset + i] = chunk[i] * g;
  }
}

function applyJoinDePopToChunk(chunk, sampleRate, mode, hasPrevJoin, hasNextJoin) {
  if (!chunk?.length || mode === 'off' || sampleRate <= 0 || (!hasPrevJoin && !hasNextJoin)) return chunk;
  const edgeMs = mode === 'light' ? 1.5 : mode === 'strong' ? 5 : mode === 'extreme' ? 8 : 3;
  const edgeSamples = Math.max(8, Math.min(chunk.length, Math.round((edgeMs / 1000) * sampleRate)));
  let out = Float32Array.from(chunk);
  if (hasPrevJoin) {
    const win = suppressImpulseClicks(out.slice(0, edgeSamples), mode);
    for (let i = 0; i < edgeSamples; i++) {
      const g = edgeSamples > 1 ? i / (edgeSamples - 1) : 0;
      out[i] = win[i] * g;
    }
  }
  if (hasNextJoin) {
    const start = Math.max(0, out.length - edgeSamples);
    const win = suppressImpulseClicks(out.slice(start), mode);
    const n = win.length;
    for (let i = 0; i < n; i++) {
      const g = n > 1 ? (n - 1 - i) / (n - 1) : 0;
      out[start + i] = win[i] * g;
    }
  }
  if (mode === 'extreme') {
    const centerMs = 1.5;
    const centerSamples = Math.max(4, Math.round((centerMs / 1000) * sampleRate));
    if (hasPrevJoin) {
      const start = Math.max(0, out.length - centerSamples);
      for (let i = start; i < out.length; i++) out[i] = 0;
    }
    if (hasNextJoin) {
      for (let i = 0; i < Math.min(centerSamples, out.length); i++) out[i] = 0;
    }
  }
  return out;
}

function createExportCancelledError() {
  return new Error('Export gestopt door gebruiker.');
}

function throwIfExportCancelled(signal) {
  if (signal?.aborted) throw createExportCancelledError();
}

function setExportUiState(active, buttonEl) {
  const exportButtons = [
    els.btnExportOne,
    els.btnExportSelection,
    els.btnExportSelectionFolder,
    els.btnExportAll,
    els.btnExportMergeFolder
  ].filter(Boolean);
  for (const btn of exportButtons) btn.classList.remove('export-btn--running');
  els.status?.classList.toggle('status--export-running', !!active);
  if (els.btnExportStop) els.btnExportStop.disabled = !active;
  if (els.btnBusyCancel) els.btnBusyCancel.disabled = !active;
  if (active && buttonEl) buttonEl.classList.add('export-btn--running');
  syncDuplicateStatus();
}

function triggerShortcutAction(actionId) {
  switch (actionId) {
    case 'decodePreview':
      playPreview().catch(console.error);
      return true;
    case 'previewQueue':
      playPreviewQueue().catch(console.error);
      return true;
    case 'stopPreview':
      stopPreviewPlayback();
      els.status.textContent = 'Afspelen gestopt.';
      return true;
    case 'prevScan':
      goPrevScan();
      return true;
    case 'nextScan':
      goNextScan();
      return true;
    case 'exportOne':
      runExportAction(els.btnExportOne, (signal, progressUi) => exportOne(signal, progressUi)).catch(console.error);
      return true;
    case 'exportSelection':
      runExportAction(els.btnExportSelection, (signal, progressUi) => exportSelectionMergedDialog(signal, progressUi)).catch(console.error);
      return true;
    case 'exportSelectionFolder':
      runExportAction(els.btnExportSelectionFolder, (signal, progressUi) => exportSelectionMergedToOutputFolder(signal, progressUi)).catch(console.error);
      return true;
    case 'exportAll':
      runExportAction(els.btnExportAll, (signal, progressUi) => exportAllDialog(signal, progressUi)).catch(console.error);
      return true;
    case 'exportAllFolder':
      runExportAction(els.btnExportMergeFolder, (signal, progressUi) => exportMergeToOutputFolder(signal, progressUi)).catch(console.error);
      return true;
    case 'stopExport':
      if (currentExportAbortController) {
        currentExportAbortController.abort();
        els.status.textContent = 'Export wordt gestopt…';
      }
      return true;
    default:
      return false;
  }
}

function handleConfiguredShortcut(e) {
  const sc = formatShortcutEvent(e);
  if (!sc) return false;
  const entry = Object.entries(shortcutBindings).find(([, value]) => normalizeShortcutString(value) === sc);
  if (!entry) return false;
  e.preventDefault();
  return triggerShortcutAction(entry[0]);
}

async function runExportAction(buttonEl, job) {
  if (currentExportAbortController) {
    els.status.textContent = 'Er loopt al een export.';
    return;
  }
  const ac = new AbortController();
  currentExportAbortController = ac;
  setExportUiState(true, buttonEl);
  try {
    await runWithBusyOverlay('Deze actie kan lang duren! Wees geduldig!', async ({ setMessage, setProgress }) => {
      await job(ac.signal, { setMessage, setProgress });
    }, { progress: 8 });
  } catch (e) {
    if (ac.signal.aborted) {
      els.status.textContent = 'Export gestopt.';
      return;
    }
    throw e;
  } finally {
    if (currentExportAbortController === ac) currentExportAbortController = null;
    setExportUiState(false);
  }
}

async function exportOne(signal, progressUi) {
  if (!workCanvas || (!loadedAudioState && currentIndex < 0)) {
    els.status.textContent = 'Geen bron geladen om te exporteren.';
    return;
  }
  throwIfExportCancelled(signal);
  progressUi?.setMessage('Audio voorbereiden…', 18);
  const usingLoadedAudio = !!loadedAudioState;
  const loadedPreview = usingLoadedAudio ? getLoadedAudioEditedPreviewData() : null;
  const samples = usingLoadedAudio ? loadedPreview?.samples || new Float32Array(0) : runDecodeOnWorkCanvas().samples;
  if (samples.length < 2) {
    els.status.textContent = 'Export mislukt: geen audio.';
    return;
  }
  const sr = usingLoadedAudio ? (loadedAudioState?.sampleRate || 48000) : (Number(els.exportSr.value) || 48000);
  const fmt = getExportFormat();
  const encoded = encodeExportWav(samples, sr, { allowPcm16Fallback: true });
  const defaultBase = usingLoadedAudio
    ? basename(loadedAudioState.fileName).replace(/\.[^.]+$/, '') + '_edited'
    : basename(paths[currentIndex]).replace(/\.[^.]+$/, '') + '_optical';
  const filePath = await pickOrBuildExportPath(defaultBase, fmt);
  if (!filePath) return;
  try {
    throwIfExportCancelled(signal);
    els.status.textContent = `Audio exporteren naar: ${filePath}`;
    progressUi?.setMessage('Audio schrijven…', 72);
    await writeAudioFile(filePath, encoded.buffer, fmt);
  } catch (e) {
    els.status.textContent = e.message || String(e);
    return;
  }
  throwIfExportCancelled(signal);
  progressUi?.setMessage('Metadata schrijven…', 92);
  const meta = usingLoadedAudio
    ? JSON.stringify({
        version: 1,
        exportFormat: fmt,
        sourceType: 'loaded-audio',
        sourceFile: loadedAudioState?.fileName || 'audio',
        sourceSampleRateHz: loadedAudioState?.sampleRate || sr,
        totalSamples: samples.length,
        durationSeconds: samples.length / sr,
        muteRegions: getMuteRegionsForPath(loadedAudioState?.sourceKey),
        editRegion: getEditRegionForPath(loadedAudioState?.sourceKey),
        editFadeMode: getEditFadeModeForPath(loadedAudioState?.sourceKey),
        editFadeMs: getEditFadeMsForPath(loadedAudioState?.sourceKey),
        limiterPeak: getLimiterPeakForPath(loadedAudioState?.sourceKey)
      }, null, 2)
    : buildMetaJson(paths[currentIndex], samples.length, sr, fmt);
  const metaPath = filePath.replace(/\.(wav|mp3)$/i, '') + '-sync.json';
  await window.osdApi.writeTextFile(metaPath, meta);
  setLastExportPath(filePath);
  await maybeOpenAudacityAfterExport();
  els.status.textContent = encoded.usedFallback
    ? `Opgeslagen als PCM16 WAV: ${filePath}`
    : `Opgeslagen: ${filePath}`;
  els.metaHint.textContent = `${encoded.encodingLabel} · ${samples.length} monsters @ ${sr} Hz`;
  scheduleSaveSession();
}

/**
 * @param {string} filePath
 * @param {'wav'|'mp3'} fmt
 * @param {number[]} pathIndices — indices in `paths`
 */
async function exportMergedStripsToPath(filePath, fmt, pathIndices, signal, progressUi, outputBaseName = null) {
  if (pathIndices.length === 0) return;
  prepareSequentialScanState(pathIndices);
  const p = readParams();
  const sr = p.exportSampleRate;
  const joinMuteSamples = Math.max(0, Math.round((readJoinMuteMs() / 1000) * sr));
  const joinFadeSamples = Math.max(0, Math.round((readJoinFadeMs() / 1000) * sr));
  const joinDePopStrength = readJoinDePopStrength();
  const chunks = [];
  let total = 0;
  const orderedPaths = [];
  for (let step = 0; step < pathIndices.length; step++) {
    throwIfExportCancelled(signal);
    const i = pathIndices[step];
    if (i < 0 || i >= paths.length) continue;
    els.status.textContent = `Decoderen ${step + 1}/${pathIndices.length}…`;
    progressUi?.setMessage(`Export voorbereiden ${step + 1}/${pathIndices.length}…`, 10 + ((step + 1) / pathIndices.length) * 62);
    let r;
    try {
      r = await decodePathToFloat(paths[i], { normalize: false });
    } catch {
      continue;
    }
    if (r.samples.length > 0) {
      chunks.push(r.samples);
      total += r.samples.length;
      orderedPaths.push(paths[i]);
    }
  }
  if (chunks.length === 0) {
    els.status.textContent = 'Geen audio om te exporteren.';
    return;
  }
  if (joinMuteSamples > 0 && chunks.length > 1) {
    total += joinMuteSamples * (chunks.length - 1);
  }
  throwIfExportCancelled(signal);
  progressUi?.setMessage('Audio samenvoegen…', 78);
  let merged = new Float32Array(total);
  let off = 0;
  for (let idx = 0; idx < chunks.length; idx++) {
    const c = applyJoinDePopToChunk(chunks[idx], sr, joinDePopStrength, idx > 0, idx < chunks.length - 1);
    throwIfExportCancelled(signal);
    const fadeOutSamples = idx < chunks.length - 1 ? joinFadeSamples : 0;
    const fadeInSamples = idx > 0 ? joinFadeSamples : 0;
    copyChunkWithEdgeFades(merged, off, c, fadeOutSamples, fadeInSamples);
    off += c.length;
    if (joinMuteSamples > 0 && idx < chunks.length - 1) {
      off += joinMuteSamples;
    }
  }
  if (p.normalize) {
    merged = normalizePeak(merged, 0.98);
  }
  let encoded;
  try {
    encoded = encodeExportWav(merged, sr, { allowPcm16Fallback: true });
  } catch (e) {
    els.status.textContent = e.message || String(e);
    return;
  }
  let actualFilePath = filePath;
  try {
    throwIfExportCancelled(signal);
    progressUi?.setMessage('Samengevoegde audio schrijven…', 88);
    if (outputBaseName) {
      els.status.textContent = `Samengevoegde audio exporteren naar uitvoermap: ${outputFolderPath}`;
      actualFilePath = await writeAudioFileToOutputFolder(outputBaseName, encoded.buffer, fmt);
    } else {
      els.status.textContent = `Samengevoegde audio exporteren naar: ${filePath}`;
      await writeAudioFile(filePath, encoded.buffer, fmt);
    }
  } catch (e) {
    els.status.textContent = e.message || String(e);
    return;
  }
  throwIfExportCancelled(signal);
  progressUi?.setMessage('Metadata schrijven…', 96);
  const metaObj = {
    version: 2,
    exportFormat: fmt,
    decodeMode: p.decodeMode,
    opticalEqPreset: p.opticalEqPreset,
    deClickStrength: p.deClickStrength,
    joinMuteMs: readJoinMuteMs(),
    joinFadeMs: readJoinFadeMs(),
    joinDePopStrength,
    rotationDegByFile: Object.fromEntries(orderedPaths.map((path) => [path, getRotation(path) ?? null])),
    decodeRegionFracByFile: Object.fromEntries(
      orderedPaths.map((path) => [path, clampRegionFrac(getRegionForPath(path))])
    ),
    decodeModeByFile: Object.fromEntries(
      orderedPaths.map((path) => [path, ensureScanState(path).decodeMode || 'density'])
    ),
    exportSampleRateHz: sr,
    filmFps: p.filmFps,
    framesPerStripAssumed: p.frames,
    stripCount: chunks.length,
    totalSamples: merged.length,
    durationSeconds: merged.length / sr,
    sourceFilesOrdered: orderedPaths.slice(),
    outputGain: p.outputGain,
    muteFadeMs: readMuteFadeMs(),
    muteRegionsByFile: Object.fromEntries(
      orderedPaths.map((path) => [path, getMuteRegionsForPath(path)])
    ),
    editRegionByFile: Object.fromEntries(orderedPaths.map((path) => [path, getEditRegionForPath(path)])),
    editFadeModeByFile: Object.fromEntries(orderedPaths.map((path) => [path, getEditFadeModeForPath(path)])),
    editFadeMsByFile: Object.fromEntries(orderedPaths.map((path) => [path, getEditFadeMsForPath(path)])),
    limiterPeakByFile: Object.fromEntries(orderedPaths.map((path) => [path, getLimiterPeakForPath(path)])),
    note: joinMuteSamples > 0
      ? `Duur per strip = frames/fps; strips achter elkaar geplakt met ${readJoinMuteMs()} ms stilte, ${readJoinFadeMs()} ms fade en join de-pop ${joinDePopStrength}.`
      : joinFadeSamples > 0
        ? `Duur per strip = frames/fps; strips achter elkaar geplakt met ${readJoinFadeMs()} ms fade en join de-pop ${joinDePopStrength}.`
        : joinDePopStrength !== 'off'
          ? `Duur per strip = frames/fps; strips achter elkaar geplakt met join de-pop ${joinDePopStrength}.`
          : 'Duur per strip = frames/fps; strips achter elkaar geplakt zonder extra overgangsbewerking.'
  };
  await window.osdApi.writeTextFile(actualFilePath.replace(/\.(wav|mp3)$/i, '') + '-sync.json', JSON.stringify(metaObj, null, 2));
  setLastExportPath(actualFilePath);
  await maybeOpenAudacityAfterExport();
  if (outputBaseName && outputFolderPath) {
    await window.osdApi.openFolder(outputFolderPath);
  }
  els.status.textContent = encoded.usedFallback
    ? `Samengevoegd opgeslagen als PCM16 WAV: ${actualFilePath} (${chunks.length} strips)`
    : `Samengevoegd opgeslagen: ${actualFilePath} (${chunks.length} strips)`;
  els.metaHint.textContent = `${encoded.encodingLabel} · Totaal ${merged.length} monsters @ ${sr} Hz · Bestand: ${actualFilePath}`;
  scheduleSaveSession();
}

async function exportAllToPath(filePath, fmt, signal, progressUi) {
  if (paths.length === 0) {
    els.status.textContent = 'Geen linten om te exporteren.';
    return;
  }
  const pathIndices = paths.map((_, i) => i);
  await exportMergedStripsToPath(filePath, fmt, pathIndices, signal, progressUi);
}

async function exportAllDialog(signal, progressUi) {
  const fmt = getExportFormat();
  const filePath = await pickOrBuildExportPath('optical-track-all-strips', fmt);
  if (!filePath) return;
  await exportAllToPath(filePath, fmt, signal, progressUi);
}

async function exportMergeToOutputFolder(signal, progressUi) {
  if (!outputFolderPath) {
    els.status.textContent = 'Kies eerst een uitvoermap.';
    return;
  }
  const fmt = getExportFormat();
  const baseName = getExportBaseName('optical-merged');
  els.status.textContent = `Schrijftest naar uitvoermap: ${outputFolderPath}`;
  await exportMergedStripsToPath(null, fmt, paths.map((_, i) => i), signal, progressUi, baseName);
}

async function exportSelectionMergedDialog(signal, progressUi) {
  let indices =
    fileListSelection.size > 0 ? [...fileListSelection].sort((a, b) => a - b) : [];
  if (indices.length === 0) {
    if (currentIndex >= 0) indices = [currentIndex];
    else {
      els.status.textContent =
        'Geen selectie: Shift+klik (bereik) of Ctrl+klik op de lijst, of open eerst een lint.';
      return;
    }
  }
  const fmt = getExportFormat();
  const filePath = await pickOrBuildExportPath(`optical-track-${indices.length}-strips`, fmt);
  if (!filePath) return;
  await exportMergedStripsToPath(filePath, fmt, indices, signal, progressUi);
}

async function exportSelectionMergedToOutputFolder(signal, progressUi) {
  if (!outputFolderPath) {
    els.status.textContent = 'Kies eerst een uitvoermap.';
    return;
  }
  let indices =
    fileListSelection.size > 0 ? [...fileListSelection].sort((a, b) => a - b) : [];
  if (indices.length === 0) {
    if (currentIndex >= 0) indices = [currentIndex];
    else {
      els.status.textContent =
        'Geen selectie: Shift+klik (bereik) of Ctrl+klik op de lijst, of open eerst een lint.';
      return;
    }
  }
  const fmt = getExportFormat();
  const baseName = getExportBaseName(`optical-track-${indices.length}-strips`);
  els.status.textContent = `Schrijftest naar uitvoermap: ${outputFolderPath}`;
  await exportMergedStripsToPath(null, fmt, indices, signal, progressUi, baseName);
}

async function applyBatchRotation() {
  const deg = Number(els.selBatchRotation?.value);
  if (!Number.isFinite(deg)) return;
  const r = ((((deg % 360) + 360) % 360));
  const idxs = getBatchPathIndices();
  if (idxs.length === 0) {
    els.status.textContent = 'Geen linten (selectie leeg: kies “Alle linten” of selecteer in de lijst).';
    return;
  }
  await runWithBusyOverlay('Deze actie kan lang duren! Wees geduldig!', async ({ setMessage }) => {
    setMessage(`Rotatie toepassen op ${idxs.length} lint(en)…`, 30);
    for (const i of idxs) {
      setRotation(paths[i], r);
    }
    renderFileList({ scrollToCurrent: false });
    syncPerLintPanelsFromPath(getPerLintUiPath());
    if (currentIndex >= 0 && idxs.includes(currentIndex) && currentImage) {
      cachedPreview = null;
      stopPreviewPlayback();
      setMessage('Voorbeeld opnieuw opbouwen…', 72);
      rebuildWorkCanvas();
      syncSlidersFromBand();
    }
    scheduleSaveSession();
  });
  els.status.textContent = `Rotatie ${r}° op ${idxs.length} lint(en).`;
}

async function applyBatchMirrorToggle(axis) {
  const idxs = getBatchPathIndices();
  if (idxs.length === 0) {
    els.status.textContent = 'Geen linten.';
    return;
  }
  await runWithBusyOverlay('Deze actie kan lang duren! Wees geduldig!', async ({ setMessage }) => {
    setMessage(`Spiegeling toepassen op ${idxs.length} lint(en)…`, 30);
    for (const i of idxs) {
      const st = ensureScanState(paths[i]);
      if (axis === 'h') st.mirrorH = !st.mirrorH;
      else st.mirrorV = !st.mirrorV;
    }
    renderFileList({ scrollToCurrent: false });
    syncMirrorButtonsFromPath(getPerLintUiPath());
    if (currentIndex >= 0 && idxs.includes(currentIndex) && currentImage) {
      cachedPreview = null;
      stopPreviewPlayback();
      setMessage('Voorbeeld opnieuw opbouwen…', 72);
      rebuildWorkCanvas();
    }
    scheduleSaveSession();
  });
  els.status.textContent = `Spiegel ${axis === 'h' ? 'horizontaal' : 'verticaal'} om op ${idxs.length} lint(en).`;
}

async function applyBatchSuggestRotation() {
  const idxs = getBatchPathIndices();
  if (idxs.length === 0) {
    els.status.textContent = 'Geen linten.';
    return;
  }
  await runWithBusyOverlay('Deze actie kan lang duren! Wees geduldig!', async ({ setMessage, setProgress }) => {
    for (let step = 0; step < idxs.length; step++) {
      const i = idxs[step];
      const path = paths[i];
      const pct = ((step + 1) / idxs.length) * 100;
      setMessage(`Auto-rotatie ${step + 1}/${idxs.length}…`, pct);
      els.status.textContent = `Auto-rotatie ${step + 1}/${idxs.length}…`;
      try {
        const url = await window.osdApi.fileToUrl(path);
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('load'));
          img.src = url;
        });
        setRotation(path, suggestRotationDeg(img));
      } catch {
        /* volgende */
      }
      setProgress(pct);
    }
    renderFileList({ scrollToCurrent: false });
    syncPerLintPanelsFromPath(getPerLintUiPath());
    if (currentIndex >= 0 && idxs.includes(currentIndex) && currentImage) {
      cachedPreview = null;
      stopPreviewPlayback();
      setMessage('Voorbeeld opnieuw opbouwen…', 96);
      rebuildWorkCanvas();
      syncSlidersFromBand();
    }
    scheduleSaveSession();
  });
  els.status.textContent = `Auto-rotatie toegepast op ${idxs.length} lint(en).`;
}

function buildMetaJson(singlePath, numSamples, sr, exportFmt) {
  const p = readParams();
  const reg = clampRegionFrac(getRegionForPath(singlePath));
  const rotMeta = getRotation(singlePath) ?? 0;
  const stM = scanStateByPath.get(singlePath);
  return JSON.stringify(
    {
      version: 2,
      exportFormat: exportFmt || 'wav',
      sourceFile: singlePath,
      rotationDeg: getRotation(singlePath) ?? null,
      mirrorH: !!stM?.mirrorH,
      mirrorV: !!stM?.mirrorV,
      fineRotationDeg: clampFineRotationDeg(stM?.fineRotationDeg),
      decodeTimeAlongAxis: decodeTimeAlongAxis(rotMeta),
      decodeMode: p.decodeMode,
      opticalEqPreset: p.opticalEqPreset,
      deClickStrength: p.deClickStrength,
      joinMuteMs: readJoinMuteMs(),
      joinFadeMs: readJoinFadeMs(),
      joinDePopStrength: readJoinDePopStrength(),
      outputGain: p.outputGain,
      decodeRegionFrac: reg,
      workCanvasCappedToMaxSide: !!workCanvas?._osdCapped,
      workCanvasLogicalPx:
        workCanvas?._osdLogicalCw && workCanvas?._osdLogicalCh
          ? { w: workCanvas._osdLogicalCw, h: workCanvas._osdLogicalCh }
          : null,
      exportSampleRateHz: sr,
      filmFps: p.filmFps,
      framesOnStrip: p.frames,
      durationFilmSeconds: p.frames / p.filmFps,
      totalSamples: numSamples,
      durationWavSeconds: numSamples / sr,
      muteRegions: getMuteRegionsForPath(singlePath),
      muteFadeMs: readMuteFadeMs(),
      editRegion: getEditRegionForPath(singlePath),
      editFadeMode: getEditFadeModeForPath(singlePath),
      editFadeMs: getEditFadeMsForPath(singlePath),
      limiterPeak: getLimiterPeakForPath(singlePath)
    },
    null,
    2
  );
}

function onPointerDown(e) {
  if (!workCanvas) return;
  if (loadedAudioState) return;
  pushUndoSnapshotForCurrentLint();
  const vc = els.viewCanvas;
  const rect = vc.getBoundingClientRect();
  const vx = (e.clientX - rect.left) * (vc.width / rect.width);
  const vy = (e.clientY - rect.top) * (vc.height / rect.height);
  const layout = computeViewBandLayout();
  if (layout) {
    const tol = 9;
    if (decodeTimeAlongFromUI() === 'y') {
      const yEnd = layout.py0 + layout.ph;
      if (Math.abs(vy - layout.py0) <= tol) {
        vc.setPointerCapture(e.pointerId);
        drag = { kind: 'trimY', edge: 'y0' };
        return;
      }
      if (Math.abs(vy - yEnd) <= tol) {
        vc.setPointerCapture(e.pointerId);
        drag = { kind: 'trimY', edge: 'y1' };
        return;
      }
    } else {
      const xEnd = layout.px0 + layout.pw;
      if (Math.abs(vx - layout.px0) <= tol) {
        vc.setPointerCapture(e.pointerId);
        drag = { kind: 'trimX', edge: 'x0' };
        return;
      }
      if (Math.abs(vx - xEnd) <= tol) {
        vc.setPointerCapture(e.pointerId);
        drag = { kind: 'trimX', edge: 'x1' };
        return;
      }
    }
  }
  const { wx, wy } = viewToWork(vx, vy);
  vc.setPointerCapture(e.pointerId);
  drag = { kind: 'rect', x0: wx, y0: wy, x1: wx, y1: wy };
}

function onPointerMove(e) {
  if (!drag || !workCanvas) return;
  const vc = els.viewCanvas;
  const rect = vc.getBoundingClientRect();
  const vx = (e.clientX - rect.left) * (vc.width / rect.width);
  const vy = (e.clientY - rect.top) * (vc.height / rect.height);
  const { wx, wy } = viewToWork(vx, vy);
  if (drag.kind === 'trimY') {
    const fy = wy / workCanvas.height;
    if (drag.edge === 'y0') {
      bandFrac = clampRegionFrac({ ...bandFrac, y0: fy });
    } else {
      bandFrac = clampRegionFrac({ ...bandFrac, y1: fy });
    }
    syncSlidersFromBand();
    cachedPreview = null;
    drawView();
    return;
  }
  if (drag.kind === 'trimX') {
    const fx = wx / workCanvas.width;
    if (drag.edge === 'x0') {
      bandFrac = clampRegionFrac({ ...bandFrac, x0: fx });
    } else {
      bandFrac = clampRegionFrac({ ...bandFrac, x1: fx });
    }
    syncSlidersFromBand();
    cachedPreview = null;
    drawView();
    return;
  }
  drag.x1 = wx;
  drag.y1 = wy;
  setBandFromWorkPixels(drag.x0, drag.y0, drag.x1, drag.y1);
  drawView();
}

function onPointerUp() {
  if (drag) {
    persistRegionForCurrent();
  }
  drag = null;
}

function updateOutputFolderLabel() {
  if (els.lblOutputFolder) {
    els.lblOutputFolder.textContent = outputFolderPath || '—';
  }
  if (els.btnOpenOutputFolder) {
    els.btnOpenOutputFolder.disabled = !outputFolderPath;
  }
}

async function refreshTemplateSelect() {
  const list = await window.osdApi.loadTemplates();
  const sel = els.selTemplate;
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Template —</option>';
  for (const t of list) {
    if (!t.id || !t.name) continue;
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    sel.appendChild(opt);
  }
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

async function refreshJoinPresetSelect() {
  const list = (await window.osdApi.loadTemplates()).filter((x) => x.kind === 'join-transition');
  const sel = els.selJoinPreset;
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Overgangspreset —</option>';
  for (const t of list) {
    if (!t.id || !t.name) continue;
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    sel.appendChild(opt);
  }
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

async function saveCurrentTemplate() {
  const name = (els.inpTemplateName?.value || '').trim();
  if (!name) {
    els.status.textContent = 'Geef een templatenaam in.';
    return;
  }
  const list = await window.osdApi.loadTemplates();
  const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  list.push({
    id,
    name,
    created: new Date().toISOString(),
    global: readGlobalForSave()
  });
  await window.osdApi.saveTemplates(list);
  els.inpTemplateName.value = '';
  await refreshTemplateSelect();
  await refreshJoinPresetSelect();
  els.selTemplate.value = id;
  els.status.textContent = `Template opgeslagen: ${name}`;
}

async function saveJoinPreset() {
  const name = (els.inpJoinPresetName?.value || '').trim();
  if (!name) {
    els.status.textContent = 'Geef een naam in voor de overgangspreset.';
    return;
  }
  const list = await window.osdApi.loadTemplates();
  const id = `jp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  list.push({
    id,
    kind: 'join-transition',
    name,
    created: new Date().toISOString(),
    values: readJoinPresetPayload()
  });
  await window.osdApi.saveTemplates(list);
  if (els.inpJoinPresetName) els.inpJoinPresetName.value = '';
  await refreshJoinPresetSelect();
  if (els.selJoinPreset) els.selJoinPreset.value = id;
  els.status.textContent = `Overgangspreset opgeslagen: ${name}`;
}

async function loadSelectedTemplate() {
  const id = els.selTemplate?.value;
  if (!id) return;
  const list = await window.osdApi.loadTemplates();
  const t = list.find((x) => x.id === id);
  if (!t?.global) return;
  applyGlobalSettings(t.global);
  if (paths[currentIndex]) {
    const st = ensureScanState(paths[currentIndex]);
    st.decodeMode = t.global.decodeMode === 'area' ? 'area' : 'density';
    els.decodeMode.value = st.decodeMode;
  }
  rebuildWorkCanvas();
  scheduleSaveSession();
  els.status.textContent = `Template geladen: ${t.name}`;
}

async function loadJoinPreset() {
  const id = els.selJoinPreset?.value;
  if (!id) return;
  const list = await window.osdApi.loadTemplates();
  const t = list.find((x) => x.id === id && x.kind === 'join-transition');
  if (!t?.values) return;
  if (els.joinMuteMs) els.joinMuteMs.value = String(Math.max(0, Math.min(100, Math.round(Number(t.values.joinMuteMs) || 0))));
  if (els.joinFadeMs) els.joinFadeMs.value = String(Math.max(0, Math.min(100, Math.round(Number(t.values.joinFadeMs) || 0))));
  if (['off', 'light', 'medium', 'strong', 'extreme'].includes(t.values.joinDePopStrength) && els.joinDePop) {
    els.joinDePop.value = t.values.joinDePopStrength;
  }
  setJoinPresetButtonsActive();
  scheduleSaveSession();
  els.status.textContent = `Overgangspreset geladen: ${t.name}`;
}

async function deleteSelectedTemplate() {
  const id = els.selTemplate?.value;
  if (!id) return;
  const list = (await window.osdApi.loadTemplates()).filter((x) => x.id !== id);
  await window.osdApi.saveTemplates(list);
  await refreshTemplateSelect();
  els.status.textContent = 'Template gewist.';
}

async function deleteJoinPreset() {
  const id = els.selJoinPreset?.value;
  if (!id) return;
  const list = (await window.osdApi.loadTemplates()).filter((x) => x.id !== id);
  await window.osdApi.saveTemplates(list);
  await refreshJoinPresetSelect();
  els.status.textContent = 'Overgangspreset gewist.';
}

async function pickAudacityExecutable() {
  const picked = await window.osdApi.selectAudacityExecutable();
  if (!picked) return;
  audacityPath = picked;
  updateAudacityUi();
  scheduleSaveSession();
  els.status.textContent = `Audacity ingesteld: ${picked}`;
}

async function openLastExportInAudacity() {
  const audioFilePath = typeof els.inpLastExportPath?.value === 'string' ? els.inpLastExportPath.value : '';
  if (!audacityPath) {
    els.status.textContent = 'Kies eerst het pad naar Audacity.';
    return;
  }
  if (!audioFilePath || audioFilePath === '—') {
    els.status.textContent = 'Er is nog geen geëxporteerd audiobestand.';
    return;
  }
  const res = await window.osdApi.openInAudacity({ audacityPath, audioFilePath });
  if (!res?.ok) {
    els.status.textContent = res?.error || 'Openen in Audacity mislukt.';
    return;
  }
  els.status.textContent = `Geopend in Audacity: ${audioFilePath}`;
}

async function maybeOpenAudacityAfterExport() {
  if (!els.inpOpenAudacityAfterExport?.checked) return;
  if (!audacityPath) return;
  const audioFilePath = typeof els.inpLastExportPath?.value === 'string' ? els.inpLastExportPath.value : '';
  if (!audioFilePath || audioFilePath === '—') return;
  const res = await window.osdApi.openInAudacity({ audacityPath, audioFilePath });
  if (!res?.ok) {
    els.status.textContent = res?.error || 'Automatisch openen in Audacity mislukt.';
  }
}

$('btn-pick-files').addEventListener('click', async () => {
  const list = await window.osdApi.selectImages();
  if (list?.length) {
    beginPathSetLoad(list, 'Afbeeldingen laden');
  } else {
    paths = [];
    currentIndex = -1;
    currentImage = null;
    workCanvas = null;
    cachedPreview = null;
    fileListSelection.clear();
    fileListShiftAnchor = -1;
    syncMirrorButtonsFromState();
    syncFineRotUIFromState();
    renderFileList({ scrollToCurrent: false });
    updateInfoPanel();
  }
});

$('btn-pick-folder').addEventListener('click', async () => {
  const folder = await window.osdApi.selectFolder();
  if (!folder) return;
  els.status.textContent = 'Map scannen…';
  const list = await window.osdApi.listFolderImages(folder);
  if (list?.length) {
    beginPathSetLoad(list, 'Map laden');
  } else {
    els.status.textContent = 'Geen beelden in deze map.';
    paths = [];
    currentIndex = -1;
    currentImage = null;
    workCanvas = null;
    cachedPreview = null;
    fileListSelection.clear();
    fileListShiftAnchor = -1;
    syncMirrorButtonsFromState();
    syncFineRotUIFromState();
    renderFileList({ scrollToCurrent: false });
    updateInfoPanel();
  }
});

$('btn-pick-output-folder').addEventListener('click', async () => {
  const f = await window.osdApi.selectOutputFolder();
  if (f) {
    outputFolderPath = f;
    updateOutputFolderLabel();
    scheduleSaveSession();
  }
});
$('btn-open-output-folder')?.addEventListener('click', async () => {
  if (!outputFolderPath) {
    els.status.textContent = 'Kies eerst een uitvoermap.';
    return;
  }
  const r = await window.osdApi.openFolder(outputFolderPath);
  if (!r?.ok) {
    els.status.textContent = r?.error || 'Uitvoermap openen mislukt.';
    return;
  }
  els.status.textContent = `Uitvoermap geopend: ${outputFolderPath}`;
});
$('btn-shortcuts')?.addEventListener('click', () => openShortcutsModal());
$('btn-shortcuts-close')?.addEventListener('click', () => closeShortcutsModal());
$('btn-shortcuts-reset')?.addEventListener('click', () => {
  shortcutBindings = { ...DEFAULT_SHORTCUTS };
  renderShortcutEditor();
  scheduleSaveSession();
});
els.shortcutsModal?.addEventListener('click', (e) => {
  if (e.target === els.shortcutsModal) closeShortcutsModal();
});

$('btn-select-all-files')?.addEventListener('click', () => selectAllFilesInList());
$('btn-clear-file-selection')?.addEventListener('click', () => clearFileSelection());

$('btn-goto').addEventListener('click', () => {
  const n = Math.max(1, Math.min(paths.length, Number(els.inpGoto?.value) || 1));
  loadPathAt(n - 1).catch(console.error);
});

$('btn-template-save').addEventListener('click', () => saveCurrentTemplate().catch(console.error));
$('btn-template-load').addEventListener('click', () => loadSelectedTemplate().catch(console.error));
$('btn-template-delete').addEventListener('click', () => deleteSelectedTemplate().catch(console.error));
els.btnJoinPresetSave?.addEventListener('click', () => saveJoinPreset().catch(console.error));
els.btnJoinPresetLoad?.addEventListener('click', () => loadJoinPreset().catch(console.error));
els.btnJoinPresetDelete?.addEventListener('click', () => deleteJoinPreset().catch(console.error));
els.btnPickAudacity?.addEventListener('click', () => pickAudacityExecutable().catch(console.error));
els.btnOpenInAudacity?.addEventListener('click', () => openLastExportInAudacity().catch(console.error));
els.inpOpenAudacityAfterExport?.addEventListener('change', () => {
  updateAudacityUi();
  scheduleSaveSession();
});

els.rotation.addEventListener('change', () => {
  const targets = getPerLintEditTargets();
  if (targets.length === 0) return;
  if (targetsIncludeCurrentLoaded(targets)) pushUndoSnapshotForCurrentLint();
  const deg = Number(els.rotation.value) || 0;
  for (const i of targets) {
    setRotation(paths[i], deg);
  }
  renderFileList({ scrollToCurrent: false });
  scheduleSaveSession();
  if (targetsIncludeCurrentLoaded(targets)) {
    cachedPreview = null;
    stopPreviewPlayback();
    rebuildWorkCanvas();
    syncSlidersFromBand();
  } else {
    els.status.textContent =
      targets.length > 1
        ? `Rotatie ${deg}° op ${targets.length} linten (niet in beeld).`
        : `Rotatie ${deg}° opgeslagen (lint niet geladen).`;
  }
});

function toggleMirror(axis) {
  const targets = getPerLintEditTargets();
  if (targets.length === 0) return;
  if (targetsIncludeCurrentLoaded(targets)) pushUndoSnapshotForCurrentLint();
  for (const i of targets) {
    const st = ensureScanState(paths[i]);
    if (axis === 'h') st.mirrorH = !st.mirrorH;
    else st.mirrorV = !st.mirrorV;
  }
  renderFileList({ scrollToCurrent: false });
  scheduleSaveSession();
  syncMirrorButtonsFromPath(getPerLintUiPath());
  if (targetsIncludeCurrentLoaded(targets)) {
    cachedPreview = null;
    stopPreviewPlayback();
    rebuildWorkCanvas();
  } else {
    els.status.textContent =
      targets.length > 1
        ? `Spiegeling op ${targets.length} linten (niet in beeld).`
        : `Spiegeling opgeslagen (lint niet geladen).`;
  }
}

els.btnMirrorH?.addEventListener('click', () => toggleMirror('h'));
els.btnMirrorV?.addEventListener('click', () => toggleMirror('v'));

els.rngFineRot?.addEventListener('input', () => applyFineRotFromUI());
els.btnFineRotMinus?.addEventListener('click', () => nudgeFineRot(-0.05));
els.btnFineRotPlus?.addEventListener('click', () => nudgeFineRot(0.05));

els.decodeMode.addEventListener('change', () => {
  const targets = getPerLintEditTargets();
  const dm = els.decodeMode.value === 'area' ? 'area' : 'density';
  if (targets.length > 0) {
    if (targetsIncludeCurrentLoaded(targets)) pushUndoSnapshotForCurrentLint();
    for (const i of targets) {
      ensureScanState(paths[i]).decodeMode = dm;
    }
    renderFileList({ scrollToCurrent: false });
    scheduleSaveSession();
    if (!targetsIncludeCurrentLoaded(targets)) {
      els.status.textContent =
        targets.length > 1
          ? `Decodemodus op ${targets.length} linten (niet in beeld).`
          : `Decodemodus opgeslagen (lint niet geladen).`;
    }
  }
  updateInfoPanel();
});

els.selZoom?.addEventListener('change', () => {
  drawView();
  scheduleSaveSession();
});

$('btn-prev-scan')?.addEventListener('click', () => goPrevScan());
$('btn-next-scan')?.addEventListener('click', () => goNextScan());
$('btn-scroll-begin')?.addEventListener('click', () => scrollStripBegin());
$('btn-scroll-middle')?.addEventListener('click', () => scrollStripMiddle());
$('btn-scroll-end')?.addEventListener('click', () => scrollStripEnd());

window.addEventListener('keydown', (e) => {
  if (!els.shortcutsModal?.classList.contains('modal-overlay--hidden')) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeShortcutsModal();
    }
    return;
  }
  if (isTypingTarget(e.target)) return;
  if (handleConfiguredShortcut(e)) return;
  if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    if (e.key === 'ArrowLeft') goPrevScan();
    else goNextScan();
    return;
  }
  if (
    e.key === 'ArrowLeft' ||
    e.key === 'ArrowRight' ||
    e.key === 'ArrowUp' ||
    e.key === 'ArrowDown'
  ) {
    if (nudgeGreenBandByArrow(e.key, e.shiftKey)) {
      e.preventDefault();
    }
  }
});

if (els.status && els.statusExport) {
  syncDuplicateStatus();
  const statusObserver = new MutationObserver(() => syncDuplicateStatus());
  statusObserver.observe(els.status, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
}

['inp-frames', 'inp-fps'].forEach((id) => {
  $(id)?.addEventListener('change', () => {
    updateInfoPanel();
    scheduleSaveSession();
  });
});

els.appFontSize?.addEventListener('change', () => {
  applyAppFontSize(els.appFontSize.value);
  scheduleSaveSession();
});
els.btnAppFontDown?.addEventListener('click', () => adjustAppFontSize(-1));
els.btnAppFontUp?.addEventListener('click', () => adjustAppFontSize(1));

[
  'inp-invert',
  'inp-hp',
  'inp-export-sr',
  'inp-export-format',
  'inp-optical-eq',
  'inp-declick',
  'inp-join-mute-ms',
  'inp-join-fade-ms',
  'inp-join-depop',
  'inp-export-name',
  'inp-smooth',
  'inp-normalize'
].forEach((id) => {
  $(id)?.addEventListener('change', () => {
    if (id === 'inp-join-mute-ms' || id === 'inp-join-fade-ms') setJoinPresetButtonsActive();
    scheduleSaveSession();
  });
});

els.inpMuteFadeMs?.addEventListener('change', () => {
  if (els.inpMuteFadeMs) els.inpMuteFadeMs.value = String(clampMuteFadeMs(els.inpMuteFadeMs.value));
  const p = currentEditablePath();
  if (p && getEditRegionForPath(p)) {
    ensureScanState(p).editFadeMs = readMuteFadeMs();
  }
  scheduleSaveSession();
  refreshPreviewAfterMuteEdit();
});
els.btnMuteFadeDown?.addEventListener('click', () => adjustMuteFadeStep(-5));
els.btnMuteFadeUp?.addEventListener('click', () => adjustMuteFadeStep(5));
els.inpMuteMarkMode?.addEventListener('change', () => {
  if (isMuteMarkMode() && els.inpEditMarkMode) els.inpEditMarkMode.checked = false;
  if (!isMuteMarkMode() && muteWaveDrag) {
    muteWaveDrag = null;
    drawView();
  }
  syncMuteWaveformPointerStyle();
  scheduleSaveSession();
});
els.inpEditMarkMode?.addEventListener('change', () => {
  if (isEditMarkMode() && els.inpMuteMarkMode) els.inpMuteMarkMode.checked = false;
  if (!isEditMarkMode() && editWaveDrag) {
    editWaveDrag = null;
    drawView();
  }
  syncMuteWaveformPointerStyle();
});
els.btnMuteClearAll?.addEventListener('click', () => {
  const p = currentEditablePath();
  if (!p) return;
  pushUndoSnapshotForCurrentLint();
  ensureScanState(p).muteRegions = [];
  refreshPreviewAfterMuteEdit();
});
els.btnEditUndo?.addEventListener('click', () => undoCurrentLintEdit());
els.btnEditRedo?.addEventListener('click', () => redoCurrentLintEdit());
els.btnEditResetLint?.addEventListener('click', () => resetCurrentLintState());
els.btnEditResetAll?.addEventListener('click', () => resetAllLintEdits());
els.btnEditFadeIn?.addEventListener('click', () => setEditFadeMode('in'));
els.btnEditFadeOut?.addEventListener('click', () => setEditFadeMode('out'));
els.btnEditFadeBoth?.addEventListener('click', () => setEditFadeMode('both'));
els.btnEditFadeToggle?.addEventListener('click', () => toggleEditFadeEnabled());
els.btnEditLimiterApply?.addEventListener('click', () => applyLimiterToEditZone());
els.inpEditLimiterPeak?.addEventListener('change', () => {
  if (els.inpEditLimiterPeak) els.inpEditLimiterPeak.value = String(readLimiterPeak());
});
els.btnEditClearZone?.addEventListener('click', () => {
  if (!currentEditablePath()) return;
  withCurrentLintEdit((st) => {
    st.editRegion = undefined;
    st.editFadeMode = 'off';
  }, 'Bewerkingszone gewist.');
});

const wfc = els.waveformCanvas;
wfc?.addEventListener('pointerdown', onMuteWavePointerDown);
wfc?.addEventListener('pointermove', onMuteWavePointerMove);
wfc?.addEventListener('pointerup', onMuteWavePointerUp);
wfc?.addEventListener('pointercancel', () => {
  if (editWaveDrag) {
    editWaveDrag = null;
    drawView();
  }
  if (muteWaveDrag) {
    muteWaveDrag = null;
    drawView();
  }
});

els.rngOutputGain?.addEventListener('input', () => {
  updateOutputGainLabel();
  scheduleSaveSession();
});

$('btn-decode-preview').addEventListener('click', () => playPreview().catch(console.error));
$('btn-preview-queue')?.addEventListener('click', () => playPreviewQueue().catch(console.error));
$('btn-preview-stop')?.addEventListener('click', () => {
  stopPreviewPlayback();
  els.status.textContent = 'Afspelen gestopt.';
});
els.btnLoadAudio?.addEventListener('click', () => {
  els.inpAudioFile?.click();
});
els.btnJoinPresetSoft?.addEventListener('click', () => applyJoinTransitionPreset('soft'));
els.btnJoinPresetMedium?.addEventListener('click', () => applyJoinTransitionPreset('medium'));
els.btnJoinPresetStrong?.addEventListener('click', () => applyJoinTransitionPreset('strong'));
els.btnUnloadAudio?.addEventListener('click', () => unloadLoadedAudio());
els.btnJoinPrev?.addEventListener('click', () => stepJoinMarker(-1));
els.btnJoinNext?.addEventListener('click', () => stepJoinMarker(1));
els.inpAudioFile?.addEventListener('change', () => {
  const file = els.inpAudioFile?.files?.[0];
  if (!file) return;
  loadAudioFromFile(file).catch((e) => {
    els.status.textContent = e?.message || String(e);
  });
});
els.inpPreviewLoop?.addEventListener('change', () => scheduleSaveSession());

$('btn-export-selection')?.addEventListener('click', () =>
  runExportAction(els.btnExportSelection, (signal, progressUi) => exportSelectionMergedDialog(signal, progressUi)).catch((e) => {
    els.status.textContent = e?.message || String(e);
    console.error(e);
  })
);
$('btn-export-selection-folder')?.addEventListener('click', () =>
  runExportAction(els.btnExportSelectionFolder, (signal, progressUi) => exportSelectionMergedToOutputFolder(signal, progressUi)).catch((e) => {
    els.status.textContent = e?.message || String(e);
    console.error(e);
  })
);
$('btn-export-stop')?.addEventListener('click', () => {
  if (!currentExportAbortController) {
    els.status.textContent = 'Er loopt geen export.';
    return;
  }
  currentExportAbortController.abort();
  els.status.textContent = 'Export wordt gestopt…';
});
$('btn-busy-cancel')?.addEventListener('click', () => {
  if (!currentExportAbortController) {
    els.status.textContent = 'Er loopt geen export.';
    return;
  }
  currentExportAbortController.abort();
  els.status.textContent = 'Export wordt gestopt…';
});
$('btn-batch-rotation')?.addEventListener('click', () => applyBatchRotation());
$('btn-batch-mirror-h')?.addEventListener('click', () => applyBatchMirrorToggle('h'));
$('btn-batch-mirror-v')?.addEventListener('click', () => applyBatchMirrorToggle('v'));
$('btn-batch-suggest-rot')?.addEventListener('click', () => applyBatchSuggestRotation().catch(console.error));

els.rngPreviewGain?.addEventListener('input', () => {
  updatePreviewGainLabel();
  scheduleSaveSession();
  if (previewMonitorGainNode && audioCtx) {
    previewMonitorGainNode.gain.value = getPreviewMonitorGain();
  }
});
$('btn-export-one').addEventListener('click', () =>
  runExportAction(els.btnExportOne, (signal, progressUi) => exportOne(signal, progressUi)).catch((e) => {
    els.status.textContent = e?.message || String(e);
    console.error(e);
  })
);
$('btn-export-all').addEventListener('click', () =>
  runExportAction(els.btnExportAll, (signal, progressUi) => exportAllDialog(signal, progressUi)).catch((e) => {
    els.status.textContent = e?.message || String(e);
    console.error(e);
  })
);
$('btn-export-merge-folder').addEventListener('click', () =>
  runExportAction(els.btnExportMergeFolder, (signal, progressUi) => exportMergeToOutputFolder(signal, progressUi)).catch((e) => {
    els.status.textContent = e?.message || String(e);
    console.error(e);
  })
);

const vc = els.viewCanvas;
vc.addEventListener('pointerdown', (e) => {
  vc.setPointerCapture(e.pointerId);
  onPointerDown(e);
});
vc.addEventListener('pointermove', onPointerMove);
vc.addEventListener('pointerup', () => {
  onPointerUp();
});
vc.addEventListener('pointercancel', () => {
  onPointerUp();
});

window.addEventListener('resize', () => {
  drawView();
});

['rng-y-start', 'rng-y-end', 'rng-x-left', 'rng-x-right'].forEach((id) => {
  const el = $(id);
  if (el) {
    el.addEventListener('input', () => applySlidersToBand());
  }
});

$('btn-trim-y-full')?.addEventListener('click', () => {
  if (decodeTimeAlongFromUI() === 'x') {
    bandFrac = clampRegionFrac({ ...bandFrac, x0: 0, x1: 1 });
  } else {
    bandFrac = clampRegionFrac({ ...bandFrac, y0: 0, y1: 1 });
  }
  syncSlidersFromBand();
  persistRegionForCurrent();
  drawView();
});

$('btn-trim-x-default')?.addEventListener('click', () => {
  const d = defaultRegion();
  if (decodeTimeAlongFromUI() === 'x') {
    bandFrac = clampRegionFrac({
      x0: bandFrac.x0,
      x1: bandFrac.x1,
      y0: d.x0,
      y1: d.x1
    });
  } else {
    bandFrac = clampRegionFrac({ ...d, y0: bandFrac.y0, y1: bandFrac.y1 });
  }
  syncSlidersFromBand();
  persistRegionForCurrent();
  drawView();
});

async function boot() {
  try {
    const ver = await window.osdApi.getBuildVersion();
    const el = document.getElementById('osd-build-version');
    if (el && ver) el.textContent = ver;
  } catch (_) {}
  await refreshTemplateSelect();
  await restoreSession();
  updateOutputGainLabel();
  updatePreviewGainLabel();
  updateInfoPanel();
  renderMuteRegionList();
  renderEditRegionList();
  syncMuteWaveformPointerStyle();
}

boot().catch(console.error);
