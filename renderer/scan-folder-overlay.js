/**
 * Modal tijdens het analyseren van een map met scanlinten (nativeImage per bestand kan minuten duren).
 */
import { t } from './i18n.js';

const OVERLAY_ID = 'f2f-scan-folder-overlay';
const BAR_ID = 'f2f-scan-folder-bar';
const COUNT_ID = 'f2f-scan-folder-count';
const DETAIL_ID = 'f2f-scan-folder-detail';

function el(id) {
  return document.getElementById(id);
}

export function showScanFolderProgressOverlay() {
  const o = el(OVERLAY_ID);
  if (o) {
    o.classList.remove('hidden');
    o.setAttribute('aria-hidden', 'false');
  }
  updateScanFolderProgressOverlay(0, 0);
}

export function hideScanFolderProgressOverlay() {
  const o = el(OVERLAY_ID);
  if (o) {
    o.classList.add('hidden');
    o.setAttribute('aria-hidden', 'true');
  }
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
  if (bar) bar.style.width = `${pct}%`;
  if (cnt) cnt.textContent = total > 0 ? t('scanFolderOverlay.countFormat', { current, total }) : t('scanFolderOverlay.countPlaceholder');
  if (det) {
    det.textContent =
      total > 0 ? t('scanFolderOverlay.detailProgress', { current, total }) : t('scanFolderOverlay.detailChecking');
  }
}

/**
 * @param {string} folderPath
 * @param {(infos: object[]) => void | Promise<void>} apiGetScanInfos — meestal window.api.getScanInfos
 * @returns {Promise<object[]>}
 */
/**
 * @param {(d: { current: number, total: number }) => void} [onProgressExtra] — o.a. toolbar-status bijwerken
 */
export async function getScanInfosWithProgressOverlay(folderPath, apiGetScanInfos, onProgressExtra) {
  if (!folderPath || typeof apiGetScanInfos !== 'function') return [];
  let overlayVisible = false;
  const onProgress = (d) => {
    const current = Number(d?.current) || 0;
    const total = Number(d?.total) || 0;
    if (total > 0 && !overlayVisible) {
      showScanFolderProgressOverlay();
      overlayVisible = true;
    }
    if (overlayVisible) updateScanFolderProgressOverlay(current, total);
    if (typeof onProgressExtra === 'function') onProgressExtra(d);
  };
  try {
    const infos = await apiGetScanInfos(folderPath, onProgress);
    return Array.isArray(infos) ? infos : [];
  } finally {
    if (overlayVisible) hideScanFolderProgressOverlay();
  }
}
