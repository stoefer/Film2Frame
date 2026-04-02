/**
 * Project map: lezen/schrijven project.json, hulp voor aantal scans in map, oriëntatie per scan.
 */
const fs = require('fs').promises;
const path = require('path');
const { nativeImage } = require('electron');
const { tr } = require('./main-i18n');

const PROJECT_FILE = 'project.json';
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp']);

function isImageFile(name) {
  return IMAGE_EXT.has(path.extname(name).toLowerCase());
}

/**
 * Lees project uit map. Retourneert null als geen project.json of ongeldig.
 */
async function readProject(projectFolderPath) {
  if (!projectFolderPath) return null;
  const filePath = path.join(projectFolderPath, PROJECT_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return { path: projectFolderPath, ...data };
  } catch {
    return null;
  }
}

/** Max frames per lint (1–99). */
const MAX_FRAMES_PER_LINT = 99;

/**
 * Schrijf project naar map. data = { name, location, framesPerLint, numberOfScans, filmFormat?, outputFolder?, ... }
 */
async function writeProject(projectFolderPath, data) {
  if (!projectFolderPath) throw new Error(tr('ipc.errorNoProjectFolderGiven'));
  await fs.mkdir(projectFolderPath, { recursive: true });
  const now = new Date().toISOString();
  const out = {
    version: 2,
    name: data.name || path.basename(projectFolderPath),
    location: data.location || '',
    framesPerLint: Math.max(1, Math.min(MAX_FRAMES_PER_LINT, Number(data.framesPerLint) || 30)),
    numberOfScans: Math.max(0, Number(data.numberOfScans) || 0),
    created: data.created || now,
    updated: now,
    state: data.state || null,
    lintStates: Array.isArray(data.lintStates) ? data.lintStates : [],
    currentLintPath: data.currentLintPath || null,
    scanInfos: Array.isArray(data.scanInfos) ? data.scanInfos : [],
    filmFormat: data.filmFormat || '16mm-double',
    filmPolarity: data.filmPolarity || 'positief',
    outputFolder: data.outputFolder || null,
    outputFormat: data.outputFormat || 'png',
    scanDpi: data.scanDpi || 4800,
    /** Laatst gekozen scanlint-strip-preset (id uit presets.json), voor dropdown na heropenen project. */
    stripPresetId:
      data.stripPresetId != null && typeof data.stripPresetId === 'string' && data.stripPresetId.trim() !== ''
        ? data.stripPresetId.trim()
        : null,
    /** Map voor PNG’s van de frame-pixel-editor (Vorige/Volgende); niet hetzelfde als frame-exportmap. */
    pixelEditorOutputFolder: data.pixelEditorOutputFolder || null,
    /** Optionele bronmap voor scan-navigatie (pixel-editor / los van project-scanlijst). */
    pixelEditorSourceFolder: data.pixelEditorSourceFolder || null
  };
  const filePath = path.join(projectFolderPath, PROJECT_FILE);
  await fs.writeFile(filePath, JSON.stringify(out, null, 2), 'utf8');
  return out;
}

/**
 * Tel aantal beeldbestanden in een map (niet recursief).
 */
async function countImagesInFolder(folderPath) {
  if (!folderPath) return 0;
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    return entries.filter(e => e.isFile() && isImageFile(e.name)).length;
  } catch {
    return 0;
  }
}

/**
 * Lijst van beeldbestanden in map (volledige paden, niet recursief).
 */
async function listImagesInFolder(folderPath) {
  if (!folderPath) return [];
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile() && isImageFile(e.name))
      .map(e => path.join(folderPath, e.name));
    files.sort();
    return files;
  } catch {
    return [];
  }
}

/**
 * Bepaal per scan de oriëntatie (verticaal/horizontaal) via afmetingen.
 * Langste zijde = hoogte => verticaal; breedte > hoogte => horizontaal (wordt bij laden 90° gedraaid).
 * Retourneert { infos, cancelled }.
 * @param {(current: number, total: number) => void} [onProgress] — current=verwerkte bestanden (0…total), total=aantal beelden
 * @param {() => boolean} [shouldCancel] — true = stoppen en gedeeltelijke infos teruggeven
 */
async function getScanInfos(folderPath, onProgress, shouldCancel) {
  const paths = await listImagesInFolder(folderPath);
  const total = paths.length;
  await new Promise((r) => setImmediate(r));
  if (typeof shouldCancel === 'function' && shouldCancel()) {
    return { infos: [], cancelled: true };
  }
  if (typeof onProgress === 'function') {
    try {
      onProgress(0, total);
    } catch (_) {}
  }
  const infos = [];
  for (let i = 0; i < paths.length; i++) {
    if (i % 5 === 0) {
      await new Promise((r) => setImmediate(r));
    }
    if (typeof shouldCancel === 'function' && shouldCancel()) {
      return { infos, cancelled: true };
    }
    const filePath = paths[i];
    let width = 0;
    let height = 0;
    try {
      const img = nativeImage.createFromPath(filePath);
      if (!img.isEmpty()) {
        const size = img.getSize();
        width = size.width || 0;
        height = size.height || 0;
      }
    } catch (_) {}
    const orientation = width > height ? 'horizontal' : 'vertical';
    infos.push({
      path: filePath,
      name: path.basename(filePath),
      width,
      height,
      orientation
    });
    if (typeof onProgress === 'function') {
      try {
        onProgress(i + 1, total);
      } catch (_) {}
    }
  }
  return { infos, cancelled: false };
}

/**
 * Bepaal het volgende framenummer in de uitvoermap (000001–999999).
 * Bestaande bestanden met patroon baseName_XXXXXX.ext worden niet overschreven; nummering loopt door.
 * @param {string} outputFolder - Pad naar uitvoermap
 * @param {string} baseName - Basis bestandsnaam (bijv. 'frame')
 * @param {string} ext - Extensie zonder punt (bijv. 'png')
 * @returns {Promise<number>} Volgende index (1-based) om te gebruiken
 */
async function getNextFrameNumber(outputFolder, baseName, ext) {
  if (!outputFolder || !baseName) return 1;
  const safeBase = (baseName || 'frame').replace(/[/\\:*?"<>|]/g, '_');
  const suffix = (ext || 'png').toLowerCase().replace(/^\./, '');
  const pattern = new RegExp(`^${escapeRe(safeBase)}_(\\d{1,6})\\.${escapeRe(suffix)}$`, 'i');
  try {
    const entries = await fs.readdir(outputFolder, { withFileTypes: true });
    let maxNum = 0;
    for (const e of entries) {
      if (!e.isFile()) continue;
      const m = e.name.match(pattern);
      if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > maxNum) maxNum = n;
      }
    }
    return Math.min(999999, maxNum + 1);
  } catch {
    return 1;
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  PROJECT_FILE,
  readProject,
  writeProject,
  countImagesInFolder,
  listImagesInFolder,
  getScanInfos,
  getNextFrameNumber
};
