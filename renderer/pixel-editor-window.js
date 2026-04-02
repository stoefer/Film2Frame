/**
 * Frame Pixel Editor — apart venster; state op het hoofdvenster, tekenen lokaal + sync via IPC.
 */
import { init as initI18n, applyToDOM, t } from './i18n.js';

const MAX_HISTORY = 24;
const VIEWPORT_PAD = 4;

const api = window.pixelEditorApi;
if (!api) {
  console.error('[Film2Frame] pixelEditorApi ontbreekt');
}

/** @type {HTMLCanvasElement} */
const baseCanvas = document.createElement('canvas');
/** @type {HTMLCanvasElement} */
const overlayCanvas = document.createElement('canvas');

let canvasEl = null;
let viewportEl = null;
let brushRingEl = null;
let colorInput = null;
let brushRange = null;
let brushValSpan = null;
let featherChk = null;
let featherRange = null;
let eyedropperBtn = null;
let zoomModeSelect = null;
let zoomPctWrap = null;
let zoomPctRange = null;
let zoomPctValSpan = null;
let brushModeSelect = null;
let sampleDirSelect = null;
let sampleDirWrapEl = null;

/** @type {'fit' | 'width' | 'height' | 'percent'} */
let zoomMode = 'fit';
let zoomPercent = 100;

/** @type {'color' | 'underlying'} */
let paintBrushMode = 'color';
/** @type {'left' | 'right' | 'up' | 'down'} */
let sampleDirection = 'left';

let eyedropperNext = false;
let painting = false;
let strokeDirty = false;
let lastOx = 0;
let lastOy = 0;
let editorPointerInside = false;

/** @type {{ history: ImageData[]; ptr: number } | null} */
let undoState = null;

let lastStripKey = '';
let lastFrameIndex = -1;

let pullDebounceTimer = 0;
let removeRefreshListener = null;
let removeLocaleListener = null;
/** Hoofdvenster vroeg refresh; wacht tot de huidige streek klaar is (voorkomt overschrijven). */
let pendingRefreshPull = false;

function parseHex(hex) {
  const s = String(hex || '').trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (!m) return { r: 128, g: 128, b: 128 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
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

function paintDabUnderlying(octx, cx, cy, rad, dir, offsetDist, useFeather, featherPct) {
  if (rad < 0.5) return;
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
  tcx.drawImage(baseCanvas, srcX, srcY, d, d, 0, 0, d, d);

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

function paintStrokeSegment(entryCtx, x0, y0, x1, y1, rad, colorHex, useFeather, featherPct) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const step = Math.max(1, rad * 0.35);
  const n = Math.max(1, Math.ceil(dist / step));
  const offsetDist = Math.max(rad, 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (paintBrushMode === 'underlying') {
      paintDabUnderlying(entryCtx, x, y, rad, sampleDirection, offsetDist, useFeather, featherPct);
    } else {
      paintDab(entryCtx, x, y, rad, colorHex, useFeather, featherPct);
    }
  }
}

function loadDataUrlAsImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = dataUrl;
  });
}

function redrawComposite() {
  if (!canvasEl) return;
  const w = overlayCanvas.width;
  const h = overlayCanvas.height;
  if (w < 1 || h < 1) {
    canvasEl.width = 0;
    canvasEl.height = 0;
    canvasEl.style.width = '';
    canvasEl.style.height = '';
    return;
  }
  canvasEl.width = w;
  canvasEl.height = h;
  const vctx = canvasEl.getContext('2d', { alpha: true });
  if (!vctx) return;
  vctx.drawImage(baseCanvas, 0, 0);
  vctx.drawImage(overlayCanvas, 0, 0);
}

function syncZoomPercentUiVisibility() {
  if (!zoomPctWrap) return;
  zoomPctWrap.classList.toggle('hidden', zoomMode !== 'percent');
}

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

function brushRadiusRaw() {
  const v = Number(brushRange?.value) || 8;
  return Math.max(0.5, v);
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

function ensureUndo(w, h) {
  const empty = new ImageData(w, h);
  undoState = { history: [empty], ptr: 0 };
}

function pushUndoSnapshot() {
  if (!undoState || overlayCanvas.width < 1) return;
  const ctx = overlayCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  let snap;
  try {
    snap = ctx.getImageData(0, 0, overlayCanvas.width, overlayCanvas.height);
  } catch (_) {
    return;
  }
  undoState.history = undoState.history.slice(0, undoState.ptr + 1);
  undoState.history.push(snap);
  while (undoState.history.length > MAX_HISTORY) {
    undoState.history.shift();
  }
  undoState.ptr = undoState.history.length - 1;
}

function undoOnce() {
  if (!undoState || undoState.ptr <= 0) return false;
  const ctx = overlayCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  undoState.ptr--;
  try {
    ctx.putImageData(undoState.history[undoState.ptr], 0, 0);
  } catch (_) {
    return false;
  }
  redrawComposite();
  void pushOverlayToMain();
  return true;
}

async function pushOverlayToMain() {
  if (!api?.pixelEditorPushOverlay || overlayCanvas.width < 1) return;
  const dataUrl = overlayCanvas.toDataURL('image/png');
  try {
    await api.pixelEditorPushOverlay(dataUrl);
  } catch (_) {}
}

function resetUndoFromOverlay() {
  const w = overlayCanvas.width;
  const h = overlayCanvas.height;
  if (w < 1 || h < 1) {
    undoState = null;
    return;
  }
  ensureUndo(w, h);
  const ctx = overlayCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  try {
    const snap = ctx.getImageData(0, 0, w, h);
    undoState.history = [snap];
    undoState.ptr = 0;
  } catch (_) {
    ensureUndo(w, h);
  }
}

function updatePathLabels(pull) {
  const outEl = document.getElementById('f2f-pixel-editor-output-path');
  const srcEl = document.getElementById('f2f-pixel-editor-source-path');
  const clearBtn = document.getElementById('f2f-pixel-editor-clear-source-folder');
  const prevBtn = document.getElementById('f2f-pixel-editor-source-prev');
  const nextBtn = document.getElementById('f2f-pixel-editor-source-next');
  const pp = pull?.outputFolder;
  const sp = pull?.sourceFolder;
  if (outEl) {
    outEl.textContent = pp ? (pp.length > 50 ? '...' + pp.slice(-47) : pp) : '—';
  }
  if (srcEl) {
    srcEl.textContent = sp ? (sp.length > 50 ? '...' + sp.slice(-47) : sp) : '—';
  }
  clearBtn?.classList.toggle('hidden', !sp);
  const srcNav = !!(sp && String(sp).trim() !== '');
  prevBtn?.classList.toggle('hidden', !srcNav);
  nextBtn?.classList.toggle('hidden', !srcNav);
}

function updateCaption(pull) {
  const capEl = document.getElementById('f2f-pixel-editor-frame-caption');
  if (!capEl || !pull?.ok) return;
  const n = Math.max(1, Number(pull.numFrames) || 1);
  const fi = Math.max(0, Math.min(n - 1, Number(pull.frameIndex) || 0)) + 1;
  const stripName = pull.lintBasename || '—';
  capEl.textContent = t('pixelEditor.frameDisplayCaption', { strip: stripName, index: fi, total: n });
}

async function applyPullPayload(pull) {
  if (!pull || !pull.ok) {
    const capEl = document.getElementById('f2f-pixel-editor-frame-caption');
    if (capEl) {
      capEl.textContent = pull?.reason === 'no-image' ? t('scanNav.noScans') : '—';
    }
    overlayCanvas.width = 0;
    overlayCanvas.height = 0;
    baseCanvas.width = 0;
    baseCanvas.height = 0;
    redrawComposite();
    applyPixelEditorDisplayScale();
    updatePathLabels({});
    return;
  }

  const sk = String(pull.stripKey || '');
  const fi = Number(pull.frameIndex);
  if (sk !== lastStripKey || fi !== lastFrameIndex) {
    lastStripKey = sk;
    lastFrameIndex = fi;
    undoState = null;
  }

  const w = Math.max(1, Number(pull.w) | 0);
  const h = Math.max(1, Number(pull.h) | 0);
  baseCanvas.width = w;
  baseCanvas.height = h;
  overlayCanvas.width = w;
  overlayCanvas.height = h;

  const bctx = baseCanvas.getContext('2d', { alpha: true });
  if (bctx) {
    bctx.clearRect(0, 0, w, h);
    try {
      const img = await loadDataUrlAsImage(pull.basePng);
      bctx.drawImage(img, 0, 0, w, h);
    } catch (_) {}
  }

  const octx = overlayCanvas.getContext('2d', { alpha: true });
  if (octx) {
    octx.clearRect(0, 0, w, h);
    if (pull.overlayPng) {
      try {
        const oimg = await loadDataUrlAsImage(pull.overlayPng);
        octx.drawImage(oimg, 0, 0, w, h);
      } catch (_) {}
    }
  }

  resetUndoFromOverlay();
  redrawComposite();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => applyPixelEditorDisplayScale());
  });

  updateCaption(pull);
  updatePathLabels(pull);

  const gotoInput = document.getElementById('f2f-pixel-editor-goto-frame');
  const n = Math.max(1, Number(pull.numFrames) || 1);
  if (gotoInput) {
    gotoInput.max = String(n);
    gotoInput.value = String(Math.max(0, Math.min(n - 1, Number(pull.frameIndex) || 0)) + 1);
  }
}

async function doPull() {
  if (!api?.pixelEditorPull) return;
  let pull;
  try {
    pull = await api.pixelEditorPull();
  } catch (_) {
    return;
  }
  await applyPullPayload(pull);
}

function schedulePull() {
  if (pullDebounceTimer) clearTimeout(pullDebounceTimer);
  pullDebounceTimer = window.setTimeout(() => {
    pullDebounceTimer = 0;
    void doPull();
  }, 90);
}

function syncPaintBrushModeUi() {
  const v = brushModeSelect?.value;
  paintBrushMode = v === 'underlying' ? 'underlying' : 'color';
  sampleDirWrapEl?.classList.toggle('hidden', paintBrushMode !== 'underlying');
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
    eyedropperBtn?.classList.remove('is-active');
    return;
  }
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
  const octx = overlayCanvas.getContext('2d', { alpha: true });
  if (octx) {
    if (paintBrushMode === 'underlying' && baseCanvas.width < 1) return;
    if (paintBrushMode === 'underlying') {
      paintDabUnderlying(octx, x, y, rad, sampleDirection, Math.max(rad, 2), useFeather, featherPct);
    } else {
      paintDab(octx, x, y, rad, color, useFeather, featherPct);
    }
    strokeDirty = true;
  }
  redrawComposite();
}

function onPointerMove(e) {
  if (!canvasEl || canvasEl.width < 1) return;
  if (viewportEl?.contains(e.target) || e.target === canvasEl) {
    updateBrushRing(e);
    brushRingEl?.classList.remove('hidden');
  }
  if (!painting) return;
  if (paintBrushMode === 'underlying' && baseCanvas.width < 1) return;
  const { x, y } = eventToLocal(e);
  const rad = brushRadiusRaw();
  const color = colorInput?.value || '#808080';
  const useFeather = featherChk?.checked === true;
  const featherPct = Number(featherRange?.value) || 0;
  const octx = overlayCanvas.getContext('2d', { alpha: true });
  if (!octx) return;
  paintStrokeSegment(octx, lastOx, lastOy, x, y, rad, color, useFeather, featherPct);
  strokeDirty = true;
  lastOx = x;
  lastOy = y;
  redrawComposite();
}

function finishPaintingStroke(e) {
  if (!painting) return;
  painting = false;
  if (e?.pointerId != null) {
    try {
      canvasEl?.releasePointerCapture(e.pointerId);
    } catch (_) {}
  }
  if (strokeDirty) {
    pushUndoSnapshot();
    void pushOverlayToMain();
  }
  strokeDirty = false;
  if (pendingRefreshPull) {
    pendingRefreshPull = false;
    void doPull();
  }
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

async function mainAction(action, payload) {
  if (!api?.pixelEditorMainAction) return;
  try {
    await api.pixelEditorMainAction(action, payload);
  } catch (_) {}
  await doPull();
}

function bindUi() {
  document.getElementById('f2f-pixel-editor-pick-folder')?.addEventListener('click', () => {
    void mainAction('pickOutputFolder', null);
  });
  document.getElementById('f2f-pixel-editor-pick-source-folder')?.addEventListener('click', () => {
    void mainAction('pickSourceFolder', null);
  });
  document.getElementById('f2f-pixel-editor-clear-source-folder')?.addEventListener('click', () => {
    void mainAction('clearSourceFolder', null);
  });
  document.getElementById('f2f-pixel-editor-source-prev')?.addEventListener('click', () => {
    void mainAction('sourcePrev', null);
  });
  document.getElementById('f2f-pixel-editor-source-next')?.addEventListener('click', () => {
    void mainAction('sourceNext', null);
  });
  document.getElementById('f2f-pixel-editor-prev-frame')?.addEventListener('click', () => {
    void mainAction('prevFrame', null);
  });
  document.getElementById('f2f-pixel-editor-next-frame')?.addEventListener('click', () => {
    void mainAction('nextFrame', null);
  });
  document.getElementById('f2f-pixel-editor-goto-frame-go')?.addEventListener('click', () => {
    const raw = parseInt(document.getElementById('f2f-pixel-editor-goto-frame')?.value, 10);
    void mainAction('gotoFrame', { frameOneBased: raw });
  });
  document.getElementById('f2f-pixel-editor-goto-frame')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const raw = parseInt(document.getElementById('f2f-pixel-editor-goto-frame')?.value, 10);
      void mainAction('gotoFrame', { frameOneBased: raw });
    }
  });
}

function boot() {
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
  brushModeSelect = document.getElementById('f2f-pixel-editor-brush-mode');
  sampleDirSelect = document.getElementById('f2f-pixel-editor-sample-dir');
  sampleDirWrapEl = document.getElementById('f2f-pixel-editor-sample-wrap');

  if (zoomModeSelect) {
    zoomModeSelect.value = zoomMode;
    zoomModeSelect.addEventListener('change', () => {
      const v = zoomModeSelect.value;
      if (v === 'width' || v === 'height' || v === 'percent' || v === 'fit') zoomMode = v;
      else zoomMode = 'fit';
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
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => applyPixelEditorDisplayScale());
    });
    ro.observe(viewportEl);
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

  syncPaintBrushModeUi();
  brushModeSelect?.addEventListener('change', syncPaintBrushModeUi);
  sampleDirSelect?.addEventListener('change', () => {
    const nv = sampleDirSelect.value;
    if (nv === 'left' || nv === 'right' || nv === 'up' || nv === 'down') sampleDirection = nv;
  });

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
  if (canvasEl) canvasEl.tabIndex = 0;

  bindUi();
}

async function start() {
  boot();
  if (api) {
    await initI18n(api);
    applyToDOM();
    removeLocaleListener = api.onStripLocaleChanged?.(() => {
      void (async () => {
        await initI18n(api);
        applyToDOM();
        schedulePull();
      })();
    });
    removeRefreshListener = api.onPixelEditorRefreshFromMain?.(() => {
      if (painting) {
        pendingRefreshPull = true;
        return;
      }
      schedulePull();
    });
  }
  await doPull();
}

void start();
