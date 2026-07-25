/**
 * Scan strip preview window shortcuts (grid adjustment).
 * Binding: { code: KeyboardEvent.code, ctrl?, shift?, alt?, meta? — true/false when required }
 * Display names: i18n keys in locales (settings.stripShortcut*).
 */

const ACTIONS = [
  { id: 'handLeft', labelKey: 'settings.stripShortcutHandLeft', default: { code: 'ArrowLeft' } },
  { id: 'handRight', labelKey: 'settings.stripShortcutHandRight', default: { code: 'ArrowRight' } },
  { id: 'handUp', labelKey: 'settings.stripShortcutHandUp', default: { code: 'ArrowUp' } },
  { id: 'handDown', labelKey: 'settings.stripShortcutHandDown', default: { code: 'ArrowDown' } },
  {
    id: 'verticalAnchorLineUp',
    labelKey: 'settings.stripShortcutVerticalAnchorLineUp',
    default: { code: 'PageUp' }
  },
  {
    id: 'verticalAnchorLineDown',
    labelKey: 'settings.stripShortcutVerticalAnchorLineDown',
    default: { code: 'PageDown' }
  },
  {
    id: 'jumpFrameMiddle',
    labelKey: 'settings.stripShortcutJumpFrameMiddle',
    default: { code: 'Home', ctrl: false, alt: false, meta: false }
  },
  { id: 'zoomFitWidth', labelKey: 'settings.stripShortcutZoomFitWidth', default: { code: 'NumpadMultiply' } },
  { id: 'zoomFitHeight', labelKey: 'settings.stripShortcutZoomFitHeight', default: { code: 'KeyH' } },
  { id: 'scanPrev', labelKey: 'settings.stripShortcutScanPrev', default: null },
  { id: 'scanNext', labelKey: 'settings.stripShortcutScanNext', default: null },
  {
    id: 'centerGridManual',
    labelKey: 'settings.stripShortcutCenterGrid',
    default: { code: 'KeyC', ctrl: false, shift: false, alt: false, meta: false }
  },
  { id: 'resetGrid', labelKey: 'settings.stripShortcutResetGrid', default: null },
  { id: 'rotate90', labelKey: 'settings.stripShortcutRotate90', default: null }
];

function normalizeBinding(b) {
  if (!b || typeof b !== 'object') return null;
  const code = typeof b.code === 'string' && b.code.trim() ? b.code.trim() : null;
  if (!code) return null;
  const o = { code };
  for (const k of ['ctrl', 'shift', 'alt', 'meta']) {
    if (b[k] === true) o[k] = true;
    if (b[k] === false) o[k] = false;
  }
  return o;
}

/**
 * @param {Record<string, unknown>} user — opgeslagen map actionId -> binding | null
 */
function mergeStripShortcuts(user) {
  const u = user && typeof user === 'object' ? { ...user } : {};
  /* Oude acties (springen actief frame): bindings doorzetten op Lijn # als nieuwe keys nog niet in prefs staan. */
  if (
    !Object.prototype.hasOwnProperty.call(u, 'verticalAnchorLineUp') &&
    Object.prototype.hasOwnProperty.call(u, 'jumpFrameTop')
  ) {
    u.verticalAnchorLineUp = u.jumpFrameTop;
  }
  if (
    !Object.prototype.hasOwnProperty.call(u, 'verticalAnchorLineDown') &&
    Object.prototype.hasOwnProperty.call(u, 'jumpFrameBottom')
  ) {
    u.verticalAnchorLineDown = u.jumpFrameBottom;
  }
  const out = {};
  for (const a of ACTIONS) {
    if (Object.prototype.hasOwnProperty.call(u, a.id)) {
      const raw = u[a.id];
      if (raw === null) {
        out[a.id] = null;
      } else {
        const n = normalizeBinding(raw);
        out[a.id] = n || (a.default ? { ...a.default } : null);
      }
    } else {
      out[a.id] = a.default ? { ...a.default } : null;
    }
  }
  return out;
}

function eventMatchesBinding(e, b) {
  if (!b || !b.code) return false;
  if (e.code !== b.code) return false;
  for (const k of ['ctrl', 'shift', 'alt', 'meta']) {
    if (b[k] === undefined) continue;
    const ek =
      k === 'ctrl' ? e.ctrlKey : k === 'shift' ? e.shiftKey : k === 'alt' ? e.altKey : e.metaKey;
    if (!!ek !== !!b[k]) return false;
  }
  return true;
}

function findActionId(e, bindings) {
  for (const a of ACTIONS) {
    if (eventMatchesBinding(e, bindings[a.id])) return a.id;
  }
  return null;
}

/** Payload voor het scanlint-venster: vaste volgorde + samengevoegde bindingen */
function getPayloadForStrip(user) {
  const bindings = mergeStripShortcuts(user);
  return {
    order: ACTIONS.map((a) => a.id),
    bindings
  };
}

function getShortcutConfigForSettings(user) {
  return {
    actions: ACTIONS.map(({ id, labelKey, default: def }) => ({
      id,
      labelKey,
      default: def ? { ...def } : null
    })),
    bindings: mergeStripShortcuts(user)
  };
}

module.exports = {
  ACTIONS,
  mergeStripShortcuts,
  normalizeBinding,
  eventMatchesBinding,
  findActionId,
  getPayloadForStrip,
  getShortcutConfigForSettings
};
