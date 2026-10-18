// Moon surface temperatures from LRO Diviner (Williams et al. 2017, Global Cumulative Products):
// bolometric brightness temperature binned at 0.5° and 0.25 h of local time, 2009–2015.
// Files are 10° latitude bands of fixed-length ASCII rows (113 bytes), ordered by longitude, then
// latitude (ascending), then 96 local-time bins — so one site's diurnal cycle is 96 contiguous rows
// and can be fetched with an HTTP Range request.
import fs from 'node:fs';
import path from 'node:path';
import { RAW, log } from './lib.mjs';

const BASE = 'https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gcp/';
const ROW = 113, NLT = 96, NLAT = 20;
const DIR = path.join(RAW, 'diviner');
fs.mkdirSync(DIR, { recursive: true });

function bandName(lat) {
  const lo = Math.floor(lat / 10) * 10, hi = lo + 10;
  const f = (v) => `${String(Math.abs(v)).padStart(2, '0')}${v < 0 || (v === 0 && lo < 0) ? 's' : 'n'}`;
  return lo < 0 ? `${f(lo)}${f(hi)}` : `${f(lo)}${f(hi)}`;
}

async function diurnal(lat, lon) {
  const lo = Math.floor(lat / 10) * 10;
  const band = bandName(lat);
  const j = Math.floor((lat - lo) / 0.5), i = Math.floor((((lon + 180) % 360 + 360) % 360) / 0.5);
  const file = path.join(DIR, `${band}_${i}_${j}.txt`);
  if (!fs.existsSync(file)) {
    const start = ROW * (1 + (i * NLAT + j) * NLT);
    const res = await fetch(`${BASE}global_cumul_avg_cyl_${band}_002.tab`, { headers: { Range: `bytes=${start}-${start + ROW * NLT - 1}` } });
    if (res.status !== 206) throw new Error(`Diviner ${band}: HTTP ${res.status}`);
    fs.writeFileSync(file, await res.text());
  }
  return fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => {
    const c = l.split(',').map(Number);
    return { lon: c[0], lat: c[1], lt: c[2], tbol: c[10] };
  });
}

/** Mean, mean-of-max and min of the diurnal cycle (°C) over the 3 x 3 cells (1.5°) around a site. */
export async function moonClimate(lat, lon) {
  const curves = [];
  for (const dLat of [-0.5, 0, 0.5])
    for (const dLon of [-0.5, 0, 0.5]) {
      const la = lat + dLat;
      if (la <= -90 || la >= 90) continue;
      const rows = await diurnal(la, lon + dLon);
      if (Math.abs(rows[0].lat - (Math.floor(la * 2) / 2 + 0.25)) > 0.01) throw new Error(`Diviner row mismatch at ${la},${lon + dLon}: got ${rows[0].lat}`);
      curves.push(rows.map((r) => r.tbol));
    }
  // Average the cells per local-time bin (ignoring empty bins), then summarise the diurnal cycle.
  const raw = [];
  for (let k = 0; k < NLT; k++) {
    const v = curves.map((c) => c[k]).filter((x) => x > 0);
    raw.push(v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
  }
  // Fill local-time gaps by linear interpolation around the (circular) day, so missing hours do
  // not bias the daily mean.
  const have = raw.map((v, k) => (Number.isFinite(v) ? k : -1)).filter((k) => k >= 0);
  const cycle = raw.map((v, k) => {
    if (Number.isFinite(v)) return v;
    const prev = [...have].reverse().find((h) => h < k) ?? have[have.length - 1] - NLT;
    const next = have.find((h) => h > k) ?? have[0] + NLT;
    const a = raw[(prev + NLT) % NLT], b = raw[next % NLT];
    return a + ((b - a) * (k - prev)) / (next - prev);
  });
  const K = 273.15;
  const mean = cycle.reduce((a, b) => a + b, 0) / cycle.length;
  return {
    ts_mean: Math.round(mean - K), ts_max: Math.round(Math.max(...cycle) - K), ts_min: Math.round(Math.min(...cycle) - K),
    bins: cycle.length, cells: curves.length,
  };
}

// Run directly: print the Diviner climate for every Moon target.
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('moon-diviner.mjs')) {
  const targets = JSON.parse(fs.readFileSync(path.join(path.dirname(RAW), 'curated', 'targets.json'), 'utf8')).moon;
  for (const t of targets) log(t.id.padEnd(12), JSON.stringify(await moonClimate(t.lat, t.lon)), 'literature:', JSON.stringify({ m: t.climate.ts_mean, x: t.climate.ts_max, n: t.climate.ts_min }));
}
