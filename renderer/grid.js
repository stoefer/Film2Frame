/**
 * Grid / frame-indeling – berekeningen voor aantal frames, actief frame, crop-rect.
 * Geen DOM.
 */
import { getState } from './state.js';
import { DEFAULT_GRID_WIDTH_RATIO_BY_FORMAT } from './constants.js';

/**
 * Afmetingen van één frame op het strip-canvas (voor stapberekening overlay-knoppen).
 */
export function getFrameDimensions(stripCanvas) {
  const s = getState();
  if (!stripCanvas || !s.numFrames) return { frameWidth: 0, frameHeight: 0 };
  const n = Math.max(1, s.numFrames);
  return {
    frameWidth: stripCanvas.width,
    frameHeight: Math.max(1, Math.round(stripCanvas.height / n))
  };
}

/**
 * Bounds van het actieve frame op het strip-canvas (in pixels).
 */
export function getActiveFrameBounds(stripCanvas) {
  const s = getState();
  if (!stripCanvas || !s.numFrames) return null;
  const n = Math.max(1, s.numFrames);
  const h = stripCanvas.height / n;
  const i = Math.max(0, Math.min(n - 1, s.activeFrameIndex));
  return {
    x: 0,
    y: i * h,
    width: stripCanvas.width,
    height: h
  };
}

/**
 * Crop een frame uit het strip-canvas naar een nieuw canvas.
 */
export function cropFrameCanvas(stripCanvas) {
  const bounds = getActiveFrameBounds(stripCanvas);
  if (!bounds) return null;
  const c = document.createElement('canvas');
  c.width = bounds.width;
  c.height = Math.max(1, Math.round(bounds.height));
  const ctx = c.getContext('2d');
  ctx.drawImage(stripCanvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, c.width, c.height);
  return c;
}

/**
 * Crop frame op gegeven index uit strip (grid-uitsnede, ladder-layout) voor export.
 * @param {HTMLCanvasElement} stripCanvas
 * @param {number} frameIndex 0-based
 * @returns {HTMLCanvasElement|null}
 */
export function cropFrameAtIndex(stripCanvas, frameIndex) {
  const s = getState();
  const n = Math.max(1, s.numFrames);
  if (!stripCanvas || frameIndex < 0 || frameIndex >= n) return null;
  const gridHeight = getLadderGridHeight(stripCanvas.height, n);
  const gridRect = getGridRect(stripCanvas.width, gridHeight);
  const oyTop = Number(s.gridOffsetY) || 0;
  const x = gridRect.x;
  const y = oyTop + frameIndex * gridHeight;
  const w = Math.max(1, gridRect.width);
  const h = Math.max(1, Math.round(gridHeight));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(stripCanvas, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

/**
 * Crop een segment van meerdere frames (rond het actieve frame) voor frame-voorbekijk bij uitzoomen.
 * Retourneert { canvas, gridRect } waarbij gridRect alleen het actieve frame in het segment markeert.
 */
export function cropFrameSegmentCanvas(stripCanvas, numFramesToShow) {
  const s = getState();
  if (!stripCanvas || !s.numFrames || numFramesToShow < 2) return null;
  const n = Math.max(1, s.numFrames);
  const activeIndex = Math.max(0, Math.min(n - 1, s.activeFrameIndex));
  const frameH = stripCanvas.height / n;
  const startIndex = Math.max(0, activeIndex - Math.floor((numFramesToShow - 1) / 2));
  const endIndex = Math.min(n, startIndex + numFramesToShow);
  const framesInSegment = endIndex - startIndex;
  if (framesInSegment < 1) return null;
  const segmentH = Math.max(1, Math.round(frameH * framesInSegment));
  const c = document.createElement('canvas');
  c.width = stripCanvas.width;
  c.height = segmentH;
  const ctx = c.getContext('2d');
  const frameHInSegment = segmentH / framesInSegment;
  for (let i = 0; i < framesInSegment; i++) {
    const sy = (startIndex + i) * frameH;
    const dy = i * frameHInSegment;
    const h = Math.min(frameH, stripCanvas.height - sy);
    ctx.drawImage(stripCanvas, 0, sy, stripCanvas.width, h, 0, dy, stripCanvas.width, frameHInSegment);
  }
  const activeInSegment = activeIndex - startIndex;
  const gridHeight = getLadderGridHeight(stripCanvas.height, n);
  const gridRectOne = getGridRect(stripCanvas.width, gridHeight);
  const oyTop = Number(s.gridOffsetY) || 0;
  const gridRects = [];
  for (let i = 0; i < framesInSegment; i++) {
    const stripY = oyTop + (startIndex + i) * gridHeight - startIndex * frameH;
    gridRects.push({
      x: gridRectOne.x,
      y: stripY,
      width: gridRectOne.width,
      height: gridHeight,
      frameNumber: startIndex + i + 1
    });
  }
  const segmentGridRect = gridRects[activeInSegment]
    ? { ...gridRects[activeInSegment], sourceWidth: c.width, sourceHeight: c.height }
    : { ...gridRectOne, y: gridRectOne.y + activeInSegment * frameHInSegment, sourceWidth: c.width, sourceHeight: c.height };
  const frameBoundaries = [];
  for (let i = 0; i < framesInSegment; i++) {
    frameBoundaries.push({
      frameNumber: startIndex + i + 1,
      y: i * frameHInSegment,
      height: frameHInSegment
    });
  }
  const gridRectInFrame = { x: gridRectOne.x, y: gridRectOne.y, width: gridRectOne.width, height: gridHeight };
  return { canvas: c, gridRect: segmentGridRect, frameBoundaries, gridRectInFrame, gridRects };
}

/** Standaard: scangrid is 75% van de breedte van de scanlint (gecentreerd). Fallback als formaat onbekend. */
export const DEFAULT_GRID_WIDTH_RATIO = 0.75;

/**
 * Effectieve linker/rechter marge in pixels voor standaard raster (gecentreerd).
 * Gebruikt filmformaat voor breedte: 16mm e.d. krijgen smallere raster dan lint.
 */
export function getDefaultGridOffsetX(frameWidth) {
  const s = getState();
  const ratio = (s.filmFormat && DEFAULT_GRID_WIDTH_RATIO_BY_FORMAT[s.filmFormat]) != null
    ? DEFAULT_GRID_WIDTH_RATIO_BY_FORMAT[s.filmFormat]
    : DEFAULT_GRID_WIDTH_RATIO;
  return (1 - ratio) / 2 * frameWidth;
}

/**
 * Huidige effectieve X-offset in pixels (voor tools: narrow/widen).
 * Als gridOffsetX 0 of niet gezet is, geldt de standaard 75%-marge.
 */
export function getEffectiveGridOffsetX(frameWidth) {
  const s = getState();
  if (s.gridOffsetXAsymmetric) {
    const m = getEffectiveGridMargins(frameWidth);
    return Math.round((m.left + m.right) / 2);
  }
  const raw = Number(s.gridOffsetX);
  if (Number.isFinite(raw) && raw !== 0) return raw;
  return getDefaultGridOffsetX(frameWidth);
}

/**
 * Hoogte van één rastercel in trapladder-layout: geen verticale tussenruimtes.
 * Totale ruimte (stripHeight - gridOffsetY - gridOffsetYBottom) wordt gelijk verdeeld over numFrames.
 */
export function getLadderGridHeight(stripHeight, numFrames) {
  const s = getState();
  const n = Math.max(1, numFrames);
  const oyTop = Number(s.gridOffsetY) || 0;
  const oyBottom = Number(s.gridOffsetYBottom) || 0;
  const total = Math.max(1, stripHeight - oyTop - oyBottom);
  return total / n;
}

/**
 * Grid-rect voor de frame-preview (rood raster) met offset.
 * gridOffsetY = bovenrand; gridOffsetYBottom = onderrand (onderlijn blijft vast bij verticaal duwen/rekken).
 * Als gridOffsetX niet gezet is (0): raster = 75% van de breedte van het lint (gecentreerd).
 */
/** Minimale rasterbreedte (ratio) zodat bij foutieve state nooit een verticale lijn ontstaat. */
const MIN_GRID_WIDTH_RATIO = 0.1;
const GRID_MIN_SIZE_PX = 20;
const GRID_MIN_SIZE_RATIO = 0.05;

/**
 * Clamp linker/rechter marge in canvas-pixels (zelfde regels als clampGridOffsetX in ui).
 */
export function clampGridMarginsCanvas(frameWidth, left, right) {
  if (frameWidth < 1) return { left: 0, right: 0 };
  const minW = Math.max(GRID_MIN_SIZE_PX, Math.round(frameWidth * GRID_MIN_SIZE_RATIO));
  const maxSum = Math.max(0, frameWidth - minW);
  let L = Math.max(0, Math.round(left));
  let R = Math.max(0, Math.round(right));
  if (L + R > maxSum) {
    const excess = L + R - maxSum;
    const tot = L + R;
    if (tot < 1) {
      L = Math.floor(maxSum / 2);
      R = maxSum - L;
    } else {
      L = Math.max(0, L - Math.round(excess * (L / tot)));
      R = Math.max(0, maxSum - L);
    }
  }
  return { left: L, right: R };
}

/**
 * Clamp gridOffsetY (boven) en gridOffsetYBottom (onder) in canvas-pixels; zelfde regels als clampGridOffsetY in ui.
 */
export function clampGridVerticalMarginsCanvas(frameHeight, numFrames, yTop, yBottom) {
  if (frameHeight < 1) return { top: 0, bottom: 0 };
  const n = Math.max(1, numFrames || 1);
  const stripHeight = frameHeight * n;
  const minTotalHeight = n * GRID_MIN_SIZE_PX;
  const margin = Math.max(1, Math.round(stripHeight * 0.05));
  const minTop = -margin;
  const minBottom = -margin;
  const maxSum = stripHeight + margin - minTotalHeight;
  let top = Math.round(yTop);
  let bottom = Math.round(yBottom);
  top = Math.max(minTop, Math.min(maxSum - bottom, top));
  bottom = Math.max(minBottom, Math.min(maxSum - top, bottom));
  top = Math.max(minTop, Math.min(maxSum - bottom, top));
  bottom = Math.max(minBottom, Math.min(maxSum - top, bottom));
  return { top, bottom };
}

/**
 * Verticaal samendrukken: Y-onder blijft (zoveel mogelijk) zoals ingesteld;
 * bovenmarge wordt vergroot zodat alle frames gelijke minimale hoogte krijgen (max. compressie naar boven toe).
 */
export function compressGridVerticallyFixedBottomCanvas(frameHeight, numFrames, fixedBottomPixels) {
  const n = Math.max(1, numFrames || 1);
  if (frameHeight < 1) return { top: 0, bottom: 0 };
  const stripHeight = frameHeight * n;
  const minTotalHeight = n * GRID_MIN_SIZE_PX;
  const margin = Math.max(1, Math.round(stripHeight * 0.05));
  const minTop = -margin;
  const minBottom = -margin;
  const maxSum = stripHeight + margin - minTotalHeight;
  let bottom = Math.round(Number(fixedBottomPixels) || 0);
  bottom = Math.max(minBottom, Math.min(maxSum - minTop, bottom));
  let top = stripHeight - bottom - minTotalHeight;
  top = Math.max(minTop, Math.min(maxSum - bottom, top));
  return clampGridVerticalMarginsCanvas(frameHeight, n, top, bottom);
}

function getSymmetricOxCanvas(frameWidthCanvas) {
  const s = getState();
  const raw = Number(s.gridOffsetX);
  if (Number.isFinite(raw) && raw !== 0) return raw;
  return getDefaultGridOffsetX(frameWidthCanvas);
}

/**
 * Linker/rechter marge in canvas-pixels.
 */
export function getEffectiveGridMargins(frameWidthCanvas) {
  const s = getState();
  const ox = getSymmetricOxCanvas(frameWidthCanvas);
  if (!s.gridOffsetXAsymmetric) {
    return clampGridMarginsCanvas(frameWidthCanvas, ox, ox);
  }
  let L = Number(s.gridOffsetXLeft);
  let R = Number(s.gridOffsetXRight);
  if (!Number.isFinite(L)) L = ox;
  if (!Number.isFinite(R)) R = ox;
  return clampGridMarginsCanvas(frameWidthCanvas, L, R);
}

/**
 * @param {number} frameWidth - Breedte van het frame (canvas of display).
 * @param {number} frameHeight - Hoogte van één cel.
 * @param {number} [displayScale] - Als gezet: gridOffsetX is in canvas-pixels en wordt omgerekend naar display (ox = gridOffsetX * displayScale). Voor strip-preview payload.
 */
export function getGridRect(frameWidth, frameHeight, displayScale) {
  return getGridRectWithOverride(frameWidth, frameHeight, displayScale, undefined);
}

/**
 * Zelfde als getGridRect maar met optionele override voor gridOffsetX (canvas-pixels). Gebruik na Hand-beweging zodat payload exact newX gebruikt.
 * frameWidth = breedte in display-coördinaten wanneer displayScale &lt; 1; anders canvas.
 */
export function getGridRectWithOverride(frameWidth, frameHeight, displayScale, overrideGridOffsetX) {
  const scale = Number(displayScale) && displayScale > 0 ? displayScale : 1;
  const frameWidthCanvas = scale !== 1 ? frameWidth / scale : frameWidth;
  const hasOverride = overrideGridOffsetX !== undefined && overrideGridOffsetX !== null;
  let leftC;
  let rightC;
  if (hasOverride && Number.isFinite(Number(overrideGridOffsetX))) {
    const ox = Number(overrideGridOffsetX);
    const maxOx = (frameWidthCanvas * (1 - MIN_GRID_WIDTH_RATIO)) / 2;
    const oxClamped = Math.min(Math.max(0, ox), maxOx);
    leftC = oxClamped;
    rightC = oxClamped;
  } else {
    const m = getEffectiveGridMargins(frameWidthCanvas);
    leftC = m.left;
    rightC = m.right;
  }
  const maxOx = (frameWidthCanvas * (1 - MIN_GRID_WIDTH_RATIO)) / 2;
  leftC = Math.min(leftC, maxOx);
  rightC = Math.min(rightC, maxOx);
  const clamped = clampGridMarginsCanvas(frameWidthCanvas, leftC, rightC);
  leftC = clamped.left;
  rightC = clamped.right;
  const x = leftC * scale;
  const w = Math.max(1, frameWidth - leftC * scale - rightC * scale);
  return {
    x,
    y: 0,
    width: w,
    height: Math.max(1, frameHeight),
    sourceWidth: frameWidth,
    sourceHeight: frameHeight
  };
}
