/**
 * Renderer constants – grenzen, defaults, filmformaten.
 */
const MAX_FRAMES = 99;
const MIN_FRAMES = 1;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 10;
const FINE_ROTATION_MIN = -1;
const FINE_ROTATION_MAX = 1;

/** Bovenrand raster (gridOffsetY) mag tot dit deel van de striphoogte (canvas) negatief zijn — extra uitlijning in scanlint-preview. */
const GRID_TOP_SLACK_RATIO = 0.05;

/** Stap pijltjestoets: 1 px normaal, 10 px met Shift. */
const ARROW_STEP_PX = 1;
const ARROW_STEP_SHIFT_PX = 10;

/** Fijne rotatie: 0.001° normaal, 0.01° met Shift (numeriek + / -); invoer tot 3 decimalen binnen ±1°. */
const ROTATION_STEP_DEG = 0.001;
const ROTATION_STEP_SHIFT_DEG = 0.01;

/** Kantelpunten voor scanlint-rotatie. */
const TILT_PIVOTS = [
  { id: 'top-left', label: 'Boven links' },
  { id: 'top-center', label: 'Boven midden' },
  { id: 'top-right', label: 'Boven rechts' },
  { id: 'center-left', label: 'Midden links' },
  { id: 'center', label: 'Midden' },
  { id: 'center-right', label: 'Midden rechts' },
  { id: 'bottom-left', label: 'Onder links' },
  { id: 'bottom-center', label: 'Onder midden' },
  { id: 'bottom-right', label: 'Onder rechts' }
];

/**
 * Filmformaten: frame-afmetingen in mm (breedte × hoogte beeldgebied).
 * Gebruikt voor raster-presets en px/mm berekening.
 */
const FILM_FORMATS = {
  '16mm-double': { label: '16mm dubbel perforatie', widthMm: 10.26, heightMm: 7.49 },
  '16mm-single': { label: '16mm enkel perforatie', widthMm: 10.26, heightMm: 7.49 },
  'super16': { label: 'Super 16mm', widthMm: 12.52, heightMm: 7.41 },
  '8mm': { label: '8mm', widthMm: 4.37, heightMm: 3.28 },
  'super8': { label: 'Super 8', widthMm: 5.79, heightMm: 4.01 },
  '9.5mm': { label: '9,5mm', widthMm: 6.15, heightMm: 4.73 },
  '35mm': { label: '35mm', widthMm: 22.0, heightMm: 16.0 }
};

/** Raster offset presets (percentage van beeldruimte). */
const GRID_OFFSET_PRESETS = {
  '16mm-double': { label: '16mm dubbel perf', percentX: 0.055, percentY: 0.05 },
  '16mm-single': { label: '16mm enkel perf', percentX: 0.07, percentY: 0.05 },
  'super16': { label: 'Super 16mm', percentX: 0.035, percentY: 0.04 },
  '8mm': { label: '8mm', percentX: 0.06, percentY: 0.05 },
  'super8': { label: 'Super 8', percentX: 0.05, percentY: 0.04 },
  '9.5mm': { label: '9,5mm', percentX: 0.05, percentY: 0.04 },
  '35mm': { label: '35mm', percentX: 0.04, percentY: 0.03 }
};

/** Standaard rasterbreedte als fractie van scanlintbreedte per filmtype (beeldgebied vs. volledige strook). Smaller dan 1 = raster smaller dan lint. */
const DEFAULT_GRID_WIDTH_RATIO_BY_FORMAT = {
  '16mm-double': 0.62,
  '16mm-single': 0.62,
  'super16': 0.72,
  '8mm': 0.58,
  'super8': 0.62,
  '9.5mm': 0.62,
  '35mm': 0.78
};

/** Scan-DPI opties (standaard 4800). */
const DPI_OPTIONS = [600, 1200, 2400, 4800, 9600];
const DEFAULT_DPI = 4800;

/** Frames per scan standaard. */
const DEFAULT_FRAMES_PER_STRIP = 30;

/** Preview-resolutie opties (max zijde px). */
const STRIP_PREVIEW_MAX_DIM_OPTIONS = [1024, 1536, 2048, 2560, 3072, 4096];

/**
 * Max. zijde van strip-canvas na rotatie (strip-loader).
 * 4096 laat 4K-monitorweergave toe in scanlint-preview.
 * Preview bouwt NOOIT groter dan dit (voorkomt multi‑100MB allocaties per muisbeweging).
 */
const STRIP_CANVAS_MAX_DIM = 4096;

/**
 * Max. zijde van strip bij frame-export (hoger dan preview: volledige scanresolutie zoveel mogelijk).
 * Was 32767 (~0,5+ GB per canvas) — dat vulde RAM tot het hele OS vastliep bij herhaalde
 * Volgende/Auto/Detecteer. 16384 houdt export bruikbaar terwijl piekgeheugen roughly halveert.
 * Chromium clampen vaak rond 16k–32k; hier proactief begrenzen.
 */
const EXPORT_STRIP_MAX_DIM = 16384;

/** Standaard max. zijde scanlint-preview (px); Full HD-vriendelijk. */
const DEFAULT_STRIP_PREVIEW_MAX_DIM = 1536;

/** Scanlint-preview: 5% boven + 5% onder het scanlint voor uitlijnen raster. */
const STRIP_EXTENDED_RATIO = 1.1;

/** Uitvoerformaten. */
const OUTPUT_FORMATS = ['png', 'jpg', 'jpeg'];
const OUTPUT_RESOLUTIONS = [
  { id: 'original', label: 'Raster (native pixels)' },
  { id: 'r1024x768', label: '1024 × 768' },
  { id: 'r1280x720', label: '1280 × 720 (SD)' },
  { id: 'r1280x960', label: '1280 × 960' },
  { id: 'r1600x1200', label: '1600 × 1200' },
  { id: 'r1920x1080', label: '1920 × 1080 (Full HD)' },
  { id: 'r2560x1440', label: '2560 × 1440 (QHD)' },
  { id: 'r3840x2160', label: '3840 × 2160 (UHD 4K)' },
  { id: 'sd', label: 'SD (720p)', w: 1280, h: 720 },
  { id: 'hd', label: 'HD (1080p)', w: 1920, h: 1080 },
  { id: 'uhd', label: 'UHD (4K)', w: 3840, h: 2160 },
  { id: 'custom', label: 'Aangepast' }
];

/** Frame-nummering: 6 cijfers 000001–999999. */
const FRAME_NUMBER_PAD = 6;

/** Max. wachttijd op <img> load/error; voorkomt oneindig hangen bij ontbrekend/vergrendeld bestand (file://). */
const STRIP_IMAGE_LOAD_TIMEOUT_MS = 120000;

export {
  MAX_FRAMES,
  MIN_FRAMES,
  ZOOM_MIN,
  ZOOM_MAX,
  FINE_ROTATION_MIN,
  FINE_ROTATION_MAX,
  ARROW_STEP_PX,
  ARROW_STEP_SHIFT_PX,
  ROTATION_STEP_DEG,
  ROTATION_STEP_SHIFT_DEG,
  TILT_PIVOTS,
  FILM_FORMATS,
  GRID_OFFSET_PRESETS,
  DEFAULT_GRID_WIDTH_RATIO_BY_FORMAT,
  DPI_OPTIONS,
  DEFAULT_DPI,
  DEFAULT_FRAMES_PER_STRIP,
  STRIP_PREVIEW_MAX_DIM_OPTIONS,
  STRIP_CANVAS_MAX_DIM,
  EXPORT_STRIP_MAX_DIM,
  DEFAULT_STRIP_PREVIEW_MAX_DIM,
  STRIP_EXTENDED_RATIO,
  GRID_TOP_SLACK_RATIO,
  OUTPUT_FORMATS,
  OUTPUT_RESOLUTIONS,
  FRAME_NUMBER_PAD,
  STRIP_IMAGE_LOAD_TIMEOUT_MS
};
