/**
 * Slaat laatste gebruikte mappen op (projectmap, bestandslocatie) in userData.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const PREFS_FILENAME = 'preferences.json';
const KEYS = {
  lastProjectFolder: 'lastProjectFolder',
  lastFileLocation: 'lastFileLocation',
  lastProjectPath: 'lastProjectPath',
  darkMode: 'darkMode',
  stripPreviewRes: 'stripPreviewRes',
  outputFormat: 'outputFormat',
  scanDpi: 'scanDpi',
  defaultFramesPerStrip: 'defaultFramesPerStrip',
  outputResolution: 'outputResolution',
  customOutputWidth: 'customOutputWidth',
  customOutputHeight: 'customOutputHeight',
  windowArrangement: 'windowArrangement',
  arrangeWindowsOnStartup: 'arrangeWindowsOnStartup',
  mainWindowBounds: 'mainWindowBounds',
  stripPreviewBounds: 'stripPreviewBounds',
  outputPreviewBounds: 'outputPreviewBounds',
  alignPreviewBounds: 'alignPreviewBounds',
  stripPreviewOpen: 'stripPreviewOpen',
  outputPreviewOpen: 'outputPreviewOpen',
  alignPreviewOpen: 'alignPreviewOpen',
  arrowStepPx: 'arrowStepPx',
  arrowStepShiftPx: 'arrowStepShiftPx',
  stripPreviewShortcuts: 'stripPreviewShortcuts',
  locale: 'locale'
};

const DEFAULTS = {
  darkMode: false,
  stripPreviewRes: 2048,
  outputFormat: 'png',
  scanDpi: 4800,
  defaultFramesPerStrip: 30,
  outputResolution: 'original',
  customOutputWidth: 1920,
  customOutputHeight: 1080,
  windowArrangement: 'horiz-osm',
  arrangeWindowsOnStartup: false,
  arrowStepPx: 1,
  arrowStepShiftPx: 10
};

function getPrefsPath() {
  try {
    return path.join(app.getPath('userData'), PREFS_FILENAME);
  } catch (_) {
    return null;
  }
}

function read() {
  const p = getPrefsPath();
  if (!p || !fs.existsSync(p)) return {};
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw);
    return typeof data === 'object' && data !== null ? data : {};
  } catch (_) {
    return {};
  }
}

function write(data) {
  const p = getPrefsPath();
  if (!p) return;
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 0), 'utf8');
  } catch (_) {}
}

function getLastPaths() {
  const data = read();
  return {
    lastProjectFolder: typeof data[KEYS.lastProjectFolder] === 'string' ? data[KEYS.lastProjectFolder] : null,
    lastFileLocation: typeof data[KEYS.lastFileLocation] === 'string' ? data[KEYS.lastFileLocation] : null,
    lastProjectPath: typeof data[KEYS.lastProjectPath] === 'string' ? data[KEYS.lastProjectPath] : null
  };
}

function getLastProjectPath() {
  return getLastPaths().lastProjectPath;
}

function setLastProjectPath(projectFolderPath) {
  if (!projectFolderPath || typeof projectFolderPath !== 'string') return;
  const data = read();
  data[KEYS.lastProjectPath] = projectFolderPath;
  write(data);
}

function setLastProjectFolder(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') return;
  const data = read();
  data[KEYS.lastProjectFolder] = folderPath;
  write(data);
}

function setLastFileLocation(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') return;
  const data = read();
  data[KEYS.lastFileLocation] = folderPath;
  write(data);
}

function getAllSettings() {
  const data = read();
  const { normalizeLayout } = require('./window-arrange');
  const rawArr = data[KEYS.windowArrangement];
  const windowArrangement = normalizeLayout(typeof rawArr === 'string' ? rawArr : DEFAULTS.windowArrangement);
  return {
    darkMode: data[KEYS.darkMode] !== undefined ? !!data[KEYS.darkMode] : DEFAULTS.darkMode,
    stripPreviewRes: typeof data[KEYS.stripPreviewRes] === 'number' ? data[KEYS.stripPreviewRes] : DEFAULTS.stripPreviewRes,
    outputFormat: data[KEYS.outputFormat] || DEFAULTS.outputFormat,
    scanDpi: typeof data[KEYS.scanDpi] === 'number' ? data[KEYS.scanDpi] : DEFAULTS.scanDpi,
    defaultFramesPerStrip: typeof data[KEYS.defaultFramesPerStrip] === 'number' ? data[KEYS.defaultFramesPerStrip] : DEFAULTS.defaultFramesPerStrip,
    outputResolution: data[KEYS.outputResolution] || DEFAULTS.outputResolution,
    customOutputWidth: typeof data[KEYS.customOutputWidth] === 'number' ? data[KEYS.customOutputWidth] : DEFAULTS.customOutputWidth,
    customOutputHeight: typeof data[KEYS.customOutputHeight] === 'number' ? data[KEYS.customOutputHeight] : DEFAULTS.customOutputHeight,
    windowArrangement,
    arrangeWindowsOnStartup: data[KEYS.arrangeWindowsOnStartup] === true,
  arrowStepPx: typeof data[KEYS.arrowStepPx] === 'number' ? Math.max(1, Math.min(10, data[KEYS.arrowStepPx])) : DEFAULTS.arrowStepPx,
  arrowStepShiftPx: typeof data[KEYS.arrowStepShiftPx] === 'number' ? Math.max(10, Math.min(100, data[KEYS.arrowStepShiftPx])) : DEFAULTS.arrowStepShiftPx,
  locale: typeof data[KEYS.locale] === 'string' && ['en', 'nl'].includes(data[KEYS.locale]) ? data[KEYS.locale] : 'nl',
    stripPreviewShortcuts:
      data[KEYS.stripPreviewShortcuts] != null && typeof data[KEYS.stripPreviewShortcuts] === 'object'
        ? data[KEYS.stripPreviewShortcuts]
        : {}
  };
}

function setSettings(settings) {
  if (!settings || typeof settings !== 'object') return;
  const data = read();
  if (settings.darkMode !== undefined) data[KEYS.darkMode] = !!settings.darkMode;
  if (settings.stripPreviewRes !== undefined) data[KEYS.stripPreviewRes] = Math.max(512, Math.min(8192, Number(settings.stripPreviewRes) || 2048));
  if (settings.outputFormat !== undefined) data[KEYS.outputFormat] = settings.outputFormat === 'jpg' || settings.outputFormat === 'jpeg' ? 'jpg' : 'png';
  if (settings.scanDpi !== undefined) data[KEYS.scanDpi] = Math.max(300, Math.min(9600, Number(settings.scanDpi) || 4800));
  if (settings.defaultFramesPerStrip !== undefined) data[KEYS.defaultFramesPerStrip] = Math.max(1, Math.min(99, Number(settings.defaultFramesPerStrip) || 30));
  if (settings.outputResolution !== undefined) data[KEYS.outputResolution] = String(settings.outputResolution);
  if (settings.customOutputWidth !== undefined) data[KEYS.customOutputWidth] = Math.max(1, Number(settings.customOutputWidth) || 1920);
  if (settings.customOutputHeight !== undefined) data[KEYS.customOutputHeight] = Math.max(1, Number(settings.customOutputHeight) || 1080);
  if (settings.windowArrangement !== undefined) {
    const { normalizeLayout, CANONICAL_LAYOUTS } = require('./window-arrange');
    const n = normalizeLayout(String(settings.windowArrangement));
    if (CANONICAL_LAYOUTS.includes(n)) {
      data[KEYS.windowArrangement] = n;
    }
  }
  if (settings.arrangeWindowsOnStartup !== undefined) {
    data[KEYS.arrangeWindowsOnStartup] = !!settings.arrangeWindowsOnStartup;
  }
  if (settings.arrowStepPx !== undefined) data[KEYS.arrowStepPx] = Math.max(1, Math.min(10, Number(settings.arrowStepPx) || 1));
  if (settings.arrowStepShiftPx !== undefined) data[KEYS.arrowStepShiftPx] = Math.max(10, Math.min(100, Number(settings.arrowStepShiftPx) || 10));
  if (settings.locale !== undefined && ['en', 'nl'].includes(String(settings.locale))) {
    data[KEYS.locale] = settings.locale;
  }
  if (settings.stripPreviewShortcuts !== undefined && settings.stripPreviewShortcuts != null) {
    const sc = require('./strip-shortcuts');
    const raw = settings.stripPreviewShortcuts;
    if (typeof raw === 'object') {
      const cleaned = {};
      for (const a of sc.ACTIONS) {
        if (!Object.prototype.hasOwnProperty.call(raw, a.id)) continue;
        const v = raw[a.id];
        if (v === null) {
          cleaned[a.id] = null;
        } else if (v && typeof v === 'object') {
          const n = sc.normalizeBinding(v);
          if (n) cleaned[a.id] = n;
        }
      }
      data[KEYS.stripPreviewShortcuts] = cleaned;
    }
  }
  write(data);
}

function parseBounds(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const x = Number(obj.x);
  const y = Number(obj.y);
  const w = Number(obj.width);
  const h = Number(obj.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w < 200 || h < 200) return null;
  return { x, y, width: w, height: h };
}

function getWindowState() {
  const data = read();
  return {
    mainBounds: parseBounds(data[KEYS.mainWindowBounds]),
    stripPreviewBounds: parseBounds(data[KEYS.stripPreviewBounds]),
    outputPreviewBounds: parseBounds(data[KEYS.outputPreviewBounds]),
    alignPreviewBounds: parseBounds(data[KEYS.alignPreviewBounds]),
    stripPreviewOpen: data[KEYS.stripPreviewOpen] === true,
    outputPreviewOpen: data[KEYS.outputPreviewOpen] === true,
    alignPreviewOpen: data[KEYS.alignPreviewOpen] === true
  };
}

function setWindowState(state) {
  if (!state || typeof state !== 'object') return;
  const data = read();
  if (state.mainBounds && typeof state.mainBounds === 'object') {
    data[KEYS.mainWindowBounds] = state.mainBounds;
  }
  if (state.stripPreviewBounds && typeof state.stripPreviewBounds === 'object') {
    data[KEYS.stripPreviewBounds] = state.stripPreviewBounds;
  }
  if (state.outputPreviewBounds && typeof state.outputPreviewBounds === 'object') {
    data[KEYS.outputPreviewBounds] = state.outputPreviewBounds;
  }
  if (state.alignPreviewBounds && typeof state.alignPreviewBounds === 'object') {
    data[KEYS.alignPreviewBounds] = state.alignPreviewBounds;
  }
  if (state.stripPreviewOpen !== undefined) data[KEYS.stripPreviewOpen] = !!state.stripPreviewOpen;
  if (state.outputPreviewOpen !== undefined) data[KEYS.outputPreviewOpen] = !!state.outputPreviewOpen;
  if (state.alignPreviewOpen !== undefined) data[KEYS.alignPreviewOpen] = !!state.alignPreviewOpen;
  write(data);
}

function getLocale() {
  const data = read();
  const loc = data[KEYS.locale];
  return typeof loc === 'string' && ['en', 'nl'].includes(loc) ? loc : 'nl';
}

function setLocale(locale) {
  if (!['en', 'nl'].includes(String(locale))) return;
  const data = read();
  data[KEYS.locale] = locale;
  write(data);
}

module.exports = {
  getLastPaths,
  getLastProjectPath,
  setLastProjectPath,
  setLastProjectFolder,
  setLastFileLocation,
  getAllSettings,
  setSettings,
  getLocale,
  setLocale,
  getWindowState,
  setWindowState,
  read,
  write,
  KEYS,
  DEFAULTS
};
