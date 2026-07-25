/**
 * Strip laden en tekenen – oriëntatie, rotatie, canvas. Geen DOM, geen state writes
 * behalve via de meegegeven state object.
 * Canvas wordt beperkt tot STRIP_CANVAS_MAX_DIM om browserlimieten te beperken; preview-max gelijk houden vermijdt dubbele downscale.
 */
import { getState } from './state.js';
import { getFrameCropRectInStripPx } from './grid.js';
import { STRIP_CANVAS_MAX_DIM, EXPORT_STRIP_MAX_DIM, STRIP_IMAGE_LOAD_TIMEOUT_MS } from './constants.js';

/**
 * Kantelpunt in bronpixels: (0,0) linksonder? — Nee: canvas drawImage gebruikt linkerboven als oorsprong.
 * (0,0) linksboven, (w,h) rechtsonder.
 */
function tiltPivotToSourcePoint(w, h, tiltPivotId) {
  const id = typeof tiltPivotId === 'string' ? tiltPivotId : 'center';
  switch (id) {
    case 'top-left':
      return { px: 0, py: 0 };
    case 'top-center':
      return { px: w / 2, py: 0 };
    case 'top-right':
      return { px: w, py: 0 };
    case 'center-left':
      return { px: 0, py: h / 2 };
    case 'center-right':
      return { px: w, py: h / 2 };
    case 'bottom-left':
      return { px: 0, py: h };
    case 'bottom-center':
      return { px: w / 2, py: h };
    case 'bottom-right':
      return { px: w, py: h };
    case 'center':
    default:
      return { px: w / 2, py: h / 2 };
  }
}

/**
 * As-gealigneerde omhullende rechthoek na rotatie om (px,py) met hoek rad (zelfde teken als ctx.rotate).
 */
function rotatedImageBounds(w, h, rad, px, py) {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h]
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < corners.length; i++) {
    const x = corners[i][0];
    const y = corners[i][1];
    const dx = x - px;
    const dy = y - py;
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    minX = Math.min(minX, rx);
    maxX = Math.max(maxX, rx);
    minY = Math.min(minY, ry);
    maxY = Math.max(maxY, ry);
  }
  return {
    outW: Math.max(1, Math.ceil(maxX - minX)),
    outH: Math.max(1, Math.ceil(maxY - minY)),
    minX,
    minY
  };
}

/**
 * Nearest-neighbour down/up-scale. Lange strips in één drawImage() geven op sommige GPU's/Chromium
 * een lege of herhaalde-rand zone onderaan; daarom verticaal getegeld tekenen.
 * @param {HTMLCanvasElement} src
 * @param {number} dstW
 * @param {number} dstH
 * @returns {HTMLCanvasElement|null}
 */
export function copyCanvasNearestScaled(src, dstW, dstH) {
  const w = src.width;
  const h = src.height;
  if (dstW < 1 || dstH < 1 || w < 1 || h < 1) return null;
  if (dstW === w && dstH === h) return src;
  const out = document.createElement('canvas');
  out.width = dstW;
  out.height = dstH;
  const ctx = out.getContext('2d', { alpha: true });
  if (!ctx) return null;
  if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = false;
  const tileH = 512;
  const useTiles = dstH > tileH || h > STRIP_CANVAS_MAX_DIM;
  if (!useTiles) {
    ctx.drawImage(src, 0, 0, w, h, 0, 0, dstW, dstH);
    return out;
  }
  /* Opeenvolgende bronrijen zonder overlap/gat: per tegel apart floor/ceil gaf dubbele of ontbrekende rijen
   * op randen → horizontale banden / "vervorming" vooral onderaan lange strips (na fijne draaiing + downscale). */
  let srcYNext = 0;
  for (let y = 0; y < dstH; y += tileH) {
    const y1 = Math.min(dstH, y + tileH);
    const srcY0 = srcYNext;
    let srcY1 = Math.ceil((y1 * h) / dstH);
    if (srcY1 <= srcY0) srcY1 = Math.min(h, srcY0 + 1);
    if (srcY1 > h) srcY1 = h;
    srcYNext = srcY1;
    const sh = srcY1 - srcY0;
    const dh = y1 - y;
    if (sh >= 1 && dh >= 1) {
      ctx.drawImage(src, 0, srcY0, w, sh, 0, y, dstW, dh);
    }
  }
  return out;
}

function scaleCanvasToMaxDim(source, maxDim) {
  const w = source.width;
  const h = source.height;
  if (w <= maxDim && h <= maxDim) return source;
  const scale = Math.min(maxDim / w, maxDim / h, 1);
  const outW = Math.round(w * scale);
  const outH = Math.round(h * scale);
  if (outW < 1 || outH < 1) return source;
  const scaled = copyCanvasNearestScaled(source, outW, outH);
  return scaled || source;
}

/** Cache voor preview-strip: voorkomt herhaaldelijk alloceren van multi‑100MB canvassen. */
let previewStripCache = { key: '', canvas: null };

/**
 * Canvassen die nog door een actieve export (of andere caller) worden vastgehouden.
 * Voorkomt dat updateUI/preview de strip op 0×0 zet terwijl cropFrameAtIndexForExport nog loopt.
 */
const heldStripCanvases = new Set();

/**
 * Laat GPU/CPU-geheugen van een canvas los (Chromium geeft buffer vrij bij 0×0).
 * @param {HTMLCanvasElement|null|undefined} canvas
 */
export function disposeCanvas(canvas) {
  if (!canvas) return;
  if (heldStripCanvases.has(canvas)) return;
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch (_) {}
}

/** Invalideert de gecachte preview-strip (na unload of zware state-wissel). */
export function invalidateStripCanvasCache() {
  const c = previewStripCache.canvas;
  previewStripCache = { key: '', canvas: null };
  if (c) disposeCanvas(c);
}

function paintOverlayCacheKey() {
  const map = getState().framePaintOverlays;
  if (!map || map.size === 0) return '0';
  const parts = [];
  for (const [fi, entry] of map.entries()) {
    const c = entry && entry.canvas;
    parts.push(
      String(fi) +
        ':' +
        String(entry.stripW || 0) +
        'x' +
        String(entry.stripH || 0) +
        ':' +
        String(entry.x || 0) +
        ',' +
        String(entry.y || 0) +
        ',' +
        String(entry.w || 0) +
        'x' +
        String(entry.h || 0) +
        ':' +
        String(c && c.width ? c.width : 0) +
        'x' +
        String(c && c.height ? c.height : 0)
    );
  }
  parts.sort();
  return parts.join('|');
}

function stripPreviewCacheKey() {
  const s = getState();
  return [
    s.path || '',
    s.naturalWidth || 0,
    s.naturalHeight || 0,
    s.rotation90 || 0,
    Number(s.fineRotationDeg) || 0,
    s.tiltPivot || 'center',
    s.flipHorizontal ? 1 : 0,
    s.flipVertical ? 1 : 0,
    STRIP_CANVAS_MAX_DIM,
    paintOverlayCacheKey()
  ].join(';');
}

/**
 * @param {string} path
 * @param {string} fileUrl
 * @returns {Promise<HTMLImageElement|null>}
 */
export function loadImage(path, fileUrl) {
  return new Promise((resolve) => {
    if (!path || !fileUrl) {
      resolve(null);
      return;
    }
    const img = new Image();
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      if (timeoutId != null) clearTimeout(timeoutId);
      resolve(result);
    };
    const timeoutId = setTimeout(() => {
      try {
        img.onload = null;
        img.onerror = null;
        img.src = '';
      } catch (_) {}
      finish(null);
    }, STRIP_IMAGE_LOAD_TIMEOUT_MS);
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    img.src = fileUrl;
  });
}

/**
 * Strip na rotatie + spiegeling (zelfde als huidige project-instellingen), bron = willekeurige afbeelding.
 * @param {CanvasImageSource} image
 * @param {number} w
 * @param {number} h
 * @param {number} [maxDim] - max. zijde van het resultaat (preview vs export)
 * @returns {HTMLCanvasElement|null}
 */
function buildStripCanvasRawFromImage(image, w, h, maxDim = EXPORT_STRIP_MAX_DIM) {
  const s = getState();
  if (!image || w < 1 || h < 1) return null;
  const totalDeg = s.rotation90 + s.fineRotationDeg;
  const rad = (totalDeg * Math.PI) / 180;
  const { px, py } = tiltPivotToSourcePoint(w, h, s.tiltPivot);
  const { outW, outH, minX, minY } = rotatedImageBounds(w, h, rad, px, py);
  let drawScale = 1;
  let cw = outW;
  let ch = outH;
  const cap = Number(maxDim) > 0 ? Number(maxDim) : 0;
  if (cap > 0 && (outW > cap || outH > cap)) {
    drawScale = Math.min(cap / outW, cap / outH, 1);
    cw = Math.max(1, Math.round(outW * drawScale));
    ch = Math.max(1, Math.round(outH * drawScale));
  }
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return null;
  if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = false;
  /* Laatste transform wordt als eerste op punten toegepast: R*(p−P) dan verschuiving zodat bbox op (0,0) start. */
  if (drawScale < 1) ctx.scale(drawScale, drawScale);
  ctx.translate(-minX, -minY);
  ctx.rotate(rad);
  ctx.translate(-px, -py);
  /* Eén drawImage over heel h na rotate: op Chromium/GPU vaak corrupte/herhaalde zone onderaan lange strips.
   * Opeenvolgende bronstroken met dezelfde transform is visueel gelijk, minder hoogte per draw. */
  const drawTileH = 2048;
  if (h <= drawTileH) {
    ctx.drawImage(image, 0, 0);
  } else {
    for (let sy = 0; sy < h; sy += drawTileH) {
      const sh = Math.min(drawTileH, h - sy);
      ctx.drawImage(image, 0, sy, w, sh, 0, sy, w, sh);
    }
  }
  const flipH = !!s.flipHorizontal;
  const flipV = !!s.flipVertical;
  let result = canvas;
  if (flipH || flipV) {
    result = copyCanvasFlipped(canvas, flipH, flipV);
    if (result !== canvas) disposeCanvas(canvas);
  }
  return result;
}

/**
 * Strip na rotatie + spiegeling, zonder pixel-editor overlay (bron voor editor-achtergrond).
 * @returns {HTMLCanvasElement|null}
 */
export function buildStripCanvasRawBase() {
  const s = getState();
  if (!s.image || !s.naturalWidth || !s.naturalHeight) return null;
  return buildStripCanvasRawFromImage(s.image, s.naturalWidth, s.naturalHeight, STRIP_CANVAS_MAX_DIM);
}

/**
 * Zelfde transformaties als project-strip, voor een apart geladen bestand (pixel-editor bronmap).
 * @param {HTMLImageElement} image
 * @returns {HTMLCanvasElement|null}
 */
export function buildPixelEditorExternalStripRaw(image) {
  if (!image || !image.naturalWidth || !image.naturalHeight) return null;
  return buildStripCanvasRawFromImage(image, image.naturalWidth, image.naturalHeight, STRIP_CANVAS_MAX_DIM);
}

function applyFramePaintOverlaysToStripCanvas(result) {
  const map = getState().framePaintOverlays;
  if (!result || !map || map.size === 0) return;
  const ctx = result.getContext('2d', { alpha: true });
  if (!ctx) return;
  const stripW = result.width;
  const stripH = result.height;
  const toDelete = [];
  for (const [fi, entry] of map.entries()) {
    const r = getFrameCropRectInStripPx(result, fi);
    if (!r || !entry?.canvas) {
      toDelete.push(fi);
      continue;
    }
    if (
      stripW !== entry.stripW ||
      stripH !== entry.stripH ||
      r.x !== entry.x ||
      r.y !== entry.y ||
      r.w !== entry.w ||
      r.h !== entry.h ||
      entry.canvas.width !== r.w ||
      entry.canvas.height !== r.h
    ) {
      toDelete.push(fi);
      continue;
    }
    ctx.drawImage(entry.canvas, r.x, r.y);
  }
  for (const fi of toDelete) map.delete(fi);
}

/**
 * Strip na rotatie + spiegeling, nog niet geschaald (bron voor preview- én export-canvas), incl. pixel-editor.
 * @param {number} [maxDim]
 * @returns {HTMLCanvasElement|null}
 */
function buildStripCanvasRaw(maxDim = EXPORT_STRIP_MAX_DIM) {
  const s = getState();
  if (!s.image || !s.naturalWidth || !s.naturalHeight) return null;
  const result = buildStripCanvasRawFromImage(s.image, s.naturalWidth, s.naturalHeight, maxDim);
  if (!result) return null;
  applyFramePaintOverlaysToStripCanvas(result);
  return result;
}

/**
 * Geef een canvas terug met de strip getekend (incl. rotatie), voor overlay/preview (max. STRIP_CANVAS_MAX_DIM).
 * Gecached: herhaalde Hand/Detecteer/Volgende mag geen multi‑100MB canvassen blijven alloceren.
 * @returns {HTMLCanvasElement|null}
 */
export function getStripCanvas() {
  const key = stripPreviewCacheKey();
  if (previewStripCache.canvas && previewStripCache.key === key) {
    return previewStripCache.canvas;
  }
  const built = buildStripCanvasRaw(STRIP_CANVAS_MAX_DIM);
  if (!built) {
    invalidateStripCanvasCache();
    return null;
  }
  if (previewStripCache.canvas && previewStripCache.canvas !== built) {
    disposeCanvas(previewStripCache.canvas);
  }
  previewStripCache = { key, canvas: built };
  return built;
}

/**
 * Export-stripafmetingen zonder te tekenen (zelfde schaalregel als buildStripCanvasRaw(EXPORT_STRIP_MAX_DIM)).
 * @returns {{ width: number, height: number }|null}
 */
export function getExportStripDimensions() {
  const s = getState();
  if (!s.image || !s.naturalWidth || !s.naturalHeight) return null;
  const w = s.naturalWidth;
  const h = s.naturalHeight;
  const totalDeg = s.rotation90 + s.fineRotationDeg;
  const rad = (totalDeg * Math.PI) / 180;
  const { px, py } = tiltPivotToSourcePoint(w, h, s.tiltPivot);
  let { outW, outH } = rotatedImageBounds(w, h, rad, px, py);
  if (EXPORT_STRIP_MAX_DIM > 0 && (outW > EXPORT_STRIP_MAX_DIM || outH > EXPORT_STRIP_MAX_DIM)) {
    const scale = Math.min(EXPORT_STRIP_MAX_DIM / outW, EXPORT_STRIP_MAX_DIM / outH, 1);
    outW = Math.max(1, Math.round(outW * scale));
    outH = Math.max(1, Math.round(outH * scale));
  }
  if (outW < 1 || outH < 1) return null;
  return { width: outW, height: outH };
}

/**
 * Eén keer de strip rasterizen: preview (laag) + export (volle resolutie tot EXPORT_STRIP_MAX_DIM).
 * Raster staat in preview-pixels; export gebruikt cropFrameAtIndexForExport(exportStrip, previewStrip, i).
 * Caller moet releaseStripCanvasPair() aanroepen.
 * @returns {{ preview: HTMLCanvasElement, export: HTMLCanvasElement } | null}
 */
export function getStripCanvasPairForExport() {
  const raw = buildStripCanvasRaw(EXPORT_STRIP_MAX_DIM);
  if (!raw) return null;
  let exportCanvas = raw;
  if (
    EXPORT_STRIP_MAX_DIM > 0 &&
    (raw.width > EXPORT_STRIP_MAX_DIM || raw.height > EXPORT_STRIP_MAX_DIM)
  ) {
    exportCanvas = scaleCanvasToMaxDim(raw, EXPORT_STRIP_MAX_DIM) || raw;
    if (exportCanvas !== raw) disposeCanvas(raw);
  }
  let preview = exportCanvas;
  if (
    exportCanvas.width > STRIP_CANVAS_MAX_DIM ||
    exportCanvas.height > STRIP_CANVAS_MAX_DIM
  ) {
    preview = scaleCanvasToMaxDim(exportCanvas, STRIP_CANVAS_MAX_DIM) || exportCanvas;
  }
  const key = stripPreviewCacheKey();
  if (previewStripCache.canvas && previewStripCache.canvas !== preview) {
    disposeCanvas(previewStripCache.canvas);
  }
  previewStripCache = { key, canvas: preview };
  heldStripCanvases.add(preview);
  heldStripCanvases.add(exportCanvas);
  return { preview, export: exportCanvas };
}

/**
 * Na export: geef het zware export-canvas vrij. Preview-cache blijft bruikbaar.
 * @param {{ preview?: HTMLCanvasElement, export?: HTMLCanvasElement }|null} pair
 */
export function releaseStripCanvasPair(pair) {
  if (!pair) return;
  const cached = previewStripCache.canvas;
  if (pair.export) heldStripCanvases.delete(pair.export);
  if (pair.preview) heldStripCanvases.delete(pair.preview);
  if (pair.export && pair.export !== cached) disposeCanvas(pair.export);
  if (pair.preview && pair.preview !== cached && pair.preview !== pair.export) {
    disposeCanvas(pair.preview);
  }
}

/**
 * Spiegel canvas horizontaal en/of verticaal.
 * Geen translate+scale(-1): op Chromium/GPU geeft dat bij lange strips vaak een corrupte band onderaan.
 * Horizontaal: getImageData/putImageData per band (CPU) — betrouwbaar; fallback kleine drawImage-tegels bij taint-fout.
 * Verticaal: negatieve dest-hoogte (één draw); bij H+V eerst H, dan V.
 */
function copyCanvasFlipped(source, flipH, flipV) {
  const cw = source.width;
  const ch = source.height;
  if (cw < 1 || ch < 1) return source;

  /**
   * Horizontaal spiegelen: eerst CPU-pad (getImageData, rijen spiegelen, putImageData).
   * Veel GPU-paden corrupten nog steeds bij talloze kleine drawImage-kopies op lange strips (“scrambled”).
   */
  const flipHorizontalCPU = (src, dstCanvas) => {
    const sctx = src.getContext('2d', { willReadFrequently: true });
    const dctx = dstCanvas.getContext('2d', { alpha: true });
    if (!sctx || !dctx) return false;
    if (dctx.imageSmoothingEnabled !== undefined) dctx.imageSmoothingEnabled = false;
    const bandH = 32;
    for (let sy = 0; sy < ch; sy += bandH) {
      const sh = Math.min(bandH, ch - sy);
      let id;
      try {
        id = sctx.getImageData(0, sy, cw, sh);
      } catch (_) {
        return false;
      }
      const pixels = id.data;
      const rowStride = cw * 4;
      for (let y = 0; y < sh; y++) {
        const rowStart = y * rowStride;
        let left = rowStart;
        let right = rowStart + (cw - 1) * 4;
        while (left < right) {
          for (let c = 0; c < 4; c++) {
            const t = pixels[left + c];
            pixels[left + c] = pixels[right + c];
            pixels[right + c] = t;
          }
          left += 4;
          right -= 4;
        }
      }
      dctx.putImageData(id, 0, sy);
    }
    return true;
  };

  /** Fallback als getImageData faalt (tainting); kleinere tegels dan voorheen. */
  const flipHorizontalStripes = (src, dstCanvas) => {
    const dctx = dstCanvas.getContext('2d', { alpha: true });
    if (!dctx) return false;
    if (dctx.imageSmoothingEnabled !== undefined) dctx.imageSmoothingEnabled = false;
    const tileW = 64;
    const tileH = 64;
    for (let sy = 0; sy < ch; sy += tileH) {
      const sh = Math.min(tileH, ch - sy);
      for (let sx = 0; sx < cw; sx += tileW) {
        const sw = Math.min(tileW, cw - sx);
        const dx = cw - sx - sw;
        dctx.drawImage(src, sx, sy, sw, sh, dx, sy, sw, sh);
      }
    }
    return true;
  };

  const flipHorizontal = (src, dstCanvas) => {
    if (flipHorizontalCPU(src, dstCanvas)) return true;
    return flipHorizontalStripes(src, dstCanvas);
  };

  const flipVerticalOneShot = (src, dstCanvas) => {
    const dctx = dstCanvas.getContext('2d', { alpha: true });
    if (!dctx) return false;
    if (dctx.imageSmoothingEnabled !== undefined) dctx.imageSmoothingEnabled = false;
    dctx.drawImage(src, 0, 0, cw, ch, 0, ch, cw, -ch);
    return true;
  };

  if (flipH && !flipV) {
    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    if (!flipHorizontal(source, out)) return source;
    return out;
  }

  if (!flipH && flipV) {
    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    if (!flipVerticalOneShot(source, out)) return source;
    return out;
  }

  if (flipH && flipV) {
    const mid = document.createElement('canvas');
    mid.width = cw;
    mid.height = ch;
    if (!flipHorizontal(source, mid)) return source;
    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    if (!flipVerticalOneShot(mid, out)) return source;
    return out;
  }

  return source;
}

/**
 * Strip-canvasafmetingen zonder canvas te tekenen (voor delta-toepassing als getStripCanvas nog niet beschikbaar is).
 * Preview-schaal (STRIP_CANVAS_MAX_DIM).
 * @returns {{ width: number, height: number }|null}
 */
export function getStripCanvasDimensions() {
  const s = getState();
  if (!s.image || !s.naturalWidth || !s.naturalHeight) return null;
  const w = s.naturalWidth;
  const h = s.naturalHeight;
  const totalDeg = s.rotation90 + s.fineRotationDeg;
  const rad = (totalDeg * Math.PI) / 180;
  const { px, py } = tiltPivotToSourcePoint(w, h, s.tiltPivot);
  let { outW, outH } = rotatedImageBounds(w, h, rad, px, py);
  if (outW > STRIP_CANVAS_MAX_DIM || outH > STRIP_CANVAS_MAX_DIM) {
    const scale = Math.min(STRIP_CANVAS_MAX_DIM / outW, STRIP_CANVAS_MAX_DIM / outH, 1);
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  }
  if (outW < 1 || outH < 1) return null;
  return { width: outW, height: outH };
}
