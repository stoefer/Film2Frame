/**
 * Preview-vensters – stuurt strip-payload naar de main process (scanlint-preview).
 * Afhankelijk van state, strip-loader, grid.
 */
import { getState } from './state.js';
import { getProjectMeta, hasProject, persistCurrentLintStateInProject } from './project.js';
import { getStripCanvas, getStripCanvasDimensions, copyCanvasNearestScaled, getExportStripDimensions } from './strip-loader.js';
import {
  getGridRect,
  getGridRectWithOverride,
  clampGridVerticalMarginsCanvas,
  getLadderRowsCanvasFromMargins,
  usesSplitLowerVerticalPan,
  resolveVerticalPivotKFromState,
  getFrameCropRectInStripPx
} from './grid.js';
import { STRIP_EXTENDED_RATIO, DEFAULT_STRIP_PREVIEW_MAX_DIM } from './constants.js';
import { refreshFramePixelEditor } from './frame-pixel-editor.js';

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
 * Gehele rijhoogtes in preview-pixels, som = target, proportioneel aan weights. Gebruikt
 * floor(target*cum[i+1]/W) − floor(target*cum[i]/W) zodat de cumulatieve onderkant van rij i exact
 * floor(i*target/n) is bij gelijke gewichten — geen stapeling van +1px vanaf het bovenste frame.
 * (Oude round-robin vanaf index 0 gaf op lange strips een systematische drift t.o.v. de bitmap.)
 */
function proportionalIntHeightsFromWeights(targetTotalDisp, weights) {
  const n = weights.length;
  const target = Math.max(1, Math.round(targetTotalDisp));
  if (n < 1) return [target];
  const w = weights.map((x) => Math.max(0, Number(x) || 0));
  const W = w.reduce((a, b) => a + b, 0);
  if (W < 1e-9) {
    const base = Math.floor(target / n);
    let rem = target - base * n;
    return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
  }
  let cum = 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const next = cum + w[i];
    const hi = Math.floor((target * next) / W) - Math.floor((target * cum) / W);
    out.push(hi);
    cum = next;
  }
  return out;
}

/**
 * Display-hoogtes proportioneel aan canvas-ladderrijen; som exact targetTotalDisp.
 * (Vroeger: round-robin restpixels vanaf frame 0 → cumulatieve drift op lange strips.)
 */
function ladderDisplayHeightsProportionalToRows(rowsCanvas, targetTotalDisp) {
  const n = rowsCanvas.length;
  if (n < 1) return [Math.max(1, Math.round(targetTotalDisp))];
  const weights = rowsCanvas.map((ry) => Number(ry.h) || 0);
  return proportionalIntHeightsFromWeights(targetTotalDisp, weights);
}

function subDistributeHeightsForSubstrip(subRows, subTarget) {
  const m = subRows.length;
  const st = Math.max(m, Math.round(subTarget));
  if (m < 1) return [];
  const weights = subRows.map((ry) => Number(ry.h) || 0);
  return proportionalIntHeightsFromWeights(st, weights);
}

/**
 * Zorgt dat de som van display-hoogtes boven index kPin exact overeenkomt met de canvas-split
 * (zodat de gele referentielijn niet “wandelt” bij kleine wijzigingen in d).
 *
 * innerCanvasPx: S − T − B uit marges (gezaghebbend). Zonder die waarde gebruikt de oude som(h)-ratio,
 * die bij float-afronding per d-stap kan oscilleren en upperTarget ±1 px laat springen.
 */
function ladderDisplayHeightsPinnedSplit(rowsCanvas, targetTotalDisp, kPin, innerCanvasPx) {
  const n = rowsCanvas.length;
  const target = Math.max(1, Math.round(targetTotalDisp));
  if (kPin <= 0 || kPin >= n || n < 1) {
    return ladderDisplayHeightsProportionalToRows(rowsCanvas, target);
  }
  const r0 = rowsCanvas[0];
  const rLast = rowsCanvas[n - 1];
  const innerTop = Number(r0?.y) || 0;
  const upperRows = rowsCanvas.slice(0, kPin);
  const lowerRows = rowsCanvas.slice(kPin);
  /* Zelfde basis als canvas-ladder: som rij-hoogtes i.p.v. ySplit−T (voorkomt ±1 px bij k-wissel door float-afronding). */
  const upperInnerSum = upperRows.reduce((a, r) => a + (Number(r.h) || 0), 0);
  const innerSum = rowsCanvas.reduce((a, r) => a + (Number(r.h) || 0), 0);
  let innerAuth =
    innerSum > 1e-9
      ? innerSum
      : innerCanvasPx != null && Number(innerCanvasPx) > 0
        ? Number(innerCanvasPx)
        : Math.max(0, (Number(rLast?.y) || 0) + (Number(rLast?.h) || 0) - innerTop);
  if (innerAuth < 1e-9) {
    return ladderDisplayHeightsFromRows(rowsCanvas, target);
  }
  const minUpper = kPin;
  const minLower = n - kPin;
  let upperTarget = Math.round((upperInnerSum / innerAuth) * target);
  upperTarget = Math.max(minUpper, Math.min(target - minLower, upperTarget));
  let lowerTarget = target - upperTarget;
  if (lowerTarget < minLower) {
    lowerTarget = minLower;
    upperTarget = target - lowerTarget;
  }
  const heightsUpper = subDistributeHeightsForSubstrip(upperRows, upperTarget);
  const heightsLower = subDistributeHeightsForSubstrip(lowerRows, lowerTarget);
  return heightsUpper.concat(heightsLower);
}

/**
 * Bouwt alleen het grid-gedeelte van de payload (geen beeld). overrideGridOffsetX: gebruik deze X i.p.v. state (voor directe doorstuur na Hand-beweging).
 *
 * extendedDisplayHeight moet groot genoeg zijn: met gecentreerde strip geldt
 * grid-onderkant = (E−dh)/2 + yTopDisp + gridTotalHeight ≤ E. Anders valt het raster buiten de container
 * en kunnen browsers onderaan vreemd tekenen (uitgesmeerde frames).
 *
 * @param {number} [stripCanvasWidth] - Echte breedte van het strip-canvas (px); zelfde als getStripCanvas().width. Voorkomt rasterbreedte-sprongen bij fijne rotatie wanneer round(W·s) en round(H·s) licht uit aspect vallen.
 */
export function buildGridPayload(displayWidth, displayHeight, scale, overrideGridOffsetX, stripCanvasWidth) {
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
  const innerCanvasPx = Math.max(0, stripCanvasH - yTopCanvas - yBottomCanvas);
  const splitVertPan = usesSplitLowerVerticalPan();
  const kSplit = splitVertPan ? resolveVerticalPivotKFromState() : -1;
  /*
   * Altijd pinned split bij 2≤k<n (ook bij d=0 / gelijke canvas-rijen). Wisselen tussen algoritmes
   * (d=0 vs d≠0) gaf na Lijn #-wissel + eerste Duw-klik een grote pixelverschuiving; tweede klik
   * leek te corrigeren doordat het algoritme dan stabiel bleef.
   */
  const usePinnedSplit = splitVertPan && kSplit > 1 && kSplit < numFrames;
  const heightsDisp = usePinnedSplit
    ? ladderDisplayHeightsPinnedSplit(rowsCanvas, gridTotalHeight, kSplit, innerCanvasPx)
    : ladderDisplayHeightsProportionalToRows(rowsCanvas, gridTotalHeight);
  let yAcc = oyTop;
  const gridRects = [];
  let gridRect = null;
  for (let i = 0; i < numFrames; i++) {
    const ry = rowsCanvas[i];
    const hRowDisp = Math.max(1, heightsDisp[i] ?? 1);
    const gr = getGridRectWithOverride(displayWidth, hRowDisp, scale, overrideGridOffsetX, stripCanvasWidth);
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
    gridRect = getGridRectWithOverride(displayWidth, gridHeight, scale, overrideGridOffsetX, stripCanvasWidth);
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

  /** UITLIJN-venster: Y van de bovenkant van de strip-bitmap in dezelfde ruimte als gridRects (zoals scanlint-preview met margin). */
  const extHForAlign = Math.max(dh, extendedDisplayHeight);
  const alignStripTopY = Math.round((extHForAlign - dh) / 2);

  return {
    displayWidth,
    displayHeight,
    extendedDisplayHeight,
    alignStripTopY,
    numFrames,
    activeFrameIndex: activeIndex,
    activeFrameNumber: activeIndex + 1,
    gridRect: activeR
      ? { x: activeR.x, y: activeR.y, width: activeR.width, height: activeR.height }
      : { x: gridRect.x, y: gridRect.y, width: gridRect.width, height: gridRect.height },
    gridRects,
    /** Canvas→display schaal (voor overlays in canvas-px, bv. zoekbereik). */
    stripScale: Number.isFinite(Number(scale)) && Number(scale) > 0 ? Number(scale) : 1,
    arrowStepPx: Math.max(1, Math.min(10, Number(s.arrowStepPx) || 1)),
    arrowStepShiftPx: Math.max(10, Math.min(100, Number(s.arrowStepShiftPx) || 10)),
    previewResSetting: Math.max(512, Number(s.stripPreviewMaxDim) || DEFAULT_STRIP_PREVIEW_MAX_DIM),
    gridOffsetX: Number(s.gridOffsetX) || 0,
    gridOffsetY: yTopCanvas,
    gridOffsetYBottom: Math.round(yBottomCanvas),
    lintFileName: getLintBasename(),
    projectScanCount,
    projectScanIndex,
    verticalAnchorMode: 'pivotCustom',
    verticalAnchorCustomK: (() => {
      const n = Math.max(1, s.numFrames || 1);
      return Math.max(0, Math.min(n, Math.round(Number(s.gridVerticalPivotCustomK) || 0)));
    })(),
    panelLinkVerticalAnchor: s.gridPanelLinkVerticalAnchor !== false,
    fixResolutionLocked: s.fixResolutionLocked === true,
    autoAdvanceAfterAlign: s.autoAdvanceAfterAlign === true,
    autoRasterAssistMode: s.autoRasterAssistMode === 'strong' ? 'strong' : (s.autoRasterAssistMode === 'soft' ? 'soft' : 'off'),
    autoRasterAssistXRef: s.autoRasterAssistXRef === 'left' ? 'left' : 'right',
    autoRasterAssistYRef: s.autoRasterAssistYRef === 'top' || s.autoRasterAssistYRef === 'bottom' ? s.autoRasterAssistYRef : 'both',
    autoRasterAssistPreset:
      s.autoRasterAssistPreset === 'standard' ||
      s.autoRasterAssistPreset === 'bottom-soft' ||
      s.autoRasterAssistPreset === 'difficult-edge' ||
      s.autoRasterAssistPreset === 'bottom-v2' ||
      s.autoRasterAssistPreset === 'black-line' ||
      s.autoRasterAssistPreset === 'black-line-left' ||
      s.autoRasterAssistPreset === 'sprocket-left' ||
      s.autoRasterAssistPreset === 'sprocket-right' ||
      s.autoRasterAssistPreset === 'left-white' ||
      s.autoRasterAssistPreset === 'right-white'
        ? s.autoRasterAssistPreset
        : 'bottom-v1',
    autoRasterAssistExtraLeftPx: Math.max(0, Math.min(400, Math.round(Number(s.autoRasterAssistExtraLeftPx) || 0))),
    autoRasterAssistExtraRightPx: Math.max(0, Math.min(400, Math.round(Number(s.autoRasterAssistExtraRightPx) || 0))),
    autoRasterAssistExtraTopPx: Math.max(0, Math.min(400, Math.round(Number(s.autoRasterAssistExtraTopPx) || 0))),
    autoRasterAssistExtraBottomPx: Math.max(0, Math.min(400, Math.round(Number(s.autoRasterAssistExtraBottomPx) || 0))),
    autoRasterCenterBeforeDetect: s.autoRasterCenterBeforeDetect === true,
    autoRasterDetectOnScanNav: s.autoRasterDetectOnScanNav === true,
    autoRasterLeftWhiteMinMarginPx: Math.max(0, Math.min(24, Math.round(Number(s.autoRasterLeftWhiteMinMarginPx) || 0))),
    autoRasterDarkLineLeftBiasPx: Math.max(0, Math.min(6, Math.round(Number(s.autoRasterDarkLineLeftBiasPx) || 0))),
    autoRasterDarkLineStrongScale: Math.max(1, Math.min(48, Math.round(Number(s.autoRasterDarkLineStrongScale) || 0))),
    autoRasterDarkLineStrongScaleAuto: s.autoRasterDarkLineStrongScaleAuto === true,
    autoRasterDarkBottomBiasPx: Math.max(-24, Math.min(24, Math.round(Number(s.autoRasterDarkBottomBiasPx) || 0))),
    autoRasterDarkLineThickness: Math.max(1, Math.min(10, Math.round(Number(s.autoRasterDarkLineThickness) || 5))),
    autoRasterDarkLineSearchRangePx: Math.max(20, Math.min(300, Math.round(Number(s.autoRasterDarkLineSearchRangePx) || 160))),
    autoRasterTriangleSensitivity: Math.max(0, Math.min(100, Math.round(Number(s.autoRasterTriangleSensitivity) || 60))),
    stripPresetId:
      meta && meta.stripPresetId != null && typeof meta.stripPresetId === 'string' && meta.stripPresetId.trim() !== ''
        ? meta.stripPresetId.trim()
        : null,
    orientLabel: s.orientLabel || '—',
    flipHorizontal: !!s.flipHorizontal,
    flipVertical: !!s.flipVertical
  };
}

/** Metadata voor Scaninfo in RASTER SETUP (strip-preview); bij elke strip-update meesturen. */
function buildScanInfoForPreview() {
  const s = getState();
  return {
    naturalWidth: s.naturalWidth > 0 ? s.naturalWidth : null,
    naturalHeight: s.naturalHeight > 0 ? s.naturalHeight : null,
    scanDpi: s.scanDpi > 0 ? s.scanDpi : null,
    filmFormat: s.filmFormat || null,
    filmPolarity: s.filmPolarity || null
  };
}

/**
 * Zelfde uitsnede als frame-export: schaal preview-raster naar export-resolutie (zonder zware export-canvas).
 * Logisch formaat (niet afgekapt) zodat Detecteer Grenzen de W×H-velden niet “kapot” zet.
 */
function buildExportFrameCropPxForPreview() {
  const s = getState();
  const preview = getStripCanvas();
  const exportDims = getExportStripDimensions();
  if (!preview || preview.width < 1 || preview.height < 1 || !exportDims) return null;
  const n = Math.max(1, s.numFrames || 1);
  const activeIndex = Math.max(0, Math.min(n - 1, s.activeFrameIndex));
  const r = getFrameCropRectInStripPx(preview, activeIndex);
  if (!r) return null;
  const kx = exportDims.width / preview.width;
  const ky = exportDims.height / preview.height;
  if (!(kx > 0) || !(ky > 0)) return null;
  return {
    width: Math.max(1, Math.round(r.w * kx)),
    height: Math.max(1, Math.round(r.h * ky))
  };
}

function attachScanInfo(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  return {
    ...payload,
    scanInfo: buildScanInfoForPreview(),
    exportFrameCropPx: buildExportFrameCropPxForPreview()
  };
}

function notifyPixelEditorRemoteRefresh() {
  try {
    if (typeof window !== 'undefined' && window.api?.notifyPixelEditorRemoteRefresh) {
      window.api.notifyPixelEditorRemoteRefresh();
    }
  } catch (_) {}
}

function pushInlineStripUpdate(payload) {
  try {
    if (typeof window !== 'undefined' && typeof window.__f2fInlineStripPushUpdate === 'function') {
      window.__f2fInlineStripPushUpdate(payload);
    }
  } catch (_) {}
}

function sendStripUpdateToMain(payload) {
  try {
    if (typeof window !== 'undefined' && typeof window.api?.sendStripUpdate === 'function') {
      window.api.sendStripUpdate(payload);
    }
  } catch (_) {}
}

/** Na elke strip/preview-update: huidige lint in lintStates spiegelen (bron voor wisselen/opslaan). */
function afterStripPreviewRefresh() {
  if (hasProject()) persistCurrentLintStateInProject();
  refreshFramePixelEditor();
  notifyPixelEditorRemoteRefresh();
  try {
    if (typeof window !== 'undefined' && typeof window.__f2fOnRasterPreviewRefreshed === 'function') {
      window.__f2fOnRasterPreviewRefreshed();
    }
  } catch (_) {}
}

function sendStripUpdateFull() {
  const canvas = getStripCanvas();
  const s = getState();
  const n = Math.max(1, s.numFrames || 1);
  if (canvas) {
    const scaled = scaleStripCanvasForPreview(canvas);
    const scale = canvas.height > 0 ? scaled.height / canvas.height : 1;
    const payload = buildGridPayload(scaled.width, scaled.height, scale, undefined, canvas.width);
    payload.stripDataUrl = scaled.toDataURL('image/png');
    const enriched = attachScanInfo(payload);
    sendStripUpdateToMain(enriched);
    pushInlineStripUpdate(enriched);
    return;
  }
  const dims = getStripCanvasDimensions();
  if (dims && dims.width >= 1 && dims.height >= 1) {
    const dim = getScaledDimensionsFromSize(dims.width, dims.height);
    const scale = dim.height >= 1 ? dim.height / dims.height : 1;
    const payload = buildGridPayload(dim.width, dim.height, scale, undefined, dims.width);
    const enriched = attachScanInfo(payload);
    sendStripUpdateToMain(enriched);
    pushInlineStripUpdate(enriched);
    return;
  }
  /* Geen bronbeeld: geen synthetisch raster sturen — main zou anders de vorige stripDataUrl weer mergen. */
  if (!s.image) {
    const enriched = attachScanInfo({});
    sendStripUpdateToMain(enriched);
    pushInlineStripUpdate(enriched);
    return;
  }
  if (n >= 1) {
    const fallbackW = 800;
    const fallbackH = Math.max(200, Math.round(600 / n) * n);
    const payload = buildGridPayload(fallbackW, fallbackH, 1, undefined, undefined);
    const enriched = attachScanInfo(payload);
    sendStripUpdateToMain(enriched);
    pushInlineStripUpdate(enriched);
    return;
  }
  const enriched = attachScanInfo({});
  sendStripUpdateToMain(enriched);
  pushInlineStripUpdate(enriched);
}

/** Stuurt alleen rasterdata naar scanlint-preview (geen beeld). Realtime bij verplaatsen/aanpassen raster. Scanlint-beeld wordt niet opnieuw geladen. */
function sendStripUpdateGridOnly() {
  let payload = null;
  const canvas = getStripCanvas();
  if (canvas) {
    const dim = getScaledDimensions(canvas);
    const scale = canvas.height > 0 ? dim.height / canvas.height : 1;
    payload = buildGridPayload(dim.width, dim.height, scale, undefined, canvas.width);
  } else {
    const dims = getStripCanvasDimensions();
    if (dims && dims.width >= 1 && dims.height >= 1) {
      const dim = getScaledDimensionsFromSize(dims.width, dims.height);
      const scale = dim.height >= 1 ? dim.height / dims.height : 1;
      payload = buildGridPayload(dim.width, dim.height, scale, undefined, dims.width);
    }
  }
  if (payload) {
    const enriched = attachScanInfo(payload);
    sendStripUpdateToMain(enriched);
    pushInlineStripUpdate(enriched);
  }
}

export function refreshPreviews() {
  sendStripUpdateFull();
  afterStripPreviewRefresh();
}

/** Alleen raster bijwerken. Optioneel: prebuiltPayload (van buildGridPayload) om tweede getStripCanvas te vermijden. */
export function refreshPreviewsGridOnly(prebuiltPayload) {
  if (prebuiltPayload && Array.isArray(prebuiltPayload.gridRects) && prebuiltPayload.gridRects.length > 0 && Number(prebuiltPayload.displayWidth) > 0 && Number(prebuiltPayload.displayHeight) > 0) {
    const enriched = attachScanInfo({ ...prebuiltPayload });
    sendStripUpdateToMain(enriched);
    pushInlineStripUpdate(enriched);
    afterStripPreviewRefresh();
    return;
  }
  sendStripUpdateGridOnly();
  afterStripPreviewRefresh();
}
