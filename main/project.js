/**
 * Project map: lezen/schrijven project.json, hulp voor aantal scans in map, oriëntatie per scan.
 */
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { nativeImage } = require('electron');
const { tr } = require('./main-i18n');

const PROJECT_FILE = 'project.json';
const PROJECT_BAK_FILE = 'project.bak.json';
const PROJECT_BACKUP_DIR = 'project-backups';
/** Minimale tijd tussen gestempelde backups (frequente Auto-saves vullen anders de schijf). */
const PROJECT_BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minuten
/** Bewaar max. aantal gestempelde backups per projectmap. */
const PROJECT_BACKUP_KEEP = 24;
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp']);

/** Laatste gestempelde backup per projectmap (ms). */
const lastStampedBackupAtByFolder = new Map();

function isImageFile(name) {
  return IMAGE_EXT.has(path.extname(name).toLowerCase());
}

function backupStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '-');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFsError(err) {
  const code = err && err.code;
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES' || code === 'EAGAIN';
}

/**
 * Op I:/externe schijven: antivirus of 2× save tegelijk → EBUSY.
 * Kort opnieuw proberen.
 */
async function withFsRetry(fn, opts) {
  const attempts = Math.max(1, Number(opts && opts.attempts) || 8);
  const baseDelay = Math.max(20, Number(opts && opts.baseDelayMs) || 40);
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableFsError(err) || i === attempts - 1) throw err;
      await sleep(baseDelay * (i + 1) + Math.floor(Math.random() * 30));
    }
  }
  throw lastErr;
}

/** Eén write-keten per projectmap; tussentijdse saves worden samengevoegd (laatste wint). */
const projectWriteQueues = new Map();

/**
 * @param {string} projectFolderPath
 * @param {(payload?: any) => Promise<any>} task
 * @param {{ coalesceKey?: string, coalescePayload?: any }} [opts]
 */
function enqueueProjectWrite(projectFolderPath, task, opts) {
  const key = path.resolve(String(projectFolderPath || ''));
  let q = projectWriteQueues.get(key);
  if (!q) {
    q = { pending: null, pumping: false };
    projectWriteQueues.set(key, q);
  }

  const coalesceKey = opts && opts.coalesceKey;
  if (!coalesceKey) {
    // Zeldzaam pad: geen coalesce — serialiseer achter eventuele pending coalesce-write
    return new Promise((resolve, reject) => {
      const run = async () => {
        try {
          while (q.pumping) await sleep(20);
          q.pumping = true;
          try {
            resolve(await task());
          } catch (err) {
            reject(err);
          } finally {
            q.pumping = false;
          }
        } catch (err) {
          reject(err);
        }
      };
      void run();
    });
  }

  return new Promise((resolve, reject) => {
    if (q.pending && q.pending.coalesceKey === coalesceKey) {
      q.pending.payload = opts.coalescePayload;
      q.pending.waiters.push({ resolve, reject });
    } else {
      q.pending = {
        coalesceKey,
        payload: opts.coalescePayload,
        task,
        waiters: [{ resolve, reject }]
      };
    }
    void pumpCoalescedWrites(q);
  });
}

async function pumpCoalescedWrites(q) {
  if (q.pumping) return;
  q.pumping = true;
  try {
    while (q.pending) {
      const job = q.pending;
      q.pending = null;
      try {
        const out = await job.task(job.payload);
        for (const w of job.waiters) w.resolve(out);
      } catch (err) {
        for (const w of job.waiters) w.reject(err);
      }
    }
  } finally {
    q.pumping = false;
    if (q.pending) void pumpCoalescedWrites(q);
  }
}

/** Ruim achtergebleven .project.json.*.tmp op I: op (van crashed/aborted saves). */
async function cleanupStaleProjectTemps(projectFolderPath) {
  try {
    const entries = await fs.readdir(projectFolderPath);
    await Promise.all(
      entries
        .filter((n) => /^\.project\.json\..+\.tmp$/i.test(n))
        .map((n) => fs.unlink(path.join(projectFolderPath, n)).catch(() => {}))
    );
  } catch (_) {}
}

/**
 * Schrijf via lokale temp (snel), daarna 1× copy naar doel (I:).
 * Voorkomt minutenlange retry-loops van 7MB writes direct op trage schijven.
 */
async function writeFileAtomic(filePath, text) {
  const tmpPath = path.join(
    os.tmpdir(),
    `f2f-project-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.tmp`
  );
  await fs.writeFile(tmpPath, text, 'utf8');
  try {
    await withFsRetry(() => fs.copyFile(tmpPath, filePath), { attempts: 6, baseDelayMs: 80 });
  } catch (_) {
    await withFsRetry(() => fs.writeFile(filePath, text, 'utf8'), { attempts: 3, baseDelayMs: 120 });
  }
  try {
    await fs.unlink(tmpPath);
  } catch (_) {}
}

/**
 * Snelle bestands-kopie (geen parse/stringify). Faalt stil als bron ontbreekt.
 */
async function copyFileIfExists(src, dest) {
  try {
    await withFsRetry(() => fs.copyFile(src, dest), { attempts: 5, baseDelayMs: 50 });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Backup: throttled (elke 5 min) copy naar .bak + gestempelde map.
 * Niet bij elke save — op I: kost een 7MB-copy anders seconden per knop.
 */
async function backupProjectFile(projectFolderPath, filePath) {
  try {
    await fs.access(filePath);
  } catch {
    return;
  }

  const now = Date.now();
  const last = lastStampedBackupAtByFolder.get(projectFolderPath) || 0;
  if (now - last < PROJECT_BACKUP_INTERVAL_MS) return;
  lastStampedBackupAtByFolder.set(projectFolderPath, now);

  const bakPath = path.join(projectFolderPath, PROJECT_BAK_FILE);
  await copyFileIfExists(filePath, bakPath);

  const backupDir = path.join(projectFolderPath, PROJECT_BACKUP_DIR);
  try {
    await fs.mkdir(backupDir, { recursive: true });
    const stamped = path.join(backupDir, `project-${backupStamp()}.json`);
    await copyFileIfExists(filePath, stamped);
  } catch (_) {
    return;
  }

  // Oude backups opruimen (nieuwste behouden)
  try {
    const entries = await fs.readdir(backupDir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && /^project-.*\.json$/i.test(e.name))
      .map((e) => ({ name: e.name, full: path.join(backupDir, e.name) }));
    const withStat = [];
    for (const f of files) {
      try {
        const st = await fs.stat(f.full);
        withStat.push({ ...f, mtimeMs: st.mtimeMs });
      } catch (_) {}
    }
    withStat.sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (let i = PROJECT_BACKUP_KEEP; i < withStat.length; i++) {
      try {
        await fs.unlink(withStat[i].full);
      } catch (_) {}
    }
  } catch (_) {}
}

/** Cache meta + zware side-data zodat save niet elke keer 7MB project.json hoeft te parsen. */
const projectMetaCache = new Map();
const projectSideCache = new Map();

function rememberProjectMeta(projectFolderPath, data) {
  if (!projectFolderPath || !data) return;
  projectMetaCache.set(projectFolderPath, {
    name: data.name || path.basename(projectFolderPath),
    created: data.created || null,
    numberOfScans: data.numberOfScans,
    location: data.location,
    scanInfosLen: Array.isArray(data.scanInfos) ? data.scanInfos.length : 0
  });
  projectSideCache.set(projectFolderPath, {
    name: data.name || path.basename(projectFolderPath),
    created: data.created || null,
    location: data.location || '',
    numberOfScans: data.numberOfScans,
    scanInfos: Array.isArray(data.scanInfos) ? data.scanInfos : [],
    stripPresetId: data.stripPresetId ?? null,
    filmFormat: data.filmFormat,
    filmPolarity: data.filmPolarity,
    outputFolder: data.outputFolder,
    outputFormat: data.outputFormat,
    scanDpi: data.scanDpi,
    framesPerLint: data.framesPerLint,
    pixelEditorOutputFolder: data.pixelEditorOutputFolder ?? null,
    pixelEditorSourceFolder: data.pixelEditorSourceFolder ?? null
  });
}

function getProjectSideCache(projectFolderPath) {
  return projectSideCache.get(projectFolderPath) || null;
}

async function getProjectMetaLightweight(projectFolderPath) {
  const cached = projectMetaCache.get(projectFolderPath);
  if (cached) return cached;
  try {
    const full = await readProject(projectFolderPath);
    if (full) {
      rememberProjectMeta(projectFolderPath, full);
      return projectMetaCache.get(projectFolderPath);
    }
  } catch (_) {}
  return null;
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
    rememberProjectMeta(projectFolderPath, data);
    return { path: projectFolderPath, ...data };
  } catch {
    return null;
  }
}

/** Max frames per lint (1–99). */
const MAX_FRAMES_PER_LINT = 99;

/**
 * Schrijf project naar map. data = { name, location, framesPerLint, numberOfScans, filmFormat?, outputFolder?, ... }
 * Meerdere snelle saves → alleen de laatste wordt naar schijf geschreven.
 */
async function writeProject(projectFolderPath, data) {
  if (!projectFolderPath) throw new Error(tr('ipc.errorNoProjectFolderGiven'));
  return enqueueProjectWrite(
    projectFolderPath,
    async (payload) => {
      const d = payload || data;
      await fs.mkdir(projectFolderPath, { recursive: true });
      await cleanupStaleProjectTemps(projectFolderPath);
      const now = new Date().toISOString();
      const out = {
        version: 2,
        name: d.name || path.basename(projectFolderPath),
        location: d.location || '',
        framesPerLint: Math.max(1, Math.min(MAX_FRAMES_PER_LINT, Number(d.framesPerLint) || 30)),
        numberOfScans: Math.max(0, Number(d.numberOfScans) || 0),
        created: d.created || now,
        updated: now,
        state: d.state || null,
        lintStates: Array.isArray(d.lintStates) ? d.lintStates : [],
        currentLintPath: d.currentLintPath || null,
        scanInfos: Array.isArray(d.scanInfos) ? d.scanInfos : [],
        filmFormat: d.filmFormat || '16mm-double',
        filmPolarity: d.filmPolarity || 'positief',
        outputFolder: d.outputFolder || null,
        outputFormat: d.outputFormat || 'png',
        scanDpi: d.scanDpi || 4800,
        stripPresetId:
          d.stripPresetId != null && typeof d.stripPresetId === 'string' && d.stripPresetId.trim() !== ''
            ? d.stripPresetId.trim()
            : null,
        pixelEditorOutputFolder: d.pixelEditorOutputFolder || null,
        pixelEditorSourceFolder: d.pixelEditorSourceFolder || null
      };
      const filePath = path.join(projectFolderPath, PROJECT_FILE);
      await backupProjectFile(projectFolderPath, filePath);
      await writeFileAtomic(filePath, JSON.stringify(out));
      rememberProjectMeta(projectFolderPath, out);
      return out;
    },
    { coalesceKey: 'writeProject', coalescePayload: data }
  );
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
  PROJECT_BAK_FILE,
  PROJECT_BACKUP_DIR,
  PROJECT_BACKUP_INTERVAL_MS,
  PROJECT_BACKUP_KEEP,
  readProject,
  writeProject,
  getProjectMetaLightweight,
  getProjectSideCache,
  countImagesInFolder,
  listImagesInFolder,
  getScanInfos,
  getNextFrameNumber
};
