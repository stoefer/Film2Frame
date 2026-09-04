/**
 * Window factory – alle vensters op één plek. Posities en groottes worden bewaard in prefs.
 */
const { BrowserWindow, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const constants = require('./constants');
const prefs = require('./prefs');
const locales = require('./locales');

/** Venster- en taakbalkicoon; op Windows bij voorkeur .ico, anders PNG. */
function getAppIconPath() {
  try {
    const base = path.join(__dirname, '..', 'build');
    const ico = path.join(base, 'icon.ico');
    if (process.platform === 'win32' && fs.existsSync(ico)) return ico;
    const png = path.join(base, 'icon.png');
    if (fs.existsSync(png)) return png;
    if (fs.existsSync(ico)) return ico;
  } catch (_) {}
  return undefined;
}

function applyWindowIcon(opts) {
  const icon = getAppIconPath();
  if (icon) opts.icon = icon;
}

function localizedAuxWindowTitle(dictKey, fallbackSuffix) {
  const d = locales.loadLocale(prefs.getLocale()) || locales.loadLocale('en') || {};
  const suf = typeof d[dictKey] === 'string' && d[dictKey].trim() ? d[dictKey].trim() : fallbackSuffix;
  return `${constants.APP_NAME} – ${suf}`;
}

/** Zijkant- en tussenruimte voor standaard 2-vensteropstelling (hoofd + raster setup). */
const PREVIEW_TILE_SIDE_PAD = 10;
const PREVIEW_TILE_GAP = 8;
const PREVIEW_TILE_BOTTOM_MARGIN = 24;

/**
 * Standaard tegelmaat voor de raster-setup: halve werkbreedte (2 kolommen).
 * @returns {{ work: Electron.Rectangle, width: number, height: number, x0: number, y: number, avail: number }}
 */
function getUnifiedPreviewTileSize() {
  try {
    const display = screen.getPrimaryDisplay();
    const work = display.workArea || display.bounds;
    const W = work.width != null ? work.width : 1400;
    const H = work.height != null ? work.height : 900;
    /** Ruimte voor 2×breedte + 1×gap tussen de kolommen. */
    const avail = W - 2 * PREVIEW_TILE_SIDE_PAD;
    let width = Math.floor((avail - PREVIEW_TILE_GAP) / 2);
    width = Math.max(240, width);
    while (2 * width + PREVIEW_TILE_GAP > avail && width > 200) width -= 1;
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
 * Standaardpositie voor preview-tegel: 0 = links, 1 = rechts.
 */
function getUnifiedPreviewSlotBounds(slotIndex) {
  const s = Math.max(0, Math.min(1, Math.floor(Number(slotIndex)) || 0));
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

/** Maximale inhoudshoogte (px) zodat het venster in het werkgebied blijft. */
function getMaxContentHeightForWindow(win) {
  try {
    if (!win || win.isDestroyed()) return 1200;
    const outer = win.getBounds();
    const content = win.getContentBounds();
    const chromeY = outer.height - content.height;
    const display = screen.getDisplayMatching(outer);
    const work = display.workArea || display.bounds;
    return Math.max(320, work.height - chromeY - 8);
  } catch (_) {
    return 1200;
  }
}

/**
 * Verhoogt zo nodig de inhoudshoogte zodat vaste UI (toolbar, RASTER-balk, …) + minimale preview zichtbaar zijn.
 * Verkleint niet t.o.v. de huidige hoogte (gebruiker mag hoger venster bewaren).
 */
async function fitWindowContentHeightIfNeeded(win, measureScript, minContentH) {
  if (!win || win.isDestroyed()) return;
  // Niet de inhoudshoogte forceren wanneer het venster gemaximaliseerd/volledig scherm is
  // (setContentSize zou de gemaximaliseerde stand ongedaan maken).
  try { if (win.isMaximized() || win.isFullScreen()) return; } catch (_) {}
  const floor = Math.max(200, Number(minContentH) || 400);
  try {
    const raw = await win.webContents.executeJavaScript(measureScript);
    const needed = Math.ceil(Number(raw));
    if (!Number.isFinite(needed) || needed < 240) return;
    const [cw, ch] = win.getContentSize();
    const target = Math.max(floor, Math.max(ch, needed));
    const maxH = getMaxContentHeightForWindow(win);
    const nextH = Math.min(maxH, target);
    if (nextH <= ch + 1) return;
    win.setContentSize(cw, nextH);
    const nb = win.getBounds();
    const display = screen.getDisplayMatching(nb);
    const work = display.workArea || display.bounds;
    if (nb.y + nb.height > work.y + work.height - 4) {
      const y = Math.max(work.y, work.y + work.height - nb.height);
      win.setPosition(nb.x, y);
    }
  } catch (_) {}
}

const MEASURE_STRIP_PREVIEW_HEIGHT = `(function(){
  function h(el){ return el && el.offsetHeight ? el.offsetHeight : 0; }
  var a = h(document.querySelector('.header'));
  var b = h(document.querySelector('.toolbar'));
  var c = h(document.querySelector('.raster-subpanel'));
  var minVp = 380;
  return a + b + c + minVp;
})()`;

const MEASURE_ALIGN_PREVIEW_HEIGHT = `(function(){
  function ht(el){ return el && el.offsetHeight ? el.offsetHeight : 0; }
  var t = ht(document.querySelector('.toolbar'));
  var minVp = 420;
  return t + minVp;
})()`;

const MEASURE_OUTPUT_PREVIEW_HEIGHT = `(function(){
  var cap = document.querySelector('.caption');
  var minVp = 360;
  return (cap ? cap.offsetHeight : 28) + 20 + minVp;
})()`;

const MEASURE_MAIN_WINDOW_HEIGHT = `(function(){
  var hdr = document.querySelector('header.toolbar');
  var main = document.querySelector('main.content');
  var h0 = hdr && hdr.offsetHeight ? hdr.offsetHeight : 52;
  var h1 = main && main.scrollHeight ? main.scrollHeight : 640;
  var pad = 40;
  return Math.min(5600, h0 + h1 + pad);
})()`;

function scheduleFitWindowContent(win, measureScript, minH, delaysMs) {
  if (!win || win.isDestroyed()) return;
  const delays = Array.isArray(delaysMs) && delaysMs.length ? delaysMs : [80, 280];
  delays.forEach((ms) => {
    setTimeout(() => {
      if (!win.isDestroyed()) fitWindowContentHeightIfNeeded(win, measureScript, minH).catch(() => {});
    }, ms);
  });
}

let mainWindow = null;
let stripPreviewWindow = null;
let outputPreviewWindow = null;
let alignPreviewWindow = null;
let settingsWindow = null;
let docsWindow = null;
let pixelEditorWindow = null;

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

/**
 * Hoofd-, scanlint-, output- en uitlijning-venster: geen verslepen/verkleinen/maximaliseren wanneer locked.
 * Na ontgrendelen worden minimale afmetingen teruggezet (Electron onthoudt die niet automatisch).
 */
function applyWindowGeometryLock(locked) {
  const L = !!locked;
  const floatingStrip = !!prefs.getAllSettings().stripPreviewFloating;
  const applyOne = (win, lockThis) => {
    if (!win || win.isDestroyed()) return;
    try {
      win.setMovable(!lockThis);
      win.setResizable(!lockThis);
      win.setMaximizable(!lockThis);
    } catch (_) {}
  };
  applyOne(mainWindow, L);
  // Zwevend preview: altijd verplaatsbaar/herschaalbaar, ook bij globale vergrendeling
  applyOne(stripPreviewWindow, L && !floatingStrip);
  applyOne(outputPreviewWindow, L);
  applyOne(alignPreviewWindow, L);
  applyOne(settingsWindow, L);
  applyOne(docsWindow, L);
  try {
    const minW = getUnifiedPreviewMinWidthPx();
    if (!L) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setMinimumSize(constants.MIN_WIDTH, constants.MIN_HEIGHT);
      }
      [stripPreviewWindow, outputPreviewWindow, alignPreviewWindow, settingsWindow, docsWindow].forEach((w) => {
        if (w && !w.isDestroyed()) w.setMinimumSize(minW, 400);
      });
    } else if (floatingStrip && stripPreviewWindow && !stripPreviewWindow.isDestroyed()) {
      stripPreviewWindow.setMinimumSize(minW, 400);
    }
  } catch (_) {}
}

function applyWindowGeometryLockFromPrefs() {
  applyWindowGeometryLock(!!prefs.getAllSettings().windowsGeometryLocked);
}

function getMainWindow() { return mainWindow; }
function getStripPreviewWindow() { return stripPreviewWindow; }
function getOutputPreviewWindow() { return outputPreviewWindow; }
function getAlignPreviewWindow() { return alignPreviewWindow; }
function getSettingsWindow() { return settingsWindow; }

function createMainWindow(preloadPath) {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  const winState = prefs.getWindowState();
  const savedMain = winState.mainBounds ? clampBoundsToDisplay(winState.mainBounds) : null;
  let defaultMainBounds = null;
  if (!savedMain) {
    try {
      const display = screen.getPrimaryDisplay();
      const work = display.workArea || display.bounds;
      const gap = PREVIEW_TILE_GAP;
      const colW = Math.max(640, Math.floor((work.width - gap) / 2));
      defaultMainBounds = {
        x: work.x,
        y: work.y,
        width: colW,
        height: work.height
      };
    } catch (_) {}
  }
  const opts = {
    width: savedMain?.width ?? defaultMainBounds?.width ?? 1280,
    height: savedMain?.height ?? defaultMainBounds?.height ?? 900,
    minWidth: constants.MIN_WIDTH,
    minHeight: constants.MIN_HEIGHT,
    title: localizedAuxWindowTitle('window.mainPanelTitleSuffix', '1 — Main panel'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  };
  if (savedMain && Number.isFinite(savedMain.x) && Number.isFinite(savedMain.y)) {
    opts.x = savedMain.x;
    opts.y = savedMain.y;
  } else if (defaultMainBounds && Number.isFinite(defaultMainBounds.x) && Number.isFinite(defaultMainBounds.y)) {
    opts.x = defaultMainBounds.x;
    opts.y = defaultMainBounds.y;
  }
  applyWindowIcon(opts);
  mainWindow = new BrowserWindow(opts);
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  // Herstel de laatst gebruikte venstermodus (gemaximaliseerd / volledig scherm).
  if (winState.mainFullScreen) {
    try { mainWindow.setFullScreen(true); } catch (_) {}
  } else if (winState.mainMaximized) {
    try { mainWindow.maximize(); } catch (_) {}
  }
  mainWindow.on('close', (e) => {
    const state = prefs.getWindowState();
    if (mainWindow && !mainWindow.isDestroyed()) {
      const isMax = mainWindow.isMaximized();
      const isFs = mainWindow.isFullScreen();
      // Bewaar de "vensterstand"-afmetingen (niet de gemaximaliseerde/volledig-scherm-bounds),
      // zodat terugschakelen naar vensterstand de vorige grootte teruggeeft.
      state.mainBounds = (isMax || isFs) ? mainWindow.getNormalBounds() : mainWindow.getBounds();
      state.mainMaximized = isMax;
      state.mainFullScreen = isFs;
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
    state.pixelEditorOpen = !!(pixelEditorWindow && !pixelEditorWindow.isDestroyed());
    if (pixelEditorWindow && !pixelEditorWindow.isDestroyed()) {
      state.pixelEditorBounds = pixelEditorWindow.getBounds();
    }
    prefs.setWindowState(state);

    if (mainWindow._f2fAllowClose) {
      mainWindow._f2fAllowClose = false;
      closeStripPreviewWindow();
      closeOutputPreviewWindow();
      closeAlignPreviewWindow();
      closeSettingsWindow();
      closeDocsWindow();
      closePixelEditorWindow();
      return;
    }
    e.preventDefault();
    closeStripPreviewWindow();
    closeOutputPreviewWindow();
    closeAlignPreviewWindow();
    closeSettingsWindow();
    closeDocsWindow();
    closePixelEditorWindow();
    mainWindow._f2fQuitSavePending = true;
    if (mainWindow._f2fQuitSaveTimer) {
      clearTimeout(mainWindow._f2fQuitSaveTimer);
      mainWindow._f2fQuitSaveTimer = null;
    }
    /* Korter dan NSIS-timeout: installer/soft-close mag niet minuten blijven hangen. */
    mainWindow._f2fQuitSaveTimer = setTimeout(() => {
      mainWindow._f2fQuitSaveTimer = null;
      if (!mainWindow || mainWindow.isDestroyed() || !mainWindow._f2fQuitSavePending) return;
      mainWindow._f2fQuitSavePending = false;
      mainWindow._f2fAllowClose = true;
      mainWindow.close();
    }, 2500);
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
  applyWindowGeometryLockFromPrefs();
  mainWindow.webContents.once('did-finish-load', () => {
    scheduleFitWindowContent(mainWindow, MEASURE_MAIN_WINDOW_HEIGHT, constants.MIN_HEIGHT, [120, 420]);
  });
  return mainWindow;
}

function createStripPreviewWindow(preloadPath, htmlPath) {
  if (stripPreviewWindow && !stripPreviewWindow.isDestroyed()) {
    stripPreviewWindow.focus();
    return stripPreviewWindow;
  }
  const base = path.join(__dirname, '..');
  /* Zwevend venster = alleen vergrote raster-preview (geen knoppen/instellingen). */
  const displayPre = path.join(base, 'preloads', 'strip-display.js');
  const displayHtml = path.join(base, 'windows', 'strip-display.html');
  const useDisplay = fs.existsSync(displayPre) && fs.existsSync(displayHtml);
  const pre = useDisplay ? displayPre : preloadPath;
  const html = useDisplay ? displayHtml : htmlPath;
  const winState = prefs.getWindowState();
  const saved = winState.stripPreviewBounds ? clampBoundsToDisplay(winState.stripPreviewBounds) : null;
  const minW = Math.max(480, Math.floor(getUnifiedPreviewMinWidthPx() * 0.75));
  const baseBounds = saved || getUnifiedPreviewSlotBounds(1);
  const bounds = {
    ...baseBounds,
    width: Math.max(minW, saved ? baseBounds.width : Math.min(1100, baseBounds.width)),
    height: Math.max(400, saved ? baseBounds.height : Math.min(900, baseBounds.height))
  };
  const stripOpts = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: minW,
    minHeight: 320,
    title: localizedAuxWindowTitle('window.floatingStripPreviewTitleSuffix', 'Raster preview'),
    webPreferences: {
      preload: pre,
      contextIsolation: true,
      nodeIntegration: false
    }
  };
  applyWindowIcon(stripOpts);
  const win = new BrowserWindow(stripOpts);
  stripPreviewWindow = win;
  win.loadFile(html);
  win.webContents.on('did-finish-load', () => {
    setImmediate(() => {
      resendLastStripPayloadToStripPreview();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('strip-preview-ready');
      }
    });
  });
  win.on('close', () => {
    const state = prefs.getWindowState();
    state.stripPreviewOpen = false;
    if (!win.isDestroyed()) {
      state.stripPreviewBounds = win.getBounds();
    }
    prefs.setWindowState(state);
  });
  win.on('closed', () => {
    /* Alleen opruimen/melden als dit nog het actieve venster is (voorkomt race bij snel opnieuw openen). */
    if (stripPreviewWindow === win) {
      stripPreviewWindow = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('strip-preview-closed');
      }
    }
  });
  prefs.setWindowState({ ...prefs.getWindowState(), stripPreviewOpen: true });
  applyWindowGeometryLockFromPrefs();
  return win;
}

function closeStripPreviewWindow() {
  if (stripPreviewWindow && !stripPreviewWindow.isDestroyed()) {
    stripPreviewWindow.close();
    /* Referentie blijft tot 'closed'; anders kan snel heropenen de nieuwe instance nullen. */
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
    title: localizedAuxWindowTitle('window.outputPreviewTitleSuffix', '4 — OUTPUT PANEL'),
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
  applyWindowIcon(opts);
  outputPreviewWindow = new BrowserWindow(opts);
  outputPreviewWindow.loadFile(htmlPath);
  outputPreviewWindow.webContents.once('did-finish-load', () => {
    scheduleFitWindowContent(outputPreviewWindow, MEASURE_OUTPUT_PREVIEW_HEIGHT, 400, [40, 200]);
  });
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
  applyWindowGeometryLockFromPrefs();
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
    title: localizedAuxWindowTitle('window.rasterPreviewTitleSuffix', '3 — RASTER PREVIEW'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  };
  applyWindowIcon(opts);
  alignPreviewWindow = new BrowserWindow(opts);
  alignPreviewWindow.loadFile(htmlPath);
  alignPreviewWindow.webContents.on('did-finish-load', () => {
    setImmediate(() => {
      resendLastStripPayloadToAlignPreview();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('align-preview-ready');
      }
    });
    scheduleFitWindowContent(alignPreviewWindow, MEASURE_ALIGN_PREVIEW_HEIGHT, 480, [60, 240]);
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
  applyWindowGeometryLockFromPrefs();
  return alignPreviewWindow;
}

function closeAlignPreviewWindow() {
  if (alignPreviewWindow && !alignPreviewWindow.isDestroyed()) {
    alignPreviewWindow.close();
    alignPreviewWindow = null;
  }
}

function createSettingsWindow(preloadPath, htmlPath) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }
  const winState = prefs.getWindowState();
  const saved = winState.settingsWindowBounds ? clampBoundsToDisplay(winState.settingsWindowBounds) : null;
  const defaultW = 560;
  const defaultH = 720;
  const opts = {
    width: saved?.width ?? defaultW,
    height: saved?.height ?? defaultH,
    minWidth: 400,
    minHeight: 480,
    title: localizedAuxWindowTitle('window.settingsTitleSuffix', '5 — SETTINGS'),
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
    try {
      const display = screen.getPrimaryDisplay();
      const work = display.workArea || display.bounds;
      opts.x = Math.round(work.x + (work.width - defaultW) / 2);
      opts.y = Math.round(work.y + (work.height - defaultH) / 3);
    } catch (_) {}
  }
  applyWindowIcon(opts);
  settingsWindow = new BrowserWindow(opts);
  settingsWindow.loadFile(htmlPath);
  settingsWindow.on('close', () => {
    const state = prefs.getWindowState();
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      state.settingsWindowBounds = settingsWindow.getBounds();
    }
    prefs.setWindowState(state);
  });
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  applyWindowGeometryLockFromPrefs();
  return settingsWindow;
}

function closeSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
    settingsWindow = null;
  }
}

function getDocsWindow() {
  return docsWindow;
}

function createDocsWindow(preloadPath, htmlPath) {
  if (docsWindow && !docsWindow.isDestroyed()) {
    docsWindow.focus();
    return docsWindow;
  }
  const winState = prefs.getWindowState();
  const saved = winState.docsWindowBounds ? clampBoundsToDisplay(winState.docsWindowBounds) : null;
  const defaultW = 920;
  const defaultH = 720;
  const opts = {
    width: saved?.width ?? defaultW,
    height: saved?.height ?? defaultH,
    minWidth: 640,
    minHeight: 480,
    title: localizedAuxWindowTitle('window.docsTitleSuffix', '7 — DOCUMENTS'),
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
    try {
      const display = screen.getPrimaryDisplay();
      const work = display.workArea || display.bounds;
      opts.x = Math.round(work.x + (work.width - defaultW) / 2);
      opts.y = Math.round(work.y + (work.height - defaultH) / 4);
    } catch (_) {}
  }
  applyWindowIcon(opts);
  docsWindow = new BrowserWindow(opts);
  docsWindow.loadFile(htmlPath);
  docsWindow.on('close', () => {
    const state = prefs.getWindowState();
    if (docsWindow && !docsWindow.isDestroyed()) {
      state.docsWindowBounds = docsWindow.getBounds();
    }
    prefs.setWindowState(state);
  });
  docsWindow.on('closed', () => {
    docsWindow = null;
  });
  applyWindowGeometryLockFromPrefs();
  return docsWindow;
}

function closeDocsWindow() {
  if (docsWindow && !docsWindow.isDestroyed()) {
    docsWindow.close();
    docsWindow = null;
  }
}

function getPixelEditorWindow() {
  return pixelEditorWindow;
}

function createPixelEditorWindow(preloadPath, htmlPath) {
  if (pixelEditorWindow && !pixelEditorWindow.isDestroyed()) {
    pixelEditorWindow.focus();
    return pixelEditorWindow;
  }
  const winState = prefs.getWindowState();
  const saved = winState.pixelEditorBounds ? clampBoundsToDisplay(winState.pixelEditorBounds) : null;
  const defaultW = 920;
  const defaultH = 720;
  const opts = {
    width: saved?.width ?? defaultW,
    height: saved?.height ?? defaultH,
    minWidth: 640,
    minHeight: 520,
    title: localizedAuxWindowTitle('window.pixelEditorTitleSuffix', '6 — FRAME PIXEL EDITOR'),
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
    try {
      const display = screen.getPrimaryDisplay();
      const work = display.workArea || display.bounds;
      opts.x = Math.round(work.x + (work.width - defaultW) / 2);
      opts.y = Math.round(work.y + (work.height - defaultH) / 4);
    } catch (_) {}
  }
  applyWindowIcon(opts);
  pixelEditorWindow = new BrowserWindow(opts);
  pixelEditorWindow.loadFile(htmlPath);
  pixelEditorWindow.webContents.once('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pixel-editor-window-ready');
    }
  });
  pixelEditorWindow.on('close', () => {
    const state = prefs.getWindowState();
    state.pixelEditorOpen = false;
    if (pixelEditorWindow && !pixelEditorWindow.isDestroyed()) {
      state.pixelEditorBounds = pixelEditorWindow.getBounds();
    }
    prefs.setWindowState(state);
  });
  pixelEditorWindow.on('closed', () => {
    pixelEditorWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pixel-editor-window-closed');
    }
  });
  prefs.setWindowState({ ...prefs.getWindowState(), pixelEditorOpen: true });
  applyWindowGeometryLockFromPrefs();
  return pixelEditorWindow;
}

function closePixelEditorWindow() {
  if (pixelEditorWindow && !pixelEditorWindow.isDestroyed()) {
    pixelEditorWindow.close();
    pixelEditorWindow = null;
  }
}

/** Alleen focussen/toon; opent geen nieuw venster. */
function focusPixelEditorWindow() {
  if (!pixelEditorWindow || pixelEditorWindow.isDestroyed()) return false;
  try {
    if (pixelEditorWindow.isMinimized()) pixelEditorWindow.restore();
    pixelEditorWindow.show();
    pixelEditorWindow.focus();
  } catch (_) {
    return false;
  }
  return true;
}

function sendToPixelEditor(channel, payload) {
  if (pixelEditorWindow && !pixelEditorWindow.isDestroyed()) {
    pixelEditorWindow.webContents.send(channel, payload);
  }
}

function sendToAlignPreview(channel, payload) {
  if (alignPreviewWindow && !alignPreviewWindow.isDestroyed()) {
    alignPreviewWindow.webContents.send(channel, payload);
  }
}

/** Zet titelbalkteksten opnieuw na taalwissel (zelfde keys als bij create*). */
function applyLocalizedWindowTitles() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(localizedAuxWindowTitle('window.mainPanelTitleSuffix', '1 — Main panel'));
  }
  if (stripPreviewWindow && !stripPreviewWindow.isDestroyed()) {
    stripPreviewWindow.setTitle(localizedAuxWindowTitle('window.floatingStripPreviewTitleSuffix', 'Raster preview'));
  }
  if (alignPreviewWindow && !alignPreviewWindow.isDestroyed()) {
    alignPreviewWindow.setTitle(localizedAuxWindowTitle('window.rasterPreviewTitleSuffix', '3 — RASTER PREVIEW'));
  }
  if (outputPreviewWindow && !outputPreviewWindow.isDestroyed()) {
    outputPreviewWindow.setTitle(localizedAuxWindowTitle('window.outputPreviewTitleSuffix', '4 — OUTPUT PANEL'));
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.setTitle(localizedAuxWindowTitle('window.settingsTitleSuffix', '5 — SETTINGS'));
  }
  if (pixelEditorWindow && !pixelEditorWindow.isDestroyed()) {
    pixelEditorWindow.setTitle(localizedAuxWindowTitle('window.pixelEditorTitleSuffix', '6 — FRAME PIXEL EDITOR'));
  }
  if (docsWindow && !docsWindow.isDestroyed()) {
    docsWindow.setTitle(localizedAuxWindowTitle('window.docsTitleSuffix', '7 — DOCUMENTS'));
  }
}

/** Zes bits legacy compat; default = alleen hoofd + raster setup. */
function parsePanelOpenMask6(str) {
  const s = String(str || '').replace(/\s/g, '');
  if (s.length !== 6 || !/^[01]+$/.test(s)) return [true, true, false, false, false, false];
  return s.split('').map((c) => c === '1');
}

/** Opent panelen 2–6 indien mask true; paneel 1 = hoofdvenster (altijd apart). */
function openAuxiliaryWindowsFromPanelMask(maskInput) {
  const mask = Array.isArray(maskInput) && maskInput.length === 6 ? maskInput.map(Boolean) : parsePanelOpenMask6(maskInput);
  const base = path.join(__dirname, '..');
  if (mask[1]) {
    const pre = path.join(base, 'preloads', 'strip-display.js');
    const html = path.join(base, 'windows', 'strip-display.html');
    if (fs.existsSync(html) && fs.existsSync(pre)) createStripPreviewWindow(pre, html);
  }
  if (mask[2]) {
    const pre = path.join(base, 'preloads', 'align-preview.js');
    const html = path.join(base, 'windows', 'align-preview.html');
    if (fs.existsSync(html) && fs.existsSync(pre)) createAlignPreviewWindow(pre, html);
  }
  if (mask[3]) {
    const pre = path.join(base, 'preloads', 'output.js');
    const html = path.join(base, 'windows', 'output-preview.html');
    if (fs.existsSync(html)) createOutputPreviewWindow(pre, html);
  }
  if (mask[4]) {
    const pre = path.join(base, 'preloads', 'settings.js');
    const html = path.join(base, 'windows', 'settings.html');
    if (fs.existsSync(html) && fs.existsSync(pre)) createSettingsWindow(pre, html);
  }
  if (mask[5]) {
    const pre = path.join(base, 'preloads', 'pixel-editor.js');
    const html = path.join(base, 'windows', 'pixel-editor.html');
    if (fs.existsSync(html) && fs.existsSync(pre)) createPixelEditorWindow(pre, html);
  }
}

/** Sluit hulpvensters 2–6 waar het masker 0 is (paneel 1 = hoofdvenster blijft altijd). */
function closeAuxiliaryWindowsNotInPanelMask(maskInput) {
  const mask = Array.isArray(maskInput) && maskInput.length === 6 ? maskInput.map(Boolean) : parsePanelOpenMask6(maskInput);
  if (!mask[1]) closeStripPreviewWindow();
  if (!mask[2]) closeAlignPreviewWindow();
  if (!mask[3]) closeOutputPreviewWindow();
  if (!mask[4]) closeSettingsWindow();
  if (!mask[5]) closePixelEditorWindow();
}

module.exports = {
  getMainWindow,
  getStripPreviewWindow,
  getOutputPreviewWindow,
  getAlignPreviewWindow,
  getSettingsWindow,
  getDocsWindow,
  getPixelEditorWindow,
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
  createSettingsWindow,
  closeSettingsWindow,
  createDocsWindow,
  closeDocsWindow,
  createPixelEditorWindow,
  closePixelEditorWindow,
  focusPixelEditorWindow,
  sendToPixelEditor,
  sendToStripPreview,
  sendToOutputPreview,
  sendToAlignPreview,
  parsePanelOpenMask6,
  openAuxiliaryWindowsFromPanelMask,
  closeAuxiliaryWindowsNotInPanelMask,
  applyWindowGeometryLock,
  applyWindowGeometryLockFromPrefs,
  applyLocalizedWindowTitles
};
