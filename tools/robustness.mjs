// Robustness of every top-10 list: for each site x purpose, the share of 60 perturbed re-scorings in
// which each top-10 place stays in the top 1 % of Earth's land. Output: data/build/robustness.json + summary.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, WEB_DATA } from './lib.mjs';
import { PURPOSES, FACTOR_KEYS, buildModel, targetProfile, scoreAll, topSites, stabilityRunner } from '../web/js/model.js';

const meta = JSON.parse(fs.readFileSync(path.join(WEB_DATA, 'earth-meta.json'), 'utf8'));
const bin = fs.readFileSync(path.join(WEB_DATA, 'earth-cells.bin'));
const model = buildModel(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length));
const targets = JSON.parse(fs.readFileSync(path.join(WEB_DATA, 'targets.json'), 'utf8'));
const out = [];
for (const body of ['moon', 'mars'])
  for (const t of targets[body]) {
    const prof = targetProfile(model, t);
    for (const [pid, p] of Object.entries(PURPOSES)) {
      const w = Object.fromEntries(FACTOR_KEYS.map((f) => [f, p.w[f] || 0]));
      const tops = topSites(model, scoreAll(model, prof, w), 10, 400);
      const r = stabilityRunner(model, prof, w, tops);
      while (!r.step());
      const res = r.result();
      out.push({ body, target: t.id, purpose: pid, stability: tops.map((i) => +res.get(i).toFixed(3)) });
    }
  }
const all = out.flatMap((o) => o.stability);
const share = (x) => (100 * all.filter((v) => v >= x).length) / all.length;
const firsts = out.map((o) => o.stability[0]);
const summary = {
  lists: out.length, places: all.length,
  robust90: +share(0.9).toFixed(1), robust100: +share(1).toFixed(1),
  firstPlaceRobust90: +((100 * firsts.filter((v) => v >= 0.9).length) / firsts.length).toFixed(1),
  median: all.sort((a, b) => a - b)[Math.floor(all.length / 2)],
};
fs.writeFileSync(path.join(ROOT, 'data', 'build', 'robustness.json'), JSON.stringify({ summary, out }, null, 1));
console.log(JSON.stringify(summary));
