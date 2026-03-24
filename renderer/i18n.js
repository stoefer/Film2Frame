/**
 * i18n – tweetalig (EN/NL) met uitbreiding voor andere talen.
 * Gebruik: t('key'), t('key', { var: value }) voor placeholders.
 */
let dict = {};
let currentLocale = 'nl';

/**
 * Get translation for key. Supports {placeholder} interpolation.
 */
export function t(key, vars) {
  let s = dict[key];
  if (s == null || s === '') return key;
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      s = String(s).replace(new RegExp('\\{' + k + '\\}', 'g'), String(v));
    }
  }
  return s;
}

export function getLocale() {
  return currentLocale;
}

/**
 * Initialize i18n: load translations from main process, apply to DOM.
 * api: { getLocale, getTranslations } (from preload).
 */
export async function init(api) {
  if (!api || !api.getTranslations) {
    dict = {};
    return;
  }
  try {
    currentLocale = (await api.getLocale()) || 'nl';
    const d = await api.getTranslations();
    dict = d && typeof d === 'object' ? d : {};
  } catch (_) {
    dict = {};
  }
  applyToDOM();
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = currentLocale === 'en' ? 'en' : 'nl';
  }
}

/**
 * Set locale, reload translations, re-apply. Requires api with setLocale.
 */
export async function setLocale(api, locale) {
  if (!api || !api.setLocale || !['en', 'nl'].includes(locale)) return;
  await api.setLocale(locale);
  await init(api);
}

/**
 * Apply translations to DOM elements with data-i18n, data-i18n-title, data-i18n-placeholder, data-i18n-aria-label.
 */
export function applyToDOM(root) {
  const el = root || document;
  if (!el.querySelectorAll) return;
  el.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    if (key) node.textContent = t(key);
  });
  el.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    const key = node.getAttribute('data-i18n-placeholder');
    if (key) node.placeholder = t(key);
  });
  el.querySelectorAll('[data-i18n-title]').forEach((node) => {
    const key = node.getAttribute('data-i18n-title');
    if (key) node.title = t(key);
  });
  el.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
    const key = node.getAttribute('data-i18n-aria-label');
    if (key) node.setAttribute('aria-label', t(key));
  });
}
