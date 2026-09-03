/**
 * Prestatie-log (hoofdproces): één plek voor pad + schrijven van perf-timing.log.
 * Bestand staat in Documenten\Film2Frame (naast de projecten) zodat het goed vindbaar is.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

function getPerfLogPath() {
  try {
    const dir = path.join(app.getPath('documents'), 'Film2Frame');
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    return path.join(dir, 'perf-timing.log');
  } catch (_) {
    return path.join(os.tmpdir(), 'film2frame-perf-timing.log');
  }
}

/** Synchroon schrijven (voor de startregel: garandeert dat het bestand bestaat). */
function appendPerfLineSync(line) {
  try {
    fs.appendFileSync(getPerfLogPath(), (typeof line === 'string' ? line : String(line)) + '\n');
  } catch (_) {}
}

/** Asynchroon schrijven (voor de frequente regels vanuit de renderer). */
function appendPerfLine(line) {
  try {
    fs.appendFile(getPerfLogPath(), (typeof line === 'string' ? line : String(line)) + '\n', () => {});
  } catch (_) {}
}

module.exports = { getPerfLogPath, appendPerfLine, appendPerfLineSync };
