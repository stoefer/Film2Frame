/**
 * Buildversie (YYYYMMDDNNN) uit version.json.
 * Bij elke build wordt version.json bijgewerkt door scripts/bump-version.js.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_VERSION = '20260318001';

function getVersionPath() {
  return path.join(__dirname, '..', 'version.json');
}

function getBuildVersion() {
  try {
    const p = getVersionPath();
    if (!fs.existsSync(p)) return DEFAULT_VERSION;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return String(data.buildVersion || DEFAULT_VERSION).trim() || DEFAULT_VERSION;
  } catch (_) {
    return DEFAULT_VERSION;
  }
}

module.exports = { getBuildVersion, getVersionPath };
