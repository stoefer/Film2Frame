/**
 * Strip laden en tekenen – oriëntatie, rotatie, canvas. Geen DOM, geen state writes
 * behalve via de meegegeven state object.
 * Canvas wordt beperkt tot MAX_STRIP_CANVAS_DIM om browserlimieten en vervorming onderaan te voorkomen.
 */
import { getState } from './state.js';

/** Maximale zijde van het strip-canvas (lager = minder vervorming onderaan, veiliger voor data-URL). */
const MAX_STRIP_CANVAS_DIM = 2048;

function scaleCanvasToMaxDim(source, maxDim) {
  const w = source.width;
  const h = source.height;
  if (w <= maxDim && h <= maxDim) return source;
  const scale = Math.min(maxDim / w, maxDim / h, 1);
  const outW = Math.round(w * scale);
  const outH = Math.round(h * scale);
  if (outW < 1 || outH < 1) return source;
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d');
  if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = true;
  if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h, 0, 0, outW, outH);
  return out;
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
  const ctx = canvas.getContext('2d');
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate(rad);
  ctx.translate(-w / 2, -h / 2);
  ctx.drawImage(s.image, 0, 0);
  const flipH = !!s.flipHorizontal;
  const flipV = !!s.flipVertical;
  let result = canvas;
  if (flipH || flipV) {
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx2 = out.getContext('2d');
    ctx2.translate(flipH ? out.width : 0, flipV ? out.height : 0);
    ctx2.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx2.drawImage(canvas, 0, 0);
    result = out;
  }
  return scaleCanvasToMaxDim(result, MAX_STRIP_CANVAS_DIM);
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
  if (outW > MAX_STRIP_CANVAS_DIM || outH > MAX_STRIP_CANVAS_DIM) {
    const scale = Math.min(MAX_STRIP_CANVAS_DIM / outW, MAX_STRIP_CANVAS_DIM / outH, 1);
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  }
  if (outW < 1 || outH < 1) return null;
  return { width: outW, height: outH };
}
