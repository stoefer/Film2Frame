/**
 * Vertalingen in het main-proces (prefs-locale, zelfde JSON als renderer).
 */
const prefs = require('./prefs');
const locales = require('./locales');

/**
 * @param {string} key - zelfde sleutel als in locales/*.json
 * @param {string | Record<string, string|number>} [fallbackOrVars] - fallback string, of bij object: placeholders {var}
 * @param {string} [fallback] - als tweede arg een vars-object is
 */
function tr(key, fallbackOrVars, fallback) {
  if (!key || typeof key !== 'string') return fallback != null ? fallback : '';
  let vars;
  let fb = fallback;
  if (fallbackOrVars != null && typeof fallbackOrVars === 'object' && !Array.isArray(fallbackOrVars)) {
    vars = fallbackOrVars;
  } else {
    fb = fallbackOrVars;
  }
  const loc = prefs.getLocale();
  const primary = locales.loadLocale(loc) || {};
  let s = primary[key];
  if (typeof s !== 'string' || !s.trim()) {
    const en = locales.loadLocale('en') || {};
    s = en[key];
  }
  if (typeof s !== 'string' || !s.trim()) {
    const nl = locales.loadLocale('nl') || {};
    s = nl[key];
  }
  if (typeof s !== 'string' || !s.trim()) return fb != null ? fb : key;
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      s = String(s).replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}

module.exports = { tr };
