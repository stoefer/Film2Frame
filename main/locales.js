/**
 * Loads translation JSON from app's locales folder.
 * Extensible: add en.json, nl.json, de.json, etc.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const SUPPORTED = ['en', 'nl'];

function getLocalesPath() {
  return path.join(app.getAppPath(), 'locales');
}

function loadLocale(locale) {
  const code = SUPPORTED.includes(locale) ? locale : 'en';
  const p = path.join(getLocalesPath(), code + '.json');
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function getSupportedLocales() {
  return [...SUPPORTED];
}

module.exports = { loadLocale, getSupportedLocales };
