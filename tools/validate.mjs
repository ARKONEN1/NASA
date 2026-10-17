// Method check: where do established analog sites rank, for every target and purpose?
// A meaningful score puts them well above 50 % (the rank of a random place) without being told about them.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, WEB_DATA } from './lib.mjs';
import { PURPOSES, FACTOR_KEYS, buildModel, targetProfile, scoreAll, rankAll, bestCellNear } from '../web/js/model.js';

const meta = JSON.parse(fs.readFileSync(path.join(WEB_DATA, 'earth-meta.json'), 'utf8'));
const bin = fs.readFileSync(path.join(WEB_DATA, 'earth-cells.bin'));
const model = buildModel(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length));
const targets = JSON.parse(fs.readFileSync(path.join(WEB_DATA, 'targets.json'), 'utf8'));
const known = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'curated', 'known-analogs.json'), 'utf8')).sites;

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const lines = [];
const summary = {};
for (const body of ['moon', 'mars']) {
  const sites = known.filter((s) => s.bodies.includes(body));
  lines.push(`\n=== ${body.toUpperCase()} — ${sites.length} known analog sites; median rank (top-10% count) ===`);
  lines.push('target'.padEnd(16) + Object.keys(PURPOSES).map((p) => p.padStart(13)).join(''));
  const all = {};
  for (const t of targets[body]) {
    const prof = targetProfile(model, t);
    let row = t.id.padEnd(16);
    for (const [pid, p] of Object.entries(PURPOSES)) {
      const w = Object.fromEntries(FACTOR_KEYS.map((f) => [f, p.w[f] || 0]));
      const scores = scoreAll(model, prof, w);
      const ranks = rankAll(model, scores);
      const r = sites.map((s) => bestCellNear(model, scores, s.lat, s.lon)).filter((i) => i >= 0).map((i) => ranks[i]);
      (all[pid] ||= []).push(...r);
      row += `${(median(r) * 100).toFixed(0)}% (${r.filter((x) => x >= 0.9).length})`.padStart(13);
    }
    lines.push(row);
  }
  summary[body] = Object.fromEntries(Object.entries(all).map(([p, r]) => [p, +(median(r) * 100).toFixed(1)]));
  lines.push('ALL'.padEnd(16) + Object.keys(PURPOSES).map((p) => `${summary[body][p]}%`.padStart(13)).join(''));
}
console.log(lines.join('\n'));
fs.writeFileSync(path.join(ROOT, 'data', 'build', 'validation.txt'), lines.join('\n') + '\n');
