/**
 * Project acties: aanmaken, openen, bewaren. Roept API aan en werkt state bij.
 */
import {
  getState,
  setProject,
  clearProject,
  resetWorkspaceAfterCloseProject,
  getLintStateSnapshot,
  setLintStateForPath,
  applyLintState,
  getLintStateForPath,
  resetGridToDefault,
  setFilmFormat,
  setFilmPolarity,
  setNumFrames,
  setOutputFormat,
  setScanDpi
} from './state.js';
import { restoreFramePaintOverlaysFromSerialized } from './frame-pixel-overlay-persist.js';
import { t } from './i18n.js';
import { perfLog } from './perf.js';

export function hasProject() {
  return !!getState().projectPath;
}

export function getProjectMeta() {
  return getState().projectMeta;
}

export function getProjectPath() {
  return getState().projectPath;
}

export function isDirty() {
  return getState().isDirty;
}

/**
 * Nieuw project aanmaken. payload = { projectFolderPath, name, location, framesPerLint, numberOfScans }.
 * Retourneert { ok, error?, project? }.
 */
export async function createProject(payload) {
  if (typeof window.api?.createProject !== 'function') return { ok: false, error: t('errors.apiUnavailable') };
  const result = await window.api.createProject(payload);
  if (!result.ok) return result;
  setProject(result.project.path, {
    name: result.project.name,
    location: result.project.location,
    framesPerLint: result.project.framesPerLint,
    numberOfScans: result.project.numberOfScans,
    lintStates: result.project.lintStates || [],
    scanInfos: result.project.scanInfos || [],
    currentLintPath: result.project.currentLintPath ?? null,
    stripPresetId: result.project.stripPresetId ?? null
  });
  return result;
}

function applyLoadedProject(p) {
  setProject(p.path, {
    name: p.name,
    location: p.location,
    framesPerLint: p.framesPerLint,
    numberOfScans: p.numberOfScans,
    lintStates: p.lintStates || [],
    scanInfos: p.scanInfos || [],
    filmFormat: p.filmFormat,
    filmPolarity: p.filmPolarity,
    outputFolder: p.outputFolder,
    outputFormat: p.outputFormat,
    scanDpi: p.scanDpi,
    currentLintPath: p.currentLintPath || null,
    stripPresetId: p.stripPresetId ?? null,
    pixelEditorOutputFolder: p.pixelEditorOutputFolder ?? null,
    pixelEditorSourceFolder: p.pixelEditorSourceFolder ?? null
  });
  if (p.state) applyLintState(p.state);
}

/**
 * Kiest welke scanlint te openen na project laden:
 * 1) Laatst actieve lint (currentLintPath) als die nog in de lijst staat — hervat waar u stopte.
 * 2) Anders eerste scan zonder opgeslagen lintState (nieuwe linten in project).
 * 3) Anders eerste scan in de lijst.
 */
export function pickResumeLintPath(paths, lintStates, currentLintPath) {
  if (!Array.isArray(paths) || paths.length === 0) return null;
  if (currentLintPath && paths.includes(currentLintPath)) return currentLintPath;
  const saved = new Set(
    (Array.isArray(lintStates) ? lintStates : [])
      .map((e) => e && e.path)
      .filter(Boolean)
  );
  for (const p of paths) {
    if (!saved.has(p)) return p;
  }
  return paths[0];
}

/**
 * Project openen (dialoog in main). Bij succes state vullen.
 */
export async function openProject() {
  if (typeof window.api?.openProject !== 'function') return { ok: false, error: t('errors.apiUnavailable') };
  const result = await window.api.openProject();
  if (!result.ok || !result.project) return result;
  applyLoadedProject(result.project);
  return result;
}

/**
 * Project openen via pad (bijv. laatst gebruikt project bij start).
 */
export async function openProjectByPath(projectFolderPath) {
  if (typeof window.api?.openProjectByPath !== 'function') return { ok: false, error: t('errors.apiUnavailable') };
  const result = await window.api.openProjectByPath(projectFolderPath);
  if (!result.ok || !result.project) return result;
  applyLoadedProject(result.project);
  return result;
}

/** Open project door project.json te kiezen (map = map waarin dat bestand staat). */
export async function openProjectFromFile() {
  if (typeof window.api?.openProjectFile !== 'function') return { ok: false, error: t('errors.apiUnavailable') };
  const result = await window.api.openProjectFile();
  if (!result.ok || !result.project) return result;
  applyLoadedProject(result.project);
  return result;
}

/**
 * Huidige wijzigingen bewaren in project.
 */
/**
 * Houdt lintStates gelijk met de live state van het huidige scanlint.
 * Zo gaan nieuwe raster-/lint-aanpassingen niet verloren bij wisselen of automatisch bewaren,
 * ook als er al een oudere invoer voor dit lint in het project stond.
 */
export function persistCurrentLintStateInProject() {
  if (!hasProject()) return;
  const s = getState();
  if (!s.path) return;
  const snapshot = getLintStateSnapshot();
  if (snapshot) setLintStateForPath(s.path, snapshot);
}

/**
 * Debounced schijf-opslag van project.json. De in-memory lint-states blijven altijd actueel
 * (persistCurrentLintStateInProject); alleen de zware serialisatie + schijfschrijf wordt uitgesteld en
 * samengevoegd, zodat snel achter elkaar navigeren (Vorige/Volgende) niet elke keer seconden kost.
 */
let pendingSaveTimer = null;
let pendingSaveOpts = null;
let pendingSaveResolvers = [];

export function scheduleProjectSave(opts = {}, delayMs = 1200) {
  if (!hasProject()) return;
  // Zwaarste optie wint als er meerdere in de wachtrij staan.
  pendingSaveOpts = { ...(pendingSaveOpts || {}), ...(opts || {}) };
  if (pendingSaveTimer) clearTimeout(pendingSaveTimer);
  pendingSaveTimer = setTimeout(() => {
    void flushPendingProjectSave();
  }, Math.max(0, Number(delayMs) || 0));
}

export function hasPendingProjectSave() {
  return pendingSaveTimer != null || pendingSaveOpts != null;
}

/** Annuleer een uitgestelde opslag zonder te schrijven (bv. wanneer een expliciete saveProject alles al wegschrijft). */
export function cancelPendingProjectSave() {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }
  pendingSaveOpts = null;
  pendingSaveResolvers = [];
}

/** Voer een uitgestelde opslag nu uit (bv. bij afsluiten, projectwissel, of vóór export). */
export async function flushPendingProjectSave() {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }
  if (pendingSaveOpts == null) return { ok: true, skipped: true };
  const opts = pendingSaveOpts;
  pendingSaveOpts = null;
  const resolvers = pendingSaveResolvers;
  pendingSaveResolvers = [];
  let result = { ok: false };
  try {
    result = await saveProject(opts);
  } catch (e) {
    result = { ok: false, error: e && e.message ? e.message : String(e) };
  }
  resolvers.forEach((r) => { try { r(result); } catch (_) {} });
  return result;
}

export async function saveProject(opts = {}) {
  const s = getState();
  if (!s.projectPath) return { ok: false, error: t('ipc.errorNoProjectOpen') };
  const snapshot = getLintStateSnapshot();
  const framesPerLint = Math.max(1, Math.min(99, Math.round(Number(s.numFrames) || 30)));
  if (s.path && snapshot) setLintStateForPath(s.path, snapshot);
  const lintStatesOut = s.lintStates.map((e) => {
    if (!e || typeof e !== 'object') return e;
    const { framePaintOverlays: _fp, ...rest } = e;
    return rest;
  });
  if (typeof window.api?.saveProject !== 'function') return { ok: false, error: t('errors.apiUnavailable') };
  const includeScanInfos = opts.includeScanInfos === true;
  const tSave = performance.now();
  const result = await window.api.saveProject({
    projectFolderPath: s.projectPath,
    state: snapshot,
    lintStates: lintStatesOut,
    currentLintPath: s.path,
    location: s.projectMeta?.location,
    framesPerLint,
    // scanInfos alleen meesturen als ze vernieuwd zijn — anders main-cache (scheelt MB's IPC)
    scanInfos: includeScanInfos ? (s.projectMeta?.scanInfos || []) : undefined,
    filmFormat: s.filmFormat,
    filmPolarity: s.filmPolarity,
    outputFolder: s.exportFolderPath,
    outputFormat: s.outputFormat,
    jpgQuality: s.jpgQuality,
    scanDpi: s.scanDpi,
    stripPresetId: s.projectMeta?.stripPresetId ?? null,
    pixelEditorOutputFolder: s.pixelEditorOutputFolder || null,
    pixelEditorSourceFolder: s.pixelEditorSourceFolder || null
  });
  perfLog('saveProject (project.json)', performance.now() - tSave, 'scans=' + (s.lintStates ? s.lintStates.length : 0));
  if (result.ok) {
    s.isDirty = false;
    if (s.projectMeta) {
      s.projectMeta.framesPerLint = framesPerLint;
      s.projectMeta.lintStates = [...s.lintStates];
      s.projectMeta.currentLintPath = s.path || null;
      s.projectMeta.pixelEditorOutputFolder = s.pixelEditorOutputFolder || null;
      s.projectMeta.pixelEditorSourceFolder = s.pixelEditorSourceFolder || null;
    }
  }
  return result;
}

/**
 * Pas opgeslagen lint-state toe voor een pad (na laden van dat lint).
 * Als het project een stripPresetId heeft: eerst die preset laden (zelfde als “Laden” in Scanlint),
 * daarna de opgeslagen lint-state — zo staan raster + rotatie/spiegeling gelijk aan de preset tot
 * waar het project per-lint data heeft. Zonder opgeslagen lint wordt alleen de preset gebruikt.
 */
export async function applySavedLintState(lintPath) {
  const snapshot = getLintStateForPath(lintPath);
  const presetId = getState().projectMeta?.stripPresetId;
  let presetApplied = false;
  if (presetId && typeof presetId === 'string' && presetId.trim() !== '' && typeof window.api?.presetLoad === 'function') {
    try {
      const data = await window.api.presetLoad(presetId.trim());
      if (data) {
        applyLintState(data);
        if (data.filmFormat) setFilmFormat(data.filmFormat);
        if (data.filmPolarity) setFilmPolarity(data.filmPolarity);
        if (data.numFrames != null) setNumFrames(data.numFrames);
        if (data.outputFormat) setOutputFormat(data.outputFormat);
        if (data.scanDpi != null) setScanDpi(data.scanDpi);
        presetApplied = true;
      }
    } catch (_) {
      /* preset ontbreekt of IPC-fout: gewoon door met snapshot/reset */
    }
  }
  if (snapshot) {
    applyLintState(snapshot);
  } else if (!presetApplied) {
    resetGridToDefault();
  }
  /* Pixel-edits niet meer uit project.json; alleen sessie + PNG via pixel-editor. */
  await restoreFramePaintOverlaysFromSerialized(null);
}

/** Huidig project ontladen en werkruimte resetten (geen map wissen). */
export function closeCurrentProject() {
  resetWorkspaceAfterCloseProject();
}

/**
 * Project definitief wissen (map van schijf verwijderen). Vraagt bevestiging in main process.
 * Bij succes wordt de projectstate geleegd.
 */
export async function deleteProject() {
  const path = getState().projectPath;
  if (!path) return { ok: false, error: t('ipc.errorNoProjectOpen') };
  if (typeof window.api?.deleteProject !== 'function') return { ok: false, error: t('errors.apiUnavailable') };
  const result = await window.api.deleteProject(path);
  if (result.ok) clearProject();
  return result;
}
