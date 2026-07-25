/**
 * Modal tijdens het analyseren van een map met scanlinten (nativeImage per bestand kan minuten duren).
 */
import { t } from './i18n.js';

const OVERLAY_ID = 'f2f-scan-folder-overlay';
const BAR_ID = 'f2f-scan-folder-bar';
const COUNT_ID = 'f2f-scan-folder-count';
const DETAIL_ID = 'f2f-scan-folder-detail';
const CANCEL_BTN_ID = 'f2f-scan-folder-cancel';

function el(id) {
  return document.getElementById(id);
}

let cancelClickWired = false;
let scanStartedAtMs = 0;

function wireCancelButtonOnce() {
  if (cancelClickWired) return;
  const btn = el(CANCEL_BTN_ID);
  if (!btn) return;
  cancelClickWired = true;
  btn.addEventListener('click', () => {
    if (typeof window.api?.cancelScanInfos === 'function') window.api.cancelScanInfos();
  });
}

/** IPC/main kan { infos, cancelled } teruggeven; oud gedrag: alleen array. */
function normalizeScanInfosResult(raw) {
  if (Array.isArray(raw)) return { cancelled: false, infos: raw };
  if (raw && typeof raw === 'object' && Array.isArray(raw.infos)) {
    return { cancelled: raw.cancelled === true, infos: raw.infos };
  }
  return { cancelled: false, infos: [] };
}

export function showScanFolderProgressOverlay() {
  wireCancelButtonOnce();
  scanStartedAtMs = Date.now();
  const o = el(OVERLAY_ID);
  if (o) {
    o.classList.remove('hidden');
    o.setAttribute('aria-hidden', 'false');
  }
  const cancelBtn = el(CANCEL_BTN_ID);
  if (cancelBtn) cancelBtn.disabled = false;
  updateScanFolderProgressOverlay(0, 0);
}

export function hideScanFolderProgressOverlay() {
  scanStartedAtMs = 0;
  const o = el(OVERLAY_ID);
  if (o) {
    o.classList.add('hidden');
    o.setAttribute('aria-hidden', 'true');
  }
  const cancelBtn = el(CANCEL_BTN_ID);
  if (cancelBtn) cancelBtn.disabled = true;
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  if (hh > 0) return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * @param {number} current — verwerkt (0…total)
 * @param {number} total — aantal beeldbestanden
 */
export function updateScanFolderProgressOverlay(current, total) {
  const pct = total > 0 ? Math.min(100, Math.round((100 * current) / total)) : 0;
  const bar = el(BAR_ID);
  const cnt = el(COUNT_ID);
  const det = el(DETAIL_ID);
  const elapsedMs = scanStartedAtMs > 0 ? Math.max(0, Date.now() - scanStartedAtMs) : 0;
  const etaMs = total > 0 && current > 0 ? Math.max(0, Math.round(((total - current) * elapsedMs) / current)) : null;
  const elapsedLabel = formatDuration(elapsedMs);
  const remainingLabel = Number.isFinite(etaMs) ? formatDuration(etaMs) : t('scanFolderOverlay.timeUnknown');
  if (bar) bar.style.width = `${pct}%`;
  if (cnt) cnt.textContent = total > 0 ? t('scanFolderOverlay.countFormat', { current, total }) : t('scanFolderOverlay.countPlaceholder');
  if (det) {
    det.textContent =
      total > 0
        ? t('scanFolderOverlay.detailProgressWithEta', { current, total, elapsed: elapsedLabel, remaining: remainingLabel })
        : t('scanFolderOverlay.detailChecking');
  }
}

/**
 * @param {string} folderPath
 * @param {(folderPath: string, onProgress: (d: { current: number, total: number }) => void) => Promise<unknown>} apiGetScanInfos — meestal window.api.getScanInfos
 * @param {(d: { current: number, total: number }) => void} [onProgressExtra] — o.a. toolbar-status bijwerken
 * @returns {Promise<{ cancelled: boolean, infos: object[] }>}
 */
export async function getScanInfosWithProgressOverlay(folderPath, apiGetScanInfos, onProgressExtra) {
  if (!folderPath || typeof apiGetScanInfos !== 'function') {
    return { cancelled: false, infos: [] };
  }
  let overlayVisible = false;
  const onProgress = (d) => {
    const current = Number(d?.current) || 0;
    const total = Number(d?.total) || 0;
    if (total > 0 && !overlayVisible) {
      showScanFolderProgressOverlay();
      overlayVisible = true;
    }
    if (overlayVisible) updateScanFolderProgressOverlay(current, total);
    const elapsedMs = scanStartedAtMs > 0 ? Math.max(0, Date.now() - scanStartedAtMs) : 0;
    const etaMs = total > 0 && current > 0 ? Math.max(0, Math.round(((total - current) * elapsedMs) / current)) : null;
    if (typeof onProgressExtra === 'function') onProgressExtra({ current, total, elapsedMs, etaMs });
  };
  try {
    const raw = await apiGetScanInfos(folderPath, onProgress);
    return normalizeScanInfosResult(raw);
  } finally {
    if (overlayVisible) hideScanFolderProgressOverlay();
  }
}
