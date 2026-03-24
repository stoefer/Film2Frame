/**
 * Film2Frame – main process entry. Alleen app lifecycle + registratie van modules.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const windows = require('./windows');
const { registerIPC } = require('./ipc');
const prefs = require('./prefs');
const windowArrange = require('./window-arrange');

app.whenReady().then(() => {
  try {
    const projectsDir = path.join(app.getPath('documents'), 'Film2Frame', 'Projects');
    fs.mkdirSync(projectsDir, { recursive: true });
  } catch (_) {}
  const preload = path.join(__dirname, '..', 'preload.js');
  windows.createMainWindow(preload);
  registerIPC();
  const mainWin = windows.getMainWindow();
  const base = path.join(__dirname, '..');
  const stripHtml = path.join(base, 'windows', 'strip-preview.html');
  const outputHtml = path.join(base, 'windows', 'output-preview.html');
  const alignHtml = path.join(base, 'windows', 'align-preview.html');
  function restorePreviews() {
    if (fs.existsSync(stripHtml) && fs.existsSync(outputHtml)) {
      windows.restorePreviewWindowsIfNeeded(
        path.join(base, 'preloads', 'strip.js'),
        stripHtml,
        path.join(base, 'preloads', 'output.js'),
        outputHtml,
        fs.existsSync(alignHtml) ? path.join(base, 'preloads', 'align-preview.js') : null,
        fs.existsSync(alignHtml) ? alignHtml : null
      );
    }
  }
  function maybeAutoArrange() {
    try {
      if (prefs.getAllSettings().arrangeWindowsOnStartup) {
        windowArrange.arrangeWindows(prefs.getAllSettings().windowArrangement);
      }
    } catch (_) {}
  }
  if (mainWin && mainWin.webContents) {
    mainWin.webContents.once('did-finish-load', () => {
      restorePreviews();
      /* Preview-vensters moeten bestaan; korte vertraging na restore. */
      setTimeout(maybeAutoArrange, 450);
    });
  } else {
    restorePreviews();
    setTimeout(maybeAutoArrange, 450);
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
