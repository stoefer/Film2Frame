/**
 * Strip laden en tekenen – oriëntatie, rotatie, canvas. Geen DOM, geen state writes
 * behalve via de meegegeven state object.
 * Canvas wordt beperkt tot STRIP_CANVAS_MAX_DIM om browserlimieten te beperken; preview-max gelijk houden vermijdt dubbele downscale.
 */
import { getState } from './state.js';
import { STRIP_CANVAS_MAX_DIM } from './constants.js';

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

/**
 * @param {string} path
 * @param {string} fileUrl
 * @returns {Promise<HTMLImageElement|null>}
 */
export function loadImage(path, fileUrl) {
  return new Promise((resolve) => {
    if (!path || !fileUrl) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = fileUrl;
  });
}

/**
 * Geef een canvas terug met de strip getekend (incl. rotatie).
 * @returns {HTMLCanvasElement|null}
 */
export function getStripCanvas() {
  const s = getState();
  if (!s.image || !s.naturalWidth || !s.naturalHeight) return null;
  const w = s.naturalWidth;
  const h = s.naturalHeight;
  const totalDeg = s.rotation90 + s.fineRotationDeg;
  const rad = (totalDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const outW = Math.ceil(w * cos + h * sin);
  const outH = Math.ceil(w * sin + h * cos);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = false;
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate(rad);
  ctx.translate(-w / 2, -h / 2);
  /* Eén drawImage over heel h na rotate: op Chromium/GPU vaak corrupte/herhaalde zone onderaan lange strips.
   * Opeenvolgende bronstroken met dezelfde transform is visueel gelijk, minder hoogte per draw. */
  const drawTileH = 2048;
  if (h <= drawTileH) {
    ctx.drawImage(s.image, 0, 0);
  } else {
    for (let sy = 0; sy < h; sy += drawTileH) {
      const sh = Math.min(drawTileH, h - sy);
      ctx.drawImage(s.image, 0, sy, w, sh, 0, sy, w, sh);
    }
  }
  const flipH = !!s.flipHorizontal;
  const flipV = !!s.flipVertical;
  let result = canvas;
  if (flipH || flipV) {
    result = copyCanvasFlipped(canvas, flipH, flipV);
  }
  return scaleCanvasToMaxDim(result, STRIP_CANVAS_MAX_DIM);
}

/**
 * Spiegel canvas horizontaal en/of verticaal.
 * Geen translate+scale(-1): op Chromium/GPU geeft dat bij lange strips vaak een corrupte band onderaan.
 * Horizontaal: één drawImage met negatieve dest-breedte werkt op veel setups niet (geen zichtbaar effect);
 * daarom verticale stroken kopiëren met positieve breedte (zelfde idee als getegelde rotate-draws).
 * Verticaal: negatieve dest-hoogte blijft (werkt doorgaans wel); bij H+V eerst H-stroken, dan V.
 */
function copyCanvasFlipped(source, flipH, flipV) {
  const cw = source.width;
  const ch = source.height;
  if (cw < 1 || ch < 1) return source;

  const flipHorizontalStripes = (src, dstCanvas) => {
    const dctx = dstCanvas.getContext('2d', { alpha: true });
    if (!dctx) return false;
    if (dctx.imageSmoothingEnabled !== undefined) dctx.imageSmoothingEnabled = false;
    const tileW = Math.min(512, Math.max(1, cw));
    for (let sx = 0; sx < cw; sx += tileW) {
      const w = Math.min(tileW, cw - sx);
      dctx.drawImage(src, sx, 0, w, ch, cw - sx - w, 0, w, ch);
    }
    return true;
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
    if (!flipHorizontalStripes(source, out)) return source;
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
    if (!flipHorizontalStripes(source, mid)) return source;
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
 * @returns {{ width: number, height: number }|null}
 */
export function getStripCanvasDimensions() {
  const s = getState();
  if (!s.image || !s.naturalWidth || !s.naturalHeight) return null;
  const w = s.naturalWidth;
  const h = s.naturalHeight;
  const totalDeg = s.rotation90 + s.fineRotationDeg;
  const rad = (totalDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  let outW = Math.ceil(w * cos + h * sin);
  let outH = Math.ceil(w * sin + h * cos);
  if (outW > STRIP_CANVAS_MAX_DIM || outH > STRIP_CANVAS_MAX_DIM) {
    const scale = Math.min(STRIP_CANVAS_MAX_DIM / outW, STRIP_CANVAS_MAX_DIM / outH, 1);
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  }
  if (outW < 1 || outH < 1) return null;
  return { width: outW, height: outH };
}
