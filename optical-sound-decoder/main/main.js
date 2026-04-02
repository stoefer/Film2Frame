const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { readSession, writeSession, readTemplates, writeTemplates } = require('./paths-store');
const { writeAudioExport, hasFfmpeg } = require('./audio-export');

function readBuildVersionDisplay() {
  try {
    const p = path.join(__dirname, '..', 'version.json');
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw);
    return typeof j.display === 'string' ? j.display : '';
  } catch {
    return '';
  }
}

function getAppIconPath() {
  const root = path.join(__dirname, '..', 'build');
  if (process.platform === 'win32') {
    const ico = path.join(root, 'icon.ico');
    if (fs.existsSync(ico)) return ico;
  }
  const png = path.join(root, 'icon.png');
  if (fs.existsSync(png)) return png;
  return undefined;
}

function createWindow() {
  const icon = getAppIconPath();
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    title: 'Optical Sound Decoder'
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  const ver = readBuildVersionDisplay();
  if (ver) {
    win.setTitle(`Optical Sound Decoder · ${ver}`);
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('get-build-version', () => readBuildVersionDisplay());

ipcMain.handle('select-images', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Afbeeldingen selecteren',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Beeld', extensions: ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp', 'webp'] }
    ]
  });
  if (r.canceled || !r.filePaths?.length) return [];
  return r.filePaths.sort();
});

ipcMain.handle('select-folder', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Map met scanlinten',
    properties: ['openDirectory']
  });
  if (r.canceled || !r.filePaths?.[0]) return null;
  return r.filePaths[0];
});

ipcMain.handle('select-output-folder', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Uitvoermap (samengevoegde audio)',
    properties: ['openDirectory', 'createDirectory']
  });
  if (r.canceled || !r.filePaths?.[0]) return null;
  return r.filePaths[0];
});

ipcMain.handle('select-audacity-executable', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Kies Audacity executable',
    properties: ['openFile'],
    filters: process.platform === 'win32'
      ? [{ name: 'Executable', extensions: ['exe'] }]
      : [{ name: 'Alle bestanden', extensions: ['*'] }]
  });
  if (r.canceled || !r.filePaths?.[0]) return null;
  return r.filePaths[0];
});

ipcMain.handle('open-folder', async (_, folderPath) => {
  if (!folderPath) return { ok: false, error: 'missing' };
  try {
    const cleanFolder = path.resolve(String(folderPath));
    await fs.promises.mkdir(cleanFolder, { recursive: true });
    await shell.openPath(cleanFolder);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('open-in-audacity', async (_, { audacityPath, audioFilePath }) => {
  if (!audacityPath || !audioFilePath) return { ok: false, error: 'missing' };
  try {
    const exe = path.resolve(String(audacityPath));
    const audio = path.resolve(String(audioFilePath));
    await fs.promises.access(exe, fs.constants.F_OK);
    await fs.promises.access(audio, fs.constants.F_OK);
    const child = spawn(exe, [audio], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('build-export-path', async (_, { folderPath, baseName, format }) => {
  if (!folderPath || !baseName) return null;
  const ext = format === 'mp3' ? 'mp3' : 'wav';
  const cleanFolder = path.resolve(String(folderPath));
  await fs.promises.mkdir(cleanFolder, { recursive: true });
  let candidate = path.join(cleanFolder, `${String(baseName)}.${ext}`);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(cleanFolder, `${String(baseName)}-${n}.${ext}`);
    n += 1;
  }
  return candidate;
});

ipcMain.handle('write-audio-to-output-folder', async (_, { folderPath, baseName, buffer, format }) => {
  if (!folderPath || !baseName || !buffer) return { ok: false, error: 'missing' };
  try {
    const ext = format === 'mp3' ? 'mp3' : 'wav';
    const cleanFolder = path.resolve(String(folderPath));
    await fs.promises.mkdir(cleanFolder, { recursive: true });
    let filePath = path.join(cleanFolder, `${String(baseName)}.${ext}`);
    let n = 2;
    while (fs.existsSync(filePath)) {
      filePath = path.join(cleanFolder, `${String(baseName)}-${n}.${ext}`);
      n += 1;
    }
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    await writeAudioExport(buf, filePath, ext);
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('write-output-folder-probe', async (_, { folderPath }) => {
  if (!folderPath) return { ok: false, error: 'missing' };
  try {
    const cleanFolder = path.resolve(String(folderPath));
    await fs.promises.mkdir(cleanFolder, { recursive: true });
    const probePath = path.join(cleanFolder, 'osd-write-test.txt');
    await fs.promises.writeFile(
      probePath,
      `Optical Sound Decoder schrijftest\n${new Date().toISOString()}\nMap: ${cleanFolder}\n`,
      'utf8'
    );
    return { ok: true, folderPath: cleanFolder, probePath };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('save-audio-dialog', async (_, { suggestedName, format }) => {
  const ext = format === 'mp3' ? 'mp3' : 'wav';
  const name = (suggestedName || `optical-track.${ext}`).replace(/\.(wav|mp3)$/i, '') + '.' + ext;
  const r = await dialog.showSaveDialog({
    title: format === 'mp3' ? 'MP3 opslaan' : 'WAV opslaan',
    defaultPath: name,
    filters: [
      { name: 'WAV', extensions: ['wav'] },
      { name: 'MP3', extensions: ['mp3'] }
    ]
  });
  if (r.canceled || !r.filePath) return null;
  let p = r.filePath;
  if (!new RegExp(`\\.${ext}$`, 'i').test(p)) p += '.' + ext;
  return p;
});

ipcMain.handle('write-wav-file', async (_, filePath, buffer) => {
  if (!filePath || !buffer) return { ok: false, error: 'missing' };
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, buf);
  return { ok: true };
});

ipcMain.handle('write-audio-export', async (_, { filePath, buffer, format }) => {
  if (!filePath || !buffer) return { ok: false, error: 'missing' };
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await writeAudioExport(buf, filePath, format === 'mp3' ? 'mp3' : 'wav');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('ffmpeg-available', () => hasFfmpeg());

ipcMain.handle('write-text-file', async (_, filePath, text) => {
  if (!filePath) return { ok: false };
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, text, 'utf8');
  return { ok: true };
});

ipcMain.handle('read-text-file', async (_, filePath) => {
  if (!filePath) return null;
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
});

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp', '.webp']);

ipcMain.handle('list-folder-images', async (_, folderPath) => {
  if (!folderPath) return [];
  try {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase()))
      .map((e) => path.join(folderPath, e.name));
    files.sort();
    return files;
  } catch {
    return [];
  }
});

ipcMain.handle('file-exists', async (_, filePath) => {
  if (!filePath) return false;
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('file-to-url', async (_, filePath) => {
  if (!filePath) return '';
  try {
    return pathToFileURL(filePath).href;
  } catch {
    return '';
  }
});

ipcMain.handle('load-session', () => readSession());

ipcMain.handle('save-session', (_, payload) => {
  try {
    writeSession(payload);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('load-templates', () => readTemplates());

ipcMain.handle('save-templates', (_, list) => {
  try {
    writeTemplates(Array.isArray(list) ? list : []);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
