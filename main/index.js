/**
 * Film2Frame – main process entry. Alleen app lifecycle + registratie van modules.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const windows = require('./windows');
const { registerIPC } = require('./ipc');

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
  function restorePreviews() {
    if (fs.existsSync(stripHtml) && fs.existsSync(outputHtml)) {
      windows.restorePreviewWindowsIfNeeded(
        path.join(base, 'preloads', 'strip.js'),
        stripHtml,
        path.join(base, 'preloads', 'output.js'),
        outputHtml
      );
    }
  }
  if (mainWin && mainWin.webContents) {
    mainWin.webContents.once('did-finish-load', restorePreviews);
  } else {
    restorePreviews();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
