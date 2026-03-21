/**
 * Window factory – alle vensters op één plek. Posities en groottes worden bewaard in prefs.
 */
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const constants = require('./constants');
const prefs = require('./prefs');

/** Minimum vensterbreedte scanlint: minstens 1/3 werkgebied (en minimaal STRIP_PREVIEW_MIN_WIDTH). */
function getStripPreviewMinWidthPx() {
  try {
    const display = screen.getPrimaryDisplay();
    const work = display.workArea || display.bounds;
    const w = work.width != null ? work.width : 1400;
    return Math.max(constants.STRIP_PREVIEW_MIN_WIDTH || 320, Math.floor(w / 3));
  } catch (_) {
    return Math.max(constants.STRIP_PREVIEW_MIN_WIDTH || 320, 400);
  }
}

/** Strip-preview: 1/3 schermbreedte, maximale hoogte, gecentreerd in het scherm. */
function getStripPreviewBounds() {
  try {
    const display = screen.getPrimaryDisplay();
    const work = display.workArea || display.bounds;
    const w = work.width != null ? work.width : 1400;
    const h = work.height != null ? work.height : 900;
    const margin = 24;
    const width = Math.max(constants.STRIP_PREVIEW_MIN_WIDTH || 320, Math.floor(w / 3));
    const height = Math.max(400, h - margin);
    const x = work.x != null ? work.x + Math.floor((w - width) / 2) : 0;
    const y = work.y != null ? work.y : 0;
    return { x, y, width, height };
  } catch (_) {
    return {
      x: 0,
      y: 0,
      width: constants.STRIP_PREVIEW_MAX_WIDTH || 480,
      height: constants.STRIP_PREVIEW_DEFAULT.height
    };
  }
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

function getMainWindow() { return mainWindow; }
function getStripPreviewWindow() { return stripPreviewWindow; }
function getOutputPreviewWindow() { return outputPreviewWindow; }

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
  mainWindow.on('close', () => {
    const state = prefs.getWindowState();
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds();
      state.mainBounds = b;
    }
    state.stripPreviewOpen = !!(stripPreviewWindow && !stripPreviewWindow.isDestroyed());
    state.outputPreviewOpen = !!(outputPreviewWindow && !outputPreviewWindow.isDestroyed());
    if (stripPreviewWindow && !stripPreviewWindow.isDestroyed()) {
      state.stripPreviewBounds = stripPreviewWindow.getBounds();
    }
    if (outputPreviewWindow && !outputPreviewWindow.isDestroyed()) {
      state.outputPreviewBounds = outputPreviewWindow.getBounds();
    }
    prefs.setWindowState(state);
    closeStripPreviewWindow();
    closeOutputPreviewWindow();
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
  const minW = getStripPreviewMinWidthPx();
  const base = saved || getStripPreviewBounds();
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('strip-preview-ready');
    }
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
  const opts = {
    width: saved?.width ?? 640,
    height: saved?.height ?? 480,
    minWidth: 320,
    minHeight: 240,
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

/** Herstel scanlint- en output-preview vensters als ze bij vorige sessie open stonden. */
function restorePreviewWindowsIfNeeded(stripPreload, stripHtmlPath, outputPreload, outputHtmlPath) {
  const state = prefs.getWindowState();
  if (state.stripPreviewOpen && stripHtmlPath && stripPreload) createStripPreviewWindow(stripPreload, stripHtmlPath);
  if (state.outputPreviewOpen && outputHtmlPath && outputPreload) createOutputPreviewWindow(outputPreload, outputHtmlPath);
}

module.exports = {
  getMainWindow,
  getStripPreviewWindow,
  getOutputPreviewWindow,
  createMainWindow,
  createStripPreviewWindow,
  createOutputPreviewWindow,
  closeStripPreviewWindow,
  closeOutputPreviewWindow,
  sendToStripPreview,
  sendToOutputPreview,
  restorePreviewWindowsIfNeeded
};
