/**
 * Raster-presets – alleen grid-geometrie (offsets, marges, referentielijn), in userData.
 * Los van strip-presets (presets.json) die volledige lint-state bewaren.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const FILENAME = 'grid-presets.json';

function getPath() {
  try {
    return path.join(app.getPath('userData'), FILENAME);
  } catch (_) {
    return null;
  }
}

function readAll() {
  const p = getPath();
  if (!p || !fs.existsSync(p)) return [];
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function writeAll(presets) {
  const p = getPath();
  if (!p) return;
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(presets, null, 2), 'utf8');
  } catch (_) {}
}

function saveGridPreset(name, grid) {
  if (!name || typeof name !== 'string') return { ok: false, error: 'Geen naam' };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Geen naam' };
  const presets = readAll();
  const existing = presets.findIndex((p) => p.name === trimmed);
  const entry = {
    id: existing >= 0 ? presets[existing].id : `gp_${Date.now()}`,
    name: trimmed,
    updated: new Date().toISOString(),
    v: 1,
    grid: grid && typeof grid === 'object' ? grid : {}
  };
  if (existing >= 0) presets[existing] = entry;
  else presets.push(entry);
  writeAll(presets);
  return { ok: true, preset: entry };
}

function loadGridPreset(id) {
  const presets = readAll();
  const found = presets.find((p) => p.id === id || p.name === id);
  return found && found.grid ? found.grid : null;
}

function deleteGridPreset(id) {
  const presets = readAll().filter((p) => p.id !== id && p.name !== id);
  writeAll(presets);
  return { ok: true };
}

function listGridPresets() {
  return readAll().map((p) => ({ id: p.id, name: p.name, updated: p.updated }));
}

module.exports = {
  listGridPresets,
  saveGridPreset,
  loadGridPreset,
  deleteGridPreset
};
