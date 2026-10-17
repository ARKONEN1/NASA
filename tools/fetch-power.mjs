// Earth climate: NASA POWER climatology (2001–2025, MERRA-2 0.5° x 0.625°, CERES for UV).
// The regional API allows one parameter per 10° x 10° box, so we walk every box that holds land
// and cache each answer in data/raw/power/<PARAM>_<lat>_<lon>.json (only ANN + 12 months kept).
import fs from 'node:fs';
import path from 'node:path';
import { RAW, pool, sleep, log } from './lib.mjs';
import { POWER_PARAMS } from './power-params.mjs';

const DIR = path.join(RAW, 'power');
fs.mkdirSync(DIR, { recursive: true });

// Land boxes from the ETOPO grid (any cell above sea level).
const etopo = fs.readFileSync(path.join(RAW, 'etopo_2min.i16'));
const g = new Int16Array(etopo.buffer, etopo.byteOffset, etopo.length / 2);
const boxes = [];
for (let la = -90; la < 90; la += 10) {
  for (let lo = -180; lo < 180; lo += 10) {
    let land = false;
    for (let r = (la + 90) * 30; r < (la + 100) * 30 && !land; r += 3)
      for (let c = (lo + 180) * 30; c < (lo + 190) * 30; c += 3)
        if (g[r * 10800 + c] > 0) { land = true; break; }
    if (land) boxes.push([la, lo]);
  }
}
const jobs = [];
for (const p of POWER_PARAMS) for (const [la, lo] of boxes) jobs.push([p, la, lo]);
log(`${boxes.length} land boxes x ${POWER_PARAMS.length} params = ${jobs.length} requests`);

// POWER answers HTTP 429 when pushed; two workers plus a global pause after a 429 keep it happy.
let done = 0, failed = 0, pauseUntil = 0;
async function getPower(url) {
  for (let attempt = 0; attempt < 12; attempt++) {
    while (Date.now() < pauseUntil) await sleep(pauseUntil - Date.now());
    let res;
    try { res = await fetch(url, { signal: AbortSignal.timeout(120000) }); } catch { await sleep(5000); continue; }
    if (res.status === 429) { pauseUntil = Date.now() + 30000 * (attempt + 1); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  throw new Error('gave up after repeated 429/timeouts');
}
const todo = jobs.filter(([p, la, lo]) => !fs.existsSync(path.join(DIR, `${p}_${la}_${lo}.json`)));
done = jobs.length - todo.length;
log(`${todo.length} still to fetch`);
await pool(todo, 2, async ([p, la, lo]) => {
  const file = path.join(DIR, `${p}_${la}_${lo}.json`);
  const url = `https://power.larc.nasa.gov/api/temporal/climatology/regional?parameters=${p}&community=RE` +
    `&latitude-min=${la}&latitude-max=${la + 10}&longitude-min=${lo}&longitude-max=${lo + 10}&format=JSON`;
  try {
    const j = await getPower(url);
    const pts = j.features.map((f) => {
      const [lon, lat] = f.geometry.coordinates;
      const v = f.properties.parameter[p];
      return [lat, lon, v.ANN, ...['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].map((m) => v[m])];
    });
    fs.writeFileSync(file, JSON.stringify(pts));
  } catch (e) {
    failed++;
    log('FAIL', p, la, lo, e.message);
  }
  if (++done % 50 === 0) log(`${done}/${jobs.length} (failed ${failed})`);
});
log(`done ${done}/${jobs.length}, failed ${failed}`);
