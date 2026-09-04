/**
 * Lichte prestatie-timing voor profilering op echte hardware.
 *
 * Elke meting logt één regel naar de DevTools-console én (via IPC) naar
 * userData/perf-timing.log, zodat je ook zonder DevTools kunt zien welke stap
 * de tijd kost. Standaard AAN in deze build; uit te zetten met:
 *   localStorage.setItem('f2fPerf','0')   (en herladen)  of  window.__f2fPerf = false
 */

/* Standaard uit; wordt aangezet via de instelling "Prestatie-logging" (loadAppSettings → setPerfEnabled).
 * Handmatige override voor power-users kan met window.__f2fPerf = true. */
let enabled = false;

export function isPerfEnabled() {
  if (typeof window !== 'undefined' && window.__f2fPerf === false) return false;
  if (typeof window !== 'undefined' && window.__f2fPerf === true) return true;
  return enabled;
}

export function setPerfEnabled(v) {
  enabled = !!v;
}

function pad2(n) { return String(n).padStart(2, '0'); }
function stamp() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/** Log een enkele meting. `extra` mag key/value-paren bevatten voor sub-stappen. */
export function perfLog(label, ms, extra) {
  if (!isPerfEnabled()) return;
  let line = `[perf] ${stamp()} ${label}: ${ms.toFixed(1)}ms`;
  if (extra && typeof extra === 'object') {
    const parts = Object.keys(extra).map((k) => {
      const v = extra[k];
      return `${k}=${typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : v}`;
    });
    if (parts.length) line += ` | ${parts.join(' ')}`;
  } else if (typeof extra === 'string' && extra) {
    line += ` | ${extra}`;
  }
  try { console.log(line); } catch (_) {}
  try {
    if (typeof window !== 'undefined' && window.api && typeof window.api.appendPerfLog === 'function') {
      window.api.appendPerfLog(line);
    }
  } catch (_) {}
}

/** Meet een synchrone functie. */
export function perfMark(label, fn, extra) {
  if (!isPerfEnabled()) return fn();
  const t = performance.now();
  try {
    return fn();
  } finally {
    perfLog(label, performance.now() - t, extra);
  }
}

/** Meet een async functie. */
export async function perfMarkAsync(label, fn, extra) {
  if (!isPerfEnabled()) return fn();
  const t = performance.now();
  try {
    return await fn();
  } finally {
    perfLog(label, performance.now() - t, extra);
  }
}

/** Handmatige timer: const end = perfStart('x'); …; end({sub: 12}). */
export function perfStart(label) {
  const t = performance.now();
  return (extra) => perfLog(label, performance.now() - t, extra);
}
