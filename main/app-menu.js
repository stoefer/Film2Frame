/**
 * Applicatiemenu voor de vereenvoudigde workflow.
 */
const { Menu, shell } = require('electron');
const locales = require('./locales');
const prefs = require('./prefs');
const perfLog = require('./perf-log');

function menuLabels() {
  const d = locales.loadLocale(prefs.getLocale()) || locales.loadLocale('en') || {};
  return {
    file: d['menu.fileMenu'] || 'File',
    window: d['menu.windowMenu'] || 'Window',
    perf: d['menu.perfMenu'] || 'Prestatie-log',
    perfOpen: d['menu.perfOpen'] || 'Open logbestand',
    perfShow: d['menu.perfShow'] || 'Toon in map'
  };
}

/**
 * @param {typeof import('./windows')} windows
 */
function applyAppMenu(windows) {
  const L = menuLabels();
  const isMac = process.platform === 'darwin';

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [];

  if (isMac) {
    template.push({ role: 'appMenu' });
    template.push({
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    });
  } else {
    template.push({
      label: L.file,
      submenu: [{ role: 'quit' }]
    });
  }

  const windowSubmenu = isMac ? [{ role: 'minimize' }, { role: 'zoom' }] : [];

  template.push({
    label: L.window,
    submenu: windowSubmenu
  });

  /* Prestatie-log: rechtstreeks openen/tonen, zodat het bestand niet handmatig gezocht hoeft te worden. */
  template.push({
    label: L.perf,
    submenu: [
      {
        label: L.perfOpen,
        click: () => { try { shell.openPath(perfLog.getPerfLogPath()); } catch (_) {} }
      },
      {
        label: L.perfShow,
        click: () => { try { shell.showItemInFolder(perfLog.getPerfLogPath()); } catch (_) {} }
      }
    ]
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { applyAppMenu };
