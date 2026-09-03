/**
 * IPC handlers – alle invoke/on handlers hier. Main process blijft dun.
 */
const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const windows = require('./windows');
const project = require('./project');
const prefs = require('./prefs');
const version = require('./version');
const locales = require('./locales');
const { applyAppMenu } = require('./app-menu');
const { tr } = require('./main-i18n');

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp'];

function getDefaultBatchRangeListPath() {
  const appSettings = prefs.getAllSettings();
  const remembered = String(appSettings?.exportScanBatchListFilePath || '').trim();
  if (remembered) return remembered;
  const projectPath = prefs.getLastProjectPath();
  const baseDir = projectPath && fs.existsSync(projectPath)
    ? projectPath
    : path.join(app.getPath('documents'), 'Film2Frame');
  return path.join(baseDir, 'batch-range-list.txt');
}

function rememberBatchRangeListPath(filePath) {
  const p = String(filePath || '').trim();
  if (!p) return;
  prefs.setSettings({ exportScanBatchListFilePath: p });
}

function parseBatchRangeLine(line) {
  const compact = String(line || '')
    .trim()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');
  if (!compact) return null;
  const nums = compact.match(/\d+/g);
  if (!nums || !nums.length) return null;
  let from = Math.floor(Number(nums[0]));
  let to = from;
  if (nums.length >= 2) {
    // Gebruik laatste 2 getallen zodat ook regels als
    // "Bereik 2: frame 101 t/m 240" correct blijven.
    from = Math.floor(Number(nums[nums.length - 2]));
    to = Math.floor(Number(nums[nums.length - 1]));
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < 1) return null;
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

function parseBatchRangesFromAscii(raw) {
  const text = String(raw || '').replace(/\uFEFF/g, '');
  const ranges = [];
  const invalidLineNumbers = [];
  let dataLineCount = 0;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    dataLineCount += 1;
    const parsed = parseBatchRangeLine(line);
    if (!parsed) {
      invalidLineNumbers.push(i + 1);
      continue;
    }
    ranges.push(parsed);
  }
  return { ranges, invalidLineNumbers, dataLineCount };
}

/** ArrayBuffer / Uint8Array / IPC-clone → Node Buffer. */
function toNodeBuffer(buffer) {
  if (buffer == null) return null;
  if (Buffer.isBuffer(buffer)) return buffer;
  if (buffer instanceof ArrayBuffer) return Buffer.from(buffer);
  if (ArrayBuffer.isView(buffer)) {
    return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  // Structured-clone van Buffer in oudere Electron: { type:'Buffer', data:[...] }
  if (buffer && buffer.type === 'Buffer' && Array.isArray(buffer.data)) {
    return Buffer.from(buffer.data);
  }
  try {
    return Buffer.from(buffer);
  } catch (_) {
    return null;
  }
}

/**
 * Windows extended path alleen waar nodig.
 * Op sommige externe/USB-volumes faalt \\?\… met UNKNOWN terwijl I:\… wél werkt.
 */
function toExtendedFsPath(p) {
  const raw = path.resolve(String(p || ''));
  if (process.platform !== 'win32') return raw;
  if (raw.startsWith('\\\\?\\') || raw.startsWith('\\\\.\\')) return raw;
  if (raw.startsWith('\\\\')) return `\\\\?\\UNC\\${raw.slice(2)}`;
  if (raw.length >= 240) return `\\\\?\\${raw}`;
  return raw;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFsError(err) {
  const code = err && err.code;
  return (
    code === 'UNKNOWN' ||
    code === 'EBUSY' ||
    code === 'EPERM' ||
    code === 'EACCES' ||
    code === 'EAGAIN' ||
    code === 'EMFILE' ||
    code === 'ENFILE'
  );
}

/** Wek volume (externe schijven slapen vaak) en controleer schrijfrechten op de map. */
function wakeDestinationDir(destDir) {
  try {
    fs.mkdirSync(destDir, { recursive: true });
  } catch (_) {}
  try {
    fs.accessSync(destDir, fs.constants.W_OK);
  } catch (_) {}
  try {
    fs.readdirSync(destDir);
  } catch (_) {}
}

function tryUnlinkQuiet(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

function writeFileDirect(filePath, buf) {
  const fd = fs.openSync(filePath, 'w');
  try {
    let offset = 0;
    const chunk = 1024 * 1024;
    while (offset < buf.length) {
      const n = Math.min(chunk, buf.length - offset);
      fs.writeSync(fd, buf, offset, n);
      offset += n;
    }
    try {
      fs.fsyncSync(fd);
    } catch (_) {}
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Schrijf bestand robuust naar lokale én externe volumes (I: e.d.).
 * Volgorde: direct chunked write → temp+copy; retries bij UNKNOWN/EBUSY.
 */
async function writeBufferToDestination(destPath, buf) {
  const destDir = path.dirname(destPath);
  wakeDestinationDir(destDir);

  const candidates = [];
  const primary = path.resolve(destPath);
  candidates.push(primary);
  const extended = toExtendedFsPath(destPath);
  if (extended !== primary) candidates.push(extended);

  let lastErr = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      wakeDestinationDir(destDir);
      await sleepMs(150 * attempt);
    }
    for (const target of candidates) {
      try {
        tryUnlinkQuiet(target);
        writeFileDirect(target, buf);
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    // Fallback: lokaal temp → copy (sommige volumes accepteren copy beter)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f2f-export-'));
    const tmpPath = path.join(tmpDir, path.basename(destPath) || 'frame.png');
    try {
      fs.writeFileSync(tmpPath, buf);
      for (const target of candidates) {
        try {
          tryUnlinkQuiet(target);
          fs.copyFileSync(tmpPath, target);
          lastErr = null;
          return;
        } catch (err) {
          lastErr = err;
        }
      }
    } finally {
      try {
        fs.unlinkSync(tmpPath);
      } catch (_) {}
      try {
        fs.rmdirSync(tmpDir);
      } catch (_) {}
    }
    if (!isRetryableFsError(lastErr)) break;
  }
  if (lastErr) throw lastErr;
}

function formatWriteError(err, filePath) {
  const code = err && err.code ? String(err.code) : '';
  const msg = (err && err.message) || tr('ipc.errorWriteFailed');
  if (code === 'UNKNOWN' || /unknown error/i.test(msg)) {
    return tr('ipc.errorWriteUnknown', { path: filePath || '' });
  }
  return msg;
}

function registerIPC() {
  /** Renderer bewaart project + lintStates naar schijf; daarna mag het hoofdvenster echt sluiten. */
  ipcMain.on('settings-saved-from-aux-window', (event) => {
    const mainWin = windows.getMainWindow();
    const settingsWin = windows.getSettingsWindow();
    if (!settingsWin || settingsWin.isDestroyed() || event.sender !== settingsWin.webContents) return;
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('app-settings-synced');
    }
  });

  ipcMain.on('quit-save-complete', (event) => {
    const win = windows.getMainWindow();
    if (!win || win.isDestroyed()) return;
    if (event.sender !== win.webContents) return;
    if (!win._f2fQuitSavePending) return;
    win._f2fQuitSavePending = false;
    if (win._f2fQuitSaveTimer) {
      clearTimeout(win._f2fQuitSaveTimer);
      win._f2fQuitSaveTimer = null;
    }
    win._f2fAllowClose = true;
    win.close();
  });

  ipcMain.handle('select-folder', async (_, options) => {
    const win = windows.getMainWindow();
    const { lastProjectFolder, lastFileLocation } = prefs.getLastPaths();
    const type = options?.type;
    let defaultPath = options?.defaultPath || null;
    if (!defaultPath && type === 'projectFolder') {
      if (lastProjectFolder) defaultPath = lastProjectFolder;
      else {
        try {
          defaultPath = path.join(app.getPath('documents'), 'Film2Frame', 'Projects');
          fs.mkdirSync(defaultPath, { recursive: true });
        } catch (_) {}
      }
    } else if (!defaultPath && type === 'fileLocation' && lastFileLocation) defaultPath = lastFileLocation;
    const result = await dialog.showOpenDialog(win || null, {
      properties: ['openDirectory'],
      title: options?.title || tr('ipc.dialogChooseFolder'),
      defaultPath: defaultPath || undefined
    });
    if (result.canceled || !result.filePaths.length) return null;
    const chosen = result.filePaths[0];
    if (type === 'projectFolder') prefs.setLastProjectFolder(chosen);
    else if (type === 'fileLocation') prefs.setLastFileLocation(chosen);
    return chosen;
  });

  ipcMain.handle('create-project', async (_, payload) => {
    const { projectFolderPath, name, location, framesPerLint, numberOfScans, scanInfos, filmFormat, filmPolarity, outputFolder, outputFormat, scanDpi } = payload || {};
    if (!projectFolderPath) return { ok: false, error: tr('ipc.errorNoProjectFolderChosen') };
    try {
      const hasManualCount = numberOfScans !== undefined && numberOfScans !== null && Number.isFinite(Number(numberOfScans));
      const count = hasManualCount ? undefined : await project.countImagesInFolder(location || projectFolderPath);
      const data = {
        name: name || path.basename(projectFolderPath),
        location: location || projectFolderPath,
        framesPerLint: Math.max(1, Math.min(99, Number(framesPerLint) || 30)),
        numberOfScans: hasManualCount ? Number(numberOfScans) : count,
        state: null,
        lintStates: [],
        currentLintPath: null,
        scanInfos: Array.isArray(scanInfos) ? scanInfos : [],
        filmFormat: filmFormat || '16mm-double',
        filmPolarity: filmPolarity || 'positief',
        outputFolder: outputFolder || null,
        outputFormat: outputFormat || 'png',
        scanDpi: scanDpi || 4800,
        stripPresetId: null,
        pixelEditorOutputFolder: null,
        pixelEditorSourceFolder: null
      };
      await project.writeProject(projectFolderPath, data);
      prefs.setLastProjectPath(projectFolderPath);
      return { ok: true, project: { path: projectFolderPath, ...data } };
    } catch (err) {
      return { ok: false, error: err.message || tr('ipc.errorCreateProjectFailed') };
    }
  });

  ipcMain.handle('get-last-project-path', () => {
    return prefs.getLastProjectPath();
  });

  ipcMain.handle('get-app-version', () => {
    return { buildVersion: version.getBuildVersion() };
  });

  ipcMain.handle('get-locale', () => prefs.getLocale());
  ipcMain.handle('set-locale', (_, locale) => {
    if (['en', 'nl'].includes(String(locale))) {
      prefs.setLocale(locale);
      windows.applyLocalizedWindowTitles();
      windows.sendToStripPreview('strip-locale-changed', {});
      const mainWin = windows.getMainWindow();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('strip-locale-changed');
      }
      applyAppMenu(windows);
    }
  });
  ipcMain.handle('get-translations', () => {
    const locale = prefs.getLocale();
    const dict = locales.loadLocale(locale);
    return dict || locales.loadLocale('en') || {};
  });

  ipcMain.handle('open-project-by-path', async (_, projectFolderPath) => {
    if (!projectFolderPath) return { ok: false, error: tr('ipc.errorNoPath'), project: null };
    const loaded = await project.readProject(projectFolderPath);
    if (!loaded) return { ok: false, error: tr('ipc.errorInvalidProjectInFolder'), project: null };
    prefs.setLastProjectPath(projectFolderPath);
    return { ok: true, project: loaded };
  });

  ipcMain.handle('open-project', async () => {
    const win = windows.getMainWindow();
    const { lastProjectFolder } = prefs.getLastPaths();
    let defaultPath = lastProjectFolder;
    if (!defaultPath) {
      try {
        defaultPath = path.join(app.getPath('documents'), 'Film2Frame', 'Projects');
        if (!fs.existsSync(defaultPath)) fs.mkdirSync(defaultPath, { recursive: true });
      } catch (_) {}
    }
    const result = await dialog.showOpenDialog(win || null, {
      properties: ['openDirectory'],
      title: tr('ipc.dialogOpenProjectFolderTitle'),
      defaultPath: defaultPath || undefined
    });
    if (result.canceled || !result.filePaths.length) return { ok: false, project: null };
    const chosen = result.filePaths[0];
    prefs.setLastProjectFolder(chosen);
    prefs.setLastProjectPath(chosen);
    const loaded = await project.readProject(chosen);
    if (!loaded) return { ok: false, error: tr('ipc.errorInvalidProjectInFolder'), project: null };
    return { ok: true, project: loaded };
  });

  ipcMain.handle('open-project-file', async () => {
    const win = windows.getMainWindow();
    let defaultPath = path.join(app.getPath('documents'), 'Film2Frame', 'Projects');
    try {
      if (!fs.existsSync(defaultPath)) fs.mkdirSync(defaultPath, { recursive: true });
    } catch (_) {}
    const result = await dialog.showOpenDialog(win || null, {
      properties: ['openFile'],
      title: tr('ipc.dialogOpenProjectJsonTitle'),
      defaultPath: fs.existsSync(defaultPath) ? defaultPath : undefined,
      filters: [{ name: tr('ipc.openProjectFileFilter'), extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths.length) return { ok: false, project: null };
    const filePath = result.filePaths[0];
    if (path.basename(filePath).toLowerCase() !== 'project.json') {
      return { ok: false, error: tr('ipc.errorSelectProjectJson'), project: null };
    }
    const projectFolderPath = path.dirname(filePath);
    prefs.setLastProjectFolder(projectFolderPath);
    prefs.setLastProjectPath(projectFolderPath);
    const loaded = await project.readProject(projectFolderPath);
    if (!loaded) return { ok: false, error: tr('ipc.errorInvalidProjectJson'), project: null };
    return { ok: true, project: loaded };
  });

  ipcMain.handle('get-suggested-project-folder', (_, rawName) => {
    const base = path.join(app.getPath('documents'), 'Film2Frame', 'Projects');
    let slug = String(rawName || 'Project')
      .replace(/[/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    if (!slug) slug = 'Project';
    return path.join(base, slug);
  });

  ipcMain.handle('delete-project', async (_, projectFolderPath) => {
    if (!projectFolderPath || typeof projectFolderPath !== 'string') return { ok: false, error: tr('ipc.errorNoProjectFolderGiven') };
    const win = windows.getMainWindow();
    const confirmed = await dialog.showMessageBox(win || null, {
      type: 'warning',
      title: tr('ipc.dialogDeleteProjectTitle'),
      message: tr('ipc.deleteProjectConfirmMessage'),
      detail: tr('ipc.deleteProjectConfirmDetail', { path: projectFolderPath }),
      buttons: [tr('ipc.deleteProjectButtonCancel'), tr('ipc.deleteProjectButtonDelete')],
      defaultId: 0,
      cancelId: 0
    });
    if (confirmed.response !== 1) return { ok: false, canceled: true };
    try {
      const projectFile = path.join(projectFolderPath, 'project.json');
      if (!fs.existsSync(projectFile)) return { ok: false, error: tr('ipc.errorInvalidProjectInFolder') };
      fs.rmSync(projectFolderPath, { recursive: true, force: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || tr('ipc.errorDeleteFailed') };
    }
  });

  ipcMain.handle('save-project', async (_, payload) => {
    const {
      projectFolderPath,
      state,
      lintStates,
      currentLintPath,
      location,
      framesPerLint,
      scanInfos,
      filmFormat,
      filmPolarity,
      outputFolder,
      outputFormat,
      scanDpi,
      stripPresetId,
      pixelEditorOutputFolder,
      pixelEditorSourceFolder
    } = payload || {};
    if (!projectFolderPath) return { ok: false, error: tr('ipc.errorNoProjectOpen') };
    try {
      // Cache i.p.v. 7MB parse; scanInfos niet steeds over IPC sturen
      let side = project.getProjectSideCache(projectFolderPath);
      if (!side) {
        await project.getProjectMetaLightweight(projectFolderPath);
        side = project.getProjectSideCache(projectFolderPath);
      }
      const resolvedScanInfos = Array.isArray(scanInfos)
        ? scanInfos
        : (side?.scanInfos || []);
      const data = {
        name: side?.name || path.basename(projectFolderPath),
        location:
          location !== undefined && location !== null
            ? String(location)
            : (side?.location || ''),
        framesPerLint:
          framesPerLint !== undefined
            ? Math.max(1, Math.min(99, Number(framesPerLint) || 30))
            : (side?.framesPerLint ?? 30),
        numberOfScans: resolvedScanInfos.length || side?.numberOfScans || 0,
        created: side?.created || undefined,
        state: state || null,
        lintStates: Array.isArray(lintStates) ? lintStates : [],
        currentLintPath: currentLintPath ?? null,
        scanInfos: resolvedScanInfos,
        filmFormat: filmFormat ?? side?.filmFormat ?? '16mm-double',
        filmPolarity: filmPolarity ?? side?.filmPolarity ?? 'positief',
        outputFolder: outputFolder !== undefined ? outputFolder : (side?.outputFolder ?? null),
        outputFormat: outputFormat ?? side?.outputFormat ?? 'png',
        scanDpi: scanDpi ?? side?.scanDpi ?? 4800,
        stripPresetId:
          stripPresetId !== undefined
            ? stripPresetId != null && typeof stripPresetId === 'string' && stripPresetId.trim() !== ''
              ? stripPresetId.trim()
              : null
            : (side?.stripPresetId ?? null),
        pixelEditorOutputFolder:
          pixelEditorOutputFolder !== undefined
            ? pixelEditorOutputFolder || null
            : (side?.pixelEditorOutputFolder ?? null),
        pixelEditorSourceFolder:
          pixelEditorSourceFolder !== undefined
            ? pixelEditorSourceFolder || null
            : (side?.pixelEditorSourceFolder ?? null)
      };
      await project.writeProject(projectFolderPath, data);
      prefs.setLastProjectPath(projectFolderPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || tr('ipc.errorSaveFailed') };
    }
  });

  ipcMain.handle('confirm-export-overwrite', async (_, payload) => {
    const { start, end, count, names } = payload || {};
    const { BrowserWindow } = require('electron');
    const win =
      BrowserWindow.getFocusedWindow() ||
      windows.getStripPreviewWindow() ||
      windows.getMainWindow();
    const countN = Math.max(1, Math.round(Number(count) || 1));
    const startNum = Number(start);
    const endNum = Number(end);
    const useNames =
      (typeof start === 'string' && !Number.isFinite(startNum)) ||
      (typeof names === 'string' && names.trim());
    const message = useNames
      ? tr('frameExport.confirmOverwriteNames', {
          names: (typeof names === 'string' && names.trim()) || String(start || ''),
          count: countN
        })
      : tr('frameExport.confirmOverwrite', {
          start: String(Math.max(1, Math.round(Number.isFinite(startNum) ? startNum : 1))).padStart(6, '0'),
          end: String(Math.max(1, Math.round(Number.isFinite(endNum) ? endNum : 1))).padStart(6, '0'),
          count: countN
        });
    const result = await dialog.showMessageBox(win || null, {
      type: 'warning',
      title: tr('frameExport.overwriteDialogTitle'),
      message,
      buttons: [tr('frameExport.overwriteButtonContinue'), tr('frameExport.overwriteButtonOverwrite')],
      defaultId: 1,
      cancelId: 0,
      noLink: true
    });
    // 0 = Ga verder (geen overschrijven), 1 = Overschrijven
    return { action: result.response === 1 ? 'overwrite' : 'continue' };
  });

  ipcMain.handle('select-export-folder', async () => {
    const win = windows.getMainWindow();
    const result = await dialog.showOpenDialog(win || null, {
      properties: ['openDirectory', 'createDirectory'],
      title: tr('ipc.dialogExportFramesTitle')
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('select-pixel-editor-output-folder', async () => {
    const win = windows.getMainWindow();
    const result = await dialog.showOpenDialog(win || null, {
      properties: ['openDirectory', 'createDirectory'],
      title: tr('ipc.dialogPixelEditorFolderTitle')
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  async function writeFrameToFile(folder, baseName, index, dataUrl, ext, fileName) {
    const extension = (ext || 'png').toLowerCase().replace(/^\./, '');
    let destName;
    if (fileName && typeof fileName === 'string' && fileName.trim()) {
      destName = fileName.trim().replace(/[/\\:*?"<>|]/g, '_');
      if (!/\.[a-z0-9]+$/i.test(destName)) destName = `${destName}.${extension}`;
    } else {
      const base = (baseName || 'frame').replace(/[/\\:*?"<>|]/g, '_');
      const num = Number(index);
      const padded = Number.isFinite(num) && num >= 1 ? String(Math.min(999999, Math.floor(num))).padStart(6, '0') : '000001';
      destName = `${base}_${padded}.${extension}`;
    }
    const filePath = path.join(folder, destName);
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    if (!base64) return { ok: false, error: tr('ipc.errorNoImageData') };
    const buf = Buffer.from(base64, 'base64');
    if (!buf.length) return { ok: false, error: tr('ipc.errorNoImageData') };
    await writeBufferToDestination(filePath, buf);
    return { ok: true, path: filePath, fileName: destName };
  }

  async function writeFrameBufferToFile(folder, fileName, buffer, ext) {
    const extension = (ext || 'png').toLowerCase().replace(/^\./, '');
    let destName =
      fileName && typeof fileName === 'string' && fileName.trim()
        ? fileName.trim().replace(/[/\\:*?"<>|]/g, '_')
        : `frame_000001.${extension}`;
    if (!/\.[a-z0-9]+$/i.test(destName)) destName = `${destName}.${extension}`;
    const filePath = path.join(folder, destName);
    const buf = toNodeBuffer(buffer);
    if (!buf || buf.length < 1) return { ok: false, error: tr('ipc.errorNoImageData') };
    await writeBufferToDestination(filePath, buf);
    return { ok: true, path: filePath, fileName: destName };
  }

  ipcMain.handle('write-frame', async (_, { folder, baseName, index, dataUrl, ext, fileName }) => {
    if (!folder || typeof folder !== 'string' || !dataUrl || typeof dataUrl !== 'string') return { ok: false, error: tr('ipc.errorInvalidParams') };
    try {
      return await writeFrameToFile(folder, baseName, index, dataUrl, ext || 'png', fileName);
    } catch (err) {
      const dest =
        fileName && typeof fileName === 'string'
          ? path.join(folder, fileName)
          : folder;
      return { ok: false, error: formatWriteError(err, dest) };
    }
  });

  ipcMain.handle('write-frame-png', async (_, { folder, baseName, index, dataUrl, fileName }) => {
    if (!folder || typeof folder !== 'string' || !dataUrl || typeof dataUrl !== 'string') return { ok: false, error: tr('ipc.errorInvalidParams') };
    try {
      return await writeFrameToFile(folder, baseName, index, dataUrl, 'png', fileName);
    } catch (err) {
      const dest =
        fileName && typeof fileName === 'string'
          ? path.join(folder, fileName)
          : folder;
      return { ok: false, error: formatWriteError(err, dest) };
    }
  });

  ipcMain.handle('write-frame-buffer', async (_, { folder, fileName, buffer, ext }) => {
    if (!folder || typeof folder !== 'string' || !fileName || buffer == null) {
      return { ok: false, error: tr('ipc.errorInvalidParams') };
    }
    try {
      return await writeFrameBufferToFile(folder, fileName, buffer, ext || 'png');
    } catch (err) {
      return { ok: false, error: formatWriteError(err, path.join(folder, String(fileName))) };
    }
  });

  ipcMain.handle('export-files-exist', async (_, { folder, fileNames }) => {
    if (!folder || typeof folder !== 'string' || !Array.isArray(fileNames)) return { ok: false, any: false, existing: [] };
    const existing = [];
    for (const name of fileNames) {
      const safe = String(name || '').replace(/[/\\:*?"<>|]/g, '_');
      if (!safe) continue;
      try {
        if (fs.existsSync(path.join(folder, safe))) existing.push(safe);
      } catch (_) {}
    }
    return { ok: true, any: existing.length > 0, existing };
  });

  ipcMain.handle('open-strip-preview', () => {
    try {
      const base = path.join(__dirname, '..');
      const preload = path.join(base, 'preloads', 'strip-display.js');
      const html = path.join(base, 'windows', 'strip-display.html');
      if (!fs.existsSync(html) || !fs.existsSync(preload)) {
        return { ok: false, error: tr('ipc.errorStripPreviewNotFound') };
      }
      windows.createStripPreviewWindow(preload, html);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err && err.message) || tr('ipc.errorOpenStripPreviewFailed') };
    }
  });

  ipcMain.handle('close-strip-preview', () => {
    windows.closeStripPreviewWindow();
    return { ok: true };
  });

  ipcMain.handle('is-strip-preview-open', () => {
    const w = windows.getStripPreviewWindow();
    return { open: !!(w && !w.isDestroyed()) };
  });

  ipcMain.handle('get-next-frame-number', async (_, { outputFolder, baseName, ext }) => {
    if (!outputFolder) return 1;
    return project.getNextFrameNumber(outputFolder, baseName || 'frame', ext || 'png');
  });

  ipcMain.handle('list-folder-images', async (_, folderPath) => {
    return project.listImagesInFolder(folderPath);
  });

  ipcMain.handle('count-folder-images', async (_, folderPath) => {
    return project.countImagesInFolder(folderPath);
  });

  let scanInfosCancelRequested = false;
  ipcMain.on('cancel-scan-infos', () => {
    scanInfosCancelRequested = true;
  });

  ipcMain.handle('get-scan-infos', async (event, folderPath) => {
    scanInfosCancelRequested = false;
    const wc = event.sender;
    return project.getScanInfos(
      folderPath,
      (current, total) => {
        if (!wc.isDestroyed()) {
          wc.send('scan-infos-progress', { current, total });
        }
      },
      () => scanInfosCancelRequested
    );
  });

  ipcMain.handle('select-scan-file', async () => {
    const win = windows.getMainWindow();
    const { lastFileLocation } = prefs.getLastPaths();
    const result = await dialog.showOpenDialog(win || null, {
      properties: ['openFile'],
      filters: [{ name: tr('ipc.dialogImageFilesFilter'), extensions: IMAGE_EXT.map(e => e.slice(1)) }],
      defaultPath: lastFileLocation || undefined
    });
    if (result.canceled || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    prefs.setLastFileLocation(path.dirname(filePath));
    return filePath;
  });

  ipcMain.handle('get-file-url', (_, filePath) => {
    if (!filePath || typeof filePath !== 'string') return '';
    try {
      const normalized = path.normalize(filePath);
      if (!fs.existsSync(normalized)) return '';
      return require('url').pathToFileURL(normalized).href;
    } catch {
      return '';
    }
  });

  /* Prestatie-timing: pad naar en append voor het perf-logbestand (voor profilering op echte hardware). */
  function getPerfLogPath() {
    try {
      return path.join(app.getPath('userData'), 'perf-timing.log');
    } catch (_) {
      return path.join(os.tmpdir(), 'film2frame-perf-timing.log');
    }
  }
  ipcMain.handle('perf-log-path', () => getPerfLogPath());
  ipcMain.on('perf-log-append', (_, line) => {
    try {
      const text = typeof line === 'string' ? line : String(line);
      fs.appendFile(getPerfLogPath(), text + '\n', () => {});
    } catch (_) {}
  });

  ipcMain.handle('save-macro-file', async (_, payload) => {
    try {
      const win = windows.getMainWindow();
      const p = payload && typeof payload === 'object' ? payload : {};
      const macroData = p.macro && typeof p.macro === 'object' ? p.macro : null;
      if (!macroData) return { ok: false, error: 'Geen macrodata om op te slaan.' };
      const projectPath = prefs.getLastProjectPath();
      const defaultDir = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath('documents');
      const suggestedRaw = typeof p.suggestedName === 'string' ? p.suggestedName.trim() : '';
      const suggestedSafe = suggestedRaw
        .replace(/[/\\:*?"<>|]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 120);
      const suggestedFile = (suggestedSafe || 'raster-macro') + '.json';
      const defaultPath = path.join(defaultDir, suggestedFile);
      const result = await dialog.showSaveDialog(win || null, {
        title: 'Macro opslaan',
        defaultPath,
        filters: [{ name: 'Macro JSON', extensions: ['json'] }]
      });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      const out = {
        format: 'film2frame-macro',
        version: 1,
        savedAt: new Date().toISOString(),
        macro: macroData
      };
      fs.writeFileSync(result.filePath, JSON.stringify(out, null, 2), 'utf8');
      return { ok: true, path: result.filePath };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Macro opslaan mislukt.' };
    }
  });

  ipcMain.handle('open-macro-file', async () => {
    try {
      const win = windows.getMainWindow();
      const projectPath = prefs.getLastProjectPath();
      const defaultDir = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath('documents');
      const result = await dialog.showOpenDialog(win || null, {
        title: 'Macro laden',
        properties: ['openFile'],
        defaultPath: defaultDir,
        filters: [{ name: 'Macro JSON', extensions: ['json'] }]
      });
      if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
      const filePath = result.filePaths[0];
      const raw = fs.readFileSync(filePath, 'utf8');
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { ok: false, error: 'Macrobestand is geen geldige JSON.' };
      }
      const macro = parsed && typeof parsed === 'object' ? (parsed.macro || parsed) : null;
      if (!macro || typeof macro !== 'object') return { ok: false, error: 'Macrobestand bevat geen macrodata.' };
      return { ok: true, path: filePath, macro };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Macro laden mislukt.' };
    }
  });

  ipcMain.handle('import-batch-range-list-file', async () => {
    try {
      const win = windows.getMainWindow();
      const suggestedFile = getDefaultBatchRangeListPath();
      const projectPath = prefs.getLastProjectPath();
      const fallbackDir = projectPath && fs.existsSync(projectPath) ? projectPath : app.getPath('documents');
      const defaultPath = fs.existsSync(suggestedFile) ? suggestedFile : fallbackDir;
      const result = await dialog.showOpenDialog(win || null, {
        title: 'Batchlijst importeren',
        properties: ['openFile'],
        defaultPath,
        filters: [
          { name: 'Batch TXT', extensions: ['txt'] },
          { name: 'Text files', extensions: ['txt', 'csv', 'list', 'md'] },
          { name: 'All files', extensions: ['*'] }
        ]
      });
      if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
      const filePath = result.filePaths[0];
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = parseBatchRangesFromAscii(raw);
      const ranges = parsed.ranges;
      if (!ranges.length) {
        return {
          ok: false,
          error: 'Geen geldige bereiken gevonden. Gebruik per regel bijv. "1-300" of "301 600".'
        };
      }
      const templateDetected =
        ranges.length === 2 &&
        ranges[0].from === 1 && ranges[0].to === 300 &&
        ranges[1].from === 301 && ranges[1].to === 600 &&
        /#\s*film2frame batch/i.test(raw) &&
        /examples?:/i.test(raw);
      rememberBatchRangeListPath(filePath);
      return {
        ok: true,
        path: filePath,
        ranges,
        invalidLineNumbers: parsed.invalidLineNumbers,
        dataLineCount: parsed.dataLineCount,
        templateDetected
      };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Batchlijst importeren mislukt.' };
    }
  });

  ipcMain.handle('open-batch-range-list-in-notepad', async () => {
    try {
      const filePath = getDefaultBatchRangeListPath();
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(filePath)) {
        const template = [
          '# Film2Frame batch range list',
          '# One range per line',
          '# Examples:',
          '# 1-300',
          '# 301-600',
          '# Remove # to activate a sample line',
          '# You can also use text like: frame 601 to 900'
        ].join('\n');
        fs.writeFileSync(filePath, template, 'utf8');
      }
      if (process.platform === 'win32') {
        const child = spawn('notepad.exe', [filePath], {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
        rememberBatchRangeListPath(filePath);
        return { ok: true, path: filePath };
      }
      return { ok: false, error: 'Notepad is alleen beschikbaar op Windows.', path: filePath };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Notepad-lijst openen mislukt.' };
    }
  });

  ipcMain.handle('reimport-batch-range-list-from-notepad', async () => {
    try {
      const filePath = getDefaultBatchRangeListPath();
      if (!fs.existsSync(filePath)) {
        return {
          ok: false,
          error: `Notepad-lijst niet gevonden op: ${filePath}. Open eerst de Notepad-lijst.`
        };
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = parseBatchRangesFromAscii(raw);
      const ranges = parsed.ranges;
      if (!ranges.length) {
        return {
          ok: false,
          error: 'Geen geldige bereiken gevonden. Gebruik per regel bijv. "1-300" of "301 600".'
        };
      }
      const templateDetected =
        ranges.length === 2 &&
        ranges[0].from === 1 && ranges[0].to === 300 &&
        ranges[1].from === 301 && ranges[1].to === 600 &&
        /#\s*film2frame batch/i.test(raw) &&
        /examples?:/i.test(raw);
      return {
        ok: true,
        path: filePath,
        ranges,
        invalidLineNumbers: parsed.invalidLineNumbers,
        dataLineCount: parsed.dataLineCount,
        templateDetected
      };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Opnieuw importeren uit Notepad mislukt.' };
    }
  });

  ipcMain.handle('open-settings-window', () => {
    try {
      const base = path.join(__dirname, '..');
      const preload = path.join(base, 'preloads', 'settings.js');
      const html = path.join(base, 'windows', 'settings.html');
      if (!fs.existsSync(html)) return { ok: false, error: tr('ipc.errorSettingsHtmlNotFound') };
      if (!fs.existsSync(preload)) return { ok: false, error: tr('ipc.errorSettingsPreloadNotFound') };
      windows.createSettingsWindow(preload, html);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err && err.message) || tr('ipc.errorOpenSettingsWindowFailed') };
    }
  });

  const DOCS_CATALOG = [
    { id: 'freeware', file: 'FREEWARE.md', titleKey: 'docs.docFreeware' },
    { id: 'snelstart', file: 'SNELSTART.md', titleKey: 'docs.docSnelstart' },
    { id: 'handleiding', file: 'HANDLEIDING.md', titleKey: 'docs.docHandleiding' },
    { id: 'quickstart', file: 'QUICK_START.md', titleKey: 'docs.docQuickStart' },
    { id: 'manual', file: 'USER_MANUAL.md', titleKey: 'docs.docUserManual' }
  ];

  function getDocsDir() {
    return path.join(__dirname, '..', 'docs');
  }

  function resolveDocEntry(id) {
    const key = typeof id === 'string' ? id.trim().toLowerCase() : '';
    return DOCS_CATALOG.find((d) => d.id === key) || null;
  }

  ipcMain.handle('open-docs-window', () => {
    try {
      const base = path.join(__dirname, '..');
      const preload = path.join(base, 'preloads', 'docs.js');
      const html = path.join(base, 'windows', 'docs.html');
      if (!fs.existsSync(html)) return { ok: false, error: tr('ipc.errorDocsHtmlNotFound') };
      if (!fs.existsSync(preload)) return { ok: false, error: tr('ipc.errorDocsPreloadNotFound') };
      windows.createDocsWindow(preload, html);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err && err.message) || tr('ipc.errorOpenDocsWindowFailed') };
    }
  });

  ipcMain.handle('list-docs', () => {
    const dir = getDocsDir();
    return DOCS_CATALOG.filter((d) => fs.existsSync(path.join(dir, d.file))).map((d) => ({
      id: d.id,
      file: d.file,
      titleKey: d.titleKey
    }));
  });

  ipcMain.handle('get-doc-content', (_, id) => {
    try {
      const entry = resolveDocEntry(id);
      if (!entry) return { ok: false, error: tr('ipc.errorDocNotFound') };
      const resolvedDir = path.resolve(getDocsDir());
      const full = path.resolve(resolvedDir, entry.file);
      if (!full.startsWith(resolvedDir + path.sep)) {
        return { ok: false, error: tr('ipc.errorDocNotFound') };
      }
      if (!fs.existsSync(full)) return { ok: false, error: tr('ipc.errorDocNotFound') };
      const markdown = fs.readFileSync(full, 'utf8');
      return {
        ok: true,
        id: entry.id,
        file: entry.file,
        titleKey: entry.titleKey,
        title: tr(entry.titleKey),
        markdown
      };
    } catch (err) {
      return { ok: false, error: (err && err.message) || tr('ipc.errorDocReadFailed') };
    }
  });

  ipcMain.handle('set-frame-window-size', (event, width, height) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed() && width > 0 && height > 0) {
      win.setSize(Math.max(640, width), Math.max(480, height));
    }
  });

  ipcMain.handle('get-eula-status', () => ({
    accepted: prefs.isEulaAccepted(),
    version: prefs.CURRENT_EULA_VERSION
  }));

  ipcMain.handle('get-eula-text', () => {
    try {
      const p = path.join(__dirname, '..', 'END_USER_AGREEMENT.md');
      const markdown = fs.readFileSync(p, 'utf8');
      return { ok: true, markdown, version: prefs.CURRENT_EULA_VERSION };
    } catch (err) {
      return { ok: false, error: (err && err.message) || 'EULA read failed' };
    }
  });

  ipcMain.handle('accept-eula', () => {
    prefs.acceptEula();
    try {
      const s = prefs.getAllSettings();
      const mask = windows.parsePanelOpenMask6(s.windowGridAutoOpenMask || '000000');
      if (s.stripPreviewFloating !== true) mask[1] = false;
      windows.openAuxiliaryWindowsFromPanelMask(mask);
      setTimeout(() => {
        try {
          if (prefs.getAllSettings().arrangeWindowsOnStartup) {
            require('./window-arrange').arrangeWindows();
          }
          windows.applyWindowGeometryLockFromPrefs();
        } catch (_) {}
      }, 450);
    } catch (_) {}
    return { ok: true, version: prefs.CURRENT_EULA_VERSION };
  });

  ipcMain.handle('quit-app', () => {
    app.quit();
    return { ok: true };
  });

  ipcMain.handle('get-app-settings', () => prefs.getAllSettings());
  ipcMain.handle('set-app-settings', (_, settings) => {
    prefs.setSettings(settings);
    if (settings && settings.stripPreviewShortcuts !== undefined) {
      const stripShortcuts = require('./strip-shortcuts');
      const user = prefs.getAllSettings().stripPreviewShortcuts || {};
      const payload = stripShortcuts.getPayloadForStrip(user);
      windows.sendToStripPreview('strip-shortcuts-updated', payload);
      const mainWin = windows.getMainWindow();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('strip-shortcuts-updated', payload);
      }
    }
    if (settings && settings.locale !== undefined) {
      windows.applyLocalizedWindowTitles();
    }
    windows.applyWindowGeometryLockFromPrefs();
    const all = prefs.getAllSettings();
    windows.sendToStripPreview('strip-preview-display-prefs', {
      stripPreviewFloating: all.stripPreviewFloating === true
    });
    // Zwevend aan/uit: open of sluit previewvenster
    if (settings && settings.stripPreviewFloating !== undefined) {
      if (settings.stripPreviewFloating) {
        try {
          const base = path.join(__dirname, '..');
          const preload = path.join(base, 'preloads', 'strip-display.js');
          const html = path.join(base, 'windows', 'strip-display.html');
          if (fs.existsSync(html) && fs.existsSync(preload)) {
            windows.createStripPreviewWindow(preload, html);
          }
        } catch (_) {}
      } else {
        windows.closeStripPreviewWindow();
      }
    }
    return { ok: true };
  });

  ipcMain.handle('get-strip-shortcuts', () => {
    const stripShortcuts = require('./strip-shortcuts');
    const user = prefs.getAllSettings().stripPreviewShortcuts || {};
    return stripShortcuts.getPayloadForStrip(user);
  });

  ipcMain.handle('get-strip-shortcut-config', () => {
    const stripShortcuts = require('./strip-shortcuts');
    const user = prefs.getAllSettings().stripPreviewShortcuts || {};
    return stripShortcuts.getShortcutConfigForSettings(user);
  });

  function applyWindowGridPrefsFromSettingsPayload(event, opts) {
    const settingsWin = windows.getSettingsWindow();
    if (!settingsWin || settingsWin.isDestroyed() || event.sender !== settingsWin.webContents) return;
    const o = opts && typeof opts === 'object' ? opts : {};
    const patch = {};
    if (typeof o.windowGridPermutation === 'string' && o.windowGridPermutation.trim()) {
      patch.windowGridPermutation = o.windowGridPermutation.trim();
    }
    const maskRaw = o.windowGridAutoOpenMask != null ? String(o.windowGridAutoOpenMask).replace(/\s/g, '') : '';
    if (/^[01]{6}$/.test(maskRaw)) {
      patch.windowGridAutoOpenMask = maskRaw;
    }
    if (o.arrangeAcrossAllDisplays !== undefined) {
      patch.arrangeAcrossAllDisplays = !!o.arrangeAcrossAllDisplays;
    }
    if (Object.keys(patch).length) prefs.setSettings(patch);
  }

  ipcMain.handle('arrange-windows', (event, opts) => {
    applyWindowGridPrefsFromSettingsPayload(event, opts);
    let locked = !!prefs.getAllSettings().windowsGeometryLocked;
    if (opts && typeof opts === 'object' && opts.windowsGeometryLocked !== undefined) {
      locked = !!opts.windowsGeometryLocked;
    }
    const settingsWin = windows.getSettingsWindow();
    const fromSettings =
      settingsWin && !settingsWin.isDestroyed() && event.sender === settingsWin.webContents;
    const windowArrange = require('./window-arrange');
    const runArrange = () => {
      if (fromSettings) {
        const mask = windows.parsePanelOpenMask6(prefs.getAllSettings().windowGridAutoOpenMask);
        windows.closeAuxiliaryWindowsNotInPanelMask(mask);
      }
      windowArrange.arrangeWindows();
      windows.applyWindowGeometryLock(locked);
    };
    if (fromSettings) {
      setImmediate(runArrange);
    } else {
      runArrange();
    }
    return { ok: true };
  });

  ipcMain.handle('auto-arrange-windows-from-grid', (event, payload) => {
    const settingsWin = windows.getSettingsWindow();
    if (!settingsWin || settingsWin.isDestroyed() || event.sender !== settingsWin.webContents) {
      return { ok: false, error: tr('ipc.errorForbidden') };
    }
    const p = payload && typeof payload === 'object' ? payload : {};
    applyWindowGridPrefsFromSettingsPayload(event, {
      windowGridPermutation: p.windowGridPermutation,
      windowGridAutoOpenMask: p.panelMask != null ? p.panelMask : p.windowGridAutoOpenMask,
      arrangeAcrossAllDisplays: p.arrangeAcrossAllDisplays
    });
    const mask = windows.parsePanelOpenMask6(p.panelMask);
    const windowArrange = require('./window-arrange');
    let locked = !!prefs.getAllSettings().windowsGeometryLocked;
    if (p.windowsGeometryLocked !== undefined) {
      locked = !!p.windowsGeometryLocked;
    }
    /* Eerst IPC-antwoord; daarna masker afdwingen (sluiten + openen) en schikken. */
    setImmediate(() => {
      windows.closeAuxiliaryWindowsNotInPanelMask(mask);
      windows.openAuxiliaryWindowsFromPanelMask(mask);
      windowArrange.arrangeWindows();
      windows.applyWindowGeometryLock(locked);
    });
    return { ok: true };
  });

  function isStripPreviewSender(event) {
    const stripWin = windows.getStripPreviewWindow();
    return !!(stripWin && !stripWin.isDestroyed() && event && event.sender === stripWin.webContents);
  }

  function sendToMainWindow(channel, payload) {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      if (payload === undefined) mainWin.webContents.send(channel);
      else mainWin.webContents.send(channel, payload);
    }
  }

  /** Hoofdvenster → scanlint-/align-preview: raster + beeldpayload. */
  ipcMain.on('send-strip-update', (_, payload) => {
    const merged = windows.setLastStripUpdatePayload(payload);
    if (merged) {
      windows.sendToStripPreview('strip-update', merged);
      windows.sendToAlignPreview('align-preview-update', merged);
    }
  });

  ipcMain.on('strip-preview-status', (event, data) => {
    if (!isStripPreviewSender(event)) return;
    if (data) sendToMainWindow('status-from-strip', { percent: data.percent, operation: data.operation });
  });

  ipcMain.on('request-strip-refresh', (event) => {
    if (!isStripPreviewSender(event)) return;
    windows.resendLastStripPayloadToStripPreview();
    windows.resendLastStripPayloadToAlignPreview();
    sendToMainWindow('strip-preview-ready');
  });

  ipcMain.handle('strip-preview-request-pick-scan-folder', (event) => {
    if (!isStripPreviewSender(event)) return { ok: false };
    sendToMainWindow('pick-scan-folder-from-strip');
    return { ok: true };
  });

  ipcMain.on('from-frame-grid-offset', (event, payload) => {
    if (!isStripPreviewSender(event)) return;
    const p = payload && typeof payload === 'object' ? payload : {};
    sendToMainWindow('frame-grid-offset-update', {
      deltaX: p.deltaX != null ? Number(p.deltaX) : 0,
      deltaY: p.deltaY != null ? Number(p.deltaY) : 0,
      tool: p.tool || 'hand'
    });
  });

  ipcMain.on('set-grid-offset-absolute', (event, payload) => {
    if (!isStripPreviewSender(event)) return;
    const p = payload && typeof payload === 'object' ? payload : {};
    sendToMainWindow('set-grid-offset-absolute', {
      gridOffsetX: p.gridOffsetX != null ? Number(p.gridOffsetX) : 0,
      gridOffsetY: p.gridOffsetY != null ? Number(p.gridOffsetY) : 0,
      gridOffsetYBottom: p.gridOffsetYBottom != null && Number.isFinite(Number(p.gridOffsetYBottom))
        ? Number(p.gridOffsetYBottom)
        : 0
    });
  });

  ipcMain.on('strip-apply-width-narrow', (event) => {
    if (!isStripPreviewSender(event)) return;
    sendToMainWindow('strip-apply-width-narrow');
  });
  ipcMain.on('strip-apply-width-widen', (event) => {
    if (!isStripPreviewSender(event)) return;
    sendToMainWindow('strip-apply-width-widen');
  });
  ipcMain.on('strip-apply-vertical-push', (event) => {
    if (!isStripPreviewSender(event)) return;
    sendToMainWindow('strip-apply-vertical-push');
  });
  ipcMain.on('strip-apply-vertical-stretch', (event) => {
    if (!isStripPreviewSender(event)) return;
    sendToMainWindow('strip-apply-vertical-stretch');
  });
  ipcMain.on('strip-adjust-width-edge', (event, payload) => {
    if (!isStripPreviewSender(event)) return;
    const p = payload && typeof payload === 'object' ? payload : {};
    sendToMainWindow('strip-adjust-width-edge', {
      edge: p.edge === 'right' ? 'right' : 'left',
      delta: p.delta != null ? Number(p.delta) : 0
    });
  });
  ipcMain.on('strip-adjust-height-edge', (event, payload) => {
    if (!isStripPreviewSender(event)) return;
    const p = payload && typeof payload === 'object' ? payload : {};
    sendToMainWindow('strip-adjust-height-edge', {
      edge: p.edge === 'bottom' ? 'bottom' : 'top',
      delta: p.delta != null ? Number(p.delta) : 0
    });
  });
  ipcMain.on('strip-vertical-rigid-pan-boundary', (event, payload) => {
    if (!isStripPreviewSender(event)) return;
    const p = payload && typeof payload === 'object' ? payload : {};
    sendToMainWindow('strip-vertical-rigid-pan-boundary', { towardCompress: !!p.towardCompress });
  });
  ipcMain.on('strip-vertical-fixed-bottom-step', (event, payload) => {
    if (!isStripPreviewSender(event)) return;
    const p = payload && typeof payload === 'object' ? payload : {};
    sendToMainWindow('strip-vertical-fixed-bottom-step', {
      delta: p.delta != null ? Number(p.delta) : 0,
      duwKind: p.duwKind === 'compress' || p.duwKind === 'stretch' ? p.duwKind : undefined
    });
  });
  ipcMain.on('strip-vertical-anchor', (event, payload) => {
    if (!isStripPreviewSender(event)) return;
    const p = payload && typeof payload === 'object' ? payload : {};
    sendToMainWindow('strip-vertical-anchor', {
      mode: typeof p.mode === 'string' ? p.mode : undefined,
      customK: p.customK != null ? Number(p.customK) : undefined
    });
  });
  ipcMain.on('strip-panel-link-vertical-anchor', (event, payload) => {
    if (!isStripPreviewSender(event)) return;
    const p = payload && typeof payload === 'object' ? payload : {};
    sendToMainWindow('strip-panel-link-vertical-anchor', { link: !!p.link });
  });

  /** Vorige/Volgende/Ga naar — inclusief exportCurrent (Volgende schrijft frames weg). */
  ipcMain.on('strip-navigate-scan', (event, payload) => {
    if (!isStripPreviewSender(event)) return;
    const p = payload && typeof payload === 'object' ? payload : {};
    const idx = p.index != null ? Math.floor(Number(p.index)) : NaN;
    if (Number.isFinite(idx) && idx >= 1) {
      sendToMainWindow('strip-navigate-scan', {
        index: idx,
        exportCurrent: !!p.exportCurrent,
        fromAutoAdvance: !!p.fromAutoAdvance
      });
      return;
    }
    const direction = p.direction === 'next' ? 'next' : p.direction === 'prev' ? 'prev' : '';
    if (!direction) return;
    sendToMainWindow('strip-navigate-scan', {
      direction,
      exportCurrent: direction === 'next' && !!p.exportCurrent,
      fromAutoAdvance: !!p.fromAutoAdvance
    });
  });

  ipcMain.on('strip-rotate-90', (event) => {
    if (!isStripPreviewSender(event)) return;
    sendToMainWindow('strip-rotate-90');
  });
  ipcMain.on('strip-set-flip', (event, payload) => {
    if (!isStripPreviewSender(event)) return;
    const p = payload && typeof payload === 'object' ? payload : {};
    sendToMainWindow('strip-set-flip', {
      flipHorizontal: !!p.flipHorizontal,
      flipVertical: !!p.flipVertical
    });
  });

  ipcMain.handle('frame-preview-jump-to', (event, position) => {
    if (!isStripPreviewSender(event)) return;
    sendToMainWindow('frame-preview-jump', position);
  });
  ipcMain.handle('set-active-frame', (event, frameNumber) => {
    if (!isStripPreviewSender(event)) return;
    sendToMainWindow('set-active-frame', Math.max(1, Math.floor(Number(frameNumber) || 1)));
  });
  ipcMain.handle('reset-grid-to-default', (event) => {
    if (!isStripPreviewSender(event)) return;
    sendToMainWindow('do-reset-grid');
  });

  /**
   * Generieke strip→main API-aanroep (Auto ▶, detectie, assist-instellingen).
   * Roept window.__f2fInvokeStripApi in het hoofdvenster aan.
   */
  ipcMain.handle('strip-api-invoke', async (event, payload) => {
    if (!isStripPreviewSender(event)) return null;
    const mainWin = windows.getMainWindow();
    if (!mainWin || mainWin.isDestroyed()) return null;
    const p = payload && typeof payload === 'object' ? payload : {};
    const method = typeof p.method === 'string' ? p.method.trim() : '';
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(method)) return null;
    const args = Array.isArray(p.args) ? p.args : [];
    try {
      return await mainWin.webContents.executeJavaScript(
        `Promise.resolve(typeof window.__f2fInvokeStripApi === 'function' ? window.__f2fInvokeStripApi(${JSON.stringify(method)}, ${JSON.stringify(args)}) : null)`
      );
    } catch (_) {
      return null;
    }
  });

}

module.exports = { registerIPC };
