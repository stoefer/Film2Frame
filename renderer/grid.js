/**
 * Grid / frame-indeling – berekeningen voor aantal frames, actief frame, crop-rect.
 * Geen DOM.
 */
import { getState, setGridFrozenLowerCellHeightPx } from './state.js';
import { DEFAULT_GRID_WIDTH_RATIO_BY_FORMAT, GRID_TOP_SLACK_RATIO } from './constants.js';

/**
 * Afmetingen van één frame op het strip-canvas (voor stapberekening overlay-knoppen).
 */
export function getFrameDimensions(stripCanvas) {
  const s = getState();
  if (!stripCanvas || !s.numFrames) return { frameWidth: 0, frameHeight: 0 };
  const n = Math.max(1, s.numFrames);
  /* Exact S/n — zelfde als buildGridPayload / getLadderRowsCanvasFromMargins. Afronden hier gaf stripHeight = n*round(S/n) ≠ S
   * en daarmee afwijkende clamp/split-berekeningen t.o.v. de ladder. */
  const fh = stripCanvas.height / n;
  return {
    frameWidth: stripCanvas.width,
    frameHeight: fh >= 1 ? fh : 1
  };
}

/**
 * Bounds van het actieve frame op het strip-canvas (in pixels).
 */
export function getActiveFrameBounds(stripCanvas) {
  const s = getState();
  if (!stripCanvas || !s.numFrames) return null;
  const n = Math.max(1, s.numFrames);
  const i = Math.max(0, Math.min(n - 1, s.activeFrameIndex));
  const rows = getLadderRowsCanvas(stripCanvas.height, n);
  const r = rows[i];
  return {
    x: 0,
    y: r.y,
    width: stripCanvas.width,
    height: r.h
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
 * Uitsnede-rechthoek in strip-canvas-pixels (zelfde coördinaten als cropFrameAtIndex).
 * @param {HTMLCanvasElement} stripCanvas
 * @param {number} frameIndex 0-based
 * @returns {{ x: number, y: number, w: number, h: number }|null}
 */
export function getFrameCropRectInStripPx(stripCanvas, frameIndex) {
  const s = getState();
  const n = Math.max(1, s.numFrames);
  if (!stripCanvas || frameIndex < 0 || frameIndex >= n) return null;
  const rows = getLadderRowsCanvas(stripCanvas.height, n);
  const row = rows[frameIndex];
  const gridRect = getGridRect(stripCanvas.width, row.h);
  let x = gridRect.x;
  let y = row.y;
  const w = Math.max(1, gridRect.width);
  const h = Math.max(1, Math.round(row.h));
  if (s.flipHorizontal) x = stripCanvas.width - x - w;
  if (s.flipVertical) y = stripCanvas.height - y - h;
  return { x, y, w, h };
}

/**
 * Crop frame op gegeven index uit strip (grid-uitsnede, ladder-layout) voor export.
 * @param {HTMLCanvasElement} stripCanvas
 * @param {number} frameIndex 0-based
 * @returns {HTMLCanvasElement|null}
 */
export function cropFrameAtIndex(stripCanvas, frameIndex) {
  const r = getFrameCropRectInStripPx(stripCanvas, frameIndex);
  if (!r) return null;
  const c = document.createElement('canvas');
  c.width = r.w;
  c.height = r.h;
  const ctx = c.getContext('2d');
  ctx.drawImage(stripCanvas, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  return c;
}

/**
 * Uitsnede op export-strip (zelfde rekenregel als cropFrameAtIndexForExport), zonder canvas.
 * Let op: dit is de *getekende* uitsnede (afgekapt op stripranden). Voor UI-formaat: getExportFrameCropSizeLogicalPx.
 * @returns {{ width: number, height: number }|null}
 */
export function getExportFrameCropSizePx(fullStrip, previewStrip, frameIndex) {
  const rect = getExportFrameCropRectPx(fullStrip, previewStrip, frameIndex);
  if (!rect) return null;
  return { width: rect.width, height: rect.height };
}

/**
 * Logisch rasterformaat in export-pixels (niet afgekapt op striprand).
 * Als het raster deels buiten beeld staat, blijft W×H gelijk — anders “springt” Detecteer Grenzen
 * het formaat in de UI en moet de gebruiker Laad Raster gebruiken.
 */
export function getExportFrameCropSizeLogicalPx(fullStrip, previewStrip, frameIndex) {
  if (!fullStrip || !previewStrip || previewStrip.width < 1 || previewStrip.height < 1) return null;
  const r = getFrameCropRectInStripPx(previewStrip, frameIndex);
  if (!r) return null;
  const kx = fullStrip.width / previewStrip.width;
  const ky = fullStrip.height / previewStrip.height;
  if (!(kx > 0) || !(ky > 0)) return null;
  return {
    width: Math.max(1, Math.round(r.w * kx)),
    height: Math.max(1, Math.round(r.h * ky))
  };
}

function getExportFrameCropRectPx(fullStrip, previewStrip, frameIndex) {
  if (!fullStrip || !previewStrip || previewStrip.width < 1 || previewStrip.height < 1) return null;
  const r = getFrameCropRectInStripPx(previewStrip, frameIndex);
  if (!r) return null;
  const kx = fullStrip.width / previewStrip.width;
  const ky = fullStrip.height / previewStrip.height;
  const x = Math.max(0, Math.floor(r.x * kx));
  const y = Math.max(0, Math.floor(r.y * ky));
  const logicalW = Math.max(1, Math.round(r.w * kx));
  const logicalH = Math.max(1, Math.round(r.h * ky));
  /* Alleen de draw-rect kappen; breedte/hoogte voor UI komen uit getExportFrameCropSizeLogicalPx. */
  const w = Math.max(1, Math.min(fullStrip.width - x, logicalW));
  const h = Math.max(1, Math.min(fullStrip.height - y, logicalH));
  return { x, y, w, h, width: w, height: h, logicalWidth: logicalW, logicalHeight: logicalH };
}

/**
 * Export: raster staat in previewStrip (laag); fullStrip is zelfde beeld op hogere resolutie (uniform geschaald).
 * @param {HTMLCanvasElement} fullStrip
 * @param {HTMLCanvasElement} previewStrip
 * @param {number} frameIndex 0-based
 * @returns {HTMLCanvasElement|null}
 */
export function cropFrameAtIndexForExport(fullStrip, previewStrip, frameIndex) {
  const rect = getExportFrameCropRectPx(fullStrip, previewStrip, frameIndex);
  if (!rect) return null;
  const { x, y, w, h } = rect;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  /* CPU-backed (willReadFrequently): per-frame export-canvas. Bij batch van duizenden frames voorkomt dit
   * dat de GPU-canvaspool uitgeput raakt (→ zwarte/corrupte uitsnedes na ~1700 frames). */
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fullStrip, x, y, w, h, 0, 0, w, h);
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
  const rows = getLadderRowsCanvas(stripCanvas.height, n);
  for (let i = 0; i < framesInSegment; i++) {
    const idx = startIndex + i;
    const r = rows[idx];
    const dy = i * frameHInSegment;
    ctx.drawImage(stripCanvas, 0, r.y, stripCanvas.width, r.h, 0, dy, stripCanvas.width, frameHInSegment);
  }
  const activeInSegment = activeIndex - startIndex;
  const gridRectOne = getGridRect(stripCanvas.width, rows[activeIndex].h);
  const gridRects = [];
  for (let i = 0; i < framesInSegment; i++) {
    gridRects.push({
      x: gridRectOne.x,
      y: i * frameHInSegment,
      width: gridRectOne.width,
      height: frameHInSegment,
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
  const gridRectInFrame = { x: gridRectOne.x, y: gridRectOne.y, width: gridRectOne.width, height: rows[activeIndex].h };
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
 * gridOffsetY = bovenrand; gridOffsetYBottom = onderrand. Rigide verticale pan: beide tegengesteld aanpassen (Hand ▲▼) zodat celhoogte gelijk blijft.
 * Als gridOffsetX niet gezet is (0): raster = 75% van de breedte van het lint (gecentreerd).
 */
/** Minimale rasterbreedte (ratio) zodat bij foutieve state nooit een verticale lijn ontstaat. */
const MIN_GRID_WIDTH_RATIO = 0.1;
const GRID_MIN_SIZE_PX = 20;
const GRID_MIN_SIZE_RATIO = 0.05;

/** Minimale gridOffsetY (canvas-px): −5% striphoogte, voor uitrekken tot net boven de film. */
export function getMinGridOffsetYCanvas(stripHeight) {
  const h = Number(stripHeight);
  if (!Number.isFinite(h) || h < 1) return 0;
  return -Math.max(1, Math.round(h * GRID_TOP_SLACK_RATIO));
}

/** Minimaal (negatief) gridOffsetYBottom: zelfde verhouding als boven — extra ruimte onder het lint. */
export function getMinGridOffsetYBottomCanvas(stripHeight) {
  return getMinGridOffsetYCanvas(stripHeight);
}

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
  const minTop = getMinGridOffsetYCanvas(stripHeight);
  const minBottom = getMinGridOffsetYBottomCanvas(stripHeight);
  const maxSum = Math.max(0, stripHeight - minTotalHeight);
  let top = Math.round(yTop);
  let bottom = Math.round(yBottom);
  top = Math.max(minTop, Math.min(maxSum - bottom, top));
  bottom = Math.max(minBottom, Math.min(maxSum - top, bottom));
  top = Math.max(minTop, Math.min(maxSum - bottom, top));
  bottom = Math.max(minBottom, Math.min(maxSum - top, bottom));
  return { top, bottom };
}

/**
 * Lijnindex k: 0 = boven raster, n = onderkant raster. Altijd uit state.gridVerticalPivotCustomK.
 */
export function resolveVerticalPivotKFromState() {
  const s = getState();
  const n = Math.max(1, s.numFrames || 1);
  return Math.max(0, Math.min(n, Math.round(Number(s.gridVerticalPivotCustomK) || 0)));
}

/**
 * True = split-pan actief (meerdere cellen boven de lijn: k ≥ 2 en k < n).
 * Bij k === 1 is er geen ruimte om d te variëren (clamp geeft altijd 0) — dan rigide pan / marges.
 */
export function usesSplitLowerVerticalPan() {
  const n = Math.max(1, getState().numFrames || 1);
  const k = resolveVerticalPivotKFromState();
  return k > 1 && k < n;
}

/** Cache-key voor eenmalig initialiseren van frozen lower height. */
let lastPivotFrozenKey = '';

/**
 * Geen split (k=0 of k=n): markeer cache zó dat we niet terugvallen op
 * lastPivotFrozenKey === '' — dat zou de “snapshot frozen behouden”-tak triggeren en hLo niet opnieuw
 * laten seeden bij terugkeren naar een middenframe → clamp zet d op 0 en uitrekken gaat verloren.
 */
const PIVOT_FROZEN_NO_SPLIT_KEY = '__no_split__';

/** Laatste split-cachekey vóór we naar no-split gingen (k=0 of k=n); voorkomt herberekenen hLo bij terugkeren naar dezelfde k. */
let lastPivotSplitKeyBeforeNoSplit = '';

/**
 * Zet gridFrozenLowerCellHeightPx bij eerste split-layout (of na n/k/mode-wijziging): h = (inner+d)/n.
 * Behoudt opgeslagen frozen na laden (lastPivotFrozenKey === '' + frozen gezet → alleen key vastleggen).
 */
export function ensurePivotFrozenLowerCellHeight(frameHeight, numFrames) {
  const s = getState();
  const n = Math.max(1, numFrames || 1);
  const k = resolveVerticalPivotKFromState();
  const key = `${n}|${k}|pivot`;
  if (!usesSplitLowerVerticalPan()) {
    if (lastPivotFrozenKey !== '' && lastPivotFrozenKey !== PIVOT_FROZEN_NO_SPLIT_KEY) {
      lastPivotSplitKeyBeforeNoSplit = lastPivotFrozenKey;
    }
    lastPivotFrozenKey = PIVOT_FROZEN_NO_SPLIT_KEY;
    return;
  }
  if (
    key === lastPivotSplitKeyBeforeNoSplit &&
    s.gridFrozenLowerCellHeightPx != null &&
    Number.isFinite(Number(s.gridFrozenLowerCellHeightPx))
  ) {
    lastPivotFrozenKey = key;
    lastPivotSplitKeyBeforeNoSplit = '';
    return;
  }
  if (key === lastPivotFrozenKey && s.gridFrozenLowerCellHeightPx != null && Number.isFinite(Number(s.gridFrozenLowerCellHeightPx))) {
    return;
  }
  if (lastPivotFrozenKey === '' && s.gridFrozenLowerCellHeightPx != null && Number.isFinite(Number(s.gridFrozenLowerCellHeightPx))) {
    lastPivotFrozenKey = key;
    return;
  }
  const c = clampGridVerticalMarginsCanvas(frameHeight, n, s.gridOffsetY ?? 0, s.gridOffsetYBottom ?? 0);
  const inner = frameHeight * n - c.top - c.bottom;
  const d = Number(s.gridSplitLowerPanCanvas) || 0;
  const h = (inner + d) / n;
  setGridFrozenLowerCellHeightPx(h);
  lastPivotFrozenKey = key;
  lastPivotSplitKeyBeforeNoSplit = '';
}

/**
 * Bovenblok-hoogte U en effectieve onder-celhoogte hLo (onder lijn k vast, tenzij inner te klein).
 */
function computeUpperInnerAndLowerCellHeight(inner, numFrames, splitK) {
  const s = getState();
  const n = Math.max(1, numFrames || 1);
  const k = Math.max(0, Math.min(n, Math.round(Number(splitK) || 0)));
  const nLo = n - k;
  const minH = GRID_MIN_SIZE_PX;
  if (nLo <= 0 || k <= 0) {
    return { U: inner, hLo: inner / Math.max(1, n), nLo: 0, k };
  }
  const dRef = Number(s.gridSplitLowerPanCanvas) || 0;
  let hLo = Number(s.gridFrozenLowerCellHeightPx);
  if (!Number.isFinite(hLo) || hLo < minH) {
    hLo = (inner + dRef) / n;
  }
  const maxLowerSum = Math.max(0, inner - k * minH);
  let L = nLo * hLo;
  if (L > maxLowerSum + 1e-9) {
    hLo = Math.max(minH, maxLowerSum / nLo);
    L = nLo * hLo;
  }
  /* Geen setGridFrozenLowerCellHeightPx hier: dat verschuift de referentielijn bij elke herberekening. */
  return { U: Math.max(0, inner - L), hLo, nLo, k };
}

/** Referentielijn-koppeling aan scanlint-previewpaneel staat aan (standaard ja). */
export function panelUsesVerticalAnchorLink() {
  return getState().gridPanelLinkVerticalAnchor !== false;
}

/** Clamp split-delta d: verdeling in het bovenblok (k cellen), onderblok vast. */
export function clampGridSplitLowerPanCanvas(frameHeight, numFrames, top, bottom, splitK, splitDelta) {
  const n = Math.max(1, numFrames || 1);
  if (frameHeight < 1) return 0;
  const c = clampGridVerticalMarginsCanvas(frameHeight, n, top, bottom);
  const S = frameHeight * n;
  const inner = S - c.top - c.bottom;
  const k = Math.max(0, Math.min(n, Math.round(Number(splitK) || 0)));
  let d = Math.round(Number(splitDelta) || 0);
  if (k <= 0 || k >= n || inner < n * GRID_MIN_SIZE_PX) return 0;
  const minH = GRID_MIN_SIZE_PX;
  const { U, k: kUse } = computeUpperInnerAndLowerCellHeight(inner, n, splitK);
  if (kUse <= 1 || U < kUse * GRID_MIN_SIZE_PX) return 0;
  const dLow = Math.ceil(kUse * minH - U);
  const dHigh = Math.floor((U - kUse * minH) / Math.max(1, kUse - 1));
  if (dLow > dHigh) return 0;
  return Math.max(dLow, Math.min(dHigh, d));
}

/**
 * Ladder-rijen voor gegeven (reeds geclampte) T/B; som van h = S − T − B exact (geen per-cel MIN-clamp).
 * Gebruik dezelfde T/B als buildGridPayload voor yTopDisp/gridTotalHeight om uitrekken onderaan te voorkomen.
 */
export function getLadderRowsCanvasFromMargins(stripHeight, numFrames, top, bottom) {
  const s = getState();
  const n = Math.max(1, numFrames);
  const S = Math.max(1, Number(stripHeight) || 1);
  const fh = S / n;
  ensurePivotFrozenLowerCellHeight(fh, n);
  const T = Math.round(Number(top) || 0);
  /* Zelfde als clampGridVerticalMarginsCanvas: negatieve bottom is toegestaan (onderste slack). */
  const B = Math.round(Number(bottom) || 0);
  const inner = Math.max(0, S - T - B);
  const k = resolveVerticalPivotKFromState();

  if (inner < 1) {
    const h = S / n;
    return Array.from({ length: n }, (_, i) => ({ y: T + i * h, h }));
  }

  if (!usesSplitLowerVerticalPan() || k <= 0 || k >= n || inner < n * GRID_MIN_SIZE_PX) {
    const h = inner / n;
    return Array.from({ length: n }, (_, i) => ({
      y: T + i * h,
      h
    }));
  }

  const d = clampGridSplitLowerPanCanvas(fh, n, T, B, k, Number(s.gridSplitLowerPanCanvas) || 0);

  /* d=0: uniforme ladder (exact inner/n); split-math wijkt subpixel af bij kleine d. */
  if (d === 0) {
    const h = inner / n;
    return Array.from({ length: n }, (_, i) => ({
      y: T + i * h,
      h
    }));
  }

  const { U, hLo, k: kUse } = computeUpperInnerAndLowerCellHeight(inner, n, k);
  const rows = [];
  let y = T;
  if (kUse <= 1) {
    rows.push({ y, h: U });
    y += U;
  } else {
    const hUp = (U + d) / kUse;
    const hLastUpper = hUp - d;
    for (let i = 0; i < kUse - 1; i++) {
      rows.push({ y, h: hUp });
      y += hUp;
    }
    rows.push({ y, h: hLastUpper });
    y += hLastUpper;
  }
  for (let i = kUse; i < n; i++) {
    rows.push({ y, h: hLo });
    y += hLo;
  }
  return rows;
}

/**
 * Per-frame Y en hoogte op strip-canvas (uit state + clamp).
 */
export function getLadderRowsCanvas(stripHeight, numFrames) {
  const s = getState();
  const n = Math.max(1, numFrames);
  const fh = stripHeight / n;
  const c = clampGridVerticalMarginsCanvas(fh, n, s.gridOffsetY ?? 0, s.gridOffsetYBottom ?? 0);
  return getLadderRowsCanvasFromMargins(stripHeight, numFrames, c.top, c.bottom);
}

export function applySplitLowerPanStepCanvas(frameHeight, numFrames, top, bottom, splitK, splitDelta, dyCanvas) {
  const d0 = Math.round(Number(splitDelta) || 0) + Math.round(Number(dyCanvas) || 0);
  return clampGridSplitLowerPanCanvas(frameHeight, numFrames, top, bottom, splitK, d0);
}

/** towardCompress true = δ naar maximum (blok omlaag); false = minimum (blok omhoog). */
export function splitLowerPanToBoundaryCanvas(frameHeight, numFrames, top, bottom, splitK, towardCompress) {
  const n = Math.max(1, numFrames || 1);
  if (frameHeight < 1) return 0;
  const c = clampGridVerticalMarginsCanvas(frameHeight, n, top, bottom);
  const S = frameHeight * n;
  const inner = S - c.top - c.bottom;
  const k = Math.max(0, Math.min(n, Math.round(Number(splitK) || 0)));
  if (k <= 0 || k >= n || inner < n * GRID_MIN_SIZE_PX) return 0;
  const minH = GRID_MIN_SIZE_PX;
  const { U, k: kUse } = computeUpperInnerAndLowerCellHeight(inner, n, splitK);
  if (kUse <= 1 || U < kUse * GRID_MIN_SIZE_PX) return 0;
  const dLow = Math.ceil(kUse * minH - U);
  const dHigh = Math.floor((U - kUse * minH) / Math.max(1, kUse - 1));
  if (dLow > dHigh) return 0;
  return towardCompress ? dHigh : dLow;
}

/**
 * Verschuif het raster als geheel over het lint: alle frames behouden dezelfde celhoogte
 * (gridOffsetY en gridOffsetYBottom tegengesteld, som blijft gelijk).
 * dyCanvas > 0: raster schuift t.o.v. de film naar beneden (bovenmarge groeit, ondermarge krimpt).
 *
 * Begrenst tot de scan: top/bottom ≥ 0 — de eerste rakende buitenlijn stopt de beweging,
 * zonder het rasterformaat te verkleinen (oude clamp kon hoogte “afkappen”).
 */
export function applyRigidVerticalPanStepCanvas(frameHeight, numFrames, top, bottom, dyCanvas) {
  const n = Math.max(1, numFrames || 1);
  if (frameHeight < 1) return { top: Number(top) || 0, bottom: Math.round(Number(bottom) || 0) };
  const S = Math.max(1, Math.round(frameHeight * n));
  const d = Math.round(Number(dyCanvas) || 0);
  return panVerticalMarginsPreserveHeightOnStrip(S, top, bottom, d);
}

/**
 * Verticale pan met vaste hoogte. Standaard binnen de scan (top/bottom ≥ 0).
 * Als het raster groter is dan het lint (zeldzaam), val terug op slack-marges i.p.v. te krimpen.
 */
export function panVerticalMarginsPreserveHeightOnStrip(stripHeight, top, bottom, deltaY) {
  const S = Math.max(1, Math.round(Number(stripHeight) || 0));
  const T0 = Math.round(Number(top) || 0);
  const B0 = Math.round(Number(bottom) || 0);
  const h = Math.max(1, S - T0 - B0);
  const d = Math.round(Number(deltaY) || 0);

  if (h > S) {
    // Past niet binnen scan: hoogte behouden, beperkte slack toestaan
    const minT = getMinGridOffsetYCanvas(S);
    const minB = getMinGridOffsetYBottomCanvas(S);
    let nT = T0 + d;
    const maxT = S - h - minB;
    nT = Math.max(minT, Math.min(maxT, nT));
    return { top: nT, bottom: S - h - nT };
  }

  let nT = T0 + d;
  // minB = 0 → maxT = S - h; minT = 0 → eerste rakende boven-/onderrand stopt pan
  const maxT = S - h;
  nT = Math.max(0, Math.min(maxT, nT));
  return { top: nT, bottom: S - h - nT };
}

/**
 * Verticale pan met vaste onderrand: alleen gridOffsetY (boven) verandert; gridOffsetYBottom blijft.
 * De onderkant van het raster blijft op strip-Y = stripHeight − bottom (referentielijn k = n + koppel aan).
 * Binnenruimte en dus celhoogte veranderen wel — geschikt om framehoogte af te stemmen zonder de onderrand te verliezen.
 */
export function applyBottomAnchoredVerticalPanStepCanvas(frameHeight, numFrames, top, bottom, dyCanvas) {
  const n = Math.max(1, numFrames || 1);
  if (frameHeight < 1) return { top: Number(top) || 0, bottom: Math.round(Number(bottom) || 0) };
  const d = Math.round(Number(dyCanvas) || 0);
  if (d === 0) return clampGridVerticalMarginsCanvas(frameHeight, n, top, bottom);
  const T = Number(top) || 0;
  const B = Math.round(Number(bottom) || 0);
  return clampGridVerticalMarginsCanvas(frameHeight, n, T + d, B);
}

/**
 * Shift+Duw tot rand bij vaste onderrand: maximaal/minimaal binnen clamp (kortste/langste cellen, onder blijft).
 */
export function bottomAnchoredVerticalPanToBoundaryCanvas(frameHeight, numFrames, top, bottom, towardCompress) {
  const n = Math.max(1, numFrames || 1);
  if (frameHeight < 1) return { top: 0, bottom: 0 };
  const S = frameHeight * n;
  const minTotalHeight = n * GRID_MIN_SIZE_PX;
  const minTop = getMinGridOffsetYCanvas(S);
  const maxSum = Math.max(0, S - minTotalHeight);
  const B = Math.round(Number(bottom) || 0);
  const maxTop = maxSum - B;
  if (towardCompress) {
    return clampGridVerticalMarginsCanvas(frameHeight, n, maxTop, B);
  }
  return clampGridVerticalMarginsCanvas(frameHeight, n, minTop, B);
}

/**
 * Zelfde als rigide pan, maar tot de clamp-grens: towardCompress true = zoveel mogelijk in "Samendruk"-richting
 * (top maximaliseren tot bottom = 0); false = zoveel mogelijk omhoog (top = 0), hoogte intact.
 */
export function rigidVerticalPanToBoundaryCanvas(frameHeight, numFrames, top, bottom, towardCompress) {
  const n = Math.max(1, numFrames || 1);
  if (frameHeight < 1) return { top: 0, bottom: 0 };
  const S = Math.max(1, Math.round(frameHeight * n));
  const c0 = panVerticalMarginsPreserveHeightOnStrip(S, top, bottom, 0);
  const h = Math.max(1, S - c0.top - c0.bottom);
  if (h > S) {
    // Fallback: oude slack-gedrag alleen als raster groter is dan lint
    const C = c0.top + c0.bottom;
    const minTop = getMinGridOffsetYCanvas(S);
    if (towardCompress) {
      return clampGridVerticalMarginsCanvas(frameHeight, n, C, 0);
    }
    return clampGridVerticalMarginsCanvas(frameHeight, n, minTop, C - minTop);
  }
  if (towardCompress) {
    return { top: S - h, bottom: 0 };
  }
  return { top: 0, bottom: S - h };
}

/**
 * Verticaal samendrukken (celhoogte omlaag): Y-onder blijft; bovenmarge wordt vergroot tot minimale celhoogte.
 */
export function compressGridVerticallyFixedBottomCanvas(frameHeight, numFrames, fixedBottomPixels) {
  const n = Math.max(1, numFrames || 1);
  if (frameHeight < 1) return { top: 0, bottom: 0 };
  const stripHeight = frameHeight * n;
  const minTotalHeight = n * GRID_MIN_SIZE_PX;
  const minTop = getMinGridOffsetYCanvas(stripHeight);
  const minBottom = getMinGridOffsetYBottomCanvas(stripHeight);
  const maxSum = Math.max(0, stripHeight - minTotalHeight);
  let bottom = Math.round(Number(fixedBottomPixels) || 0);
  bottom = Math.max(minBottom, Math.min(maxSum, bottom));
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
  return getGridRectWithOverride(frameWidth, frameHeight, displayScale, undefined, undefined);
}

/**
 * Zelfde als getGridRect maar met optionele override voor gridOffsetX (canvas-pixels). Gebruik na Hand-beweging zodat payload exact newX gebruikt.
 * frameWidth = breedte in display-coördinaten wanneer displayScale &lt; 1; anders canvas.
 * stripCanvasWidth: echte strip-canvasbreedte (px) voor marge/clamp; voorkomt sprongen wanneer displayWidth/scale ≠ canvasbreedte door aparte round(W*s) en round(H*s).
 */
export function getGridRectWithOverride(frameWidth, frameHeight, displayScale, overrideGridOffsetX, stripCanvasWidth) {
  const scale = Number(displayScale) && displayScale > 0 ? displayScale : 1;
  const wCanvasAuth =
    stripCanvasWidth != null && Number(stripCanvasWidth) > 0 && Number.isFinite(Number(stripCanvasWidth))
      ? Number(stripCanvasWidth)
      : null;
  const frameWidthCanvas = wCanvasAuth != null ? wCanvasAuth : scale !== 1 ? frameWidth / scale : frameWidth;
  const hasOverride = overrideGridOffsetX !== undefined && overrideGridOffsetX !== null;
  let leftC;
  let rightC;
  const maxOx = (frameWidthCanvas * (1 - MIN_GRID_WIDTH_RATIO)) / 2;
  if (hasOverride && Number.isFinite(Number(overrideGridOffsetX))) {
    const ox = Number(overrideGridOffsetX);
    const oxClamped = Math.min(Math.max(0, ox), maxOx);
    leftC = oxClamped;
    rightC = oxClamped;
  } else {
    const m = getEffectiveGridMargins(frameWidthCanvas);
    leftC = m.left;
    rightC = m.right;
    /* Geen per-zijde maxOx hier: dat maakte asymmetrische Detecteer-marges breder/smaller. */
  }
  const clamped = clampGridMarginsCanvas(frameWidthCanvas, leftC, rightC);
  leftC = clamped.left;
  rightC = clamped.right;
  /* Horizontaal: echte verhouding display/canvas (niet displayScale uit hoogte — die wijkt af door round(W·s) vs round(H·s)). */
  const scaleX =
    wCanvasAuth != null && frameWidthCanvas > 0
      ? frameWidth / frameWidthCanvas
      : scale;
  const marginL = Math.round(leftC * scaleX);
  const marginR = Math.round(rightC * scaleX);
  const x = marginL;
  const w = Math.max(1, frameWidth - marginL - marginR);
  return {
    x,
    y: 0,
    width: w,
    height: Math.max(1, frameHeight),
    sourceWidth: frameWidth,
    sourceHeight: frameHeight
  };
}
