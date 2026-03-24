/**
 * Vensters schikken: Output/Scanlint/Hoofd (9 opties) óf Hoofd/Scanlint/UITLIJN (6 permutaties, volle hoogte).
 * Output-preview wordt bij de UITLIJN-layouts niet verplaatst.
 */
const { screen } = require('electron');
const windows = require('./windows');

/** Legacy projectwaarde → canonieke id. */
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
  /* Hoofd + Scanlint + UITLIJN, drie gelijke kolommen (output ongewijzigd) */
  'triple-msa',
  'triple-mus',
  'triple-sma',
  'triple-suh',
  'triple-ums',
  'triple-ush'
];

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

function setBounds(win, x, y, w, h) {
  if (!win || win.isDestroyed()) return;
  win.setBounds({ x, y, width: w, height: h });
  win.setVisibleOnAllWorkspaces(true);
  win.setVisibleOnAllWorkspaces(false);
}

/**
 * Drie gelijke kolommen: welk venster links / midden / rechts.
 */
function layoutThreeColumns(leftWin, midWin, rightWin, X, Y, W, H, gap) {
  const w = Math.floor((W - 2 * gap) / 3);
  let x = X;
  setBounds(leftWin, x, Y, w, H);
  x += w + gap;
  setBounds(midWin, x, Y, w, H);
  x += w + gap;
  setBounds(rightWin, x, Y, w, H);
}

/**
 * @param {string} layoutKey - Voorkeur uit preferences (mag legacy alias zijn).
 */
function arrangeWindows(layoutKey) {
  const mainWin = windows.getMainWindow();
  const stripWin = windows.getStripPreviewWindow();
  const outputWin = windows.getOutputPreviewWindow();
  const alignWin = windows.getAlignPreviewWindow();
  const display = screen.getPrimaryDisplay();
  const work = display.workArea;
  const gap = 8;
  const W = work.width;
  const H = work.height;
  const X = work.x;
  const Y = work.y;

  const layout = normalizeLayout(layoutKey);

  const O = outputWin;
  const S = stripWin;
  const M = mainWin;
  const U = alignWin;

  switch (layout) {
    case 'triple-msa':
      layoutThreeColumns(M, S, U, X, Y, W, H, gap);
      break;
    case 'triple-mus':
      layoutThreeColumns(M, U, S, X, Y, W, H, gap);
      break;
    case 'triple-sma':
      layoutThreeColumns(S, M, U, X, Y, W, H, gap);
      break;
    case 'triple-suh':
      layoutThreeColumns(S, U, M, X, Y, W, H, gap);
      break;
    case 'triple-ums':
      layoutThreeColumns(U, M, S, X, Y, W, H, gap);
      break;
    case 'triple-ush':
      layoutThreeColumns(U, S, M, X, Y, W, H, gap);
      break;
    case 'horiz-osm':
      layoutThreeColumns(O, S, M, X, Y, W, H, gap);
      break;
    case 'horiz-oms':
      layoutThreeColumns(O, M, S, X, Y, W, H, gap);
      break;
    case 'horiz-som':
      layoutThreeColumns(S, O, M, X, Y, W, H, gap);
      break;
    case 'horiz-smo':
      layoutThreeColumns(S, M, O, X, Y, W, H, gap);
      break;
    case 'horiz-mos':
      layoutThreeColumns(M, O, S, X, Y, W, H, gap);
      break;
    case 'horiz-mso':
      layoutThreeColumns(M, S, O, X, Y, W, H, gap);
      break;
    case 'split-out-left': {
      const wLeft = Math.floor((W - gap) / 2);
      const wRight = W - wLeft - gap;
      const hHalf = Math.floor((H - gap) / 2);
      setBounds(O, X, Y, wLeft, H);
      setBounds(S, X + wLeft + gap, Y, wRight, hHalf);
      setBounds(M, X + wLeft + gap, Y + hHalf + gap, wRight, H - hHalf - gap);
      break;
    }
    case 'vert-osm': {
      const h = Math.floor((H - 2 * gap) / 3);
      setBounds(O, X, Y, W, h);
      setBounds(S, X, Y + h + gap, W, h);
      setBounds(M, X, Y + 2 * (h + gap), W, H - 2 * (h + gap));
      break;
    }
    case 'horiz-top2-bottom-main': {
      const wLeft = Math.floor((W - gap) / 2);
      const wRight = W - wLeft - gap;
      const hTop = Math.floor((H - gap) / 2);
      const hBottom = H - hTop - gap;
      setBounds(O, X, Y, wLeft, hTop);
      setBounds(S, X + wLeft + gap, Y, wRight, hTop);
      setBounds(M, X, Y + hTop + gap, W, hBottom);
      break;
    }
    default:
      layoutThreeColumns(O, S, M, X, Y, W, H, gap);
  }
}

module.exports = {
  arrangeWindows,
  normalizeLayout,
  isValidLayout,
  CANONICAL_LAYOUTS,
  LAYOUT_ALIASES
};
