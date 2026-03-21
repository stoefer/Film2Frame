/**
 * Presets – opslaan/laden van instellingen (filmformaat, raster, frames, etc.) in userData.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const PRESETS_FILENAME = 'presets.json';

function getPresetsPath() {
  try {
    return path.join(app.getPath('userData'), PRESETS_FILENAME);
  } catch (_) {
    return null;
  }
}

function readPresets() {
  const p = getPresetsPath();
  if (!p || !fs.existsSync(p)) return [];
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function writePresets(presets) {
  const p = getPresetsPath();
  if (!p) return;
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(presets, null, 2), 'utf8');
  } catch (_) {}
}

function savePreset(name, data) {
  if (!name || typeof name !== 'string') return { ok: false, error: 'Geen naam' };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Geen naam' };
  const presets = readPresets();
  const existing = presets.findIndex(p => p.name === trimmed);
  const entry = {
    id: existing >= 0 ? presets[existing].id : `preset_${Date.now()}`,
    name: trimmed,
    updated: new Date().toISOString(),
    data: data || {}
  };
  if (existing >= 0) presets[existing] = entry;
  else presets.push(entry);
  writePresets(presets);
  return { ok: true, preset: entry };
}

function loadPreset(id) {
  const presets = readPresets();
  const found = presets.find(p => p.id === id || p.name === id);
  return found ? found.data : null;
}

function deletePreset(id) {
  const presets = readPresets().filter(p => p.id !== id && p.name !== id);
  writePresets(presets);
  return { ok: true };
}

function listPresets() {
  return readPresets().map(p => ({ id: p.id, name: p.name, updated: p.updated }));
}

module.exports = {
  listPresets,
  savePreset,
  loadPreset,
  deletePreset
};
