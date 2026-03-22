/**
 * Project acties: aanmaken, openen, bewaren. Roept API aan en werkt state bij.
 */
import {
  getState,
  setProject,
  clearProject,
  getLintStateSnapshot,
  setLintStateForPath,
  applyLintState,
  getLintStateForPath,
  resetGridToDefault
} from './state.js';

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
  if (typeof window.api?.createProject !== 'function') return { ok: false, error: 'API niet beschikbaar' };
  const result = await window.api.createProject(payload);
  if (!result.ok) return result;
  setProject(result.project.path, {
    name: result.project.name,
    location: result.project.location,
    framesPerLint: result.project.framesPerLint,
    numberOfScans: result.project.numberOfScans,
    lintStates: result.project.lintStates || [],
    scanInfos: result.project.scanInfos || [],
    currentLintPath: result.project.currentLintPath ?? null
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
    currentLintPath: p.currentLintPath || null
  });
  if (p.state) applyLintState(p.state);
}

/**
 * Kiest welke scanlint te openen: eerste uit de lijst zonder opgeslagen lintState
 * (nog niet eerder geladen in dit project), anders laatst gebruikte pad, anders de eerste scan.
 */
export function pickResumeLintPath(paths, lintStates, currentLintPath) {
  if (!Array.isArray(paths) || paths.length === 0) return null;
  const saved = new Set(
    (Array.isArray(lintStates) ? lintStates : [])
      .map((e) => e && e.path)
      .filter(Boolean)
  );
  for (const p of paths) {
    if (!saved.has(p)) return p;
  }
  if (currentLintPath && paths.includes(currentLintPath)) return currentLintPath;
  return paths[0];
}

/**
 * Project openen (dialoog in main). Bij succes state vullen.
 */
export async function openProject() {
  if (typeof window.api?.openProject !== 'function') return { ok: false, error: 'API niet beschikbaar' };
  const result = await window.api.openProject();
  if (!result.ok || !result.project) return result;
  applyLoadedProject(result.project);
  return result;
}

/**
 * Project openen via pad (bijv. laatst gebruikt project bij start).
 */
export async function openProjectByPath(projectFolderPath) {
  if (typeof window.api?.openProjectByPath !== 'function') return { ok: false, error: 'API niet beschikbaar' };
  const result = await window.api.openProjectByPath(projectFolderPath);
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

export async function saveProject() {
  const s = getState();
  if (!s.projectPath) return { ok: false, error: 'Geen project geopend' };
  const snapshot = getLintStateSnapshot();
  if (s.path && snapshot) setLintStateForPath(s.path, snapshot);
  if (typeof window.api?.saveProject !== 'function') return { ok: false, error: 'API niet beschikbaar' };
  const result = await window.api.saveProject({
    projectFolderPath: s.projectPath,
    state: snapshot,
    lintStates: s.lintStates,
    currentLintPath: s.path,
    scanInfos: s.projectMeta?.scanInfos,
    filmFormat: s.filmFormat,
    filmPolarity: s.filmPolarity,
    outputFolder: s.exportFolderPath,
    outputFormat: s.outputFormat,
    scanDpi: s.scanDpi
  });
  if (result.ok) {
    s.isDirty = false;
    if (s.projectMeta) {
      s.projectMeta.lintStates = [...s.lintStates];
      s.projectMeta.currentLintPath = s.path || null;
    }
  }
  return result;
}

/**
 * Pas opgeslagen lint-state toe voor een pad (na laden van dat lint).
 */
export function applySavedLintState(lintPath) {
  const snapshot = getLintStateForPath(lintPath);
  if (snapshot) {
    applyLintState(snapshot);
  } else {
    resetGridToDefault();
  }
}

/**
 * Project definitief wissen (map van schijf verwijderen). Vraagt bevestiging in main process.
 * Bij succes wordt de projectstate geleegd.
 */
export async function deleteProject() {
  const path = getState().projectPath;
  if (!path) return { ok: false, error: 'Geen project geopend' };
  if (typeof window.api?.deleteProject !== 'function') return { ok: false, error: 'API niet beschikbaar' };
  const result = await window.api.deleteProject(path);
  if (result.ok) clearProject();
  return result;
}
