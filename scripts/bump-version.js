/**
 * Bump build version: YYYYMMDDNNN
 * - Same day: increment NNN (001, 002, …)
 * - New day: set date to today and NNN to 001
 * Run before each build (prebuild) or manually: node scripts/bump-version.js
 */
const fs = require('fs');
const path = require('path');

const versionPath = path.join(__dirname, '..', 'version.json');
const today = new Date();
const dateStr = today.getFullYear() +
  String(today.getMonth() + 1).padStart(2, '0') +
  String(today.getDate()).padStart(2, '0');

let data = { buildVersion: '20260318001' };
if (fs.existsSync(versionPath)) {
  try {
    data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
  } catch (_) {}
}

const current = String(data.buildVersion || '20260318001');
const currentDate = current.length >= 8 ? current.slice(0, 8) : '';
const currentSeq = current.length > 8 ? parseInt(current.slice(8), 10) : 0;
const seq = Number.isFinite(currentSeq) && currentSeq >= 0 ? currentSeq : 0;

let nextVersion;
if (currentDate === dateStr) {
  nextVersion = dateStr + String(seq + 1).padStart(3, '0');
} else {
  nextVersion = dateStr + '001';
}

data.buildVersion = nextVersion;
fs.writeFileSync(versionPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('Build version:', nextVersion);
