// Method check: where do established analog sites rank, for every target and purpose?
// Two numbers per body x purpose, over all targets of that body:
//   median rank of the known sites (50 % = a random place), and
//   ROC AUC: probability that a known site ranks above a random land place given the same
//   "best cell within 60 km" treatment (0.5 = chance, 1 = perfect).
// Reported for the original 19 sites ("core") and for all 31 ("all").
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, WEB_DATA } from './lib.mjs';
import { PURPOSES, FACTOR_KEYS, buildModel, targetProfile, scoreAll, rankAll, randomLandPoints, ranksNear, aucOf } from '../web/js/model.js';

const meta = JSON.parse(fs.readFileSync(path.join(WEB_DATA, 'earth-meta.json'), 'utf8'));
const bin = fs.readFileSync(path.join(WEB_DATA, 'earth-cells.bin'));
const model = buildModel(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length));
const targets = JSON.parse(fs.readFileSync(path.join(WEB_DATA, 'targets.json'), 'utf8'));
const known = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'curated', 'known-analogs.json'), 'utf8')).sites;
const randomPts = randomLandPoints(model, 400);

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pctf = (x) => `${(x * 100).toFixed(1)}%`;
const lines = [], summary = {};
for (const body of ['moon', 'mars']) {
  const sets = { core: known.filter((s) => s.bodies.includes(body) && s.set === 'core'), all: known.filter((s) => s.bodies.includes(body)) };
  lines.push(`\n=== ${body.toUpperCase()} — ${sets.core.length} core / ${sets.all.length} all known sites ===`);
  lines.push('purpose'.padEnd(10) + ['median core', 'AUC core', 'median all', 'AUC all'].map((h) => h.padStart(13)).join(''));
  summary[body] = {};
  for (const [pid, p] of Object.entries(PURPOSES)) {
    const w = Object.fromEntries(FACTOR_KEYS.map((f) => [f, p.w[f] || 0]));
    const acc = { core: { r: [], auc: [] }, all: { r: [], auc: [] } };
    for (const t of targets[body]) {
      const scores = scoreAll(model, targetProfile(model, t), w);
      const ranks = rankAll(model, scores);
      const rnd = ranksNear(model, scores, ranks, randomPts);
      for (const [k, list] of Object.entries(sets)) {
        const kr = ranksNear(model, scores, ranks, list.map((s) => [s.lat, s.lon]));
        acc[k].r.push(...kr);
        acc[k].auc.push(aucOf(kr, rnd));
      }
    }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const row = { medianCore: median(acc.core.r), aucCore: mean(acc.core.auc), medianAll: median(acc.all.r), aucAll: mean(acc.all.auc) };
    summary[body][pid] = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, +v.toFixed(3)]));
    lines.push(pid.padEnd(10) + [pctf(row.medianCore), row.aucCore.toFixed(2), pctf(row.medianAll), row.aucAll.toFixed(2)].map((x) => x.padStart(13)).join(''));
  }
}
console.log(lines.join('\n'));
fs.writeFileSync(path.join(ROOT, 'data', 'build', 'validation.txt'), lines.join('\n') + '\n');
fs.writeFileSync(path.join(ROOT, 'data', 'build', 'validation.json'), JSON.stringify(summary, null, 1));
