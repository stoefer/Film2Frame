const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'renderer', 'ui.js');
let s = fs.readFileSync(filePath, 'utf8');

// onWidthNarrow: use effectiveX
s = s.replace(
  /const next = clampGridOffsetX\(frameWidth, s\.gridOffsetX \+ step\);/,
  'const effectiveX = getEffectiveGridOffsetX(frameWidth);\n  const next = clampGridOffsetX(frameWidth, effectiveX + step);'
);

// onWidthWiden: use effectiveX and allow past 75%
s = s.replace(
  /const next = clampGridOffsetX\(frameWidth, Math\.max\(0, s\.gridOffsetX - step\)\);/,
  'const effectiveX = getEffectiveGridOffsetX(frameWidth);\n  const next = clampGridOffsetX(frameWidth, Math.max(0, effectiveX - step));'
);

fs.writeFileSync(filePath, s);
console.log('Done');
