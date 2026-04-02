/**
 * IPC handlers – alle invoke/on handlers hier. Main process blijft dun.
 */
const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const windows = require('./windows');
const project = require('./project');
const prefs = require('./prefs');
const presets = require('./presets');
const gridPresets = require('./grid-presets');
const version = require('./version');
const locales = require('./locales');
const videoExport = require('./video-export');
const { applyAppMenu } = require('./app-menu');
const { tr } = require('./main-i18n');

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp'];

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
      const count = await project.countImagesInFolder(location || projectFolderPath);
      const data = {
        name: name || path.basename(projectFolderPath),
        location: location || projectFolderPath,
        framesPerLint: Math.max(1, Math.min(99, Number(framesPerLint) || 30)),
        numberOfScans: numberOfScans !== undefined ? Number(numberOfScans) : count,
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
      windows.sendToAlignPreview('strip-locale-changed', {});
      windows.sendToOutputPreview('strip-locale-changed', {});
      windows.sendToPixelEditor('strip-locale-changed', {});
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
      const existing = await project.readProject(projectFolderPath);
      const data = {
        name: existing?.name || path.basename(projectFolderPath),
        location: existing?.location || '',
        framesPerLint: existing?.framesPerLint ?? 30,
        numberOfScans: existing?.numberOfScans ?? 0,
        created: existing?.created,
        state: state || null,
        lintStates: Array.isArray(lintStates) ? lintStates : (existing?.lintStates || []),
        currentLintPath: currentLintPath ?? existing?.currentLintPath ?? null,
        scanInfos: Array.isArray(scanInfos) ? scanInfos : (existing?.scanInfos ?? []),
        filmFormat: filmFormat ?? existing?.filmFormat ?? '16mm-double',
        filmPolarity: filmPolarity ?? existing?.filmPolarity ?? 'positief',
        outputFolder: outputFolder ?? existing?.outputFolder ?? null,
        outputFormat: outputFormat ?? existing?.outputFormat ?? 'png',
        scanDpi: scanDpi ?? existing?.scanDpi ?? 4800,
        stripPresetId:
          stripPresetId !== undefined
            ? stripPresetId != null && typeof stripPresetId === 'string' && stripPresetId.trim() !== ''
              ? stripPresetId.trim()
              : null
            : existing?.stripPresetId ?? null,
        pixelEditorOutputFolder:
          pixelEditorOutputFolder !== undefined
            ? pixelEditorOutputFolder || null
            : existing?.pixelEditorOutputFolder ?? null,
        pixelEditorSourceFolder:
          pixelEditorSourceFolder !== undefined
            ? pixelEditorSourceFolder || null
            : existing?.pixelEditorSourceFolder ?? null
      };
      await project.writeProject(projectFolderPath, data);
      prefs.setLastProjectPath(projectFolderPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || tr('ipc.errorSaveFailed') };
    }
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

  async function writeFrameToFile(folder, baseName, index, dataUrl, ext) {
    const base = (baseName || 'frame').replace(/[/\\:*?"<>|]/g, '_');
    const num = Number(index);
    const padded = Number.isFinite(num) && num >= 1 ? String(Math.min(999999, Math.floor(num))).padStart(6, '0') : '000001';
    const extension = (ext || 'png').toLowerCase().replace(/^\./, '');
    const filePath = path.join(folder, `${base}_${padded}.${extension}`);
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    if (!base64) return { ok: false, error: tr('ipc.errorNoImageData') };
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return { ok: true };
  }

  ipcMain.handle('write-frame', async (_, { folder, baseName, index, dataUrl, ext }) => {
    if (!folder || typeof folder !== 'string' || !dataUrl || typeof dataUrl !== 'string') return { ok: false, error: tr('ipc.errorInvalidParams') };
    try {
      return await writeFrameToFile(folder, baseName, index, dataUrl, ext || 'png');
    } catch (err) {
      return { ok: false, error: err.message || tr('ipc.errorWriteFailed') };
    }
  });

  ipcMain.handle('write-frame-png', async (_, { folder, baseName, index, dataUrl }) => {
    if (!folder || typeof folder !== 'string' || !dataUrl || typeof dataUrl !== 'string') return { ok: false, error: tr('ipc.errorInvalidParams') };
    try {
      return await writeFrameToFile(folder, baseName, index, dataUrl, 'png');
    } catch (err) {
      return { ok: false, error: err.message || tr('ipc.errorWriteFailed') };
    }
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
    if (!filePath) return '';
    try {
      return require('url').pathToFileURL(filePath).href;
    } catch {
      return '';
    }
  });

  ipcMain.handle('open-strip-preview', () => {
    try {
      const base = path.join(__dirname, '..');
      const preload = path.join(base, 'preloads', 'strip.js');
      const html = path.join(base, 'windows', 'strip-preview.html');
      if (!fs.existsSync(html)) return { ok: false, error: tr('ipc.errorStripPreviewHtmlNotFound') };
      if (!fs.existsSync(preload)) return { ok: false, error: tr('ipc.errorStripPreloadNotFound') };
      windows.createStripPreviewWindow(preload, html);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err && err.message) || tr('ipc.errorOpenStripPreviewFailed') };
    }
  });

  ipcMain.handle('close-strip-preview', () => {
    windows.closeStripPreviewWindow();
  });

  ipcMain.handle('open-output-preview', () => {
    const base = path.join(__dirname, '..');
    const preload = path.join(base, 'preloads', 'output.js');
    const html = path.join(base, 'windows', 'output-preview.html');
    if (!fs.existsSync(html)) return { ok: false, error: tr('ipc.errorOutputPreviewHtmlNotFound') };
    windows.createOutputPreviewWindow(preload, html);
    return { ok: true };
  });

  ipcMain.handle('open-align-preview', () => {
    try {
      const base = path.join(__dirname, '..');
      const preload = path.join(base, 'preloads', 'align-preview.js');
      const html = path.join(base, 'windows', 'align-preview.html');
      if (!fs.existsSync(html)) return { ok: false, error: tr('ipc.errorAlignPreviewHtmlNotFound') };
      if (!fs.existsSync(preload)) return { ok: false, error: tr('ipc.errorAlignPreloadNotFound') };
      windows.createAlignPreviewWindow(preload, html);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err && err.message) || tr('ipc.errorOpenAlignPreviewFailed') };
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

  function assertPixelEditorSender(wc) {
    const win = windows.getPixelEditorWindow();
    return win && !win.isDestroyed() && wc && wc === win.webContents;
  }

  ipcMain.handle('open-pixel-editor', () => {
    try {
      const base = path.join(__dirname, '..');
      const preload = path.join(base, 'preloads', 'pixel-editor.js');
      const html = path.join(base, 'windows', 'pixel-editor.html');
      if (!fs.existsSync(html)) return { ok: false, error: tr('ipc.errorPixelEditorHtmlNotFound') };
      if (!fs.existsSync(preload)) return { ok: false, error: tr('ipc.errorPixelEditorPreloadNotFound') };
      windows.createPixelEditorWindow(preload, html);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err && err.message) || tr('ipc.errorOpenPixelEditorFailed') };
    }
  });

  ipcMain.handle('close-pixel-editor', () => {
    windows.closePixelEditorWindow();
  });

  /** Opent geen venster; alleen focus als de pixel-editor al open is. */
  ipcMain.handle('focus-pixel-editor', () => ({ ok: windows.focusPixelEditorWindow() }));

  ipcMain.handle('pixel-editor-pull', async (event) => {
    if (!assertPixelEditorSender(event.sender)) return { ok: false, error: tr('ipc.errorForbidden') };
    const mainWin = windows.getMainWindow();
    if (!mainWin || mainWin.isDestroyed()) return { ok: false, error: tr('ipc.errorNoMainWindow') };
    try {
      return await mainWin.webContents.executeJavaScript(
        `(window.__f2fPixelEditorBridge && window.__f2fPixelEditorBridge('pull'))`
      );
    } catch (err) {
      return { ok: false, error: (err && err.message) || tr('ipc.errorPixelEditorPullFailed') };
    }
  });

  ipcMain.handle('pixel-editor-push-overlay', async (event, payload) => {
    if (!assertPixelEditorSender(event.sender)) return { ok: false, error: tr('ipc.errorForbidden') };
    const mainWin = windows.getMainWindow();
    if (!mainWin || mainWin.isDestroyed()) return { ok: false, error: tr('ipc.errorNoMainWindow') };
    const dataUrl = payload && typeof payload.dataUrl === 'string' ? payload.dataUrl : '';
    try {
      return await mainWin.webContents.executeJavaScript(
        `(window.__f2fPixelEditorBridge && window.__f2fPixelEditorBridge('pushOverlay', { dataUrl: ${JSON.stringify(dataUrl)} }))`
      );
    } catch (err) {
      return { ok: false, error: (err && err.message) || tr('ipc.errorPixelEditorPushFailed') };
    }
  });

  ipcMain.handle('pixel-editor-main-action', async (event, payload) => {
    if (!assertPixelEditorSender(event.sender)) return { ok: false, error: tr('ipc.errorForbidden') };
    const mainWin = windows.getMainWindow();
    if (!mainWin || mainWin.isDestroyed()) return { ok: false, error: tr('ipc.errorNoMainWindow') };
    const action = payload && typeof payload.action === 'string' ? payload.action : '';
    const pl = payload && payload.payload != null ? payload.payload : null;
    try {
      return await mainWin.webContents.executeJavaScript(
        `(async () => {
          const fn = window.__f2fPixelEditorMainUi;
          if (typeof fn !== 'function') return { ok: false, error: ${JSON.stringify(tr('ipc.errorPixelEditorNoMainUi'))} };
          return await fn(${JSON.stringify(action)}, ${JSON.stringify(pl)});
        })()`
      );
    } catch (err) {
      return { ok: false, error: (err && err.message) || tr('ipc.errorPixelEditorMainActionFailed') };
    }
  });

  ipcMain.on('notify-pixel-editor-remote-refresh', (event) => {
    const mainWin = windows.getMainWindow();
    if (!mainWin || mainWin.isDestroyed() || event.sender !== mainWin.webContents) return;
    windows.sendToPixelEditor('pixel-editor-refresh-from-main', {});
  });

  ipcMain.handle('close-align-preview', () => {
    windows.closeAlignPreviewWindow();
  });

  ipcMain.handle('close-output-preview', () => {
    windows.closeOutputPreviewWindow();
  });

  ipcMain.handle('send-output-preview-image', (_, dataUrl) => {
    windows.sendToOutputPreview('output-image', { dataUrl });
  });

  ipcMain.on('send-strip-update', (_, payload) => {
    const merged = windows.setLastStripUpdatePayload(payload);
    if (merged) {
      windows.sendToStripPreview('strip-update', merged);
      windows.sendToAlignPreview('align-preview-update', merged);
    }
  });

  ipcMain.handle('set-frame-window-size', (event, width, height) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed() && width > 0 && height > 0) {
      win.setSize(Math.max(640, width), Math.max(480, height));
    }
  });

  /** Belasting/status uit scanlint-preview doorsturen naar hoofdvenster (toolbar-indicator). */
  ipcMain.on('strip-preview-status', (_, data) => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed() && data) {
      mainWin.webContents.send('status-from-strip', { percent: data.percent, operation: data.operation });
    }
  });

  /** Strip-preview vraagt om opnieuw strip-data (na reload of bij eerste load). */
  ipcMain.on('request-strip-refresh', () => {
    windows.resendLastStripPayloadToStripPreview();
    windows.resendLastStripPayloadToAlignPreview();
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('strip-preview-ready');
    }
  });

  /** Uitlijning-venster: zelfde strip-payload ophalen als scanlint-preview. */
  ipcMain.on('request-align-preview-refresh', () => {
    windows.resendLastStripPayloadToStripPreview();
    windows.resendLastStripPayloadToAlignPreview();
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('align-preview-ready');
    }
  });

  /** Rasteraanpassingen uit frame- of strip-voorbekijk doorsturen naar hoofdvenster voor real-time sync. Payload: { deltaX, deltaY, tool }. */
  ipcMain.on('from-frame-grid-offset', (_, payload) => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      const p = payload && typeof payload === 'object' ? payload : {};
      mainWin.webContents.send('frame-grid-offset-update', {
        deltaX: p.deltaX != null ? Number(p.deltaX) : 0,
        deltaY: p.deltaY != null ? Number(p.deltaY) : 0,
        tool: p.tool || 'hand'
      });
    }
  });

  /** Absolute rasterpositie uit strip-preview (handmatige X/Y-invoer). Payload: { gridOffsetX, gridOffsetY, gridOffsetYBottom }. */
  ipcMain.on('set-grid-offset-absolute', (_, payload) => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      const p = payload && typeof payload === 'object' ? payload : {};
      mainWin.webContents.send('set-grid-offset-absolute', {
        gridOffsetX: p.gridOffsetX != null ? Number(p.gridOffsetX) : 0,
        gridOffsetY: p.gridOffsetY != null ? Number(p.gridOffsetY) : 0,
        gridOffsetYBottom: p.gridOffsetYBottom != null && Number.isFinite(Number(p.gridOffsetYBottom)) ? Number(p.gridOffsetYBottom) : 0
      });
    }
  });

  /** Overlay Grid-tools vanuit strip-preview: doorsturen naar hoofdvenster. */
  ipcMain.on('strip-apply-width-narrow', () => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('strip-apply-width-narrow');
  });
  ipcMain.on('strip-apply-width-widen', () => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('strip-apply-width-widen');
  });
  ipcMain.on('strip-apply-vertical-push', () => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('strip-apply-vertical-push');
  });
  ipcMain.on('strip-apply-vertical-stretch', () => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('strip-apply-vertical-stretch');
  });
  ipcMain.on('strip-adjust-width-edge', (_, payload) => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      const p = payload && typeof payload === 'object' ? payload : {};
      mainWin.webContents.send('strip-adjust-width-edge', {
        edge: p.edge === 'right' ? 'right' : 'left',
        delta: p.delta != null ? Number(p.delta) : 0
      });
    }
  });
  ipcMain.on('strip-adjust-height-edge', (_, payload) => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      const p = payload && typeof payload === 'object' ? payload : {};
      mainWin.webContents.send('strip-adjust-height-edge', {
        edge: p.edge === 'bottom' ? 'bottom' : 'top',
        delta: p.delta != null ? Number(p.delta) : 0
      });
    }
  });

  /** Shift+Samendruk / Shift+Uitrek: rigide pan tot clamp-grens (towardCompress true = omlaag, false = omhoog). */
  ipcMain.on('strip-vertical-rigid-pan-boundary', (_, payload) => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      const p = payload && typeof payload === 'object' ? payload : {};
      mainWin.webContents.send('strip-vertical-rigid-pan-boundary', {
        towardCompress: !!p.towardCompress
      });
    }
  });

  /** Vorige/volgende scanlint of spring naar index (1-based): hoofdvenster slaat project eerst op, daarna laden. */
  ipcMain.on('strip-navigate-scan', (_, payload) => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      const p = payload && typeof payload === 'object' ? payload : {};
      const idx = p.index != null ? Math.floor(Number(p.index)) : NaN;
      if (Number.isFinite(idx) && idx >= 1) {
        mainWin.webContents.send('strip-navigate-scan', { index: idx });
        return;
      }
      const direction = p.direction === 'next' ? 'next' : p.direction === 'prev' ? 'prev' : '';
      if (direction) mainWin.webContents.send('strip-navigate-scan', { direction });
    }
  });

  /** delta in preview-pixels: + / − = rigide verticale pan (zelfde als Hand ▲▼), geen celhoogte-wijziging */
  ipcMain.on('strip-vertical-fixed-bottom-step', (_, payload) => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      const p = payload && typeof payload === 'object' ? payload : {};
      mainWin.webContents.send('strip-vertical-fixed-bottom-step', {
        delta: p.delta != null ? Number(p.delta) : 0,
        duwKind: p.duwKind === 'compress' || p.duwKind === 'stretch' ? p.duwKind : undefined
      });
    }
  });

  /** Referentielijn Lijn # (optioneel legacy mode); customK = index 0…n. */
  ipcMain.on('strip-vertical-anchor', (_, payload) => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      const p = payload && typeof payload === 'object' ? payload : {};
      mainWin.webContents.send('strip-vertical-anchor', {
        mode: typeof p.mode === 'string' ? p.mode : undefined,
        customK: p.customK != null ? Number(p.customK) : undefined
      });
    }
  });

  /** Referentielijn koppelen aan scanlint-previewpaneel (Hand/Duw/Shift+Duw). */
  ipcMain.on('strip-panel-link-vertical-anchor', (_, payload) => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      const p = payload && typeof payload === 'object' ? payload : {};
      mainWin.webContents.send('strip-panel-link-vertical-anchor', { link: !!p.link });
    }
  });

  ipcMain.on('strip-preset-save', (_, name) => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('strip-preset-do-save', typeof name === 'string' ? name : '');
  });
  ipcMain.on('strip-preset-load', (_, id) => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('strip-preset-do-load', id);
  });
  ipcMain.on('strip-preset-delete', (_, id) => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('strip-preset-do-delete', id);
  });
  /** Scanlint-preview: draai 90° / spiegelen — zelfde state als hoofdvenster. */
  ipcMain.on('strip-rotate-90', () => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('strip-rotate-90');
  });
  ipcMain.on('strip-set-flip', (_, payload) => {
    const mainWin = windows.getMainWindow();
    const p = payload && typeof payload === 'object' ? payload : {};
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('strip-set-flip', {
        flipHorizontal: !!p.flipHorizontal,
        flipVertical: !!p.flipVertical
      });
    }
  });
  ipcMain.on('notify-strip-presets-updated', () => {
    windows.sendToStripPreview('presets-updated');
  });

  /** Frame-voorbekijk: spring naar boven/midden/onder van het scanlint. */
  ipcMain.handle('frame-preview-jump-to', (_, position) => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('frame-preview-jump', position);
    }
  });

  /** Scanlint: dubbelklik op rastercel → dat frame wordt actief (rood). */
  ipcMain.handle('set-active-frame', (_, frameNumber) => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('set-active-frame', Math.max(1, Math.floor(Number(frameNumber) || 1)));
    }
  });

  /** Reset raster naar startpositie (X=0, Y=0, Y-onder=0). Aanroepbaar vanuit scanlint-preview of hoofdvenster. */
  ipcMain.handle('reset-grid-to-default', () => {
    const mainWin = windows.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('do-reset-grid');
    }
  });

  ipcMain.handle('presets-list', () => presets.listPresets());
  ipcMain.handle('preset-save', (_, name, data) => presets.savePreset(name, data));
  ipcMain.handle('preset-load', (_, id) => presets.loadPreset(id));
  ipcMain.handle('preset-delete', (_, id) => presets.deletePreset(id));

  ipcMain.handle('grid-presets-list', () => gridPresets.listGridPresets());
  ipcMain.handle('grid-preset-save', (_, name, grid) => gridPresets.saveGridPreset(name, grid));
  ipcMain.handle('grid-preset-load', (_, id) => gridPresets.loadGridPreset(id));
  ipcMain.handle('grid-preset-delete', (_, id) => gridPresets.deleteGridPreset(id));

  ipcMain.handle('get-app-settings', () => prefs.getAllSettings());
  ipcMain.handle('set-app-settings', (_, settings) => {
    prefs.setSettings(settings);
    if (settings && settings.stripPreviewShortcuts !== undefined) {
      const stripShortcuts = require('./strip-shortcuts');
      const user = prefs.getAllSettings().stripPreviewShortcuts || {};
      windows.sendToStripPreview('strip-shortcuts-updated', stripShortcuts.getPayloadForStrip(user));
    }
    if (settings && settings.locale !== undefined) {
      windows.applyLocalizedWindowTitles();
    }
    windows.applyWindowGeometryLockFromPrefs();
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

  ipcMain.handle('select-video-output-file', async (_, formatId) => {
    const win = windows.getMainWindow();
    const formats = videoExport.getVideoFormats();
    const preset = formats[formatId] || formats.h264;
    const ext = preset.ext;
    const result = await dialog.showSaveDialog(win || null, {
      title: tr('ipc.dialogSaveVideoTitle'),
      defaultPath: `output.${ext}`,
      filters: [{ name: tr('ipc.videoFileFilter', { ext: ext.toUpperCase() }), extensions: [ext] }]
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('get-temp-video-folder', async () => {
    const dir = path.join(require('os').tmpdir(), `film2frame-video-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  });

  ipcMain.handle('prepare-video-export', () => {
    videoExport.beginVideoExportJob();
    return { ok: true };
  });

  ipcMain.handle('cancel-video-export', () => {
    videoExport.cancelVideoExport();
    return { ok: true };
  });

  ipcMain.handle('remove-temp-video-folder', (_, folderPath) => {
    videoExport.removeTempFolder(folderPath);
    return { ok: true };
  });

  ipcMain.handle('create-video-from-frames', async (_, opts) => {
    const { tempFolder, outputPath, fps, formatId } = opts || {};
    if (!tempFolder || !outputPath) return { ok: false, error: tr('ipc.errorMissingParams') };
    try {
      const result = await videoExport.createVideo({
        framesFolder: tempFolder,
        outputPath,
        fps: Number(fps) || 24,
        formatId: formatId || 'h264',
        onProgress: (phase, detail) => {
          const win = windows.getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('video-export-progress', { phase, detail });
          }
        }
      });
      videoExport.removeTempFolder(tempFolder);
      return result;
    } catch (err) {
      videoExport.removeTempFolder(tempFolder);
      return { ok: false, error: err.message || tr('ipc.errorVideoFailed') };
    }
  });

  ipcMain.handle('create-video-from-folder', async (_, opts) => {
    const { folderPath, outputPath, fps, formatId, uniformFit } = opts || {};
    if (!folderPath || !outputPath) return { ok: false, error: tr('ipc.errorMissingParams') };
    try {
      const imagePaths = await project.listImagesInFolder(folderPath);
      if (!imagePaths.length) return { ok: false, error: tr('ipc.errorNoImagesInFolder') };
      const sendProgress = (phase, detail) => {
        const win = windows.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('video-export-progress', { phase, detail });
        }
      };
      return await videoExport.createVideoFromImagePaths({
        imagePaths,
        outputPath,
        fps: Number(fps) || 24,
        formatId: formatId || 'h264',
        onProgress: sendProgress,
        uniformFit: uniformFit === 'cover' ? 'cover' : 'pad'
      });
    } catch (err) {
      return { ok: false, error: err.message || tr('ipc.errorVideoFailed') };
    }
  });

  ipcMain.handle('check-ffmpeg-available', () => videoExport.checkFfmpegAvailable());
}

module.exports = { registerIPC };
