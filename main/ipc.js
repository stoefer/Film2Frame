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

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp'];

function registerIPC() {
  /** Renderer bewaart project + lintStates naar schijf; daarna mag het hoofdvenster echt sluiten. */
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
      title: options?.title || 'Kies map',
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
    if (!projectFolderPath) return { ok: false, error: 'Geen projectmap gekozen' };
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
        stripPresetId: null
      };
      await project.writeProject(projectFolderPath, data);
      prefs.setLastProjectPath(projectFolderPath);
      return { ok: true, project: { path: projectFolderPath, ...data } };
    } catch (err) {
      return { ok: false, error: err.message || 'Project aanmaken mislukt' };
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
    if (['en', 'nl'].includes(String(locale))) prefs.setLocale(locale);
  });
  ipcMain.handle('get-translations', () => {
    const locale = prefs.getLocale();
    const dict = locales.loadLocale(locale);
    return dict || locales.loadLocale('en') || {};
  });

  ipcMain.handle('open-project-by-path', async (_, projectFolderPath) => {
    if (!projectFolderPath) return { ok: false, error: 'Geen pad', project: null };
    const loaded = await project.readProject(projectFolderPath);
    if (!loaded) return { ok: false, error: 'Geen geldig project in deze map', project: null };
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
      title: 'Open project (kies projectmap)',
      defaultPath: defaultPath || undefined
    });
    if (result.canceled || !result.filePaths.length) return { ok: false, project: null };
    const chosen = result.filePaths[0];
    prefs.setLastProjectFolder(chosen);
    prefs.setLastProjectPath(chosen);
    const loaded = await project.readProject(chosen);
    if (!loaded) return { ok: false, error: 'Geen geldig project in deze map', project: null };
    return { ok: true, project: loaded };
  });

  ipcMain.handle('delete-project', async (_, projectFolderPath) => {
    if (!projectFolderPath || typeof projectFolderPath !== 'string') return { ok: false, error: 'Geen projectmap opgegeven' };
    const win = windows.getMainWindow();
    const confirmed = await dialog.showMessageBox(win || null, {
      type: 'warning',
      title: 'Project wissen',
      message: 'Projectmap definitief verwijderen?',
      detail: 'De map en alle bestanden erin worden permanent verwijderd. Dit kan niet ongedaan worden gemaakt.\n\n' + projectFolderPath,
      buttons: ['Annuleren', 'Project wissen'],
      defaultId: 0,
      cancelId: 0
    });
    if (confirmed.response !== 1) return { ok: false, canceled: true };
    try {
      const projectFile = path.join(projectFolderPath, 'project.json');
      if (!fs.existsSync(projectFile)) return { ok: false, error: 'Geen geldig project in deze map' };
      fs.rmSync(projectFolderPath, { recursive: true, force: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || 'Verwijderen mislukt' };
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
      stripPresetId
    } = payload || {};
    if (!projectFolderPath) return { ok: false, error: 'Geen project geopend' };
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
            : existing?.stripPresetId ?? null
      };
      await project.writeProject(projectFolderPath, data);
      prefs.setLastProjectPath(projectFolderPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || 'Bewaren mislukt' };
    }
  });

  ipcMain.handle('select-export-folder', async () => {
    const win = windows.getMainWindow();
    const result = await dialog.showOpenDialog(win || null, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Doelmap voor uitgeknipte frames'
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
    if (!base64) return { ok: false, error: 'Geen beelddata' };
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return { ok: true };
  }

  ipcMain.handle('write-frame', async (_, { folder, baseName, index, dataUrl, ext }) => {
    if (!folder || typeof folder !== 'string' || !dataUrl || typeof dataUrl !== 'string') return { ok: false, error: 'Ongeldige parameters' };
    try {
      return await writeFrameToFile(folder, baseName, index, dataUrl, ext || 'png');
    } catch (err) {
      return { ok: false, error: err.message || 'Schrijven mislukt' };
    }
  });

  ipcMain.handle('write-frame-png', async (_, { folder, baseName, index, dataUrl }) => {
    if (!folder || typeof folder !== 'string' || !dataUrl || typeof dataUrl !== 'string') return { ok: false, error: 'Ongeldige parameters' };
    try {
      return await writeFrameToFile(folder, baseName, index, dataUrl, 'png');
    } catch (err) {
      return { ok: false, error: err.message || 'Schrijven mislukt' };
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

  ipcMain.handle('get-scan-infos', async (event, folderPath) => {
    const wc = event.sender;
    return project.getScanInfos(folderPath, (current, total) => {
      if (!wc.isDestroyed()) {
        wc.send('scan-infos-progress', { current, total });
      }
    });
  });

  ipcMain.handle('select-scan-file', async () => {
    const win = windows.getMainWindow();
    const { lastFileLocation } = prefs.getLastPaths();
    const result = await dialog.showOpenDialog(win || null, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: IMAGE_EXT.map(e => e.slice(1)) }],
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
      if (!fs.existsSync(html)) return { ok: false, error: 'strip-preview.html not found' };
      if (!fs.existsSync(preload)) return { ok: false, error: 'strip preload not found' };
      windows.createStripPreviewWindow(preload, html);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err && err.message) || 'open-strip-preview failed' };
    }
  });

  ipcMain.handle('close-strip-preview', () => {
    windows.closeStripPreviewWindow();
  });

  ipcMain.handle('open-output-preview', () => {
    const base = path.join(__dirname, '..');
    const preload = path.join(base, 'preloads', 'output.js');
    const html = path.join(base, 'windows', 'output-preview.html');
    if (!fs.existsSync(html)) return { ok: false, error: 'output-preview.html not found' };
    windows.createOutputPreviewWindow(preload, html);
    return { ok: true };
  });

  ipcMain.handle('open-align-preview', () => {
    try {
      const base = path.join(__dirname, '..');
      const preload = path.join(base, 'preloads', 'align-preview.js');
      const html = path.join(base, 'windows', 'align-preview.html');
      if (!fs.existsSync(html)) return { ok: false, error: 'align-preview.html not found' };
      if (!fs.existsSync(preload)) return { ok: false, error: 'align-preview preload not found' };
      windows.createAlignPreviewWindow(preload, html);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err && err.message) || 'open-align-preview failed' };
    }
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

  /** Verticale referentielijn (strip-overlay) + state: mode + optioneel customK (lijn 0…n). */
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

  ipcMain.handle('arrange-windows', () => {
    const windowArrange = require('./window-arrange');
    windowArrange.arrangeWindows(prefs.getAllSettings().windowArrangement);
    return { ok: true };
  });

  ipcMain.handle('select-video-output-file', async (_, formatId) => {
    const win = windows.getMainWindow();
    const formats = videoExport.getVideoFormats();
    const preset = formats[formatId] || formats.h264;
    const ext = preset.ext;
    const result = await dialog.showSaveDialog(win || null, {
      title: 'Video bestand opslaan',
      defaultPath: `output.${ext}`,
      filters: [{ name: `${ext.toUpperCase()} Video`, extensions: [ext] }]
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('get-temp-video-folder', async () => {
    const dir = path.join(require('os').tmpdir(), `film2frame-video-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  });

  ipcMain.handle('create-video-from-frames', async (_, opts) => {
    const { tempFolder, outputPath, fps, formatId } = opts || {};
    if (!tempFolder || !outputPath) return { ok: false, error: 'Ontbrekende parameters' };
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
      return { ok: false, error: err.message || 'Video maken mislukt' };
    }
  });

  ipcMain.handle('create-video-from-folder', async (_, opts) => {
    const { folderPath, outputPath, fps, formatId } = opts || {};
    if (!folderPath || !outputPath) return { ok: false, error: 'Ontbrekende parameters' };
    try {
      const imagePaths = await project.listImagesInFolder(folderPath);
      if (!imagePaths.length) return { ok: false, error: 'Geen beeldbestanden in deze map' };
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
        onProgress: sendProgress
      });
    } catch (err) {
      return { ok: false, error: err.message || 'Video maken mislukt' };
    }
  });

  ipcMain.handle('check-ffmpeg-available', () => videoExport.checkFfmpegAvailable());
}

module.exports = { registerIPC };
