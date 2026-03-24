/**
 * Sneltoetsen voor het Scanlint-previewvenster (raster afstellen).
 * Binding: { code: string (KeyboardEvent.code), ctrl?, shift?, alt?, meta? — true/false indien verplicht }
 */

const ACTIONS = [
  { id: 'handLeft', label: 'Hand: een stap naar links', default: { code: 'ArrowLeft' } },
  { id: 'handRight', label: 'Hand: een stap naar rechts', default: { code: 'ArrowRight' } },
  { id: 'handUp', label: 'Hand: een stap omhoog', default: { code: 'ArrowUp' } },
  { id: 'handDown', label: 'Hand: een stap omlaag', default: { code: 'ArrowDown' } },
  {
    id: 'jumpFrameTop',
    label: 'Spring naar boven (actief frame)',
    default: { code: 'PageUp' }
  },
  {
    id: 'jumpFrameBottom',
    label: 'Spring naar onder (actief frame)',
    default: { code: 'PageDown' }
  },
  {
    id: 'jumpFrameMiddle',
    label: 'Spring naar midden (actief frame)',
    default: { code: 'Home', ctrl: false, alt: false, meta: false }
  },
  { id: 'zoomFitWidth', label: 'Zoom: scanlint breedte (venster)', default: { code: 'NumpadMultiply' } },
  { id: 'zoomFitHeight', label: 'Zoom: scanlint hoogte (venster)', default: { code: 'NumpadDivide' } },
  { id: 'scanPrev', label: 'Vorige scanlint', default: null },
  { id: 'scanNext', label: 'Volgende scanlint', default: null },
  { id: 'resetGrid', label: 'Raster reset (standaard)', default: null },
  { id: 'rotate90', label: 'Beeld 90° draaien', default: null }
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
  const u = user && typeof user === 'object' ? user : {};
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
    actions: ACTIONS.map(({ id, label, default: def }) => ({
      id,
      label,
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
