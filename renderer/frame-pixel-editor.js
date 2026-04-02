/**
 * FRAME PIXEL EDITOR — stof/artifacts oververven op het actieve frame (overlay op strip, export/preview).
 */
import { getState, setDirty } from './state.js';
import { buildStripCanvasRawBase, buildPixelEditorExternalStripRaw, getStripCanvas } from './strip-loader.js';
import { getFrameCropRectInStripPx } from './grid.js';

const MAX_HISTORY = 24;

/** @type {HTMLCanvasElement|null} */
let canvasEl = null;
/** @type {HTMLElement|null} */
let viewportEl = null;
/** @type {HTMLElement|null} */
let brushRingEl = null;
/** @type {HTMLInputElement|null} */
let colorInput = null;
let brushRange = null;
let brushValSpan = null;
let featherChk = null;
let featherRange = null;
let eyedropperBtn = null;
/** @type {HTMLSelectElement|null} */
let zoomModeSelect = null;
/** @type {HTMLElement|null} */
let zoomPctWrap = null;
/** @type {HTMLInputElement|null} */
let zoomPctRange = null;
/** @type {HTMLElement|null} */
let zoomPctValSpan = null;
/** @type {ResizeObserver|null} */
let viewportResizeObserver = null;

/** @type {'fit' | 'width' | 'height' | 'percent'} */
let zoomMode = 'fit';
let zoomPercent = 100;

/** Offscreen: actieve cel zonder pixel-overlay (hergebruikt tijdens strepen). */
let baseCropCanvas = null;

let scaleRawPerPreview = 1;
let lastStripKey = '';

/** Undo per strip+frame (string key: extern pad of project-pad). */
/** @type {Map<string, { history: ImageData[]; ptr: number }>} */
const undoByPaintKey = new Map();

/** Verf op externe bestanden: absoluut pad → Map(frameIndex → overlay entry). */
const externalPaintByPath = new Map();

let eyedropperNext = false;
let painting = false;
let strokeDirty = false;

/** @type {'color' | 'underlying'} */
let paintBrushMode = 'color';
/** @type {'left' | 'right' | 'up' | 'down'} */
let sampleDirection = 'left';

/** @type {HTMLSelectElement|null} */
let brushModeSelect = null;
/** @type {HTMLSelectElement|null} */
let sampleDirSelect = null;
/** @type {HTMLElement|null} */
let sampleDirWrapEl = null;
let lastOx = 0;
let lastOy = 0;
let editorPointerInside = false;
let listenersAttached = false;

/** @type {(() => void) | null} */
let notifyChange = null;

/** Na overlay-wijziging op hoofdvenster (bridge): previews verversen + optioneel aux-venster. */
let afterOverlayMutatedOnMain = null;

function loadDataUrlAsImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = dataUrl;
  });
}

function parseHex(hex) {
  const s = String(hex || '').trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (!m) return { r: 128, g: 128, b: 128 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function stripKeyForState(raw) {
  const s = getState();
  if (s.pixelEditorExternalPath) {
    return `ext:${s.pixelEditorExternalPath}|${raw.width}x${raw.height}`;
  }
  const p = s.path || '';
  return `${p}|${raw.width}x${raw.height}`;
}

function paintHistoryKey(fi) {
  const s = getState();
  if (s.pixelEditorExternalPath) return `x\t${s.pixelEditorExternalPath}\t${fi}`;
  return `p\t${s.path || ''}\t${fi}`;
}

function getPaintEntryForFrame(fi) {
  const s = getState();
  if (s.pixelEditorExternalPath && s.pixelEditorExternalImage) {
    return externalPaintByPath.get(s.pixelEditorExternalPath)?.get(fi) ?? null;
  }
  return s.framePaintOverlays.get(fi) ?? null;
}

function ensureUndo(fi, w, h) {
  const k = paintHistoryKey(fi);
  if (!undoByPaintKey.has(k)) {
    const empty = new ImageData(w, h);
    undoByPaintKey.set(k, { history: [empty], ptr: 0 });
  }
}

function pushHistory(fi, entry) {
  const ctx = entry.canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  let snap;
  try {
    snap = ctx.getImageData(0, 0, entry.canvas.width, entry.canvas.height);
  } catch (_) {
    return;
  }
  const k = paintHistoryKey(fi);
  let u = undoByPaintKey.get(k);
  if (!u) {
    ensureUndo(fi, entry.canvas.width, entry.canvas.height);
    u = undoByPaintKey.get(k);
  }
  if (!u) return;
  u.history = u.history.slice(0, u.ptr + 1);
  u.history.push(snap);
  while (u.history.length > MAX_HISTORY) {
    u.history.shift();
  }
  u.ptr = u.history.length - 1;
}

function undoOnce() {
  const s = getState();
  const fi = s.pixelEditorActiveFrameIndex;
  const entry = getPaintEntryForFrame(fi);
  const k = paintHistoryKey(fi);
  const u = undoByPaintKey.get(k);
  if (!entry || !u || u.ptr <= 0) return false;
  const ctx = entry.canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  u.ptr--;
  try {
    ctx.putImageData(u.history[u.ptr], 0, 0);
  } catch (_) {
    return false;
  }
  redrawView(entry);
  setDirty();
  notifyChange?.();
  return true;
}

function redrawView(entry) {
  if (!canvasEl || !baseCropCanvas) return;
  const w = entry.canvas.width;
  const h = entry.canvas.height;
  if (w < 1 || h < 1) return;
  canvasEl.width = w;
  canvasEl.height = h;
  const vctx = canvasEl.getContext('2d', { alpha: true });
  if (!vctx) return;
  vctx.drawImage(baseCropCanvas, 0, 0);
  vctx.drawImage(entry.canvas, 0, 0);
}

const VIEWPORT_PAD = 4;

function syncZoomPercentUiVisibility() {
  if (!zoomPctWrap) return;
  zoomPctWrap.classList.toggle('hidden', zoomMode !== 'percent');
}

/**
 * CSS-weergavegrootte van het canvas (intrinsiek blijft 1:1 met frame-pixels voor tekenen).
 */
function applyPixelEditorDisplayScale() {
  if (!canvasEl || !viewportEl) return;
  const iw = canvasEl.width;
  const ih = canvasEl.height;
  if (iw < 1 || ih < 1) {
    canvasEl.style.width = '';
    canvasEl.style.height = '';
    return;
  }
  let vw = viewportEl.clientWidth - VIEWPORT_PAD;
  let vh = viewportEl.clientHeight - VIEWPORT_PAD;
  if (vw < 8) vw = 8;
  if (vh < 8) vh = 8;

  let scale;
  switch (zoomMode) {
    case 'width':
      scale = vw / iw;
      break;
    case 'height':
      scale = vh / ih;
      break;
    case 'percent':
      scale = Math.max(0.01, Math.min(10, zoomPercent / 100));
      break;
    case 'fit':
    default:
      scale = Math.min(vw / iw, vh / ih);
      break;
  }
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;

  const cssW = iw * scale;
  const cssH = ih * scale;
  canvasEl.style.width = `${Math.round(cssW * 100) / 100}px`;
  canvasEl.style.height = `${Math.round(cssH * 100) / 100}px`;
}

function directionOffset(dir, dist) {
  const d = Math.max(0, dist);
  switch (String(dir || 'left')) {
    case 'right':
      return { ox: d, oy: 0 };
    case 'up':
      return { ox: 0, oy: -d };
    case 'down':
      return { ox: 0, oy: d };
    case 'left':
    default:
      return { ox: -d, oy: 0 };
  }
}

/**
 * Klonen van de onderliggende scan (zonder eerdere verf): bronpatch gecentreerd op (cx+ox, cy+oy),
 * geplaatst op (cx, cy) — natuurlijke korrel/verloop zoals healing clone.
 */
function paintDabUnderlying(octx, cx, cy, rad, dir, offsetDist, useFeather, featherPct) {
  if (rad < 0.5 || !baseCropCanvas) return;
  const { ox, oy } = directionOffset(dir, offsetDist);
  const sx = cx + ox;
  const sy = cy + oy;

  const d = Math.ceil(2 * rad + 4);
  const half = d / 2;
  const temp = document.createElement('canvas');
  temp.width = d;
  temp.height = d;
  const tcx = temp.getContext('2d', { willReadFrequently: true });
  if (!tcx) return;

  const srcX = Math.round(sx - half);
  const srcY = Math.round(sy - half);
  tcx.clearRect(0, 0, d, d);
  tcx.drawImage(baseCropCanvas, srcX, srcY, d, d, 0, 0, d, d);

  const cx2 = half;
  const cy2 = half;
  if (!useFeather || featherPct <= 0) {
    tcx.globalCompositeOperation = 'destination-in';
    tcx.fillStyle = '#fff';
    tcx.beginPath();
    tcx.arc(cx2, cy2, rad, 0, Math.PI * 2);
    tcx.fill();
    tcx.globalCompositeOperation = 'source-over';
  } else {
    const inner = Math.max(0, Math.min(1, 1 - featherPct / 100));
    const mask = document.createElement('canvas');
    mask.width = d;
    mask.height = d;
    const mx = mask.getContext('2d');
    if (!mx) return;
    const g = mx.createRadialGradient(cx2, cy2, 0, cx2, cy2, rad);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(inner, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    mx.fillStyle = g;
    mx.beginPath();
    mx.arc(cx2, cy2, rad, 0, Math.PI * 2);
    mx.fill();
    tcx.globalCompositeOperation = 'destination-in';
    tcx.drawImage(mask, 0, 0);
    tcx.globalCompositeOperation = 'source-over';
  }

  const dx = Math.round(cx - half);
  const dy = Math.round(cy - half);
  octx.drawImage(temp, dx, dy);
}

function paintDab(octx, ox, oy, rad, colorHex, useFeather, featherPct) {
  if (rad < 0.5) return;
  const { r: red, g: green, b: blue } = parseHex(colorHex);
  if (!useFeather || featherPct <= 0) {
    octx.fillStyle = colorHex;
    octx.beginPath();
    octx.arc(ox, oy, rad, 0, Math.PI * 2);
    octx.fill();
    return;
  }
  const d = Math.ceil(2 * rad + 4);
  const temp = document.createElement('canvas');
  temp.width = d;
  temp.height = d;
  const tcx = temp.getContext('2d');
  if (!tcx) return;
  const cx = d / 2;
  const cy = d / 2;
  const g = tcx.createRadialGradient(cx, cy, 0, cx, cy, rad);
  const inner = Math.max(0, Math.min(1, 1 - featherPct / 100));
  g.addColorStop(0, `rgb(${red},${green},${blue})`);
  g.addColorStop(inner, `rgb(${red},${green},${blue})`);
  g.addColorStop(1, `rgba(${red},${green},${blue},0)`);
  tcx.fillStyle = g;
  tcx.beginPath();
  tcx.arc(cx, cy, rad, 0, Math.PI * 2);
  tcx.fill();
  octx.drawImage(temp, ox - cx, oy - cy);
}

function paintStrokeSegment(entry, x0, y0, x1, y1, rad, colorHex, useFeather, featherPct) {
  const octx = entry.canvas.getContext('2d', { alpha: true });
  if (!octx) return;
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const step = Math.max(1, rad * 0.35);
  const n = Math.max(1, Math.ceil(dist / step));
  const offsetDist = Math.max(rad, 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (paintBrushMode === 'underlying') {
      paintDabUnderlying(octx, x, y, rad, sampleDirection, offsetDist, useFeather, featherPct);
    } else {
      paintDab(octx, x, y, rad, colorHex, useFeather, featherPct);
    }
  }
}

function eventToLocal(e) {
  if (!canvasEl) return { x: 0, y: 0 };
  const rect = canvasEl.getBoundingClientRect();
  const scaleX = canvasEl.width / Math.max(1, rect.width);
  const scaleY = canvasEl.height / Math.max(1, rect.height);
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function brushRadiusRaw() {
  const v = Number(brushRange?.value) || 8;
  return Math.max(0.5, v * scaleRawPerPreview);
}

function updateBrushRing(e) {
  if (!brushRingEl || !canvasEl || !viewportEl) return;
  const rect = canvasEl.getBoundingClientRect();
  const vr = viewportEl.getBoundingClientRect();
  const rScreen = brushRadiusRaw() * (rect.width / Math.max(1, canvasEl.width));
  brushRingEl.style.width = `${2 * rScreen}px`;
  brushRingEl.style.height = `${2 * rScreen}px`;
  brushRingEl.style.left = `${e.clientX - vr.left - rScreen}px`;
  brushRingEl.style.top = `${e.clientY - vr.top - rScreen}px`;
}

function sampleColorFromEvent(e) {
  if (!canvasEl) return;
  const { x, y } = eventToLocal(e);
  const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const ix = Math.max(0, Math.min(canvasEl.width - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(canvasEl.height - 1, Math.floor(y)));
  let d;
  try {
    d = ctx.getImageData(ix, iy, 1, 1).data;
  } catch (_) {
    return;
  }
  const toHex = (n) => n.toString(16).padStart(2, '0');
  const hex = `#${toHex(d[0])}${toHex(d[1])}${toHex(d[2])}`;
  if (colorInput) colorInput.value = hex;
}

/**
 * Zorgt voor paint-entry + crop-rect; zet lastStripKey/scale niet (gebeurt in caller).
 * @returns {{ entry: object, rRaw: object, rPrev: object, raw: HTMLCanvasElement } | null}
 */
function ensurePaintEntryForFrame(raw, preview, fi) {
  const s = getState();
  const rRaw = getFrameCropRectInStripPx(raw, fi);
  const rPrev = getFrameCropRectInStripPx(preview, fi);
  if (!rRaw || !rPrev || rRaw.w < 1 || rRaw.h < 1) return null;

  let entry;
  if (s.pixelEditorExternalPath && s.pixelEditorExternalImage) {
    let pathMap = externalPaintByPath.get(s.pixelEditorExternalPath);
    if (!pathMap) {
      pathMap = new Map();
      externalPaintByPath.set(s.pixelEditorExternalPath, pathMap);
    }
    entry = pathMap.get(fi);
    if (
      !entry ||
      entry.stripW !== raw.width ||
      entry.stripH !== raw.height ||
      entry.x !== rRaw.x ||
      entry.y !== rRaw.y ||
      entry.w !== rRaw.w ||
      entry.h !== rRaw.h
    ) {
      const c = document.createElement('canvas');
      c.width = rRaw.w;
      c.height = rRaw.h;
      entry = {
        stripW: raw.width,
        stripH: raw.height,
        x: rRaw.x,
        y: rRaw.y,
        w: rRaw.w,
        h: rRaw.h,
        canvas: c
      };
      pathMap.set(fi, entry);
      undoByPaintKey.delete(paintHistoryKey(fi));
      ensureUndo(fi, c.width, c.height);
    }
  } else {
    const map = s.framePaintOverlays;
    entry = map.get(fi);
    if (
      !entry ||
      entry.stripW !== raw.width ||
      entry.stripH !== raw.height ||
      entry.x !== rRaw.x ||
      entry.y !== rRaw.y ||
      entry.w !== rRaw.w ||
      entry.h !== rRaw.h
    ) {
      const c = document.createElement('canvas');
      c.width = rRaw.w;
      c.height = rRaw.h;
      entry = {
        stripW: raw.width,
        stripH: raw.height,
        x: rRaw.x,
        y: rRaw.y,
        w: rRaw.w,
        h: rRaw.h,
        canvas: c
      };
      map.set(fi, entry);
      undoByPaintKey.delete(paintHistoryKey(fi));
      ensureUndo(fi, c.width, c.height);
    }
  }

  return { entry, rRaw, rPrev, raw };
}

function finishPixelEditorRefresh(raw, preview, fi) {
  const sk = stripKeyForState(raw);
  if (sk !== lastStripKey) {
    lastStripKey = sk;
    undoByPaintKey.clear();
  }

  const ensured = ensurePaintEntryForFrame(raw, preview, fi);
  if (!ensured) return;
  const { entry, rRaw, rPrev } = ensured;
  scaleRawPerPreview = rRaw.w / Math.max(1, rPrev.w);

  baseCropCanvas = document.createElement('canvas');
  baseCropCanvas.width = rRaw.w;
  baseCropCanvas.height = rRaw.h;
  const bctx = baseCropCanvas.getContext('2d');
  if (bctx) {
    bctx.drawImage(raw, rRaw.x, rRaw.y, rRaw.w, rRaw.h, 0, 0, rRaw.w, rRaw.h);
  }
  redrawView(entry);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => applyPixelEditorDisplayScale());
  });
}

function lintBasenameForBridge() {
  const p = getState().path;
  if (!p || typeof p !== 'string') return '';
  const norm = p.replace(/\\/g, '/');
  const i = norm.lastIndexOf('/');
  return i >= 0 ? norm.slice(i + 1) : norm;
}

/**
 * Seriële payload voor het aparte pixel-editor-venster (IPC).
 */
export function buildPixelEditorBridgePull() {
  const s = getState();
  const extPath = s.pixelEditorExternalPath;
  const extImg = s.pixelEditorExternalImage;

  if (extPath && extImg && extImg.naturalWidth > 0) {
    const raw = buildPixelEditorExternalStripRaw(extImg);
    if (!raw) return { ok: false, reason: 'no-image' };
    const fi = s.pixelEditorActiveFrameIndex;
    const ensured = ensurePaintEntryForFrame(raw, raw, fi);
    if (!ensured) return { ok: false, reason: 'no-crop' };
    const { entry, rRaw } = ensured;
    const baseCrop = document.createElement('canvas');
    baseCrop.width = rRaw.w;
    baseCrop.height = rRaw.h;
    const bx = baseCrop.getContext('2d');
    if (bx) bx.drawImage(raw, rRaw.x, rRaw.y, rRaw.w, rRaw.h, 0, 0, rRaw.w, rRaw.h);
    return {
      ok: true,
      mode: 'external',
      basePng: baseCrop.toDataURL('image/png'),
      overlayPng: entry.canvas.width > 0 ? entry.canvas.toDataURL('image/png') : null,
      w: rRaw.w,
      h: rRaw.h,
      frameIndex: fi,
      numFrames: Math.max(1, s.numFrames || 1),
      stripKey: stripKeyForState(raw),
      lintBasename: extPath ? String(extPath).split(/[/\\]/).pop() || '—' : '—',
      externalPath: extPath || null,
      outputFolder: s.pixelEditorOutputFolder || null,
      sourceFolder: s.pixelEditorSourceFolder || null
    };
  }

  if (!s.image) return { ok: false, reason: 'no-image' };
  const raw = buildStripCanvasRawBase();
  const preview = getStripCanvas();
  if (!raw || !preview) return { ok: false, reason: 'no-image' };
  const fi = s.pixelEditorActiveFrameIndex;
  const ensured = ensurePaintEntryForFrame(raw, preview, fi);
  if (!ensured) return { ok: false, reason: 'no-crop' };
  const { entry, rRaw } = ensured;
  const baseCrop = document.createElement('canvas');
  baseCrop.width = rRaw.w;
  baseCrop.height = rRaw.h;
  const bx = baseCrop.getContext('2d');
  if (bx) bx.drawImage(raw, rRaw.x, rRaw.y, rRaw.w, rRaw.h, 0, 0, rRaw.w, rRaw.h);
  return {
    ok: true,
    mode: 'project',
    basePng: baseCrop.toDataURL('image/png'),
    overlayPng: entry.canvas.width > 0 ? entry.canvas.toDataURL('image/png') : null,
    w: rRaw.w,
    h: rRaw.h,
    frameIndex: fi,
    numFrames: Math.max(1, s.numFrames || 1),
    stripKey: stripKeyForState(raw),
    lintBasename: lintBasenameForBridge(),
    externalPath: null,
    outputFolder: s.pixelEditorOutputFolder || null,
    sourceFolder: s.pixelEditorSourceFolder || null
  };
}

export async function mergePixelEditorOverlayFromPng(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return { ok: false, error: 'no-data' };
  let img;
  try {
    img = await loadDataUrlAsImage(dataUrl);
  } catch (_) {
    return { ok: false, error: 'decode' };
  }
  const s = getState();
  const fi = s.pixelEditorActiveFrameIndex;
  const extPath = s.pixelEditorExternalPath;
  const extImg = s.pixelEditorExternalImage;

  if (extPath && extImg && extImg.naturalWidth > 0) {
    const raw = buildPixelEditorExternalStripRaw(extImg);
    if (!raw) return { ok: false, error: 'no-raw' };
    const ensured = ensurePaintEntryForFrame(raw, raw, fi);
    if (!ensured) return { ok: false, error: 'no-entry' };
    const { entry } = ensured;
    const ctx = entry.canvas.getContext('2d', { alpha: true });
    if (!ctx) return { ok: false, error: 'no-ctx' };
    ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
    ctx.drawImage(img, 0, 0, entry.canvas.width, entry.canvas.height);
  } else {
    if (!s.image) return { ok: false, error: 'no-image' };
    const raw = buildStripCanvasRawBase();
    const preview = getStripCanvas();
    if (!raw || !preview) return { ok: false, error: 'no-strip' };
    const ensured = ensurePaintEntryForFrame(raw, preview, fi);
    if (!ensured) return { ok: false, error: 'no-entry' };
    const { entry } = ensured;
    const ctx = entry.canvas.getContext('2d', { alpha: true });
    if (!ctx) return { ok: false, error: 'no-ctx' };
    ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
    ctx.drawImage(img, 0, 0, entry.canvas.width, entry.canvas.height);
  }

  setDirty();
  afterOverlayMutatedOnMain?.();
  return { ok: true };
}

/**
 * Installeert `window.__f2fPixelEditorBridge` op het hoofdvenster (pull/push overlay).
 */
export function installPixelEditorBridgeInMainWindow(onAfterOverlayMutated) {
  afterOverlayMutatedOnMain = typeof onAfterOverlayMutated === 'function' ? onAfterOverlayMutated : null;
  window.__f2fPixelEditorBridge = async (op, payload) => {
    if (op === 'pull') return buildPixelEditorBridgePull();
    if (op === 'pushOverlay') return mergePixelEditorOverlayFromPng(payload && payload.dataUrl);
    return { ok: false, error: 'unknown-op' };
  };
}

export function refreshFramePixelEditor() {
  if (!canvasEl) return;
  const s = getState();
  const extPath = s.pixelEditorExternalPath;
  const extImg = s.pixelEditorExternalImage;

  if (extPath && extImg && extImg.naturalWidth > 0) {
    const raw = buildPixelEditorExternalStripRaw(extImg);
    if (!raw) {
      canvasEl.width = 0;
      canvasEl.height = 0;
      canvasEl.style.width = '';
      canvasEl.style.height = '';
      baseCropCanvas = null;
      return;
    }
    const fi = s.pixelEditorActiveFrameIndex;
    finishPixelEditorRefresh(raw, raw, fi);
    return;
  }

  if (!s.image) {
    canvasEl.width = 0;
    canvasEl.height = 0;
    canvasEl.style.width = '';
    canvasEl.style.height = '';
    baseCropCanvas = null;
    undoByPaintKey.clear();
    lastStripKey = '';
    return;
  }
  const raw = buildStripCanvasRawBase();
  const preview = getStripCanvas();
  if (!raw || !preview) return;
  const fi = s.pixelEditorActiveFrameIndex;
  finishPixelEditorRefresh(raw, preview, fi);
}

/** Zichtbare verf op het actieve pixel-editor-frame (project-strip of extern bestand). */
export function hasVisiblePixelEditorPaintAt(frameIndex) {
  const fi = Number(frameIndex);
  const entry = getPaintEntryForFrame(fi);
  if (!entry?.canvas) return false;
  const w = entry.canvas.width;
  const h = entry.canvas.height;
  if (w < 1 || h < 1) return false;
  const ctx = entry.canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  try {
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] !== 0) return true;
    }
  } catch (_) {
    return true;
  }
  return false;
}

/**
 * Canvas voor PNG-export (actief frame + overlay) wanneer externe bron actief is.
 * @returns {HTMLCanvasElement|null}
 */
export function getPixelEditorExternalExportCanvas() {
  const s = getState();
  if (!s.pixelEditorExternalPath || !s.pixelEditorExternalImage) return null;
  const raw = buildPixelEditorExternalStripRaw(s.pixelEditorExternalImage);
  if (!raw) return null;
  const fi = s.pixelEditorActiveFrameIndex;
  const r = getFrameCropRectInStripPx(raw, fi);
  if (!r || r.w < 1 || r.h < 1) return null;
  const c = document.createElement('canvas');
  c.width = r.w;
  c.height = r.h;
  const ctx = c.getContext('2d', { alpha: true });
  if (!ctx) return null;
  ctx.drawImage(raw, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  const entry = externalPaintByPath.get(s.pixelEditorExternalPath)?.get(fi);
  if (entry?.canvas) ctx.drawImage(entry.canvas, 0, 0);
  return c;
}

function onPointerDown(e) {
  if (!canvasEl || canvasEl.width < 1) return;
  if (e.button === 2) {
    e.preventDefault();
    undoOnce();
    return;
  }
  if (e.button !== 0) return;
  if (eyedropperNext) {
    e.preventDefault();
    sampleColorFromEvent(e);
    eyedropperNext = false;
    if (eyedropperBtn) eyedropperBtn.classList.remove('is-active');
    return;
  }
  const s = getState();
  const entry = getPaintEntryForFrame(s.pixelEditorActiveFrameIndex);
  if (!entry) return;
  if (paintBrushMode === 'underlying' && !baseCropCanvas) return;
  strokeDirty = false;
  painting = true;
  try {
    canvasEl.setPointerCapture(e.pointerId);
  } catch (_) {}
  const { x, y } = eventToLocal(e);
  lastOx = x;
  lastOy = y;
  const rad = brushRadiusRaw();
  const color = colorInput?.value || '#808080';
  const useFeather = featherChk?.checked === true;
  const featherPct = Number(featherRange?.value) || 0;
  const octx = entry.canvas.getContext('2d', { alpha: true });
  if (octx) {
    if (paintBrushMode === 'underlying') {
      paintDabUnderlying(octx, x, y, rad, sampleDirection, Math.max(rad, 2), useFeather, featherPct);
    } else {
      paintDab(octx, x, y, rad, color, useFeather, featherPct);
    }
    strokeDirty = true;
  }
  redrawView(entry);
}

function onPointerMove(e) {
  if (!canvasEl || canvasEl.width < 1) return;
  if (viewportEl?.contains(e.target) || e.target === canvasEl) {
    updateBrushRing(e);
    brushRingEl?.classList.remove('hidden');
  }
  if (!painting) return;
  if (paintBrushMode === 'underlying' && !baseCropCanvas) return;
  const { x, y } = eventToLocal(e);
  const s = getState();
  const entry = getPaintEntryForFrame(s.pixelEditorActiveFrameIndex);
  if (!entry) return;
  const rad = brushRadiusRaw();
  const color = colorInput?.value || '#808080';
  const useFeather = featherChk?.checked === true;
  const featherPct = Number(featherRange?.value) || 0;
  paintStrokeSegment(entry, lastOx, lastOy, x, y, rad, color, useFeather, featherPct);
  strokeDirty = true;
  lastOx = x;
  lastOy = y;
  redrawView(entry);
}

function finishPaintingStroke(e) {
  if (!painting) return;
  painting = false;
  if (e?.pointerId != null) {
    try {
      canvasEl?.releasePointerCapture(e.pointerId);
    } catch (_) {}
  }
  const s = getState();
  const fi = s.pixelEditorActiveFrameIndex;
  const entry = getPaintEntryForFrame(fi);
  if (entry && strokeDirty) {
    pushHistory(fi, entry);
    setDirty();
    notifyChange?.();
  }
  strokeDirty = false;
}

function onPointerUp(e) {
  if (e.button !== 0) return;
  finishPaintingStroke(e);
}

function onPointerCancel() {
  finishPaintingStroke(null);
}

function onKeyDown(e) {
  if (!e.ctrlKey || (e.key !== 'z' && e.key !== 'Z')) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
  if (!editorPointerInside && document.activeElement !== canvasEl) return;
  e.preventDefault();
  undoOnce();
}

/**
 * @param {{ onChange?: () => void }} opts
 */
export function initFramePixelEditor(opts = {}) {
  notifyChange = opts.onChange || null;

  canvasEl = document.getElementById('f2f-pixel-editor-canvas');
  viewportEl = document.getElementById('f2f-pixel-editor-viewport');
  brushRingEl = document.getElementById('f2f-pixel-editor-brush-ring');
  colorInput = document.getElementById('f2f-pixel-editor-color');
  brushRange = document.getElementById('f2f-pixel-editor-brush');
  brushValSpan = document.getElementById('f2f-pixel-editor-brush-val');
  featherChk = document.getElementById('f2f-pixel-editor-feather');
  featherRange = document.getElementById('f2f-pixel-editor-feather-pct');
  eyedropperBtn = document.getElementById('f2f-pixel-editor-eyedropper');
  zoomModeSelect = document.getElementById('f2f-pixel-editor-zoom-mode');
  zoomPctWrap = document.getElementById('f2f-pixel-editor-zoom-pct-wrap');
  zoomPctRange = document.getElementById('f2f-pixel-editor-zoom-pct');
  zoomPctValSpan = document.getElementById('f2f-pixel-editor-zoom-pct-val');

  if (zoomModeSelect) {
    zoomModeSelect.value = zoomMode;
    zoomModeSelect.addEventListener('change', () => {
      const v = zoomModeSelect.value;
      if (v === 'width' || v === 'height' || v === 'percent' || v === 'fit') {
        zoomMode = v;
      } else {
        zoomMode = 'fit';
      }
      syncZoomPercentUiVisibility();
      applyPixelEditorDisplayScale();
    });
  }
  if (zoomPctRange && zoomPctValSpan) {
    zoomPctRange.value = String(zoomPercent);
    zoomPctValSpan.textContent = String(zoomPercent);
    const onPct = () => {
      const n = Math.round(Number(zoomPctRange.value) || 100);
      zoomPercent = Math.max(1, Math.min(1000, n));
      zoomPctRange.value = String(zoomPercent);
      zoomPctValSpan.textContent = String(zoomPercent);
      if (zoomMode === 'percent') applyPixelEditorDisplayScale();
    };
    zoomPctRange.addEventListener('input', onPct);
    zoomPctRange.addEventListener('change', onPct);
  }
  syncZoomPercentUiVisibility();

  if (viewportEl && typeof ResizeObserver !== 'undefined') {
    if (viewportResizeObserver) viewportResizeObserver.disconnect();
    viewportResizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => applyPixelEditorDisplayScale());
    });
    viewportResizeObserver.observe(viewportEl);
  }

  if (brushRange && brushValSpan) {
    const sync = () => {
      brushValSpan.textContent = String(brushRange.value);
    };
    sync();
    brushRange.addEventListener('input', sync);
  }

  eyedropperBtn?.addEventListener('click', () => {
    eyedropperNext = !eyedropperNext;
    eyedropperBtn.classList.toggle('is-active', eyedropperNext);
  });

  featherChk?.addEventListener('change', () => {
    if (featherRange) featherRange.disabled = featherChk.checked !== true;
  });
  if (featherRange && featherChk) featherRange.disabled = featherChk.checked !== true;

  brushModeSelect = document.getElementById('f2f-pixel-editor-brush-mode');
  sampleDirSelect = document.getElementById('f2f-pixel-editor-sample-dir');
  sampleDirWrapEl = document.getElementById('f2f-pixel-editor-sample-wrap');

  function syncPaintBrushModeUi() {
    const v = brushModeSelect?.value;
    paintBrushMode = v === 'underlying' ? 'underlying' : 'color';
    sampleDirWrapEl?.classList.toggle('hidden', paintBrushMode !== 'underlying');
  }
  if (brushModeSelect) {
    syncPaintBrushModeUi();
    brushModeSelect.addEventListener('change', syncPaintBrushModeUi);
  }
  if (sampleDirSelect) {
    const d = sampleDirSelect.value;
    if (d === 'left' || d === 'right' || d === 'up' || d === 'down') sampleDirection = d;
    sampleDirSelect.addEventListener('change', () => {
      const nv = sampleDirSelect.value;
      if (nv === 'left' || nv === 'right' || nv === 'up' || nv === 'down') sampleDirection = nv;
    });
  }

  if (!listenersAttached) {
    listenersAttached = true;
    canvasEl?.addEventListener('pointerdown', onPointerDown);
    canvasEl?.addEventListener('pointermove', onPointerMove);
    canvasEl?.addEventListener('pointerup', onPointerUp);
    canvasEl?.addEventListener('pointercancel', onPointerCancel);
    canvasEl?.addEventListener('contextmenu', (ev) => ev.preventDefault());

    viewportEl?.addEventListener('pointerenter', () => {
      editorPointerInside = true;
    });
    viewportEl?.addEventListener('pointerleave', () => {
      editorPointerInside = false;
      brushRingEl?.classList.add('hidden');
    });

    window.addEventListener('keydown', onKeyDown, true);
  }

  if (canvasEl) canvasEl.tabIndex = 0;
}

/** Na laden van overlays uit project: undo-stack wissen (voorkomt inconsistente undo). */
export function clearPixelEditorUndoHistory() {
  undoByPaintKey.clear();
  externalPaintByPath.clear();
  lastStripKey = '';
}
