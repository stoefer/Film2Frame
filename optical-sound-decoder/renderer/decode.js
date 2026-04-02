/** Bron in kleine tegels tekenen: één grote drawImage na rotatie geeft op Chromium/GPU vaak strepen/herhaling aan het einde van lange strips. */
const ROT_DRAW_TILE = 2048;

/**
 * Boven deze zijde (px) geeft Chromium vaak een afgekapte of corrupte bitmap; uniform schalen.
 * Decode en UI gebruiken deze (eventueel) verkleinde werk-canvas — fracs blijven geldig.
 */
export const MAX_ROTATED_CANVAS_SIDE = 8192;

/**
 * Teken volledige bron in huidige transform (o.a. na translate+rotate), met 2D-tegels.
 */
function drawImageTiledInCurrentTransform(ctx, img, w, h) {
  if (w < 1 || h < 1) return;
  if (w <= ROT_DRAW_TILE && h <= ROT_DRAW_TILE) {
    ctx.drawImage(img, -w / 2, -h / 2);
    return;
  }
  for (let sy = 0; sy < h; sy += ROT_DRAW_TILE) {
    const sh = Math.min(ROT_DRAW_TILE, h - sy);
    for (let sx = 0; sx < w; sx += ROT_DRAW_TILE) {
      const sw = Math.min(ROT_DRAW_TILE, w - sx);
      ctx.drawImage(img, sx, sy, sw, sh, -w / 2 + sx, -h / 2 + sy, sw, sh);
    }
  }
}

function drawImageTiledNoRotation(ctx, img, w, h) {
  if (w < 1 || h < 1) return;
  if (w <= ROT_DRAW_TILE && h <= ROT_DRAW_TILE) {
    ctx.drawImage(img, 0, 0);
    return;
  }
  for (let sy = 0; sy < h; sy += ROT_DRAW_TILE) {
    const sh = Math.min(ROT_DRAW_TILE, h - sy);
    for (let sx = 0; sx < w; sx += ROT_DRAW_TILE) {
      const sw = Math.min(ROT_DRAW_TILE, w - sx);
      ctx.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
    }
  }
}

/**
 * Tijas op werkcanvas: 0°/180° = rijen (y), 90°/270° = kolommen (x) — lange kant van typische 90°-scan.
 */
export function decodeTimeAlongAxis(rotationDeg) {
  const r = ((((rotationDeg || 0) % 360) + 360) % 360);
  return r === 90 || r === 270 ? 'x' : 'y';
}

/** Fijnrotatie na hoofdrotatie; ±1° typisch voor scheef horizontaal lint. */
export const FINE_ROTATION_MAX_DEG = 1;

/**
 * Draait een canvas rond het midden; uitvoer is groter (omlijsting) zodat niets wordt afgesneden.
 */
function applyFineRotationToCanvas(source, fineDeg) {
  const cw0 = source.width;
  const ch0 = source.height;
  if (cw0 < 1 || ch0 < 1) return source;
  const rad = (fineDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const nw = Math.max(1, Math.ceil(cw0 * cos + ch0 * sin));
  const nh = Math.max(1, Math.ceil(cw0 * sin + ch0 * cos));

  const out = document.createElement('canvas');
  out.width = nw;
  out.height = nh;
  const octx = out.getContext('2d', { alpha: true });
  if (!octx) return source;
  if (octx.imageSmoothingEnabled !== undefined) octx.imageSmoothingEnabled = true;
  octx.fillStyle = '#0d0f12';
  octx.fillRect(0, 0, nw, nh);
  octx.translate(nw / 2, nh / 2);
  octx.rotate(rad);
  octx.drawImage(source, -cw0 / 2, -ch0 / 2);
  return out;
}

/**
 * Canvas met dezelfde afmetingen als bron na rotatie (tegen de klok in graden).
 * @param {{ mirrorH?: boolean, mirrorV?: boolean, fineRotationDeg?: number }} mirror — spiegeling + optionele fijnrotatie (±1°) rond het midden
 * @returns {HTMLCanvasElement & { _osdCapped?: boolean, _osdLogicalCw?: number, _osdLogicalCh?: number }}
 */
export function buildRotatedCanvas(img, rotationDeg, mirror = {}) {
  const mirrorH = !!mirror.mirrorH;
  const mirrorV = !!mirror.mirrorV;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const r = ((((rotationDeg || 0) % 360) + 360) % 360);
  let cw;
  let ch;
  if (r === 90 || r === 270) {
    cw = h;
    ch = w;
  } else {
    cw = w;
    ch = h;
  }
  let scaleFit = 1;
  if (cw > MAX_ROTATED_CANVAS_SIDE || ch > MAX_ROTATED_CANVAS_SIDE) {
    scaleFit = Math.min(MAX_ROTATED_CANVAS_SIDE / cw, MAX_ROTATED_CANVAS_SIDE / ch);
  }
  const outW = Math.max(1, Math.round(cw * scaleFit));
  const outH = Math.max(1, Math.round(ch * scaleFit));

  const c = document.createElement('canvas');
  c.width = outW;
  c.height = outH;
  const ctx = c.getContext('2d', { alpha: true });
  if (!ctx) return c;
  if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = false;
  c._osdLogicalCw = cw;
  c._osdLogicalCh = ch;
  c._osdCapped = scaleFit < 1;

  if (r === 0) {
    if (scaleFit < 1) {
      ctx.scale(scaleFit, scaleFit);
    }
    if (mirrorH && mirrorV) {
      ctx.translate(w, h);
      ctx.scale(-1, -1);
    } else if (mirrorH) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    } else if (mirrorV) {
      ctx.translate(0, h);
      ctx.scale(1, -1);
    }
    drawImageTiledNoRotation(ctx, img, w, h);
  } else {
    ctx.translate(outW / 2, outH / 2);
    if (scaleFit < 1) {
      ctx.scale(scaleFit, scaleFit);
    }
    if (mirrorH) ctx.scale(-1, 1);
    if (mirrorV) ctx.scale(1, -1);
    ctx.rotate((-r * Math.PI) / 180);
    drawImageTiledInCurrentTransform(ctx, img, w, h);
  }

  let fine = Number(mirror.fineRotationDeg);
  if (!Number.isFinite(fine)) fine = 0;
  fine = Math.max(-FINE_ROTATION_MAX_DEG, Math.min(FINE_ROTATION_MAX_DEG, fine));
  if (Math.abs(fine) < 1e-6) return c;

  const out = applyFineRotationToCanvas(c, fine);
  out._osdLogicalCw = c._osdLogicalCw;
  out._osdLogicalCh = c._osdLogicalCh;
  out._osdCapped = c._osdCapped;
  return out;
}

/**
 * Optische variabele-dichtheid: luminantie langs de tijdas (scanrichting) → audiomonster.
 * Lineaire luma (sRGB), optioneel hoogdoorlaat, resampling naar export-samplefrequentie.
 */

function srgbChannelToLinear(u8) {
  const c = u8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function pixelLuma(id, idx) {
  const r = srgbChannelToLinear(id.data[idx]);
  const g = srgbChannelToLinear(id.data[idx + 1]);
  const b = srgbChannelToLinear(id.data[idx + 2]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Eén monster per beeldrij: tijd loopt met oplopende y (film langs perforaties).
 * @param {HTMLCanvasElement} canvas — al geroteerd/gespiegeld zoals in UI
 * @param {{ x0: number, x1: number, y0: number, y1: number }} band — band in canvaspixels
 * @param {{ invert: boolean }} opts
 * @returns {Float32Array} ~0..1 vóór AC-koppeling
 */
export function scanBandToRawSamples(canvas, band, opts = {}) {
  const { x0, x1, y0, y1 } = band;
  const w = canvas.width;
  const h = canvas.height;
  const xi0 = Math.max(0, Math.min(w - 1, Math.min(x0, x1)));
  const xi1 = Math.max(0, Math.min(w - 1, Math.max(x0, x1)));
  const yi0 = Math.max(0, Math.min(h - 1, Math.min(y0, y1)));
  const yi1 = Math.max(0, Math.min(h - 1, Math.max(y0, y1)));
  const rows = yi1 - yi0 + 1;
  if (rows < 1 || xi1 < xi0) return new Float32Array(0);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const id = ctx.getImageData(0, yi0, w, rows);
  const idW = w;
  const out = new Float32Array(rows);
  for (let j = 0; j < rows; j++) {
    let sum = 0;
    let n = 0;
    const rowOff = j * idW * 4;
    for (let x = xi0; x <= xi1; x++) {
      sum += pixelLuma(id, rowOff + x * 4);
      n++;
    }
    let v = n ? sum / n : 0;
    if (opts.invert) v = 1 - v;
    out[j] = v;
  }
  return out;
}

/**
 * Zelfde als scanBandToRawSamples maar tijd langs x: één monster per kolom (gemiddelde over y).
 */
export function scanBandToRawSamplesCols(canvas, band, opts = {}) {
  const { x0, x1, y0, y1 } = band;
  const w = canvas.width;
  const h = canvas.height;
  const xi0 = Math.max(0, Math.min(w - 1, Math.min(x0, x1)));
  const xi1 = Math.max(0, Math.min(w - 1, Math.max(x0, x1)));
  const yi0 = Math.max(0, Math.min(h - 1, Math.min(y0, y1)));
  const yi1 = Math.max(0, Math.min(h - 1, Math.max(y0, y1)));
  const cols = xi1 - xi0 + 1;
  const rows = yi1 - yi0 + 1;
  if (cols < 1 || rows < 1) return new Float32Array(0);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const id = ctx.getImageData(xi0, yi0, cols, rows);
  const idW = cols;
  const out = new Float32Array(cols);
  for (let c = 0; c < cols; c++) {
    let sum = 0;
    let n = 0;
    for (let j = 0; j < rows; j++) {
      const rowOff = j * idW * 4;
      sum += pixelLuma(id, rowOff + c * 4);
      n++;
    }
    let v = n ? sum / n : 0;
    if (opts.invert) v = 1 - v;
    out[c] = v;
  }
  return out;
}

/**
 * Variabele oppervlakte: per rij de breedte van het donkere spoor (luma onder rij-drempel),
 * genormaliseerd op de bandbreedte. Drempel = (min+max)/2 langs de rij in lineaire luma.
 */
export function scanBandToAreaWidthSamples(canvas, band, opts = {}) {
  const { x0, x1, y0, y1 } = band;
  const w = canvas.width;
  const h = canvas.height;
  const xi0 = Math.max(0, Math.min(w - 1, Math.min(x0, x1)));
  const xi1 = Math.max(0, Math.min(w - 1, Math.max(x0, x1)));
  const yi0 = Math.max(0, Math.min(h - 1, Math.min(y0, y1)));
  const yi1 = Math.max(0, Math.min(h - 1, Math.max(y0, y1)));
  const rows = yi1 - yi0 + 1;
  const bandW = xi1 - xi0 + 1;
  if (rows < 1 || bandW < 1) return new Float32Array(0);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const id = ctx.getImageData(0, yi0, w, rows);
  const idW = w;
  const out = new Float32Array(rows);
  const rowBuf = new Float32Array(bandW);

  for (let j = 0; j < rows; j++) {
    const rowOff = j * idW * 4;
    let minL = 1;
    let maxL = 0;
    let k = 0;
    for (let x = xi0; x <= xi1; x++) {
      let lum = pixelLuma(id, rowOff + x * 4);
      if (opts.invert) lum = 1 - lum;
      rowBuf[k] = lum;
      if (lum < minL) minL = lum;
      if (lum > maxL) maxL = lum;
      k++;
    }
    const t = maxL > minL ? (minL + maxL) * 0.5 : 0.5;
    let left = -1;
    let right = -1;
    for (let i = 0; i < bandW; i++) {
      if (rowBuf[i] < t) {
        if (left < 0) left = i;
        right = i;
      }
    }
    if (left < 0) {
      out[j] = 0;
    } else {
      out[j] = (right - left + 1) / bandW;
    }
  }
  return out;
}

/**
 * Variabele oppervlakte langs x: per kolom de hoogte van het donkere spoor (luma onder drempel), genormaliseerd op bandhoogte.
 */
export function scanBandToAreaWidthSamplesCols(canvas, band, opts = {}) {
  const { x0, x1, y0, y1 } = band;
  const w = canvas.width;
  const h = canvas.height;
  const xi0 = Math.max(0, Math.min(w - 1, Math.min(x0, x1)));
  const xi1 = Math.max(0, Math.min(w - 1, Math.max(x0, x1)));
  const yi0 = Math.max(0, Math.min(h - 1, Math.min(y0, y1)));
  const yi1 = Math.max(0, Math.min(h - 1, Math.max(y0, y1)));
  const cols = xi1 - xi0 + 1;
  const rows = yi1 - yi0 + 1;
  const bandH = rows;
  if (cols < 1 || bandH < 1) return new Float32Array(0);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const id = ctx.getImageData(xi0, yi0, cols, rows);
  const idW = cols;
  const out = new Float32Array(cols);
  const colBuf = new Float32Array(bandH);

  for (let c = 0; c < cols; c++) {
    let minL = 1;
    let maxL = 0;
    for (let j = 0; j < bandH; j++) {
      let lum = pixelLuma(id, j * idW * 4 + c * 4);
      if (opts.invert) lum = 1 - lum;
      colBuf[j] = lum;
      if (lum < minL) minL = lum;
      if (lum > maxL) maxL = lum;
    }
    const t = maxL > minL ? (minL + maxL) * 0.5 : 0.5;
    let top = -1;
    let bottom = -1;
    for (let j = 0; j < bandH; j++) {
      if (colBuf[j] < t) {
        if (top < 0) top = j;
        bottom = j;
      }
    }
    if (top < 0) {
      out[c] = 0;
    } else {
      out[c] = (bottom - top + 1) / bandH;
    }
  }
  return out;
}

/** AC-gekoppeld audiosignaal −1..1 */
export function rawToAudio(raw) {
  const n = raw.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (raw[i] - 0.5) * 2;
  }
  return out;
}

/** Eénpoolig hoogdoorlaat (geschikt voor DC / zeer lage frequenties) */
export function highpassOnePole(samples, sampleRate, cutoffHz) {
  const n = samples.length;
  if (n < 2 || sampleRate <= 0 || cutoffHz <= 0) return Float32Array.from(samples);
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  const y = new Float32Array(n);
  y[0] = samples[0];
  for (let i = 1; i < n; i++) {
    y[i] = alpha * (y[i - 1] + samples[i] - samples[i - 1]);
  }
  return y;
}

/** Direct Form I biquad (a0 genormaliseerd naar 1) */
function biquadDF1(samples, b0, b1, b2, a1, a2) {
  const n = samples.length;
  if (n < 1) return new Float32Array(0);
  const y = new Float32Array(n);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < n; i++) {
    const x0 = samples[i];
    y[i] = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y[i];
  }
  return y;
}

/** RBJ Audio EQ Cookbook — hoogdoorlaat, Q ≈ 0.707 */
function rbjHighpassCoeffs(sampleRate, f0Hz, Q = 0.70710678) {
  const w0 = (2 * Math.PI * f0Hz) / sampleRate;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / (2 * Q);
  let b0 = (1 + cosw0) / 2;
  let b1 = -(1 + cosw0);
  let b2 = (1 + cosw0) / 2;
  const a0 = 1 + alpha;
  let a1 = -2 * cosw0;
  let a2 = 1 - alpha;
  b0 /= a0;
  b1 /= a0;
  b2 /= a0;
  a1 /= a0;
  a2 /= a0;
  return { b0, b1, b2, a1, a2 };
}

/** RBJ — laagdoorlaat */
function rbjLowpassCoeffs(sampleRate, f0Hz, Q = 0.70710678) {
  const w0 = (2 * Math.PI * f0Hz) / sampleRate;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / (2 * Q);
  let b0 = (1 - cosw0) / 2;
  let b1 = 1 - cosw0;
  let b2 = (1 - cosw0) / 2;
  const a0 = 1 + alpha;
  let a1 = -2 * cosw0;
  let a2 = 1 - alpha;
  b0 /= a0;
  b1 /= a0;
  b2 /= a0;
  a1 /= a0;
  a2 /= a0;
  return { b0, b1, b2, a1, a2 };
}

/**
 * Steilere hoogdoorlaat dan één pool; bij extreem lage f0 t.o.v. fs val terug op één pool (stabiliteit).
 */
export function highpassBiquad(samples, sampleRate, cutoffHz) {
  const n = samples.length;
  if (n < 3 || sampleRate <= 0 || cutoffHz <= 0) return Float32Array.from(samples);
  const ny = sampleRate * 0.48;
  if (cutoffHz >= ny) return Float32Array.from(samples);
  if (cutoffHz < sampleRate * 0.00025) {
    return highpassOnePole(samples, sampleRate, cutoffHz);
  }
  const { b0, b1, b2, a1, a2 } = rbjHighpassCoeffs(sampleRate, Math.min(cutoffHz, ny * 0.95), 0.70710678);
  return biquadDF1(samples, b0, b1, b2, a1, a2);
}

function lowpassBiquad(samples, sampleRate, cutoffHz) {
  const n = samples.length;
  if (n < 3 || sampleRate <= 0 || cutoffHz <= 0) return Float32Array.from(samples);
  const ny = sampleRate * 0.48;
  const f0 = Math.min(cutoffHz, ny * 0.98);
  if (f0 < 1) return Float32Array.from(samples);
  const { b0, b1, b2, a1, a2 } = rbjLowpassCoeffs(sampleRate, f0, 0.70710678);
  return biquadDF1(samples, b0, b1, b2, a1, a2);
}

function cubicHermiteInterp(y0, y1, y2, y3, t) {
  const v0 = (y2 - y0) * 0.5;
  const v1 = (y3 - y1) * 0.5;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y1 + (t3 - 2 * t2 + t) * v0 + (-2 * t3 + 3 * t2) * y2 + (t3 - t2) * v1;
}

/**
 * Upsampling/downsampling met kubische Hermite-splines (minder ritsel dan lineair bij hoge opschalingsfactoren).
 */
export function resampleCubicHermite(input, inRate, outRate) {
  if (inRate <= 0 || outRate <= 0 || input.length < 1) return new Float32Array(0);
  if (Math.abs(inRate - outRate) < 0.01) return Float32Array.from(input);
  const ratio = outRate / inRate;
  const outLen = Math.max(1, Math.round(input.length * ratio));
  const out = new Float32Array(outLen);
  const n = input.length;
  const last = n - 1;
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const i1 = Math.floor(srcPos);
    const t = srcPos - i1;
    const i0 = Math.max(0, i1 - 1);
    const i2 = Math.min(last, i1 + 1);
    const i3 = Math.min(last, i1 + 2);
    const y0 = input[i0];
    const y1 = input[Math.min(last, Math.max(0, i1))];
    const y2 = input[i2];
    const y3 = input[i3];
    out[i] = cubicHermiteInterp(y0, y1, y2, y3, t);
  }
  return out;
}

/** Licht glad langs de tijd (optioneel, 3-tap) */
export function smoothTriangular(samples) {
  const n = samples.length;
  if (n < 3) return Float32Array.from(samples);
  const y = new Float32Array(n);
  y[0] = samples[0];
  y[n - 1] = samples[n - 1];
  for (let i = 1; i < n - 1; i++) {
    y[i] = 0.25 * samples[i - 1] + 0.5 * samples[i] + 0.25 * samples[i + 1];
  }
  return y;
}

export function resampleLinear(input, inRate, outRate) {
  if (inRate <= 0 || outRate <= 0 || input.length < 1) return new Float32Array(0);
  if (Math.abs(inRate - outRate) < 0.01) return Float32Array.from(input);
  const ratio = outRate / inRate;
  const outLen = Math.max(1, Math.round(input.length * ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = srcPos - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

export function normalizePeak(samples, peak = 0.98) {
  let m = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > m) m = a;
  }
  if (m < 1e-8) return Float32Array.from(samples);
  const g = peak / m;
  const y = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) y[i] = samples[i] * g;
  return y;
}

export function suppressImpulseClicks(samples, strength = 'off') {
  const mode = typeof strength === 'string' ? strength : 'off';
  if (mode === 'off' || samples.length < 5) return Float32Array.from(samples);
  let threshold = 5.5;
  let passes = 1;
  if (mode === 'light') {
    threshold = 6.5;
  } else if (mode === 'medium') {
    threshold = 5.25;
    passes = 2;
  } else if (mode === 'strong') {
    threshold = 4.75;
    passes = 2;
  } else if (mode === 'extreme') {
    threshold = 4.1;
    passes = 3;
  }
  let out = Float32Array.from(samples);
  for (let pass = 0; pass < passes; pass++) {
    const next = Float32Array.from(out);
    for (let i = 2; i < out.length - 2; i++) {
      const prev = out[i - 1];
      const cur = out[i];
      const next1 = out[i + 1];
      const median3 = [prev, cur, next1].sort((a, b) => a - b)[1];
      const localInterp = (prev + next1) * 0.5;
      const deviation = Math.abs(cur - localInterp);
      const localActivity =
        Math.abs(out[i - 2] - prev) +
        Math.abs(prev - next1) +
        Math.abs(next1 - out[i + 2]);
      const baseline = Math.max(1e-5, localActivity / 3);
      const signFlip = Math.sign(cur - prev) !== 0 && Math.sign(cur - prev) === -Math.sign(next1 - cur);
      if (signFlip && deviation > baseline * threshold) {
        next[i] = localInterp * 0.85 + median3 * 0.15;
      }
    }
    out = next;
  }
  return out;
}

/**
 * Per stiltezone [t0,t1] (genormaliseerd 0–1 over de buffer): fade-out vóór t0, stilte, fade-in na t1.
 * Meerdere zones: per monster de minimum gain (zachte overgangen blijven behouden).
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @param {{ t0: number, t1: number }[]} regions
 * @param {number} fadeMs
 */
export function applyMuteRegions(samples, sampleRate, regions, fadeMs) {
  const n = samples.length;
  if (n < 1 || !regions?.length || sampleRate <= 0) return Float32Array.from(samples);
  const fadeN = Math.max(1, Math.round((Math.max(0, Number(fadeMs)) / 1000) * sampleRate));
  const g = new Float32Array(n);
  g.fill(1);

  for (const raw of regions) {
    let t0 = Number(raw.t0);
    let t1 = Number(raw.t1);
    if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue;
    if (t0 > t1) [t0, t1] = [t1, t0];
    t0 = Math.max(0, Math.min(1, t0));
    t1 = Math.max(0, Math.min(1, t1));
    if (t1 - t0 < 1e-7) continue;

    let s0 = Math.floor(t0 * n);
    let s1 = Math.ceil(t1 * n);
    if (s1 <= s0) s1 = s0 + 1;
    s0 = Math.max(0, Math.min(n - 1, s0));
    s1 = Math.max(s0 + 1, Math.min(n, s1)); /* eindindex exclusief: stil [s0 .. s1-1] */

    const outStart = Math.max(0, s0 - fadeN);

    for (let i = 0; i < n; i++) {
      let gi;
      if (i < outStart) gi = 1;
      else if (i <= s0) {
        const span = s0 - outStart;
        gi = span > 0 ? (s0 - i) / span : 0;
      } else if (i < s1) gi = 0;
      else if (i < s1 + fadeN) {
        gi = (i - s1) / fadeN;
        if (gi > 1) gi = 1;
      } else gi = 1;
      if (gi < g[i]) g[i] = gi;
    }
  }

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = samples[i] * g[i];
  return out;
}

function clampUnit(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function regionToSampleBounds(n, region) {
  if (n < 1 || !region) return null;
  let t0 = clampUnit(region.t0);
  let t1 = clampUnit(region.t1);
  if (t0 > t1) [t0, t1] = [t1, t0];
  if (t1 - t0 < 1e-7) return null;
  let s0 = Math.floor(t0 * n);
  let s1 = Math.ceil(t1 * n);
  if (s1 <= s0) s1 = s0 + 1;
  s0 = Math.max(0, Math.min(n - 1, s0));
  s1 = Math.max(s0 + 1, Math.min(n, s1));
  return { s0, s1 };
}

export function applyFadeToRegion(samples, sampleRate, region, fadeMs, opts = {}) {
  const n = samples.length;
  if (n < 1 || sampleRate <= 0) return Float32Array.from(samples);
  const bounds = regionToSampleBounds(n, region);
  if (!bounds) return Float32Array.from(samples);
  const fadeIn = opts.fadeIn !== false;
  const fadeOut = opts.fadeOut !== false;
  if (!fadeIn && !fadeOut) return Float32Array.from(samples);
  const fadeN = Math.max(1, Math.round((Math.max(0, Number(fadeMs)) / 1000) * sampleRate));
  const { s0, s1 } = bounds;
  const out = Float32Array.from(samples);
  const len = Math.max(1, s1 - s0);
  for (let i = s0; i < s1; i++) {
    let g = 1;
    if (fadeIn) {
      const k = Math.min(1, (i - s0 + 1) / Math.min(fadeN, len));
      g = Math.min(g, k);
    }
    if (fadeOut) {
      const k = Math.min(1, (s1 - i) / Math.min(fadeN, len));
      g = Math.min(g, k);
    }
    out[i] *= g;
  }
  return out;
}

export function limitRegionPeak(samples, region, peakCap = 0.8) {
  const n = samples.length;
  if (n < 1) return Float32Array.from(samples);
  const bounds = regionToSampleBounds(n, region);
  if (!bounds) return Float32Array.from(samples);
  const cap = Math.max(1e-4, Math.min(1, Number(peakCap) || 0.8));
  const { s0, s1 } = bounds;
  let peak = 0;
  for (let i = s0; i < s1; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak <= cap || peak < 1e-8) return Float32Array.from(samples);
  const g = cap / peak;
  const out = Float32Array.from(samples);
  for (let i = s0; i < s1; i++) out[i] *= g;
  return out;
}

function writeStr(dv, off, s) {
  for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
}

/** Mono IEEE float WAV */
export function encodeFloat32WavMono(samples, sampleRate) {
  const bitsPerSample = 32;
  const numChannels = 1;
  const blockAlign = 4;
  const byteRate = sampleRate * blockAlign;
  const dataBytes = samples.length * 4;
  const buf = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(buf);
  let o = 0;
  writeStr(dv, o, 'RIFF');
  o += 4;
  dv.setUint32(o, 36 + dataBytes, true);
  o += 4;
  writeStr(dv, o, 'WAVE');
  o += 4;
  writeStr(dv, o, 'fmt ');
  o += 4;
  dv.setUint32(o, 18, true);
  o += 4;
  dv.setUint16(o, 3, true);
  o += 2;
  dv.setUint16(o, numChannels, true);
  o += 2;
  dv.setUint32(o, sampleRate, true);
  o += 4;
  dv.setUint32(o, byteRate, true);
  o += 4;
  dv.setUint16(o, blockAlign, true);
  o += 2;
  dv.setUint16(o, bitsPerSample, true);
  o += 2;
  dv.setUint16(o, 0, true);
  o += 2;
  writeStr(dv, o, 'data');
  o += 4;
  dv.setUint32(o, dataBytes, true);
  o += 4;
  for (let i = 0; i < samples.length; i++) {
    dv.setFloat32(o, samples[i], true);
    o += 4;
  }
  return buf;
}

/** Mono PCM16 WAV */
export function encodePcm16WavMono(samples, sampleRate) {
  const bitsPerSample = 16;
  const numChannels = 1;
  const blockAlign = 2;
  const byteRate = sampleRate * blockAlign;
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(buf);
  let o = 0;
  writeStr(dv, o, 'RIFF');
  o += 4;
  dv.setUint32(o, 36 + dataBytes, true);
  o += 4;
  writeStr(dv, o, 'WAVE');
  o += 4;
  writeStr(dv, o, 'fmt ');
  o += 4;
  dv.setUint32(o, 16, true);
  o += 4;
  dv.setUint16(o, 1, true);
  o += 2;
  dv.setUint16(o, numChannels, true);
  o += 2;
  dv.setUint32(o, sampleRate, true);
  o += 4;
  dv.setUint32(o, byteRate, true);
  o += 4;
  dv.setUint16(o, blockAlign, true);
  o += 2;
  dv.setUint16(o, bitsPerSample, true);
  o += 2;
  writeStr(dv, o, 'data');
  o += 4;
  dv.setUint32(o, dataBytes, true);
  o += 4;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const v = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
    dv.setInt16(o, v, true);
    o += 2;
  }
  return buf;
}

function biquadProcess(samples, b0, b1, b2, a1, a2) {
  const out = new Float32Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

function biquadPeaking(samples, sampleRate, centerHz, q = 0.707, gainDb = 0) {
  if (!Number.isFinite(centerHz) || centerHz <= 0 || !Number.isFinite(gainDb) || Math.abs(gainDb) < 1e-6) return samples;
  const w0 = 2 * Math.PI * centerHz / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const A = Math.pow(10, gainDb / 40);
  const alpha = sin / (2 * q);
  const b0 = 1 + alpha * A;
  const b1 = -2 * cos;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cos;
  const a2 = 1 - alpha / A;
  return biquadProcess(samples, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

function biquadHighShelf(samples, sampleRate, cutoffHz, gainDb = 0, slope = 1) {
  if (!Number.isFinite(cutoffHz) || cutoffHz <= 0 || !Number.isFinite(gainDb) || Math.abs(gainDb) < 1e-6) return samples;
  const A = Math.pow(10, gainDb / 40);
  const w0 = 2 * Math.PI * cutoffHz / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = (sin / 2) * Math.sqrt((A + 1 / A) * (1 / slope - 1) + 2);
  const beta = 2 * Math.sqrt(A) * alpha;
  const b0 = A * ((A + 1) + (A - 1) * cos + beta);
  const b1 = -2 * A * ((A - 1) + (A + 1) * cos);
  const b2 = A * ((A + 1) + (A - 1) * cos - beta);
  const a0 = (A + 1) - (A - 1) * cos + beta;
  const a1 = 2 * ((A - 1) - (A + 1) * cos);
  const a2 = (A + 1) - (A - 1) * cos - beta;
  return biquadProcess(samples, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

export function applyOpticalEqPreset(samples, sampleRate, preset = 'off') {
  const mode = typeof preset === 'string' ? preset : 'off';
  if (mode === 'off') return samples;
  let out = samples;
  switch (mode) {
    case 'mild':
      out = biquadHighShelf(out, sampleRate, 3800, -3);
      break;
    case 'academy':
      out = biquadHighShelf(out, sampleRate, 4200, -6);
      out = biquadPeaking(out, sampleRate, 2200, 0.9, -1.5);
      break;
    case 'noise-cut':
      out = biquadHighShelf(out, sampleRate, 3400, -9);
      break;
    case 'voice':
      out = highpassBiquad(out, sampleRate, 95);
      out = biquadPeaking(out, sampleRate, 2400, 0.9, 2.5);
      out = biquadHighShelf(out, sampleRate, 7000, -2);
      break;
    default:
      break;
  }
  return out;
}

/**
 * Volledige keten: ruwe scan → native rate → biquad-HP → optioneel smooth →
 * bij downsampling anti-alias-LP → kubische resample → bij upsampling anti-imaging-LP → gain → optioneel normalize
 */
export function decodeStrip({
  canvas,
  band,
  framesOnStrip,
  filmFps,
  invert,
  highpassHz,
  exportSampleRate,
  applySmooth,
  normalize,
  decodeMode = 'density',
  timeAlong = 'y',
  outputGain = 1,
  opticalEqPreset = 'off',
  deClickStrength = 'off'
}) {
  const useCols = timeAlong === 'x';
  const raw =
    decodeMode === 'area'
      ? useCols
        ? scanBandToAreaWidthSamplesCols(canvas, band, { invert })
        : scanBandToAreaWidthSamples(canvas, band, { invert })
      : useCols
        ? scanBandToRawSamplesCols(canvas, band, { invert })
        : scanBandToRawSamples(canvas, band, { invert });
  if (raw.length < 2) {
    return { samples: new Float32Array(0), nativeSampleRate: 0, durationSec: 0 };
  }
  const durationSec = framesOnStrip / filmFps;
  const nativeSampleRate = raw.length / durationSec;
  let audio = rawToAudio(raw);
  if (highpassHz > 0 && nativeSampleRate > 0) {
    audio = highpassBiquad(audio, nativeSampleRate, highpassHz);
  }
  if (applySmooth) {
    audio = smoothTriangular(audio);
  }
  const downRatio = exportSampleRate / nativeSampleRate;
  if (downRatio < 0.95) {
    const fcPre = Math.min(nativeSampleRate * 0.45, exportSampleRate * 0.45);
    if (fcPre > 20 && fcPre < nativeSampleRate * 0.48) {
      audio = lowpassBiquad(audio, nativeSampleRate, fcPre);
    }
  }
  let out = resampleCubicHermite(audio, nativeSampleRate, exportSampleRate);
  if (downRatio > 1.15) {
    const fcPost = Math.min(nativeSampleRate * 0.45, exportSampleRate * 0.46);
    if (fcPost > 20 && fcPost < exportSampleRate * 0.48) {
      out = lowpassBiquad(out, exportSampleRate, fcPost);
    }
  }
  out = suppressImpulseClicks(out, deClickStrength);
  out = applyOpticalEqPreset(out, exportSampleRate, opticalEqPreset);
  const gain = Number(outputGain);
  if (Number.isFinite(gain) && gain > 0 && Math.abs(gain - 1) > 1e-8) {
    for (let i = 0; i < out.length; i++) out[i] *= gain;
  }
  if (normalize) {
    out = normalizePeak(out, 0.98);
  }
  return {
    samples: out,
    nativeSampleRate,
    durationSec,
    exportSampleRate
  };
}
