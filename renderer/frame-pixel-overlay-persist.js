/**
 * Pixel-editor overlays: detectie zichtbare pixels; herstellen uit oude project.json (alleen laden).
 * Worden niet meer in lintState/project.json bewaard — export via pixel-editor Vorige/Volgende naar een map.
 */
import { getState } from './state.js';

function canvasHasNonTransparentPixels(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  if (w < 1 || h < 1) return false;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  try {
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] !== 0) return true;
    }
  } catch (_) {
    return true;
  }
  return false;
}

/** True als er zichtbare (niet-transparante) pixels op de overlay van dit frame staan. */
export function hasVisibleFramePaintAt(frameIndex) {
  const map = getState().framePaintOverlays;
  const entry = map?.get(Number(frameIndex));
  if (!entry?.canvas) return false;
  return canvasHasNonTransparentPixels(entry.canvas);
}

/**
 * Vervangt state.framePaintOverlays. `layers`: opgeslagen array of null/undefined om te wissen.
 * @returns {Promise<void>}
 */
export async function restoreFramePaintOverlaysFromSerialized(layers) {
  const { clearPixelEditorUndoHistory } = await import('./frame-pixel-editor.js');
  clearPixelEditorUndoHistory();
  const state = getState();
  state.framePaintOverlays.clear();
  if (!Array.isArray(layers) || layers.length === 0) return;

  const loaders = layers.map(
    (layer) =>
      new Promise((resolve) => {
        const fi = Number(layer.frameIndex);
        const stripW = Number(layer.stripW);
        const stripH = Number(layer.stripH);
        const x = Number(layer.x);
        const y = Number(layer.y);
        const w = Number(layer.w);
        const h = Number(layer.h);
        const png = layer.png;
        if (!Number.isFinite(fi) || !png || typeof png !== 'string' || w < 1 || h < 1) {
          resolve(null);
          return;
        }
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const cctx = c.getContext('2d', { alpha: true });
          if (!cctx) {
            resolve(null);
            return;
          }
          cctx.drawImage(img, 0, 0, w, h);
          resolve({
            fi,
            entry: {
              stripW,
              stripH,
              x,
              y,
              w,
              h,
              canvas: c
            }
          });
        };
        img.onerror = () => resolve(null);
        img.src = png;
      })
  );

  const results = await Promise.all(loaders);
  for (const r of results) {
    if (r) state.framePaintOverlays.set(r.fi, r.entry);
  }
}
