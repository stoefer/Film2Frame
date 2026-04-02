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
const { applyAppMenu } = require('./app-menu');

app.whenReady().then(() => {
  try {
    const projectsDir = path.join(app.getPath('documents'), 'Film2Frame', 'Projects');
    fs.mkdirSync(projectsDir, { recursive: true });
  } catch (_) {}
  const preload = path.join(__dirname, '..', 'preload.js');
  windows.createMainWindow(preload);
  registerIPC();
  applyAppMenu(windows);
  const mainWin = windows.getMainWindow();
  function openAuxWindowsFromSavedMask() {
    windows.openAuxiliaryWindowsFromPanelMask(prefs.getAllSettings().windowGridAutoOpenMask);
  }
  function maybeAutoArrange() {
    try {
      if (prefs.getAllSettings().arrangeWindowsOnStartup) {
        windowArrange.arrangeWindows();
      }
    } catch (_) {}
  }
  if (mainWin && mainWin.webContents) {
    mainWin.webContents.once('did-finish-load', () => {
      openAuxWindowsFromSavedMask();
      /* Hulpvensters moeten bestaan; korte vertraging na openen. */
      setTimeout(() => {
        maybeAutoArrange();
        windows.applyWindowGeometryLockFromPrefs();
      }, 450);
    });
  } else {
    openAuxWindowsFromSavedMask();
    setTimeout(() => {
      maybeAutoArrange();
      windows.applyWindowGeometryLockFromPrefs();
    }, 450);
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
