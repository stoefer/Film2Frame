/**
 * Vensters schikken voor minimal cut: 1 = hoofd, 2 = RASTER SETUP.
 */
const { screen } = require('electron');
const windows = require('./windows');
const prefs = require('./prefs');

/** Legacy projectwaarde → canonieke id (alleen voor migratie oude prefs). */
const LAYOUT_ALIASES = {
  'left-center-right': 'horiz-osm',
  'left-rightstack': 'split-out-left',
  'top-middle-bottom': 'vert-osm',
  'left-right-bottom': 'horiz-top2-bottom-main'
};

const CANONICAL_LAYOUTS = [
  'horiz-osm',
  'horiz-oms',
  'horiz-som',
  'horiz-smo',
  'horiz-mos',
  'horiz-mso',
  'split-out-left',
  'vert-osm',
  'horiz-top2-bottom-main',
  'triple-msa',
  'triple-mus',
  'triple-sma',
  'triple-suh',
  'triple-ums',
  'triple-ush'
];

const DEFAULT_PERM = [1, 2, 3, 4, 5, 6];

/** Oude layout-id → permutatie [cel0…cel5] rij voor rij (3 kolommen × 2 rijen). */
function legacyLayoutToPermutation(layout) {
  const L = normalizeLayout(layout);
  const m = {
    'horiz-osm': [4, 2, 1, 3, 5, 6],
    'horiz-oms': [4, 1, 2, 3, 5, 6],
    'horiz-som': [2, 4, 1, 3, 5, 6],
    'horiz-smo': [2, 1, 4, 3, 5, 6],
    'horiz-mos': [1, 4, 2, 3, 5, 6],
    'horiz-mso': [1, 2, 4, 3, 5, 6],
    'triple-msa': [1, 2, 3, 4, 5, 6],
    'triple-mus': [1, 3, 2, 4, 5, 6],
    'triple-sma': [2, 1, 3, 4, 5, 6],
    'triple-suh': [2, 3, 1, 4, 5, 6],
    'triple-ums': [3, 1, 2, 4, 5, 6],
    'triple-ush': [3, 2, 1, 4, 5, 6],
    'split-out-left': [4, 2, 1, 3, 5, 6],
    'vert-osm': [4, 2, 1, 3, 5, 6],
    'horiz-top2-bottom-main': [4, 2, 1, 3, 5, 6]
  };
  return (m[L] || DEFAULT_PERM).slice();
}

function normalizeLayout(layout) {
  if (!layout || typeof layout !== 'string') return 'horiz-osm';
  const t = layout.trim();
  if (LAYOUT_ALIASES[t]) return LAYOUT_ALIASES[t];
  if (CANONICAL_LAYOUTS.includes(t)) return t;
  return 'horiz-osm';
}

function isValidLayout(layout) {
  const n = normalizeLayout(layout);
  return CANONICAL_LAYOUTS.includes(n) || Object.keys(LAYOUT_ALIASES).includes(layout);
}

function isValidPermutation(p) {
  if (!Array.isArray(p) || p.length !== 6) return false;
  const s = new Set();
  for (const n of p) {
    const v = Number(n);
    if (!Number.isInteger(v) || v < 1 || v > 6) return false;
    s.add(v);
  }
  return s.size === 6;
}

/**
 * @param {string} [stored]
 * @param {string} [legacyLayout] genormaliseerde oude layout-id
 * @returns {string} komma-gescheiden permutatie
 */
function parseStoredWindowGrid(stored, legacyLayout) {
  if (typeof stored === 'string' && stored.trim()) {
    const parts = stored.split(',').map((x) => parseInt(String(x).trim(), 10));
    if (isValidPermutation(parts)) return parts.join(',');
  }
  return legacyLayoutToPermutation(legacyLayout || 'horiz-osm').join(',');
}

function parsePermutationString(str) {
  if (typeof str !== 'string' || !str.trim()) return null;
  const parts = str.split(',').map((x) => parseInt(String(x).trim(), 10));
  return isValidPermutation(parts) ? parts : null;
}

function setBounds(win, x, y, w, h) {
  if (!win || win.isDestroyed()) return;
  win.setBounds({ x, y, width: w, height: h });
  win.setVisibleOnAllWorkspaces(true);
  win.setVisibleOnAllWorkspaces(false);
}

/**
 * Rechthoek voor cel (0…5): 3 kolommen, 2 rijen, gelijke verdeling + gap.
 */
function cellRect(X, Y, W, H, gap, cellIndex) {
  const col = cellIndex % 3;
  const row = Math.floor(cellIndex / 3);
  const innerW = W - 2 * gap;
  const innerH = H - gap;
  const w0 = Math.floor(innerW / 3);
  const w1 = Math.floor((innerW - w0) / 2);
  const w2 = innerW - w0 - w1;
  const widths = [w0, w1, w2];
  const h0 = Math.floor(innerH / 2);
  const h1 = innerH - h0;
  const heights = [h0, h1];
  let x = X;
  for (let c = 0; c < col; c++) x += widths[c] + gap;
  let y = Y;
  for (let r = 0; r < row; r++) y += heights[r] + gap;
  return { x, y, w: widths[col], h: heights[row] };
}

/**
 * Drie gelijke kolommen.
 */
function layoutThreeColumns(leftWin, midWin, rightWin, X, Y, W, H, gap) {
  const w = Math.floor((W - 2 * gap) / 3);
  let x = X;
  setBounds(leftWin, x, Y, w, H);
  x += w + gap;
  setBounds(midWin, x, Y, w, H);
  x += w + gap;
  const w3 = W - 2 * gap - 2 * w;
  setBounds(rightWin, x, Y, w3, H);
}

/** Paneelvolgorde over schermen (links → rechts): 1 hoofd, 2 raster setup. */
function arrangeAcrossAllDisplays() {
  const gap = 8;
  const mainWin = windows.getMainWindow();
  const stripWin = windows.getStripPreviewWindow();
  const ordered = [mainWin, stripWin];
  const wins = ordered.filter((w) => w && !w.isDestroyed());
  if (!wins.length) return;
  const displays = screen
    .getAllDisplays()
    .slice()
    .sort((a, b) => (a.bounds.x !== b.bounds.x ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y));
  if (!displays.length) return;

  let wi = 0;
  for (let di = 0; di < displays.length && wi < wins.length; di++) {
    const wa = displays[di].workArea || displays[di].bounds;
    setBounds(wins[wi], wa.x, wa.y, wa.width, wa.height);
    wi++;
  }
  if (wi < wins.length) {
    const last = displays[displays.length - 1];
    const wa = last.workArea || last.bounds;
    const rem = wins.length - wi;
    const totalGap = (rem - 1) * gap;
    const baseH = Math.floor((wa.height - totalGap) / rem);
    let y = wa.y;
    for (let j = 0; j < rem; j++) {
      const thisH = j === rem - 1 ? wa.y + wa.height - y : baseH;
      setBounds(wins[wi + j], wa.x, y, wa.width, thisH);
      y += thisH + gap;
    }
  }
}

function getPanelWindows() {
  return {
    1: windows.getMainWindow(),
    2: windows.getStripPreviewWindow()
  };
}

/**
 * Leest voorkeur uit prefs; schikt open vensters.
 */
function arrangeWindows() {
  if (prefs.getAllSettings().arrangeAcrossAllDisplays) {
    arrangeAcrossAllDisplays();
    return;
  }

  const all = prefs.getAllSettings();
  const perm = parsePermutationString(all.windowGridPermutation);
  if (!perm) return;

  const map = getPanelWindows();
  const display = screen.getPrimaryDisplay();
  const work = display.workArea;
  const gap = 8;
  const W = work.width;
  const H = work.height;
  const X = work.x;
  const Y = work.y;

  /** Open vensters in volgorde van raster (cel 0→5): welke panelen staan waar. */
  const orderedOpen = [];
  for (let cell = 0; cell < 6; cell++) {
    const pid = perm[cell];
    const win = map[pid];
    if (win && !win.isDestroyed()) orderedOpen.push(win);
  }
  const n = orderedOpen.length;
  if (n === 0) return;

  if (n === 1) {
    setBounds(orderedOpen[0], X, Y, W, H);
    return;
  }

  if (n === 2) {
    const wcol = Math.floor((W - gap) / 2);
    setBounds(orderedOpen[0], X, Y, wcol, H);
    setBounds(orderedOpen[1], X + wcol + gap, Y, W - wcol - gap, H);
    return;
  }

  if (n === 3) {
    layoutThreeColumns(orderedOpen[0], orderedOpen[1], orderedOpen[2], X, Y, W, H, gap);
    return;
  }

  /* 4, 5 of 6 vensters: vaste 3×2-cellen; lege cellen blijven leeg. */
  for (let cell = 0; cell < 6; cell++) {
    const pid = perm[cell];
    const win = map[pid];
    if (!win || win.isDestroyed()) continue;
    const r = cellRect(X, Y, W, H, gap, cell);
    setBounds(win, r.x, r.y, r.w, r.h);
  }
}

module.exports = {
  arrangeWindows,
  arrangeAcrossAllDisplays,
  normalizeLayout,
  isValidLayout,
  CANONICAL_LAYOUTS,
  LAYOUT_ALIASES,
  parseStoredWindowGrid,
  parsePermutationString,
  legacyLayoutToPermutation,
  DEFAULT_WINDOW_GRID_PERMUTATION: DEFAULT_PERM.join(','),
  isValidPermutation
};
