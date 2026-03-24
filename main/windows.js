/**
 * Window factory – alle vensters op één plek. Posities en groottes worden bewaard in prefs.
 */
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const constants = require('./constants');
const prefs = require('./prefs');

/** Zijkant- en tussenruimte zodat Scanlint, Uitlijning en Output naast elkaar in het werkgebied passen. */
const PREVIEW_TILE_SIDE_PAD = 10;
const PREVIEW_TILE_GAP = 8;
const PREVIEW_TILE_BOTTOM_MARGIN = 24;

/**
 * Eén tegelmaat voor alle drie preview-vensters: breedte = (werkbreedte − padding − 2×gap) / 3.
 * @returns {{ work: Electron.Rectangle, width: number, height: number, x0: number, y: number, avail: number }}
 */
function getUnifiedPreviewTileSize() {
  try {
    const display = screen.getPrimaryDisplay();
    const work = display.workArea || display.bounds;
    const W = work.width != null ? work.width : 1400;
    const H = work.height != null ? work.height : 900;
    /** Ruimte voor 3×breedte + 2×gap tussen de kolommen. */
    const avail = W - 2 * PREVIEW_TILE_SIDE_PAD;
    let width = Math.floor((avail - 2 * PREVIEW_TILE_GAP) / 3);
    width = Math.max(240, width);
    while (3 * width + 2 * PREVIEW_TILE_GAP > avail && width > 200) width -= 1;
    const height = Math.max(400, H - PREVIEW_TILE_BOTTOM_MARGIN);
    const x0 = (work.x != null ? work.x : 0) + PREVIEW_TILE_SIDE_PAD;
    const y = work.y != null ? work.y : 0;
    return { work, width, height, x0, y, avail };
  } catch (_) {
    return {
      work: { x: 0, y: 0, width: 1400, height: 900 },
      width: 400,
      height: 600,
      x0: 10,
      y: 0,
      avail: 1200
    };
  }
}

/**
 * Standaardpositie voor preview-tegel: 0 = Scanlint (links), 1 = Uitlijning (midden), 2 = Output (rechts).
 */
function getUnifiedPreviewSlotBounds(slotIndex) {
  const s = Math.max(0, Math.min(2, Math.floor(Number(slotIndex)) || 0));
  const { width, height, x0, y } = getUnifiedPreviewTileSize();
  return {
    x: x0 + s * (width + PREVIEW_TILE_GAP),
    y,
    width,
    height
  };
}

/** Min-breedte: niet groter dan de tegel (anders past “drie naast elkaar” niet meer). */
function getUnifiedPreviewMinWidthPx() {
  const { width } = getUnifiedPreviewTileSize();
  return Math.min(constants.STRIP_PREVIEW_MIN_WIDTH || 320, Math.max(240, width));
}

/** Bounds binnen werkgebied van een scherm houden. */
function clampBoundsToDisplay(bounds) {
  if (!bounds || typeof bounds.width !== 'number' || typeof bounds.height !== 'number') return null;
  try {
    const display = screen.getDisplayMatching({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
    const work = display.workArea || display.bounds;
    const minW = 200;
    const minH = 200;
    const w = Math.max(minW, Math.min(bounds.width, work.width));
    const h = Math.max(minH, Math.min(bounds.height, work.height));
    const x = Math.max(work.x, Math.min(bounds.x, work.x + work.width - w));
    const y = Math.max(work.y, Math.min(bounds.y, work.y + work.height - h));
    return { x, y, width: w, height: h };
  } catch (_) {
    return null;
  }
}

let mainWindow = null;
let stripPreviewWindow = null;
let outputPreviewWindow = null;
let alignPreviewWindow = null;

/** Laatste strip-payload; UITLIJN opent na IPC → eerste updates kunnen verloren gaan → opnieuw sturen bij load. */
let lastStripUpdatePayload = null;

/**
 * Los van lastStripUpdatePayload: één mislukte merge (bijv. 1 px verschil in display-hoogte) mocht de PNG
 * niet permanent uit de cache wissen. Scanlint hield dan het oude <img>, maar UITLIJN + resend kregen
 * nooit meer een stripDataUrl.
 */
let lastCommittedStripDataUrl = null;
let lastCommittedStripDispW = 0;
let lastCommittedStripDispH = 0;

/** Toegestane afwijking displayWidth/Height t.o.v. de laatst opgeslagen bitmap (afronding / code-paden). */
const STRIP_PREVIEW_DIM_MATCH_TOL = 2;

function displayDimsMatchCommittedBitmap(w, h) {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return false;
  if (!Number.isFinite(lastCommittedStripDispW) || !Number.isFinite(lastCommittedStripDispH)) return false;
  if (lastCommittedStripDispW < 1 || lastCommittedStripDispH < 1) return false;
  return (
    Math.abs(w - lastCommittedStripDispW) <= STRIP_PREVIEW_DIM_MATCH_TOL &&
    Math.abs(h - lastCommittedStripDispH) <= STRIP_PREVIEW_DIM_MATCH_TOL
  );
}

/** Voegt stripDataUrl toe uit vaste bitmap-cache wanneer de grid-update die niet meestuurt. */
function attachCommittedStripBitmap(next) {
  if (!next || next.stripDataUrl) return next;
  const hasGrid = Array.isArray(next.gridRects) && next.gridRects.length > 0;
  if (!hasGrid || !lastCommittedStripDataUrl) return next;
  const w = Number(next.displayWidth);
  const h = Number(next.displayHeight);
  if (!displayDimsMatchCommittedBitmap(w, h)) return next;
  return { ...next, stripDataUrl: lastCommittedStripDataUrl };
}

/**
 * Grid-only updates hebben geen stripDataUrl; scanlint-preview houdt het oude <img>.
 * Bitmap blijft in lastCommittedStripDataUrl; payload wordt aangevuld zolang de preview-afmetingen kloppen.
 */
function setLastStripUpdatePayload(p) {
  if (p == null || typeof p !== 'object') {
    lastStripUpdatePayload = null;
    lastCommittedStripDataUrl = null;
    lastCommittedStripDispW = 0;
    lastCommittedStripDispH = 0;
    return null;
  }
  let next = { ...p };
  const hasGrid = Array.isArray(next.gridRects) && next.gridRects.length > 0;

  if (next.stripDataUrl && typeof next.stripDataUrl === 'string' && next.stripDataUrl.length > 0) {
    lastCommittedStripDataUrl = next.stripDataUrl;
    lastCommittedStripDispW = Number(next.displayWidth);
    lastCommittedStripDispH = Number(next.displayHeight);
  } else if (!hasGrid && !next.stripDataUrl) {
    lastCommittedStripDataUrl = null;
    lastCommittedStripDispW = 0;
    lastCommittedStripDispH = 0;
  }

  next = attachCommittedStripBitmap(next);
  lastStripUpdatePayload = next;
  return next;
}

function resendLastStripPayloadToAlignPreview() {
  if (!lastStripUpdatePayload || !alignPreviewWindow || alignPreviewWindow.isDestroyed()) return;
  const toSend = attachCommittedStripBitmap(lastStripUpdatePayload);
  try {
    alignPreviewWindow.webContents.send('align-preview-update', toSend);
  } catch (_) {}
}

function resendLastStripPayloadToStripPreview() {
  if (!lastStripUpdatePayload || !stripPreviewWindow || stripPreviewWindow.isDestroyed()) return;
  const toSend = attachCommittedStripBitmap(lastStripUpdatePayload);
  try {
    stripPreviewWindow.webContents.send('strip-update', toSend);
  } catch (_) {}
}

function getMainWindow() { return mainWindow; }
function getStripPreviewWindow() { return stripPreviewWindow; }
function getOutputPreviewWindow() { return outputPreviewWindow; }
function getAlignPreviewWindow() { return alignPreviewWindow; }

function createMainWindow(preloadPath) {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  const winState = prefs.getWindowState();
  const savedMain = winState.mainBounds ? clampBoundsToDisplay(winState.mainBounds) : null;
  const opts = {
    width: savedMain?.width ?? 1440,
    height: savedMain?.height ?? 900,
    minWidth: constants.MIN_WIDTH,
    minHeight: constants.MIN_HEIGHT,
    title: constants.APP_NAME,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  };
  if (savedMain && Number.isFinite(savedMain.x) && Number.isFinite(savedMain.y)) {
    opts.x = savedMain.x;
    opts.y = savedMain.y;
  }
  mainWindow = new BrowserWindow(opts);
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  mainWindow.on('close', (e) => {
    const state = prefs.getWindowState();
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds();
      state.mainBounds = b;
    }
    state.stripPreviewOpen = !!(stripPreviewWindow && !stripPreviewWindow.isDestroyed());
    state.outputPreviewOpen = !!(outputPreviewWindow && !outputPreviewWindow.isDestroyed());
    state.alignPreviewOpen = !!(alignPreviewWindow && !alignPreviewWindow.isDestroyed());
    if (stripPreviewWindow && !stripPreviewWindow.isDestroyed()) {
      state.stripPreviewBounds = stripPreviewWindow.getBounds();
    }
    if (outputPreviewWindow && !outputPreviewWindow.isDestroyed()) {
      state.outputPreviewBounds = outputPreviewWindow.getBounds();
    }
    if (alignPreviewWindow && !alignPreviewWindow.isDestroyed()) {
      state.alignPreviewBounds = alignPreviewWindow.getBounds();
    }
    prefs.setWindowState(state);

    if (mainWindow._f2fAllowClose) {
      mainWindow._f2fAllowClose = false;
      closeStripPreviewWindow();
      closeOutputPreviewWindow();
      closeAlignPreviewWindow();
      return;
    }
    e.preventDefault();
    closeStripPreviewWindow();
    closeOutputPreviewWindow();
    closeAlignPreviewWindow();
    mainWindow._f2fQuitSavePending = true;
    if (mainWindow._f2fQuitSaveTimer) {
      clearTimeout(mainWindow._f2fQuitSaveTimer);
      mainWindow._f2fQuitSaveTimer = null;
    }
    mainWindow._f2fQuitSaveTimer = setTimeout(() => {
      mainWindow._f2fQuitSaveTimer = null;
      if (!mainWindow || mainWindow.isDestroyed() || !mainWindow._f2fQuitSavePending) return;
      mainWindow._f2fQuitSavePending = false;
      mainWindow._f2fAllowClose = true;
      mainWindow.close();
    }, 8000);
    if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('request-quit-save');
    } else {
      if (mainWindow._f2fQuitSaveTimer) {
        clearTimeout(mainWindow._f2fQuitSaveTimer);
        mainWindow._f2fQuitSaveTimer = null;
      }
      mainWindow._f2fQuitSavePending = false;
      mainWindow._f2fAllowClose = true;
      mainWindow.close();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

function createStripPreviewWindow(preloadPath, htmlPath) {
  if (stripPreviewWindow && !stripPreviewWindow.isDestroyed()) {
    stripPreviewWindow.focus();
    return stripPreviewWindow;
  }
  const winState = prefs.getWindowState();
  const saved = winState.stripPreviewBounds ? clampBoundsToDisplay(winState.stripPreviewBounds) : null;
  const minW = getUnifiedPreviewMinWidthPx();
  const base = saved || getUnifiedPreviewSlotBounds(0);
  const bounds = { ...base, width: Math.max(minW, base.width) };
  stripPreviewWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: minW,
    minHeight: 400,
    title: constants.APP_NAME + ' – Scanlint',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  stripPreviewWindow.loadFile(htmlPath);
  stripPreviewWindow.webContents.on('did-finish-load', () => {
    /* Na inline script + preload listeners: voorkomt race waarbij eerste resend geen handler heeft. */
    setImmediate(() => {
      resendLastStripPayloadToStripPreview();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('strip-preview-ready');
      }
    });
  });
  stripPreviewWindow.on('close', () => {
    const state = prefs.getWindowState();
    state.stripPreviewOpen = false;
    if (stripPreviewWindow && !stripPreviewWindow.isDestroyed()) {
      state.stripPreviewBounds = stripPreviewWindow.getBounds();
    }
    prefs.setWindowState(state);
  });
  stripPreviewWindow.on('closed', () => {
    stripPreviewWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('strip-preview-closed');
    }
  });
  (function markStripOpen() {
    prefs.setWindowState({ ...prefs.getWindowState(), stripPreviewOpen: true });
  })();
  return stripPreviewWindow;
}

function closeStripPreviewWindow() {
  if (stripPreviewWindow && !stripPreviewWindow.isDestroyed()) {
    stripPreviewWindow.close();
    stripPreviewWindow = null;
  }
}

function sendToStripPreview(channel, payload) {
  if (stripPreviewWindow && !stripPreviewWindow.isDestroyed()) {
    stripPreviewWindow.webContents.send(channel, payload);
  }
}

function createOutputPreviewWindow(preloadPath, htmlPath) {
  if (outputPreviewWindow && !outputPreviewWindow.isDestroyed()) {
    outputPreviewWindow.focus();
    return outputPreviewWindow;
  }
  const winState = prefs.getWindowState();
  const saved = winState.outputPreviewBounds ? clampBoundsToDisplay(winState.outputPreviewBounds) : null;
  const defaultBounds = getUnifiedPreviewSlotBounds(2);
  const minW = getUnifiedPreviewMinWidthPx();
  const opts = {
    width: saved?.width ?? defaultBounds.width,
    height: saved?.height ?? defaultBounds.height,
    minWidth: minW,
    minHeight: 400,
    title: constants.APP_NAME + ' – Output preview',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  };
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    opts.x = saved.x;
    opts.y = saved.y;
  } else {
    opts.x = defaultBounds.x;
    opts.y = defaultBounds.y;
  }
  outputPreviewWindow = new BrowserWindow(opts);
  outputPreviewWindow.loadFile(htmlPath);
  outputPreviewWindow.on('close', () => {
    const state = prefs.getWindowState();
    state.outputPreviewOpen = false;
    if (outputPreviewWindow && !outputPreviewWindow.isDestroyed()) {
      state.outputPreviewBounds = outputPreviewWindow.getBounds();
    }
    prefs.setWindowState(state);
  });
  outputPreviewWindow.on('closed', () => {
    outputPreviewWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('output-preview-closed');
    }
  });
  prefs.setWindowState({ ...prefs.getWindowState(), outputPreviewOpen: true });
  return outputPreviewWindow;
}

function closeOutputPreviewWindow() {
  if (outputPreviewWindow && !outputPreviewWindow.isDestroyed()) {
    outputPreviewWindow.close();
    outputPreviewWindow = null;
  }
}

function sendToOutputPreview(channel, payload) {
  if (outputPreviewWindow && !outputPreviewWindow.isDestroyed()) {
    outputPreviewWindow.webContents.send(channel, payload);
  }
}

function createAlignPreviewWindow(preloadPath, htmlPath) {
  if (alignPreviewWindow && !alignPreviewWindow.isDestroyed()) {
    alignPreviewWindow.focus();
    return alignPreviewWindow;
  }
  const winState = prefs.getWindowState();
  const saved = winState.alignPreviewBounds ? clampBoundsToDisplay(winState.alignPreviewBounds) : null;
  /** Zelfde tegelmaat en rij als Scanlint (slot 0) en Output (slot 2). */
  const minW = getUnifiedPreviewMinWidthPx();
  const base = saved || getUnifiedPreviewSlotBounds(1);
  const bounds = { ...base, width: Math.max(minW, base.width) };
  const opts = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: minW,
    minHeight: 400,
    title: constants.APP_NAME + ' – UITLIJN',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  };
  alignPreviewWindow = new BrowserWindow(opts);
  alignPreviewWindow.loadFile(htmlPath);
  alignPreviewWindow.webContents.on('did-finish-load', () => {
    setImmediate(() => {
      resendLastStripPayloadToAlignPreview();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('align-preview-ready');
      }
    });
  });
  alignPreviewWindow.on('close', () => {
    const state = prefs.getWindowState();
    state.alignPreviewOpen = false;
    if (alignPreviewWindow && !alignPreviewWindow.isDestroyed()) {
      state.alignPreviewBounds = alignPreviewWindow.getBounds();
    }
    prefs.setWindowState(state);
  });
  alignPreviewWindow.on('closed', () => {
    alignPreviewWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('align-preview-closed');
    }
  });
  prefs.setWindowState({ ...prefs.getWindowState(), alignPreviewOpen: true });
  return alignPreviewWindow;
}

function closeAlignPreviewWindow() {
  if (alignPreviewWindow && !alignPreviewWindow.isDestroyed()) {
    alignPreviewWindow.close();
    alignPreviewWindow = null;
  }
}

function sendToAlignPreview(channel, payload) {
  if (alignPreviewWindow && !alignPreviewWindow.isDestroyed()) {
    alignPreviewWindow.webContents.send(channel, payload);
  }
}

/** Herstel scanlint-, output- en uitlijning-preview vensters als ze bij vorige sessie open stonden. */
function restorePreviewWindowsIfNeeded(stripPreload, stripHtmlPath, outputPreload, outputHtmlPath, alignPreload, alignHtmlPath) {
  const state = prefs.getWindowState();
  if (state.stripPreviewOpen && stripHtmlPath && stripPreload) createStripPreviewWindow(stripPreload, stripHtmlPath);
  if (state.outputPreviewOpen && outputHtmlPath && outputPreload) createOutputPreviewWindow(outputPreload, outputHtmlPath);
  if (state.alignPreviewOpen && alignHtmlPath && alignPreload) createAlignPreviewWindow(alignPreload, alignHtmlPath);
}

module.exports = {
  getMainWindow,
  getStripPreviewWindow,
  getOutputPreviewWindow,
  getAlignPreviewWindow,
  setLastStripUpdatePayload,
  resendLastStripPayloadToStripPreview,
  resendLastStripPayloadToAlignPreview,
  createMainWindow,
  createStripPreviewWindow,
  createOutputPreviewWindow,
  createAlignPreviewWindow,
  closeStripPreviewWindow,
  closeOutputPreviewWindow,
  closeAlignPreviewWindow,
  sendToStripPreview,
  sendToOutputPreview,
  sendToAlignPreview,
  restorePreviewWindowsIfNeeded
};
