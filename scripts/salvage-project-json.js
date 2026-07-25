/**
 * Herstel een afgekapte project.json: behoud complete lintStates-objecten,
 * vul meta uit de kapotte kop / een geldige template.
 *
 * Usage: node scripts/salvage-project-json.js "I:/Film2Scan-Projecten"
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'I:/Film2Scan-Projecten';
const projectPath = path.join(dir, 'project.json');

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '-');
}

function extractField(raw, key) {
  const re = new RegExp(
    '"' + key + '"\\s*:\\s*("(?:\\\\.|[^"\\\\])*"|null|true|false|-?\\d+(?:\\.\\d+)?)'
  );
  const m = raw.match(re);
  if (!m) return undefined;
  try {
    return JSON.parse(m[1]);
  } catch {
    return undefined;
  }
}

function countCompleteLintObjects(raw) {
  const idx = raw.indexOf('"lintStates"');
  if (idx < 0) return { objects: 0, lastCompleteEnd: -1, arrStart: -1 };
  const arrStart = raw.indexOf('[', idx);
  if (arrStart < 0) return { objects: 0, lastCompleteEnd: -1, arrStart: -1 };
  let i = arrStart + 1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let lastCompleteEnd = -1;
  let objects = 0;
  for (; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === '\\') {
        esc = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        lastCompleteEnd = i + 1;
        objects++;
      }
    } else if (c === ']' && depth === 0) {
      break;
    }
  }
  return { objects, lastCompleteEnd, arrStart };
}

function loadJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function pickTemplate(dir) {
  const preferred = [
    'project.salvaged-2026-07-21-06-37-22.json',
    'project.repaired-20260720-064307.json',
    'project - Kopie.json',
    'project.repaired.json'
  ];
  for (const name of preferred) {
    const p = path.join(dir, name);
    const j = loadJsonSafe(p);
    if (j) {
      console.log('template:', name);
      return j;
    }
  }
  // Fallback: newest project.salvaged-*.json
  try {
    const files = fs
      .readdirSync(dir)
      .filter((n) => /^project\.salvaged-.*\.json$/i.test(n))
      .map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const f of files) {
      const j = loadJsonSafe(path.join(dir, f.n));
      if (j) {
        console.log('template (newest salvaged):', f.n);
        return j;
      }
    }
  } catch (_) {}
  return null;
}

function main() {
  if (!fs.existsSync(projectPath)) {
    console.error('Missing', projectPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(projectPath, 'utf8');
  const template = pickTemplate(dir);
  if (!template) {
    console.error('No valid template backup found');
    process.exit(1);
  }

  const { objects, lastCompleteEnd, arrStart } = countCompleteLintObjects(raw);
  console.log('corrupt size', raw.length);
  console.log('complete lintState objects found', objects);

  let salvagedLint = [];
  if (objects > 0 && lastCompleteEnd > arrStart) {
    let body = raw.slice(arrStart + 1, lastCompleteEnd).replace(/[\s,]+$/, '');
    salvagedLint = JSON.parse('[' + body + ']');
  }

  const templateLint = Array.isArray(template.lintStates) ? template.lintStates.length : 0;
  console.log('template lintStates', templateLint);
  console.log('salvaged lintStates', salvagedLint.length);

  // Merge op path: nieuwere/corrupt-salvage wint per pad; template vult ontbrekende aan
  const byPath = new Map();
  const pathOf = (ls) => (ls && (ls.path || ls.lintPath)) || '';
  if (Array.isArray(template.lintStates)) {
    for (const ls of template.lintStates) {
      const p = pathOf(ls);
      if (p) byPath.set(p, ls);
    }
  }
  for (const ls of salvagedLint) {
    const p = pathOf(ls);
    if (p) byPath.set(p, ls); // corrupt/salvage overschrijft (recarder)
  }
  const merged = Array.from(byPath.values());
  // Stabiele volgorde: eerst salvaged-volgorde, dan template-only
  const order = [];
  const seen = new Set();
  for (const ls of salvagedLint) {
    const p = pathOf(ls);
    if (p && !seen.has(p)) {
      order.push(byPath.get(p));
      seen.add(p);
    }
  }
  for (const ls of template.lintStates || []) {
    const p = pathOf(ls);
    if (p && !seen.has(p)) {
      order.push(byPath.get(p));
      seen.add(p);
    }
  }

  const out = { ...template };
  out.lintStates = order.length ? order : merged;
  console.log('merged lintStates', out.lintStates.length);

  const metaKeys = [
    'version',
    'name',
    'location',
    'framesPerLint',
    'numberOfScans',
    'filmFormat',
    'filmPolarity',
    'outputFolder',
    'outputFormat',
    'scanDpi',
    'currentLintPath',
    'stripPresetId',
    'exportFolderPath',
    'exportBaseName'
  ];
  for (const k of metaKeys) {
    const v = extractField(raw, k);
    if (v !== undefined) out[k] = v;
  }

  // Probeer ook root-state deels te redden als die vóór lintStates nog compleet was
  try {
    const stateIdx = raw.indexOf('"state"');
    const lintIdx = raw.indexOf('"lintStates"');
    if (stateIdx >= 0 && lintIdx > stateIdx) {
      const brace = raw.indexOf('{', stateIdx);
      if (brace > 0 && brace < lintIdx) {
        let depth = 0;
        let inStr = false;
        let esc = false;
        let end = -1;
        for (let i = brace; i < lintIdx; i++) {
          const c = raw[i];
          if (inStr) {
            if (esc) {
              esc = false;
              continue;
            }
            if (c === '\\') {
              esc = true;
              continue;
            }
            if (c === '"') inStr = false;
            continue;
          }
          if (c === '"') {
            inStr = true;
            continue;
          }
          if (c === '{') depth++;
          else if (c === '}') {
            depth--;
            if (depth === 0) {
              end = i + 1;
              break;
            }
          }
        }
        if (end > brace) {
          const stateObj = JSON.parse(raw.slice(brace, end));
          out.state = { ...(template.state || {}), ...stateObj };
          console.log('merged root state from corrupt head');
        }
      }
    }
  } catch (e) {
    console.log('state merge skipped:', e.message);
  }

  out.updated = new Date().toISOString();

  const s = stamp();
  const corruptBak = path.join(dir, 'project.corrupt-truncated-' + s + '.json');
  fs.copyFileSync(projectPath, corruptBak);
  console.log('backed up corrupt →', corruptBak);

  const outText = JSON.stringify(out, null, 2);
  // Validate before overwrite
  JSON.parse(outText);

  const salvagedPath = path.join(dir, 'project.salvaged-' + s + '.json');
  fs.writeFileSync(salvagedPath, outText, 'utf8');
  fs.writeFileSync(projectPath, outText, 'utf8');
  console.log('restored project.json');
  console.log('also saved', salvagedPath);
  console.log(
    'result: scans=',
    out.numberOfScans,
    'lintStates=',
    Array.isArray(out.lintStates) ? out.lintStates.length : 0,
    'current=',
    out.currentLintPath || (out.state && out.state.path) || '—',
    'bytes=',
    outText.length
  );
}

main();
