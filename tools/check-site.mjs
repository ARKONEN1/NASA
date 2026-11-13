// Pre-deploy check: the static site in web/ must have every data file the app loads,
// and each file must fit Cloudflare's 25 MiB per-asset limit.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const WEB = path.join(ROOT, 'web');
const REQUIRED = [
  'index.html', 'css/app.css', 'js/app.js', 'js/model.js', 'js/i18n.js', 'js/extras.js', 'js/stability-worker.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'data/earth-meta.json', 'data/earth-cells.bin', 'data/targets.json', 'data/known-analogs.json',
  'data/places.json', 'data/bodymaps.json', 'data/detail.json', 'data/logistics.json', 'data/life-sites.json', 'docs/en.html', 'docs/uk.html', 'data/basemap-west.jpg', 'data/basemap-east.jpg',
  'data/map-moon.png', 'data/map-mars.png', 'data/map-moon-south.png',
];
const LIMIT = 25 * 1024 * 1024;
let ok = true;
for (const f of REQUIRED) {
  if (!fs.existsSync(path.join(WEB, f))) { console.error('missing', f); ok = false; }
}
const targets = JSON.parse(fs.readFileSync(path.join(WEB, 'data/targets.json'), 'utf8'));
for (const t of [...targets.moon, ...targets.mars]) {
  if (!fs.existsSync(path.join(WEB, 'data/thumbs', `${t.id}.png`))) { console.error('missing thumbnail', t.id); ok = false; }
}
let total = 0, count = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    const size = fs.statSync(p).size;
    total += size; count++;
    if (size > LIMIT) { console.error('too large for Cloudflare assets:', path.relative(WEB, p)); ok = false; }
  }
})(WEB);
console.log(`web/: ${count} files, ${(total / 1e6).toFixed(1)} MB`);
if (!ok) process.exit(1);
console.log('site ready to deploy');
