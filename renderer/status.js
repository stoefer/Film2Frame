/**
 * Titeldbalk-status: belasting 0–100% en huidige bewerking.
 * Roept updateStatus(percent, operation) aan vanuit de rest van de app.
 */
const STATUS_LOAD_ID = 'status-load';
const STATUS_BAR_ID = 'status-load-bar';
const STATUS_OPERATION_ID = 'status-operation';

function el(id) {
  return document.getElementById(id);
}

/**
 * @param {number} [percent] 0–100, wordt afgerond; weglaten = geen wijziging
 * @param {string} [operation] Huidige bewerking; weglaten = geen wijziging
 */
export function updateStatus(percent, operation) {
  if (percent !== undefined && percent !== null) {
    const p = Math.max(0, Math.min(100, Math.round(Number(percent))));
    const loadEl = el(STATUS_LOAD_ID);
    const barEl = el(STATUS_BAR_ID);
    if (loadEl) loadEl.textContent = p + '%';
    if (barEl) barEl.style.width = p + '%';
  }
  if (operation !== undefined) {
    const opEl = el(STATUS_OPERATION_ID);
    if (opEl) opEl.textContent = operation === '' || operation == null ? '—' : String(operation);
  }
}

export function setLoad(percent) {
  updateStatus(percent, undefined);
}

export function setOperation(operation) {
  updateStatus(undefined, operation);
}

if (typeof window !== 'undefined') {
  window.updateStatus = updateStatus;
  window.setStatusLoad = setLoad;
  window.setStatusOperation = setOperation;
}
