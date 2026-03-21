/**
 * Preview-vensters – stuurt strip-payload naar de main process (scanlint-preview).
 * Afhankelijk van state, strip-loader, grid.
 */
import { getState } from './state.js';
import { getStripCanvas, getStripCanvasDimensions } from './strip-loader.js';
import { getGridRect, getGridRectWithOverride } from './grid.js';
import { STRIP_EXTENDED_RATIO } from './constants.js';

/** Standaard max. zijde als state nog niet gezet is. */
const STRIP_PREVIEW_MAX_DIM_DEFAULT = 1536;

/** Geeft geschaalde breedte/hoogte voor preview zonder canvas te tekenen (voor grid-only updates). Export voor delta-schaling Hand-tool. */
export function getScaledDimensions(sourceCanvas) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  return getScaledDimensionsFromSize(w, h);
}

/** Zelfde schaling als getScaledDimensions maar op basis van breedte/hoogte (geen canvas nodig). Voor snelle delta-berekening. */
export function getScaledDimensionsFromSize(w, h) {
  const max = Math.max(512, (getState().stripPreviewMaxDim || STRIP_PREVIEW_MAX_DIM_DEFAULT));
  if (w <= max && h <= max) return { width: w, height: h, scale: 1 };
  const scale = Math.min(max / w, max / h, 1);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale
  };
}

/**
 * Schaal een canvas proportioneel terug als het groter is dan de ingestelde max. zijde.
 * Voorkomt dat toDataURL() te grote payloads geeft; hogere resolutie = nauwkeurigere rasterplaatsing.
 */
function scaleStripCanvasForPreview(sourceCanvas) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const dim = getScaledDimensions(sourceCanvas);
  if (dim.scale >= 1) return sourceCanvas;
  const out = document.createElement('canvas');
  out.width = dim.width;
  out.height = dim.height;
  const ctx = out.getContext('2d');
  if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = true;
  if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, w, h, 0, 0, dim.width, dim.height);
  return out;
}

/** Bouwt alleen het grid-gedeelte van de payload (geen beeld). overrideGridOffsetX: gebruik deze X i.p.v. state (voor directe doorstuur na Hand-beweging). */
export function buildGridPayload(displayWidth, displayHeight, scale, overrideGridOffsetX) {
  const s = getState();
  const numFrames = Math.max(1, s.numFrames);
  const activeIndex = Math.max(0, Math.min(numFrames - 1, s.activeFrameIndex));
  const extendedDisplayHeight = Math.max(displayHeight, Math.round(displayHeight * STRIP_EXTENDED_RATIO));
  const marginTop = extendedDisplayHeight > displayHeight ? Math.round((extendedDisplayHeight - displayHeight) / 2) : 0;
  let oyTop;
  let gridTotalHeight;
  const defaultAlign = (Number(s.gridOffsetY) || 0) === 0 && (Number(s.gridOffsetYBottom) || 0) === 0;
  if (defaultAlign) {
    gridTotalHeight = displayHeight;
    oyTop = marginTop;
  } else {
    oyTop = marginTop + (Number(s.gridOffsetY) || 0) * scale;
    const oyBottom = (Number(s.gridOffsetYBottom) || 0) * scale;
    gridTotalHeight = Math.max(1, displayHeight - (Number(s.gridOffsetY) || 0) * scale - oyBottom);
  }
  const gridHeight = Math.max(1, gridTotalHeight) / numFrames;
  const gridRect = getGridRectWithOverride(displayWidth, gridHeight, scale, overrideGridOffsetX);
  const gridRects = [];
  for (let i = 0; i < numFrames; i++) {
    gridRects.push({
      x: gridRect.x,
      y: oyTop + i * gridHeight,
      width: gridRect.width,
      height: gridHeight,
      frameNumber: i + 1
    });
  }
  return {
    displayWidth,
    displayHeight,
    extendedDisplayHeight,
    numFrames,
    activeFrameIndex: activeIndex,
    activeFrameNumber: activeIndex + 1,
    gridRect: { x: gridRect.x, y: gridRect.y, width: gridRect.width, height: gridRect.height },
    gridRects,
    arrowStepPx: Math.max(1, Math.min(10, Number(s.arrowStepPx) || 1)),
    arrowStepShiftPx: Math.max(10, Math.min(100, Number(s.arrowStepShiftPx) || 10)),
    gridOffsetX: Number(s.gridOffsetX) || 0,
    gridOffsetY: Number(s.gridOffsetY) || 0,
    gridOffsetYBottom: Number.isFinite(Number(s.gridOffsetYBottom)) ? Math.round(s.gridOffsetYBottom) : 0
  };
}

function sendStripUpdateFull() {
  if (typeof window.api?.sendStripUpdate !== 'function') return;
  const canvas = getStripCanvas();
  const s = getState();
  const n = Math.max(1, s.numFrames || 1);
  if (canvas) {
    const scaled = scaleStripCanvasForPreview(canvas);
    const scale = canvas.height > 0 ? scaled.height / canvas.height : 1;
    const payload = buildGridPayload(scaled.width, scaled.height, scale);
    payload.stripDataUrl = scaled.toDataURL('image/png');
    window.api.sendStripUpdate(payload);
    return;
  }
  const dims = getStripCanvasDimensions();
  if (dims && dims.width >= 1 && dims.height >= 1) {
    const dim = getScaledDimensionsFromSize(dims.width, dims.height);
    const scale = dim.height >= 1 ? dim.height / dims.height : 1;
    const payload = buildGridPayload(dim.width, dim.height, scale);
    window.api.sendStripUpdate(payload);
    return;
  }
  if (n >= 1) {
    const fallbackW = 800;
    const fallbackH = Math.max(200, Math.round(600 / n) * n);
    const payload = buildGridPayload(fallbackW, fallbackH, 1);
    window.api.sendStripUpdate(payload);
    return;
  }
  window.api.sendStripUpdate({});
}

/** Stuurt alleen rasterdata naar scanlint-preview (geen beeld). Realtime bij verplaatsen/aanpassen raster. Scanlint-beeld wordt niet opnieuw geladen. */
function sendStripUpdateGridOnly() {
  if (typeof window.api?.sendStripUpdate !== 'function') return;
  let payload = null;
  const canvas = getStripCanvas();
  if (canvas) {
    const dim = getScaledDimensions(canvas);
    const scale = canvas.height > 0 ? dim.height / canvas.height : 1;
    payload = buildGridPayload(dim.width, dim.height, scale);
  } else {
    const dims = getStripCanvasDimensions();
    if (dims && dims.width >= 1 && dims.height >= 1) {
      const dim = getScaledDimensionsFromSize(dims.width, dims.height);
      const scale = dim.height >= 1 ? dim.height / dims.height : 1;
      payload = buildGridPayload(dim.width, dim.height, scale);
    }
  }
  if (payload) window.api.sendStripUpdate(payload);
}

export function refreshPreviews() {
  sendStripUpdateFull();
}

/** Alleen raster bijwerken. Optioneel: prebuiltPayload (van buildGridPayload) om tweede getStripCanvas te vermijden. */
export function refreshPreviewsGridOnly(prebuiltPayload) {
  if (prebuiltPayload && Array.isArray(prebuiltPayload.gridRects) && prebuiltPayload.gridRects.length > 0 && Number(prebuiltPayload.displayWidth) > 0 && Number(prebuiltPayload.displayHeight) > 0) {
    if (typeof window.api?.sendStripUpdate === 'function') window.api.sendStripUpdate(prebuiltPayload);
    return;
  }
  sendStripUpdateGridOnly();
}
