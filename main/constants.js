/**
 * Main process constants – centraliseer hier alle magic numbers.
 */
module.exports = {
  APP_NAME: 'Film2Frame',
  MIN_WIDTH: 1280,
  MIN_HEIGHT: 720,
  STRIP_PREVIEW_DEFAULT: { width: 1400, height: 900 },
  /** Smaller width so main window menu/options remain reachable. */
  STRIP_PREVIEW_MAX_WIDTH: 480,
  /** Ondergrens; effectieve min-breedte = min( deze, tegelbreedte ) voor de drie preview-vensters. */
  STRIP_PREVIEW_MIN_WIDTH: 320,
  FRAME_PREVIEW_DEFAULT: { width: 1280, height: 720 },
  FRAME_PREVIEW_MIN: { width: 640, height: 480 }
};
