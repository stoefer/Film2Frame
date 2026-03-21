import fs from 'fs';
let s = fs.readFileSync('renderer/ui.js', 'utf8');
s = s.replace("from './grid.js';", "from './grid.js';");
fs.writeFileSync('renderer/ui.js', s);
