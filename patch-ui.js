const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'renderer', 'ui.js');
let s = fs.readFileSync(filePath, 'utf8');

s = s.replace(
  "import { getFrameDimensions } from './grid.js';",
  "import { getFrameDimensions, getEffectiveGridOffsetX, getDefaultGridOffsetX } from './grid.js';"
);

s = s.replace(
  `function onWidthNarrow() {
  const canvas = getStripCanvas();
  const { frameWidth } = getFrameDimensions(canvas);
  if (frameWidth < 1) return;
  const s = getState();
  const step = Math.max(1, Math.round(frameWidth * GRID_STEP_PERCENT));
  const next = clampGridOffsetX(frameWidth, s.gridOffsetX + step);
  setGridOffset(next, s.gridOffsetY);
  setDirty();
  updateUI();
  refreshPreviews();
}`,
  `function onWidthNarrow() {
  const canvas = getStripCanvas();
  const { frameWidth } = getFrameDimensions(canvas);
  if (frameWidth < 1) {
    if (el(ids.loadLint)) el(ids.loadLint).focus();
    return;
  }
  const s = getState();
  const step = Math.max(1, Math.round(frameWidth * GRID_STEP_PERCENT));
  const effectiveX = getEffectiveGridOffsetX(frameWidth);
  const next = clampGridOffsetX(frameWidth, effectiveX + step);
  setGridOffset(next, s.gridOffsetY);
  setDirty();
  updateUI();
  refreshPreviews();
}`
);

s = s.replace(
  `function onWidthWiden() {
  const canvas = getStripCanvas();
  const { frameWidth } = getFrameDimensions(canvas);
  if (frameWidth < 1) return;
  const s = getState();
  const step = Math.max(1, Math.round(frameWidth * GRID_STEP_PERCENT));
  const next = clampGridOffsetX(frameWidth, Math.max(0, s.gridOffsetX - step));
  setGridOffset(next, s.gridOffsetY);
  setDirty();
  updateUI();
  refreshPreviews();
}`,
  `function onWidthWiden() {
  const canvas = getStripCanvas();
  const { frameWidth } = getFrameDimensions(canvas);
  if (frameWidth < 1) {
    if (el(ids.loadLint)) el(ids.loadLint).focus();
    return;
  }
  const s = getState();
  const step = Math.max(1, Math.round(frameWidth * GRID_STEP_PERCENT));
  const effectiveX = getEffectiveGridOffsetX(frameWidth);
  const next = clampGridOffsetX(frameWidth, Math.max(0, effectiveX - step));
  setGridOffset(next, s.gridOffsetY);
  setDirty();
  updateUI();
  refreshPreviews();
}`
);

s = s.replace(
  `function onVerticalPush() {
  const canvas = getStripCanvas();
  const { frameHeight } = getFrameDimensions(canvas);
  if (frameHeight < 1) return;
`,
  `function onVerticalPush() {
  const canvas = getStripCanvas();
  const { frameHeight } = getFrameDimensions(canvas);
  if (frameHeight < 1) {
    if (el(ids.loadLint)) el(ids.loadLint).focus();
    return;
  }
`
);

s = s.replace(
  `function onVerticalStretch() {
  const canvas = getStripCanvas();
  const { frameHeight } = getFrameDimensions(canvas);
  if (frameHeight < 1) return;
`,
  `function onVerticalStretch() {
  const canvas = getStripCanvas();
  const { frameHeight } = getFrameDimensions(canvas);
  if (frameHeight < 1) {
    if (el(ids.loadLint)) el(ids.loadLint).focus();
    return;
  }
`
);

fs.writeFileSync(filePath, s);
console.log('Patched renderer/ui.js');
