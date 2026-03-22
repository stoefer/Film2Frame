/**
 * Preview-vensters – stuurt strip-payload naar de main process (scanlint-preview).
 * Afhankelijk van state, strip-loader, grid.
 */
import { getState } from './state.js';
import { getProjectMeta, hasProject, persistCurrentLintStateInProject } from './project.js';
import { getStripCanvas, getStripCanvasDimensions, copyCanvasNearestScaled } from './strip-loader.js';
import {
  getGridRect,
  getGridRectWithOverride,
  clampGridVerticalMarginsCanvas,
  getLadderRowsCanvasFromMargins
} from './grid.js';
import { STRIP_EXTENDED_RATIO, DEFAULT_STRIP_PREVIEW_MAX_DIM } from './constants.js';

/** Standaard max. zijde als state nog niet gezet is (= strip-cap, één schaalstap). */
const STRIP_PREVIEW_MAX_DIM_DEFAULT = DEFAULT_STRIP_PREVIEW_MAX_DIM;

/** Geeft geschaalde breedte/hoogte voor preview zonder canvas te tekenen (voor grid-only updates). Export voor delta-schaling Hand-tool. */
export function getScaledDimensions(sourceCanvas) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  return getScaledDimensionsFromSize(w, h);
}

/** Zelfde schaling als getScaledDimensions maar op basis van breedte/hoogte (geen canvas nodig). Voor snelle delta-berekening. */
export function getScaledDimensionsFromSize(w, h) {
  const max = Math.max(512, Number(getState().stripPreviewMaxDim) || STRIP_PREVIEW_MAX_DIM_DEFAULT);
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
  const dim = getScaledDimensions(sourceCanvas);
  if (dim.scale >= 1) return sourceCanvas;
  const out = copyCanvasNearestScaled(sourceCanvas, dim.width, dim.height);
  return out || sourceCanvas;
}

/** Alleen bestandsnaam voor scanlint-titelbalk (Windows-paden). */
function getLintBasename() {
  const p = getState().path;
  if (!p || typeof p !== 'string') return '';
  const norm = p.replace(/\\/g, '/');
  const i = norm.lastIndexOf('/');
  return i >= 0 ? norm.slice(i + 1) : norm;
}

/** Ruimte onder het raster in preview-pixels (lijnen + afronding), voorkomt afsnijden/“smeer” onderaan. */
const STRIP_VIEW_BOTTOM_PAD = 16;

/**
 * Gehele display-hoogtes per rij die exact `targetTotalDisp` sommeren (largest-remainder),
 * proportioneel aan canvas-rijhoogtes. Voorkomt dat Σ(ry.h*scale) door float-afwijking onderaan
 * buiten de bitmap valt (grijs / vervormd).
 */
function ladderDisplayHeightsFromRows(rowsCanvas, targetTotalDisp) {
  const n = rowsCanvas.length;
  const target = Math.max(1, Math.round(targetTotalDisp));
  if (n < 1) return [target];
  const innerC = rowsCanvas.reduce((acc, r) => acc + (Number(r.h) || 0), 0);
  if (innerC < 1e-9) {
    const base = Math.floor(target / n);
    let rem = target - base * n;
    return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
  }
  const ideal = rowsCanvas.map((ry) => ((Number(ry.h) || 0) / innerC) * target);
  const flo = ideal.map((x) => Math.floor(x));
  let sum = flo.reduce((a, b) => a + b, 0);
  let deficit = target - sum;
  const out = flo.slice();
  const order = ideal.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => (b.r - a.r) || (a.i - b.i));
  if (deficit >= 0) {
    for (let k = 0; k < deficit; k++) out[order[k % n].i]++;
  } else {
    const orderAsc = ideal.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => (a.r - b.r) || (a.i - b.i));
    let need = -deficit;
    let step = 0;
    while (need > 0 && step < n * (target + 5)) {
      const j = orderAsc[step % n].i;
      if (out[j] > 1) {
        out[j]--;
        need--;
      }
      step++;
    }
  }
  return out;
}

/**
 * Bouwt alleen het grid-gedeelte van de payload (geen beeld). overrideGridOffsetX: gebruik deze X i.p.v. state (voor directe doorstuur na Hand-beweging).
 *
 * extendedDisplayHeight moet groot genoeg zijn: met gecentreerde strip geldt
 * grid-onderkant = (E−dh)/2 + yTopDisp + gridTotalHeight ≤ E. Anders valt het raster buiten de container
 * en kunnen browsers onderaan vreemd tekenen (uitgesmeerde frames).
 */
export function buildGridPayload(displayWidth, displayHeight, scale, overrideGridOffsetX) {
  const s = getState();
  const numFrames = Math.max(1, s.numFrames);
  const activeIndex = Math.max(0, Math.min(numFrames - 1, s.activeFrameIndex));
  const dh = Math.max(1, displayHeight);
  const stripCanvasH = scale > 0 ? dh / scale : dh;
  const fhStrip = stripCanvasH / numFrames;
  const cv = clampGridVerticalMarginsCanvas(
    fhStrip,
    numFrames,
    Number(s.gridOffsetY) || 0,
    Number.isFinite(Number(s.gridOffsetYBottom)) ? Number(s.gridOffsetYBottom) : 0
  );
  const yTopCanvas = cv.top;
  const yBottomCanvas = cv.bottom;
  const defaultAlign = yTopCanvas === 0 && yBottomCanvas === 0;
  const yTopDisp = yTopCanvas * scale;
  const yBottomDisp = yBottomCanvas * scale;
  let gridTotalHeight;
  if (defaultAlign) {
    gridTotalHeight = dh;
  } else {
    gridTotalHeight = Math.max(1, dh - yTopDisp - yBottomDisp);
  }
  const minFromRatio = Math.max(dh, Math.round(dh * STRIP_EXTENDED_RATIO));
  let extendedDisplayHeight;
  if (defaultAlign) {
    extendedDisplayHeight = minFromRatio;
  } else {
    const minForGridBottom = Math.ceil(2 * (yTopDisp + gridTotalHeight + STRIP_VIEW_BOTTOM_PAD) - dh);
    extendedDisplayHeight = Math.max(minFromRatio, minForGridBottom, dh, 1);
  }
  const marginTop = Math.round((extendedDisplayHeight - dh) / 2);
  const oyTop = defaultAlign ? marginTop : marginTop + yTopDisp;
  const rowsCanvas = getLadderRowsCanvasFromMargins(stripCanvasH, numFrames, yTopCanvas, yBottomCanvas);
  const heightsDisp = ladderDisplayHeightsFromRows(rowsCanvas, gridTotalHeight);
  let yAcc = oyTop;
  const gridRects = [];
  let gridRect = null;
  for (let i = 0; i < numFrames; i++) {
    const ry = rowsCanvas[i];
    const hRowDisp = Math.max(1, heightsDisp[i] ?? 1);
    const gr = getGridRectWithOverride(displayWidth, hRowDisp, scale, overrideGridOffsetX);
    if (i === 0) gridRect = gr;
    gridRects.push({
      x: gr.x,
      y: yAcc,
      width: gr.width,
      height: hRowDisp,
      frameNumber: i + 1
    });
    yAcc += hRowDisp;
  }
  if (!gridRect) {
    const gridHeight = Math.max(1, gridTotalHeight) / numFrames;
    gridRect = getGridRectWithOverride(displayWidth, gridHeight, scale, overrideGridOffsetX);
  }
  /* Strip-bitmap is in getStripCanvas() hor./vert. gespiegeld; overlay + preview moeten dezelfde coördinaten gebruiken. */
  if (s.flipHorizontal) {
    for (let i = 0; i < gridRects.length; i++) {
      const r = gridRects[i];
      r.x = displayWidth - r.x - r.width;
    }
  }
  if (s.flipVertical) {
    const Hm = extendedDisplayHeight;
    for (let i = 0; i < gridRects.length; i++) {
      const r = gridRects[i];
      r.y = Hm - r.y - r.height;
    }
  }
  const activeR = gridRects[activeIndex] || gridRects[0];
  const meta = getProjectMeta();
  let projectScanCount = null;
  let projectScanIndex = null;
  if (meta && Array.isArray(meta.scanInfos) && meta.scanInfos.length) {
    projectScanCount = meta.scanInfos.length;
    const cur = s.path;
    const si = cur ? meta.scanInfos.findIndex((inf) => inf.path === cur) : -1;
    if (si >= 0) projectScanIndex = si + 1;
  }

  return {
    displayWidth,
    displayHeight,
    extendedDisplayHeight,
    numFrames,
    activeFrameIndex: activeIndex,
    activeFrameNumber: activeIndex + 1,
    gridRect: activeR
      ? { x: activeR.x, y: activeR.y, width: activeR.width, height: activeR.height }
      : { x: gridRect.x, y: gridRect.y, width: gridRect.width, height: gridRect.height },
    gridRects,
    arrowStepPx: Math.max(1, Math.min(10, Number(s.arrowStepPx) || 1)),
    arrowStepShiftPx: Math.max(10, Math.min(100, Number(s.arrowStepShiftPx) || 10)),
    gridOffsetX: Number(s.gridOffsetX) || 0,
    gridOffsetY: yTopCanvas,
    gridOffsetYBottom: Math.round(yBottomCanvas),
    lintFileName: getLintBasename(),
    projectScanCount,
    projectScanIndex,
    verticalAnchorMode: s.gridVerticalAnchorMode || 'bottomFixed',
    verticalAnchorCustomK: (() => {
      const n = Math.max(1, s.numFrames || 1);
      return Math.max(0, Math.min(n, Math.round(Number(s.gridVerticalPivotCustomK) || 0)));
    })(),
    panelLinkVerticalAnchor: s.gridPanelLinkVerticalAnchor !== false
  };
}

/** Na elke strip/preview-update: huidige lint in lintStates spiegelen (bron voor wisselen/opslaan). */
function afterStripPreviewRefresh() {
  if (hasProject()) persistCurrentLintStateInProject();
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
  afterStripPreviewRefresh();
}

/** Alleen raster bijwerken. Optioneel: prebuiltPayload (van buildGridPayload) om tweede getStripCanvas te vermijden. */
export function refreshPreviewsGridOnly(prebuiltPayload) {
  if (prebuiltPayload && Array.isArray(prebuiltPayload.gridRects) && prebuiltPayload.gridRects.length > 0 && Number(prebuiltPayload.displayWidth) > 0 && Number(prebuiltPayload.displayHeight) > 0) {
    if (typeof window.api?.sendStripUpdate === 'function') window.api.sendStripUpdate(prebuiltPayload);
    afterStripPreviewRefresh();
    return;
  }
  sendStripUpdateGridOnly();
  afterStripPreviewRefresh();
}
