const path = require('path');
const fs = require('fs');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getStoreDir() {
  const { app } = require('electron');
  const d = path.join(app.getPath('userData'), 'optical-sound-decoder');
  ensureDir(d);
  return d;
}

function sessionFilePath() {
  return path.join(getStoreDir(), 'session.json');
}

function templatesFilePath() {
  return path.join(getStoreDir(), 'templates.json');
}

function readSession() {
  const p = sessionFilePath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

function writeSession(data) {
  const p = sessionFilePath();
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function readTemplates() {
  const p = templatesFilePath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeTemplates(list) {
  const p = templatesFilePath();
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(list, null, 2), 'utf8');
}

module.exports = {
  readSession,
  writeSession,
  readTemplates,
  writeTemplates,
  getStoreDir
};
