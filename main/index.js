/**
 * Film2Frame – main process entry. Alleen app lifecycle + registratie van modules.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const windows = require('./windows');
const { registerIPC } = require('./ipc');
const windowArrange = require('./window-arrange');
const { applyAppMenu } = require('./app-menu');
const prefs = require('./prefs');
const perfLog = require('./perf-log');

app.whenReady().then(() => {
  try {
    const projectsDir = path.join(app.getPath('documents'), 'Film2Frame', 'Projects');
    fs.mkdirSync(projectsDir, { recursive: true });
  } catch (_) {}
  /* Startregel alleen schrijven als prestatie-logging aanstaat (instelling); garandeert dan dat het bestand bestaat. */
  try {
    if (prefs.getAllSettings && prefs.getAllSettings().perfLogging) {
      perfLog.appendPerfLineSync('[perf] === Film2Frame gestart ' + new Date().toISOString() + ' — logbestand: ' + perfLog.getPerfLogPath() + ' ===');
    }
  } catch (_) {}
  const preload = path.join(__dirname, '..', 'preload.js');
  windows.createMainWindow(preload);
  registerIPC();
  applyAppMenu(windows);
  const mainWin = windows.getMainWindow();
  function openAuxWindowsDefault() {
    const s = prefs.getAllSettings();
    const mask = windows.parsePanelOpenMask6(s.windowGridAutoOpenMask || '000000');
    // Zwevende preview alleen auto-openen als die voorkeur expliciet AAN staat.
    if (s.stripPreviewFloating !== true) mask[1] = false;
    windows.openAuxiliaryWindowsFromPanelMask(mask);
  }
  function maybeAutoArrange() {
    try {
      if (prefs.getAllSettings().arrangeWindowsOnStartup) {
        windowArrange.arrangeWindows();
      }
    } catch (_) {}
  }
  function openAuxAfterEulaIfNeeded() {
    if (!prefs.isEulaAccepted()) return;
    openAuxWindowsDefault();
    setTimeout(() => {
      maybeAutoArrange();
      windows.applyWindowGeometryLockFromPrefs();
    }, 450);
  }
  if (mainWin && mainWin.webContents) {
    mainWin.webContents.once('did-finish-load', () => {
      openAuxAfterEulaIfNeeded();
    });
  } else {
    openAuxAfterEulaIfNeeded();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
