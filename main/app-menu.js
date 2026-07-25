/**
 * Applicatiemenu voor de vereenvoudigde workflow.
 */
const { Menu } = require('electron');
const locales = require('./locales');
const prefs = require('./prefs');

function menuLabels() {
  const d = locales.loadLocale(prefs.getLocale()) || locales.loadLocale('en') || {};
  return {
    file: d['menu.fileMenu'] || 'File',
    window: d['menu.windowMenu'] || 'Window'
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

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { applyAppMenu };
