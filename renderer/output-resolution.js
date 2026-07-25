/**
 * Gedeelde logica voor uitvoerresolutie-ID’s (Frame generator, instellingen).
 */

export const RESOLUTION_ID_TO_DIMS = {
  sd: [1280, 720],
  hd: [1920, 1080],
  uhd: [3840, 2160],
  r1024x768: [1024, 768],
  r1280x720: [1280, 720],
  r1280x960: [1280, 960],
  r1600x1200: [1600, 1200],
  r1920x1080: [1920, 1080],
  r2560x1440: [2560, 1440],
  r3840x2160: [3840, 2160]
};

const VALID_OUTPUT_RESOLUTION_IDS = new Set([
  'original',
  'custom',
  'sd',
  'hd',
  'uhd',
  ...Object.keys(RESOLUTION_ID_TO_DIMS)
]);

/** Oude voorkeuren (sd/hd/uhd) mappen naar expliciete presets. */
export function normalizeOutputResolutionId(raw) {
  const r = String(raw || 'original').trim();
  const legacy = { sd: 'r1280x720', hd: 'r1920x1080', uhd: 'r3840x2160' };
  const id = legacy[r] || r;
  return VALID_OUTPUT_RESOLUTION_IDS.has(id) ? id : 'original';
}
