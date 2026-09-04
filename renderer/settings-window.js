/**
 * Zelfstandig instellingen-venster (geen gedeelde renderer-state met hoofdvenster).
 */
import { init as initI18n, t, applyToDOM } from './i18n.js';
import { DEFAULT_STRIP_PREVIEW_MAX_DIM, STRIP_PREVIEW_MAX_DIM_OPTIONS } from './constants.js';

const gel = (id) => document.getElementById(id);

const S = {
  settingDpi: 'f2f-setting-dpi',
  settingDefaultFrames: 'f2f-setting-default-frames',
  settingOutputFormat: 'f2f-setting-output-format',
  settingJpgQuality: 'f2f-setting-jpg-quality',
  settingJpgQualityRow: 'f2f-setting-jpg-quality-row',
  settingPreviewRes: 'f2f-setting-preview-res',
  displayProfileFullHdBtn: 'f2f-display-profile-fullhd',
  displayProfileFullHdActive: 'f2f-display-profile-fullhd-active',
  displayProfile4kBtn: 'f2f-display-profile-4k',
  displayProfile4kActive: 'f2f-display-profile-4k-active',
  quickFullHdPresetBtn: 'f2f-quick-fullhd-preset',
  quickResetWorkspaceBtn: 'f2f-quick-reset-workspace',
  settingDarkMode: 'f2f-setting-dark-mode',
  settingCompactUi: 'f2f-setting-compact-ui',
  settingWindowGrid: 'f2f-setting-window-grid',
  settingWindowGridMask: 'f2f-setting-window-grid-mask',
  arrangeMatrix: 'f2f-arrange-matrix',
  arrangeMatrixReset: 'f2f-arrange-matrix-reset',
  autoArrangeGridBtn: 'f2f-auto-arrange-grid',
  applyWindowGridBtn: 'f2f-apply-window-grid',
  settingArrangeAllDisplays: 'f2f-setting-arrange-all-displays',
  settingArrowStepPx: 'f2f-setting-arrow-step-px',
  settingArrowStepShiftPx: 'f2f-setting-arrow-step-shift-px',
  settingPreserveGridOnScanNav: 'f2f-setting-preserve-grid-scan-nav',
  settingPerfLogging: 'f2f-setting-perf-logging',
  stripShortcutsTbody: 'f2f-strip-shortcuts-tbody',
  stripShortcutsResetAll: 'f2f-strip-shortcuts-reset-all',
  arrangeWindowsBtn: 'f2f-arrange-windows',
  settingsSaveBtn: 'f2f-settings-save'
};

let stripShortcutCaptureCleanup = null;
const ACTIVE_LAYOUT_PANELS = new Set([1, 2]);
let settingsWindowsGeometryLocked = false;

/** @type {number[]} */
let matrixPermutation = [1, 2, 3, 4, 5, 6];
let matrixSelectedCellIndex = null;
/** @type {boolean[]} paneel 1–6 */
let matrixPanelMask = [true, true, false, false, false, false];

function parsePanelMaskString(str) {
  const s = String(str || '').replace(/\s/g, '');
  if (s.length !== 6 || !/^[01]+$/.test(s)) return [true, true, false, false, false, false];
  const raw = s.split('').map((c) => c === '1');
  return [
    !!raw[0],
    !!raw[1],
    false,
    false,
    false,
    false
  ];
}

function encodePanelMaskString(mask) {
  const m = Array.isArray(mask) ? mask : [];
  return [
    m[0] ? '1' : '0',
    m[1] ? '1' : '0',
    '0',
    '0',
    '0',
    '0'
  ].join('');
}

/** Slaat venster-keuzemasker direct op in prefs (zonder volledige Instellingen bewaren). */
function persistWindowGridAutoOpenMask() {
  const enc = encodePanelMaskString(matrixPanelMask);
  const h = gel(S.settingWindowGridMask);
  if (h) h.value = enc;
  if (window.api?.setAppSettings) {
    window.api.setAppSettings({ windowGridAutoOpenMask: enc }).catch(() => {});
  }
}

function getMatrixUiMode() {
  const r = document.querySelector('input[name="f2f-matrix-ui-mode"]:checked');
  return r && r.value === 'swap' ? 'swap' : 'pick';
}

function parseWindowGridString(str) {
  const parts = String(str || '')
    .split(',')
    .map((x) => parseInt(String(x).trim(), 10));
  if (parts.length !== 6) return null;
  const s = new Set(parts);
  if (s.size !== 6) return null;
  for (let i = 1; i <= 6; i++) {
    if (!s.has(i)) return null;
  }
  return parts;
}

function applyMatrixUI() {
  const hidden = gel(S.settingWindowGrid);
  if (hidden) hidden.value = matrixPermutation.join(',');
  const hiddenMask = gel(S.settingWindowGridMask);
  if (hiddenMask) hiddenMask.value = encodePanelMaskString(matrixPanelMask);
  const mode = getMatrixUiMode();
  const grid = gel(S.arrangeMatrix);
  if (grid) {
    grid.querySelectorAll('.f2f-arrange-matrix-cell').forEach((btn) => {
      const ci = parseInt(btn.getAttribute('data-cell'), 10);
      const num = btn.querySelector('.f2f-arrange-matrix-num');
      if (num && !Number.isNaN(ci) && ci >= 0 && ci < 6) {
        num.textContent = String(matrixPermutation[ci]);
      }
      const panelId = matrixPermutation[ci];
      const inMask =
        !Number.isNaN(ci) && ci >= 0 && ci < 6 && panelId >= 1 && panelId <= 6
          ? !!matrixPanelMask[panelId - 1]
          : false;
      const isLayoutPanelActive = ACTIVE_LAYOUT_PANELS.has(panelId);
      btn.classList.toggle('f2f-arrange-matrix-cell--not-used', !isLayoutPanelActive);
      if (!isLayoutPanelActive && mode === 'pick') {
        btn.setAttribute('aria-disabled', 'true');
      } else {
        btn.removeAttribute('aria-disabled');
      }
      btn.classList.toggle('f2f-arrange-matrix-cell--auto-open', inMask);
      const swapPick = mode === 'swap' && matrixSelectedCellIndex === ci;
      btn.classList.toggle('f2f-arrange-matrix-cell--swap-pick', swapPick);
    });
  }
}

function setMatrixPermutationFromString(str) {
  const p = parseWindowGridString(str);
  matrixPermutation = p || [1, 2, 3, 4, 5, 6];
  matrixSelectedCellIndex = null;
  applyMatrixUI();
}

function onMatrixCellClick(cellIndex) {
  if (getMatrixUiMode() === 'pick') {
    matrixSelectedCellIndex = null;
    const pid = matrixPermutation[cellIndex];
    if (ACTIVE_LAYOUT_PANELS.has(pid)) {
      matrixPanelMask[pid - 1] = !matrixPanelMask[pid - 1];
    }
    applyMatrixUI();
    persistWindowGridAutoOpenMask();
    return;
  }
  if (matrixSelectedCellIndex === null) {
    matrixSelectedCellIndex = cellIndex;
    applyMatrixUI();
    return;
  }
  if (matrixSelectedCellIndex === cellIndex) {
    matrixSelectedCellIndex = null;
    applyMatrixUI();
    return;
  }
  const a = matrixSelectedCellIndex;
  const b = cellIndex;
  const tmp = matrixPermutation[a];
  matrixPermutation[a] = matrixPermutation[b];
  matrixPermutation[b] = tmp;
  matrixSelectedCellIndex = null;
  applyMatrixUI();
}

function stripCodeToLabel(code) {
  if (!code) return '';
  const map = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    NumpadMultiply: 'Num *',
    NumpadDivide: 'Num /',
    PageUp: 'Page ↑',
    PageDown: 'Page ↓',
    Home: 'Home',
    Space: 'Spatie',
    Enter: 'Enter',
    Escape: 'Esc',
    Tab: 'Tab',
    Backquote: '`',
    BracketLeft: '[',
    BracketRight: ']'
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

function formatStripBindingDisplay(b) {
  if (!b || !b.code) return t('settings.stripShortcutNone');
  const parts = [];
  if (b.ctrl) parts.push('Ctrl');
  if (b.meta) parts.push('Win');
  if (b.alt) parts.push('Alt');
  if (b.shift) parts.push('Shift');
  parts.push(stripCodeToLabel(b.code));
  return parts.join('+');
}

function updateStripShortcutRowBinding(tr, binding) {
  const cell = tr.querySelector('.strip-sc-display');
  if (!cell) return;
  tr._stripBinding = binding === null || binding === undefined ? null : { ...binding };
  cell.textContent =
    tr._stripBinding && tr._stripBinding.code
      ? formatStripBindingDisplay(tr._stripBinding)
      : t('settings.stripShortcutNone');
}

function startStripShortcutCapture(tr) {
  if (stripShortcutCaptureCleanup) stripShortcutCaptureCleanup();
  document.body.classList.add('f2f-strip-sc-capturing');
  tr.classList.add('strip-sc-row-capturing');
  function cleanup() {
    document.body.classList.remove('f2f-strip-sc-capturing');
    tr.classList.remove('strip-sc-row-capturing');
    window.removeEventListener('keydown', onKeyDown, true);
    stripShortcutCaptureCleanup = null;
  }
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
      return;
    }
    const ignoreKeys = ['Shift', 'Control', 'Alt', 'Meta'];
    if (ignoreKeys.includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const b = {
      code: e.code,
      ctrl: !!e.ctrlKey,
      shift: !!e.shiftKey,
      alt: !!e.altKey,
      meta: !!e.metaKey
    };
    if (!b.code) {
      cleanup();
      return;
    }
    updateStripShortcutRowBinding(tr, b);
    cleanup();
  }
  stripShortcutCaptureCleanup = cleanup;
  window.addEventListener('keydown', onKeyDown, true);
}

async function buildStripShortcutsSettingsTable() {
  const tbody = gel(S.stripShortcutsTbody);
  if (!tbody || !window.api?.getStripShortcutConfig) return;
  let cfg;
  try {
    cfg = await window.api.getStripShortcutConfig();
  } catch (_) {
    return;
  }
  if (!cfg || !Array.isArray(cfg.actions)) return;
  tbody.innerHTML = '';
  cfg.actions.forEach((a) => {
    const tr = document.createElement('tr');
    tr.dataset.actionId = a.id;
    const td0 = document.createElement('td');
    td0.textContent = (a.labelKey && t(a.labelKey)) || a.id;
    const td1 = document.createElement('td');
    td1.className = 'strip-sc-display';
    const td2 = document.createElement('td');
    td2.className = 'strip-sc-btns';
    const btnCh = document.createElement('button');
    btnCh.type = 'button';
    btnCh.className = 'btn btn-secondary small';
    btnCh.textContent = t('settings.stripShortcutChangeButton');
    const btnCl = document.createElement('button');
    btnCl.type = 'button';
    btnCl.className = 'btn btn-secondary small';
    btnCl.textContent = t('settings.stripShortcutClearButton');
    btnCh.addEventListener('click', () => startStripShortcutCapture(tr));
    btnCl.addEventListener('click', () => updateStripShortcutRowBinding(tr, null));
    td2.appendChild(btnCh);
    td2.appendChild(document.createTextNode(' '));
    td2.appendChild(btnCl);
    tr.appendChild(td0);
    tr.appendChild(td1);
    tr.appendChild(td2);
    tbody.appendChild(tr);
    const b = cfg.bindings && cfg.bindings[a.id];
    if (b && b.code) {
      updateStripShortcutRowBinding(tr, { ...b });
    } else {
      updateStripShortcutRowBinding(tr, null);
    }
  });
}

function collectStripShortcutsFromSettingsUI() {
  const out = {};
  const tbody = gel(S.stripShortcutsTbody);
  if (!tbody) return out;
  tbody.querySelectorAll('tr[data-action-id]').forEach((tr) => {
    const id = tr.dataset.actionId;
    if (!id) return;
    out[id] = tr._stripBinding == null || !tr._stripBinding.code ? null : { ...tr._stripBinding };
  });
  return out;
}

async function resetAllStripShortcutsToDefaults() {
  const tbody = gel(S.stripShortcutsTbody);
  if (!tbody || !window.api?.getStripShortcutConfig) return;
  let cfg;
  try {
    cfg = await window.api.getStripShortcutConfig();
  } catch (_) {
    return;
  }
  if (!cfg || !Array.isArray(cfg.actions)) return;
  tbody.querySelectorAll('tr[data-action-id]').forEach((tr) => {
    const id = tr.dataset.actionId;
    const a = cfg.actions.find((x) => x.id === id);
    const def = a && a.default && a.default.code ? { ...a.default } : null;
    updateStripShortcutRowBinding(tr, def);
  });
}

function applyTheme(darkMode) {
  if (document.body) {
    document.body.classList.toggle('theme-light', !darkMode);
  }
}

function updateJpgQualityRowVisibility() {
  const fmt = gel(S.settingOutputFormat)?.value;
  const row = gel(S.settingJpgQualityRow);
  if (row) row.hidden = fmt !== 'jpg';
}

function updateDisplayProfileButtons() {
  const v = parseInt(gel(S.settingPreviewRes)?.value, 10);
  const fullHdBtn = gel(S.displayProfileFullHdBtn);
  const k4Btn = gel(S.displayProfile4kBtn);
  const fullHdActive = gel(S.displayProfileFullHdActive);
  const k4Active = gel(S.displayProfile4kActive);
  if (fullHdBtn) fullHdBtn.classList.toggle('btn-display-profile-active', v === 1536);
  if (k4Btn) k4Btn.classList.toggle('btn-display-profile-active', v === 4096);
  if (fullHdActive) fullHdActive.classList.toggle('hidden', v !== 1536);
  if (k4Active) k4Active.classList.toggle('hidden', v !== 4096);
}

async function applyDisplayProfile(profileId) {
  const profile = profileId === '4k' ? { stripPreviewRes: 4096 } : { stripPreviewRes: 1536 };
  const previewEl = gel(S.settingPreviewRes);
  if (previewEl) previewEl.value = String(profile.stripPreviewRes);
  updateDisplayProfileButtons();
  if (window.api?.setAppSettings) {
    await window.api.setAppSettings(profile);
  }
  window.api?.notifySettingsSaved?.();
}

async function applyQuickFullHdPreset() {
  const settings = {
    stripPreviewRes: 1536,
    compactUi: true
  };
  const previewEl = gel(S.settingPreviewRes);
  if (previewEl) previewEl.value = String(settings.stripPreviewRes);
  const compactEl = gel(S.settingCompactUi);
  if (compactEl) compactEl.checked = true;
  updateDisplayProfileButtons();
  if (window.api?.setAppSettings) {
    await window.api.setAppSettings(settings);
  }
  window.api?.notifySettingsSaved?.();
}

async function applyQuickResetWorkspace() {
  const settings = {
    compactUi: false,
    stripPreviewRes: 1536
  };
  const compactEl = gel(S.settingCompactUi);
  if (compactEl) compactEl.checked = false;
  const previewEl = gel(S.settingPreviewRes);
  if (previewEl) previewEl.value = '1536';
  updateDisplayProfileButtons();
  if (window.api?.setAppSettings) {
    await window.api.setAppSettings(settings);
  }
  window.api?.notifySettingsSaved?.();
}

async function loadForm() {
  try {
    const s = await window.api?.getAppSettings?.();
    if (!s || typeof s !== 'object') return;
    const set = (id, value, type = 'value') => {
      const el_ = gel(id);
      if (!el_) return;
      if (type === 'value') el_.value = value;
      else if (type === 'checked') el_.checked = !!value;
    };
    set(S.settingDpi, String(s.scanDpi));
    set(S.settingDefaultFrames, String(s.defaultFramesPerStrip));
    set(S.settingOutputFormat, s.outputFormat === 'jpg' || s.outputFormat === 'jpeg' ? 'jpg' : 'png');
    set(S.settingJpgQuality, String(Math.max(1, Math.min(100, Math.round(Number(s.jpgQuality) || 92)))));
    updateJpgQualityRowVisibility();
    const previewRes = Math.max(512, Math.min(8192, Number(s.stripPreviewRes) || DEFAULT_STRIP_PREVIEW_MAX_DIM));
    set(S.settingPreviewRes, String(previewRes));
    updateDisplayProfileButtons();
    set(S.settingDarkMode, s.darkMode, 'checked');
    set(S.settingCompactUi, !!s.compactUi, 'checked');
    matrixPanelMask = parsePanelMaskString(s.windowGridAutoOpenMask);
    setMatrixPermutationFromString(s.windowGridPermutation || '1,2,3,4,5,6');
    set(S.settingArrangeAllDisplays, !!s.arrangeAcrossAllDisplays, 'checked');
    settingsWindowsGeometryLocked = !!s.windowsGeometryLocked;
    const arrowPx = (s.arrowStepPx != null && Number(s.arrowStepPx) >= 1) ? Math.min(10, Number(s.arrowStepPx)) : 1;
    const arrowShiftPx = (s.arrowStepShiftPx != null && Number(s.arrowStepShiftPx) >= 10) ? Math.min(100, Number(s.arrowStepShiftPx)) : 10;
    set(S.settingArrowStepPx, String(arrowPx));
    set(S.settingArrowStepShiftPx, String(arrowShiftPx));
    set(S.settingPreserveGridOnScanNav, s.preserveGridOnScanNav !== false, 'checked');
    set(S.settingPerfLogging, s.perfLogging === true, 'checked');
    applyTheme(s.darkMode);
    await buildStripShortcutsSettingsTable();
    applyToDOM(document.body);
  } catch (_) {}
}

async function saveForm() {
  const arrowPx = Math.max(1, Math.min(10, parseInt(gel(S.settingArrowStepPx)?.value, 10) || 1));
  const arrowShiftPx = Math.max(10, Math.min(100, parseInt(gel(S.settingArrowStepShiftPx)?.value, 10) || 10));
  const settings = {
    scanDpi: parseInt(gel(S.settingDpi)?.value, 10) || 4800,
    defaultFramesPerStrip: parseInt(gel(S.settingDefaultFrames)?.value, 10) || 30,
    outputFormat: gel(S.settingOutputFormat)?.value === 'jpg' ? 'jpg' : 'png',
    jpgQuality: Math.max(1, Math.min(100, parseInt(gel(S.settingJpgQuality)?.value, 10) || 92)),
    stripPreviewRes: parseInt(gel(S.settingPreviewRes)?.value, 10) || DEFAULT_STRIP_PREVIEW_MAX_DIM,
    darkMode: !!gel(S.settingDarkMode)?.checked,
    compactUi: !!gel(S.settingCompactUi)?.checked,
    windowGridPermutation: gel(S.settingWindowGrid)?.value || '1,2,3,4,5,6',
    windowGridAutoOpenMask: gel(S.settingWindowGridMask)?.value || encodePanelMaskString(matrixPanelMask),
    arrangeAcrossAllDisplays: !!gel(S.settingArrangeAllDisplays)?.checked,
    arrowStepPx: arrowPx,
    arrowStepShiftPx: arrowShiftPx,
    preserveGridOnScanNav: !!gel(S.settingPreserveGridOnScanNav)?.checked,
    perfLogging: !!gel(S.settingPerfLogging)?.checked
  };
  const tbodySc = gel(S.stripShortcutsTbody);
  if (tbodySc && tbodySc.querySelector('tr[data-action-id]')) {
    settings.stripPreviewShortcuts = collectStripShortcutsFromSettingsUI();
  }
  await window.api?.setAppSettings?.(settings);
  applyTheme(settings.darkMode);
  window.api?.notifySettingsSaved?.();
  if (window.api?.arrangeWindows) {
    try {
      await window.api.arrangeWindows();
    } catch (_) {}
  }
}

/** Huidige raster + masker + alle-schermen, zoals in het formulier (voor directe toepassing zonder volledige save). */
function getWindowGridPrefsPayload() {
  return {
    windowGridPermutation: gel(S.settingWindowGrid)?.value || '1,2,3,4,5,6',
    windowGridAutoOpenMask: gel(S.settingWindowGridMask)?.value || encodePanelMaskString(matrixPanelMask),
    arrangeAcrossAllDisplays: !!gel(S.settingArrangeAllDisplays)?.checked
  };
}

async function onArrangeWindows() {
  if (!window.api?.arrangeWindows) return;
  const lockedEl = gel('f2f-setting-windows-geometry-locked');
  const locked = lockedEl ? !!lockedEl.checked : settingsWindowsGeometryLocked;
  await window.api.arrangeWindows({
    windowsGeometryLocked: locked,
    ...getWindowGridPrefsPayload()
  });
}

async function onAutoArrangeFromGrid() {
  if (!window.api?.autoArrangeWindowsFromGrid) return;
  const lockedEl = gel('f2f-setting-windows-geometry-locked');
  const locked = lockedEl ? !!lockedEl.checked : settingsWindowsGeometryLocked;
  const grid = getWindowGridPrefsPayload();
  try {
    await window.api.autoArrangeWindowsFromGrid({
      panelMask: grid.windowGridAutoOpenMask,
      windowsGeometryLocked: locked,
      windowGridPermutation: grid.windowGridPermutation,
      arrangeAcrossAllDisplays: grid.arrangeAcrossAllDisplays
    });
  } catch (_) {}
}

async function boot() {
  await initI18n(window.api);
  await loadForm();
  gel(S.settingOutputFormat)?.addEventListener('change', updateJpgQualityRowVisibility);
  gel(S.settingPreviewRes)?.addEventListener('change', updateDisplayProfileButtons);
  gel(S.displayProfileFullHdBtn)?.addEventListener('click', () => applyDisplayProfile('fullhd').catch(() => {}));
  gel(S.displayProfile4kBtn)?.addEventListener('click', () => applyDisplayProfile('4k').catch(() => {}));
  gel(S.quickFullHdPresetBtn)?.addEventListener('click', () => applyQuickFullHdPreset().catch(() => {}));
  gel(S.quickResetWorkspaceBtn)?.addEventListener('click', () => applyQuickResetWorkspace().catch(() => {}));
  gel(S.arrangeMatrix)?.addEventListener('click', (e) => {
    const btn = e.target.closest('.f2f-arrange-matrix-cell');
    if (!btn || btn.dataset.cell == null) return;
    const ci = parseInt(btn.getAttribute('data-cell'), 10);
    if (!Number.isNaN(ci) && ci >= 0 && ci < 6) onMatrixCellClick(ci);
  });
  gel(S.arrangeMatrixReset)?.addEventListener('click', () => {
    matrixPermutation = [1, 2, 3, 4, 5, 6];
    matrixSelectedCellIndex = null;
    applyMatrixUI();
  });
  document.querySelectorAll('input[name="f2f-matrix-ui-mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      matrixSelectedCellIndex = null;
      applyMatrixUI();
    });
  });
  gel(S.applyWindowGridBtn)?.addEventListener('click', () => onArrangeWindows().catch(() => {}));
  gel(S.autoArrangeGridBtn)?.addEventListener('click', () => onAutoArrangeFromGrid().catch(() => {}));
  gel(S.arrangeWindowsBtn)?.addEventListener('click', () => onArrangeWindows().catch(() => {}));
  gel(S.settingsSaveBtn)?.addEventListener('click', () => saveForm().catch(() => {}));
  gel(S.stripShortcutsResetAll)?.addEventListener('click', () => resetAllStripShortcutsToDefaults().catch(() => {}));
}

boot().catch(() => {});
