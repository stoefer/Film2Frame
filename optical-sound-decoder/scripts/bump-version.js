/**
 * Bouwversie: OSD + YYYYMMDD + 3-cijferige teller (bijv. OSD20260330001).
 * Zelfde kalenderdag: teller +1. Nieuwe dag: teller reset naar 000.
 */
const PREFIX = 'OSD';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const versionPath = path.join(root, 'version.json');

const now = new Date();
const y = now.getFullYear();
const mo = String(now.getMonth() + 1).padStart(2, '0');
const da = String(now.getDate()).padStart(2, '0');
const dateStr = `${y}${mo}${da}`;

let seq = 0;
if (fs.existsSync(versionPath)) {
  try {
    const raw = fs.readFileSync(versionPath, 'utf8');
    const prev = JSON.parse(raw);
    const prevDate = String(prev.date || '').replace(/\D/g, '');
    const prevSeq = Number(prev.seq);
    if (prevDate === dateStr && Number.isFinite(prevSeq)) {
      seq = prevSeq + 1;
    }
  } catch (_) {
    seq = 0;
  }
}

const seqStr = seq <= 999 ? String(seq).padStart(3, '0') : String(seq);
const display = `${PREFIX}${dateStr}${seqStr}`;

const out = {
  display,
  date: dateStr,
  seq
};

fs.writeFileSync(versionPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('Buildversie:', display);
