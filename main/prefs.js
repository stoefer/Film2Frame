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
  jpgQuality: 'jpgQuality',
  perfLogging: 'perfLogging',
  scanDpi: 'scanDpi',
  defaultFramesPerStrip: 'defaultFramesPerStrip',
  outputResolution: 'outputResolution',
  customOutputWidth: 'customOutputWidth',
  customOutputHeight: 'customOutputHeight',
  windowArrangement: 'windowArrangement',
  windowGridPermutation: 'windowGridPermutation',
  windowGridAutoOpenMask: 'windowGridAutoOpenMask',
  arrangeWindowsOnStartup: 'arrangeWindowsOnStartup',
  arrangeAcrossAllDisplays: 'arrangeAcrossAllDisplays',
  windowsGeometryLocked: 'windowsGeometryLocked',
  stripPreviewFloating: 'stripPreviewFloating',
  mainWindowBounds: 'mainWindowBounds',
  stripPreviewBounds: 'stripPreviewBounds',
  stripPreviewOpen: 'stripPreviewOpen',
  arrowStepPx: 'arrowStepPx',
  arrowStepShiftPx: 'arrowStepShiftPx',
  stripPreviewShortcuts: 'stripPreviewShortcuts',
  locale: 'locale',
  preserveGridOnScanNav: 'preserveGridOnScanNav',
  compactUi: 'compactUi',
  overlayGridRefPxWidth: 'overlayGridRefPxWidth',
  overlayGridRefPxHeight: 'overlayGridRefPxHeight',
  overlayGridRefPxFrames: 'overlayGridRefPxFrames',
  exportScanRangeDraftFrom: 'exportScanRangeDraftFrom',
  exportScanRangeDraftTo: 'exportScanRangeDraftTo',
  exportScanBatchRangeRefs: 'exportScanBatchRangeRefs',
  exportScanBatchRanges: 'exportScanBatchRanges',
  exportScanBatchAutoMerge: 'exportScanBatchAutoMerge',
  exportScanBatchWrapNav: 'exportScanBatchWrapNav',
  exportBatchDisablePreview: 'exportBatchDisablePreview',
  exportScanBatchListFilePath: 'exportScanBatchListFilePath',
  exportBatchResumeState: 'exportBatchResumeState',
  eulaAcceptedVersion: 'eulaAcceptedVersion'
};

/** Bump when END_USER_AGREEMENT.md terms change meaningfully (forces re-accept). */
const CURRENT_EULA_VERSION = '1.2';

const DEFAULTS = {
  darkMode: false,
  stripPreviewRes: 1536,
  outputFormat: 'png',
  jpgQuality: 92,
  perfLogging: false,
  scanDpi: 4800,
  defaultFramesPerStrip: 30,
  outputResolution: 'original',
  customOutputWidth: 1920,
  customOutputHeight: 1080,
  windowArrangement: 'horiz-osm',
  arrangeWindowsOnStartup: false,
  arrangeAcrossAllDisplays: false,
  windowsGeometryLocked: false,
  stripPreviewFloating: false,
  arrowStepPx: 1,
  arrowStepShiftPx: 10,
  preserveGridOnScanNav: true,
  compactUi: false,
  overlayGridRefPxWidth: 103,
  overlayGridRefPxHeight: 75,
  overlayGridRefPxFrames: 30,
  exportScanRangeDraftFrom: 1,
  exportScanRangeDraftTo: 1,
  exportScanBatchRangeRefs: {},
  exportScanBatchRanges: [],
  exportScanBatchAutoMerge: true,
  exportScanBatchWrapNav: false,
  exportBatchDisablePreview: false,
  windowGridAutoOpenMask: '000000'
};

function normalizeExportScanBatchRanges(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const from = Math.floor(Number(item.from));
    const to = Math.floor(Number(item.to));
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (from < 1 || to < 1) continue;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    out.push({ from: lo, to: hi });
  }
  return out;
}

function normalizeExportScanBatchRangeRefs(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^\d+-\d+$/.test(String(key))) continue;
    if (!value || typeof value !== 'object') continue;
    if (!value.snapshot || typeof value.snapshot !== 'object') continue;
    out[key] = {
      snapshot: value.snapshot,
      savedAt: Number.isFinite(Number(value.savedAt)) ? Number(value.savedAt) : Date.now(),
      scanPath: typeof value.scanPath === 'string' ? value.scanPath : '',
      activeFrameIndex: Number.isFinite(Number(value.activeFrameIndex)) ? Math.max(0, Math.floor(Number(value.activeFrameIndex))) : 0
    };
  }
  return out;
}

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
  const { normalizeLayout, parseStoredWindowGrid } = require('./window-arrange');
  const rawArr = data[KEYS.windowArrangement];
  const legacyLayout = normalizeLayout(typeof rawArr === 'string' ? rawArr : DEFAULTS.windowArrangement);
  const rawGrid = data[KEYS.windowGridPermutation];
  const windowGridPermutation = parseStoredWindowGrid(
    typeof rawGrid === 'string' ? rawGrid : '',
    legacyLayout
  );
  const rawMask = data[KEYS.windowGridAutoOpenMask];
  const windowGridAutoOpenMask =
    typeof rawMask === 'string' && /^[01]{6}$/.test(rawMask.replace(/\s/g, ''))
      ? rawMask.replace(/\s/g, '')
      : DEFAULTS.windowGridAutoOpenMask;
  return {
    darkMode: data[KEYS.darkMode] !== undefined ? !!data[KEYS.darkMode] : DEFAULTS.darkMode,
    stripPreviewRes: typeof data[KEYS.stripPreviewRes] === 'number' ? data[KEYS.stripPreviewRes] : DEFAULTS.stripPreviewRes,
    outputFormat: data[KEYS.outputFormat] || DEFAULTS.outputFormat,
    jpgQuality: typeof data[KEYS.jpgQuality] === 'number' ? data[KEYS.jpgQuality] : DEFAULTS.jpgQuality,
    perfLogging: data[KEYS.perfLogging] !== undefined ? !!data[KEYS.perfLogging] : DEFAULTS.perfLogging,
    scanDpi: typeof data[KEYS.scanDpi] === 'number' ? data[KEYS.scanDpi] : DEFAULTS.scanDpi,
    defaultFramesPerStrip: typeof data[KEYS.defaultFramesPerStrip] === 'number' ? data[KEYS.defaultFramesPerStrip] : DEFAULTS.defaultFramesPerStrip,
    outputResolution: data[KEYS.outputResolution] || DEFAULTS.outputResolution,
    customOutputWidth: typeof data[KEYS.customOutputWidth] === 'number' ? data[KEYS.customOutputWidth] : DEFAULTS.customOutputWidth,
    customOutputHeight: typeof data[KEYS.customOutputHeight] === 'number' ? data[KEYS.customOutputHeight] : DEFAULTS.customOutputHeight,
    windowGridPermutation,
    windowGridAutoOpenMask,
    arrangeWindowsOnStartup: data[KEYS.arrangeWindowsOnStartup] === true,
    arrangeAcrossAllDisplays: data[KEYS.arrangeAcrossAllDisplays] === true,
    windowsGeometryLocked: data[KEYS.windowsGeometryLocked] === true,
    stripPreviewFloating:
      data[KEYS.stripPreviewFloating] !== undefined
        ? data[KEYS.stripPreviewFloating] === true
        : DEFAULTS.stripPreviewFloating,
  arrowStepPx: typeof data[KEYS.arrowStepPx] === 'number' ? Math.max(1, Math.min(10, data[KEYS.arrowStepPx])) : DEFAULTS.arrowStepPx,
  arrowStepShiftPx: typeof data[KEYS.arrowStepShiftPx] === 'number' ? Math.max(10, Math.min(100, data[KEYS.arrowStepShiftPx])) : DEFAULTS.arrowStepShiftPx,
  locale: typeof data[KEYS.locale] === 'string' && ['en', 'nl'].includes(data[KEYS.locale]) ? data[KEYS.locale] : 'nl',
    stripPreviewShortcuts:
      data[KEYS.stripPreviewShortcuts] != null && typeof data[KEYS.stripPreviewShortcuts] === 'object'
        ? data[KEYS.stripPreviewShortcuts]
        : {},
    preserveGridOnScanNav:
      data[KEYS.preserveGridOnScanNav] === false ? false : DEFAULTS.preserveGridOnScanNav,
    compactUi:
      data[KEYS.compactUi] === true,
    overlayGridRefPxWidth:
      typeof data[KEYS.overlayGridRefPxWidth] === 'number'
        ? Math.max(1, Math.min(20000, Math.round(data[KEYS.overlayGridRefPxWidth])))
        : DEFAULTS.overlayGridRefPxWidth,
    overlayGridRefPxHeight:
      typeof data[KEYS.overlayGridRefPxHeight] === 'number'
        ? Math.max(1, Math.min(20000, Math.round(data[KEYS.overlayGridRefPxHeight])))
        : DEFAULTS.overlayGridRefPxHeight,
    overlayGridRefPxFrames:
      typeof data[KEYS.overlayGridRefPxFrames] === 'number'
        ? Math.max(1, Math.min(99, Math.round(data[KEYS.overlayGridRefPxFrames])))
        : DEFAULTS.overlayGridRefPxFrames,
    exportScanRangeDraftFrom:
      typeof data[KEYS.exportScanRangeDraftFrom] === 'number'
        ? Math.max(1, Math.min(999999999, Math.round(data[KEYS.exportScanRangeDraftFrom])))
        : DEFAULTS.exportScanRangeDraftFrom,
    exportScanRangeDraftTo:
      typeof data[KEYS.exportScanRangeDraftTo] === 'number'
        ? Math.max(1, Math.min(999999999, Math.round(data[KEYS.exportScanRangeDraftTo])))
        : DEFAULTS.exportScanRangeDraftTo,
    exportScanBatchRangeRefs:
      normalizeExportScanBatchRangeRefs(data[KEYS.exportScanBatchRangeRefs]),
    exportScanBatchRanges: normalizeExportScanBatchRanges(data[KEYS.exportScanBatchRanges]),
    exportScanBatchAutoMerge:
      data[KEYS.exportScanBatchAutoMerge] !== undefined
        ? data[KEYS.exportScanBatchAutoMerge] !== false
        : DEFAULTS.exportScanBatchAutoMerge,
    exportScanBatchWrapNav:
      data[KEYS.exportScanBatchWrapNav] === true,
    exportBatchDisablePreview:
      data[KEYS.exportBatchDisablePreview] === true,
    exportScanBatchListFilePath:
      typeof data[KEYS.exportScanBatchListFilePath] === 'string' && data[KEYS.exportScanBatchListFilePath].trim()
        ? data[KEYS.exportScanBatchListFilePath].trim()
        : '',
    exportBatchResumeState:
      data[KEYS.exportBatchResumeState] && typeof data[KEYS.exportBatchResumeState] === 'object'
        ? data[KEYS.exportBatchResumeState]
        : null
  };
}

function setSettings(settings) {
  if (!settings || typeof settings !== 'object') return;
  const data = read();
  if (settings.darkMode !== undefined) data[KEYS.darkMode] = !!settings.darkMode;
  if (settings.stripPreviewRes !== undefined) data[KEYS.stripPreviewRes] = Math.max(512, Math.min(8192, Number(settings.stripPreviewRes) || 2048));
  if (settings.outputFormat !== undefined) data[KEYS.outputFormat] = settings.outputFormat === 'jpg' || settings.outputFormat === 'jpeg' ? 'jpg' : 'png';
  if (settings.jpgQuality !== undefined) data[KEYS.jpgQuality] = Math.max(1, Math.min(100, Math.round(Number(settings.jpgQuality) || 92)));
  if (settings.perfLogging !== undefined) data[KEYS.perfLogging] = !!settings.perfLogging;
  if (settings.scanDpi !== undefined) data[KEYS.scanDpi] = Math.max(300, Math.min(9600, Number(settings.scanDpi) || 4800));
  if (settings.defaultFramesPerStrip !== undefined) data[KEYS.defaultFramesPerStrip] = Math.max(1, Math.min(99, Number(settings.defaultFramesPerStrip) || 30));
  if (settings.outputResolution !== undefined) data[KEYS.outputResolution] = String(settings.outputResolution);
  if (settings.customOutputWidth !== undefined) data[KEYS.customOutputWidth] = Math.max(1, Number(settings.customOutputWidth) || 1920);
  if (settings.customOutputHeight !== undefined) data[KEYS.customOutputHeight] = Math.max(1, Number(settings.customOutputHeight) || 1080);
  if (settings.windowGridPermutation !== undefined) {
    const { parsePermutationString } = require('./window-arrange');
    const s = String(settings.windowGridPermutation).trim();
    const parsed = parsePermutationString(s);
    if (parsed) {
      data[KEYS.windowGridPermutation] = parsed.join(',');
    }
  }
  if (settings.windowGridAutoOpenMask !== undefined) {
    const m = String(settings.windowGridAutoOpenMask).replace(/\s/g, '');
    if (/^[01]{6}$/.test(m)) {
      data[KEYS.windowGridAutoOpenMask] = m;
    }
  }
  if (settings.windowArrangement !== undefined && settings.windowGridPermutation === undefined) {
    const { normalizeLayout, CANONICAL_LAYOUTS, legacyLayoutToPermutation } = require('./window-arrange');
    const n = normalizeLayout(String(settings.windowArrangement));
    if (CANONICAL_LAYOUTS.includes(n)) {
      data[KEYS.windowArrangement] = n;
      data[KEYS.windowGridPermutation] = legacyLayoutToPermutation(n).join(',');
    }
  }
  if (settings.arrangeWindowsOnStartup !== undefined) {
    data[KEYS.arrangeWindowsOnStartup] = !!settings.arrangeWindowsOnStartup;
  }
  if (settings.arrangeAcrossAllDisplays !== undefined) {
    data[KEYS.arrangeAcrossAllDisplays] = !!settings.arrangeAcrossAllDisplays;
  }
  if (settings.windowsGeometryLocked !== undefined) {
    data[KEYS.windowsGeometryLocked] = !!settings.windowsGeometryLocked;
  }
  if (settings.stripPreviewFloating !== undefined) {
    data[KEYS.stripPreviewFloating] = !!settings.stripPreviewFloating;
  }
  if (settings.arrowStepPx !== undefined) data[KEYS.arrowStepPx] = Math.max(1, Math.min(10, Number(settings.arrowStepPx) || 1));
  if (settings.arrowStepShiftPx !== undefined) data[KEYS.arrowStepShiftPx] = Math.max(10, Math.min(100, Number(settings.arrowStepShiftPx) || 10));
  if (settings.locale !== undefined && ['en', 'nl'].includes(String(settings.locale))) {
    data[KEYS.locale] = settings.locale;
  }
  if (settings.preserveGridOnScanNav !== undefined) {
    data[KEYS.preserveGridOnScanNav] = !!settings.preserveGridOnScanNav;
  }
  if (settings.compactUi !== undefined) {
    data[KEYS.compactUi] = !!settings.compactUi;
  }
  if (settings.overlayGridRefPxWidth !== undefined) {
    data[KEYS.overlayGridRefPxWidth] = Math.max(1, Math.min(20000, Math.round(Number(settings.overlayGridRefPxWidth) || DEFAULTS.overlayGridRefPxWidth)));
  }
  if (settings.overlayGridRefPxHeight !== undefined) {
    data[KEYS.overlayGridRefPxHeight] = Math.max(1, Math.min(20000, Math.round(Number(settings.overlayGridRefPxHeight) || DEFAULTS.overlayGridRefPxHeight)));
  }
  if (settings.overlayGridRefPxFrames !== undefined) {
    data[KEYS.overlayGridRefPxFrames] = Math.max(1, Math.min(99, Math.round(Number(settings.overlayGridRefPxFrames) || DEFAULTS.overlayGridRefPxFrames)));
  }
  if (settings.exportScanRangeDraftFrom !== undefined) {
    data[KEYS.exportScanRangeDraftFrom] = Math.max(1, Math.min(999999999, Math.round(Number(settings.exportScanRangeDraftFrom) || DEFAULTS.exportScanRangeDraftFrom)));
  }
  if (settings.exportScanRangeDraftTo !== undefined) {
    data[KEYS.exportScanRangeDraftTo] = Math.max(1, Math.min(999999999, Math.round(Number(settings.exportScanRangeDraftTo) || DEFAULTS.exportScanRangeDraftTo)));
  }
  if (settings.exportScanBatchRangeRefs !== undefined) {
    data[KEYS.exportScanBatchRangeRefs] = normalizeExportScanBatchRangeRefs(settings.exportScanBatchRangeRefs);
  }
  if (settings.exportScanBatchRanges !== undefined) {
    data[KEYS.exportScanBatchRanges] = normalizeExportScanBatchRanges(settings.exportScanBatchRanges);
  }
  if (settings.exportScanBatchAutoMerge !== undefined) {
    data[KEYS.exportScanBatchAutoMerge] = settings.exportScanBatchAutoMerge !== false;
  }
  if (settings.exportScanBatchWrapNav !== undefined) {
    data[KEYS.exportScanBatchWrapNav] = settings.exportScanBatchWrapNav === true;
  }
  if (settings.exportBatchDisablePreview !== undefined) {
    data[KEYS.exportBatchDisablePreview] = settings.exportBatchDisablePreview === true;
  }
  if (settings.exportScanBatchListFilePath !== undefined) {
    const p = String(settings.exportScanBatchListFilePath || '').trim();
    data[KEYS.exportScanBatchListFilePath] = p;
  }
  if (settings.exportBatchResumeState !== undefined) {
    data[KEYS.exportBatchResumeState] =
      settings.exportBatchResumeState && typeof settings.exportBatchResumeState === 'object'
        ? settings.exportBatchResumeState
        : null;
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
    stripPreviewOpen: data[KEYS.stripPreviewOpen] === true
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
  if (state.stripPreviewOpen !== undefined) data[KEYS.stripPreviewOpen] = !!state.stripPreviewOpen;
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

function isEulaAccepted() {
  const data = read();
  return data[KEYS.eulaAcceptedVersion] === CURRENT_EULA_VERSION;
}

function acceptEula() {
  const data = read();
  data[KEYS.eulaAcceptedVersion] = CURRENT_EULA_VERSION;
  write(data);
}

function getEulaAcceptedVersion() {
  const data = read();
  const v = data[KEYS.eulaAcceptedVersion];
  return typeof v === 'string' ? v : null;
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
  isEulaAccepted,
  acceptEula,
  getEulaAcceptedVersion,
  CURRENT_EULA_VERSION,
  getWindowState,
  setWindowState,
  read,
  write,
  KEYS,
  DEFAULTS
};
