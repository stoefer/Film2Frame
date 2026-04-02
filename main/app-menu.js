/**
 * Applicatiemenu — o.a. pixel-editor focussen/sluiten (alle platforms; macOS incl. standaard app- en bewerkmenu).
 */
const { Menu } = require('electron');
const locales = require('./locales');
const prefs = require('./prefs');

function menuLabels() {
  const d = locales.loadLocale(prefs.getLocale()) || locales.loadLocale('en') || {};
  return {
    file: d['menu.fileMenu'] || 'File',
    window: d['menu.windowMenu'] || 'Window',
    focusPixelEditor: d['menu.focusPixelEditor'] || 'Focus pixel editor',
    closePixelEditor: d['menu.closePixelEditor'] || 'Close pixel editor'
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

  const windowSubmenu = [
    ...(isMac
      ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }]
      : []),
    {
      label: L.focusPixelEditor,
      click: () => {
        windows.focusPixelEditorWindow();
      }
    },
    {
      label: L.closePixelEditor,
      click: () => {
        windows.closePixelEditorWindow();
      }
    }
  ];

  template.push({
    label: L.window,
    submenu: windowSubmenu
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { applyAppMenu };
