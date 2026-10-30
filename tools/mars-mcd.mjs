// Mars surface climate from the Mars Climate Database v6 (LMD / Open University / IAA / ESA / CNES),
// through its public web interface: diurnal cycles (24 local hours) of surface temperature, surface
// pressure, 10 m wind and water vapour, plus the dust column optical depth, for 12 seasons
// (Ls 0°, 30°, … 330°), climatology scenario.
// Answers are cached in data/raw/mcd/<site>_<Ls>.txt (climate) and <site>_<Ls>_dod.txt (dust).
import fs from 'node:fs';
import path from 'node:path';
import { RAW, pool, sleep, log } from './lib.mjs';

const DIR = path.join(RAW, 'mcd');
fs.mkdirSync(DIR, { recursive: true });
const BASE = 'https://www-mars.lmd.jussieu.fr/mcd_python/';
export const LS = Array.from({ length: 12 }, (_, k) => k * 30);

const VARS = {
  climate: { var1: 'tsurf', var2: 'ps', var3: 'wind', var4: 'vmr_h2o', expect: 'Surface temperature', suffix: '' },
  dust: { var1: 'dod', var2: 'none', var3: 'none', var4: 'none', expect: 'dust column visible optical depth', suffix: '_dod' },
};

function query(lat, lon, ls, kind) {
  const { var1, var2, var3, var4 } = VARS[kind];
  const p = {
    var1, var2, var3, var4, datekeyhtml: 1, ls, localtime: 'all',
    year: '', month: '', day: '', hours: '', minutes: '', seconds: '', julian: '', martianyear: '', sol: '',
    latitude: lat, longitude: lon, altitude: '10.', zkey: 3, spacecraft: 'none', betatest: 'on', isfixedlt: 'off',
    dust: 1, hrkey: 1, averaging: 'off', zonmean: 'off', diumean: 'off', animation: 'off', animframes: 12, dpi: 80,
    islog: 'off', colorm: 'jet', minval: '', maxval: '', proj: 'cyl', palt: '', plon: '', plat: '', trans: '',
    iswind: 'off', latpoint: '', lonpoint: '',
  };
  return BASE + 'cgi-bin/mcdcgi.py?' + new URLSearchParams(p).toString();
}

async function fetchSeason(id, lat, lon, ls, kind = 'climate') {
  const file = path.join(DIR, `${id}_${ls}${VARS[kind].suffix}.txt`);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const html = await (await fetch(query(lat, lon, ls, kind), { signal: AbortSignal.timeout(180000) })).text();
      const link = html.match(/txt\/[a-f0-9]+\.txt/)?.[0];
      if (!link) throw new Error('no data link');
      const txt = await (await fetch(BASE + link)).text();
      // Guard against the stale default file the server returns when a query fails.
      if (!txt.includes(`Ls ${ls.toFixed(1)}deg`) || !txt.includes(VARS[kind].expect)) throw new Error('unexpected answer');
      fs.writeFileSync(file, txt);
      return txt;
    } catch (e) {
      log('retry', id, ls, e.message);
      await sleep(4000 * (attempt + 1));
    }
  }
  throw new Error(`MCD failed for ${id} Ls ${ls}`);
}

/** Parse the sections of one answer → { 'Surface temperature (K)': [24 values], … }. */
function parse(txt) {
  const out = {};
  let cur = null;
  for (const line of txt.split('\n')) {
    const m = line.match(/Column 2 is (.+)$/);
    if (m) { cur = m[1].trim(); out[cur] = []; continue; }
    if (cur && /^\s+[\d.]/.test(line)) {
      const [h, v] = line.trim().split(/\s+/).map(Number);
      if (h < 24) out[cur].push(v);
    }
  }
  return out;
}

/** Annual climate of a Mars site (same definitions as the Earth cells). */
export async function marsClimate(id, lat, lon) {
  const seasons = [];
  const dusts = [];
  for (const ls of LS) {
    seasons.push(parse(await fetchSeason(id, lat, lon, ls)));
    dusts.push(parse(await fetchSeason(id, lat, lon, ls, 'dust')));
  }
  const key = (s, name) => Object.keys(s).find((k) => k.startsWith(name));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const ts = seasons.map((s) => s[key(s, 'Surface temperature')]);
  const K = 273.15;
  // Water vapour volume mixing ratio → specific humidity in g/kg (H2O 18.015, Mars air ≈ 43.34 g/mol).
  const q = mean(seasons.map((s) => mean(s[key(s, 'Water vapor vol')]))) * (18.015 / 43.34) * 1000;
  return {
    ts_mean: Math.round(mean(ts.map(mean)) - K),
    ts_max: Math.round(mean(ts.map((d) => Math.max(...d))) - K),
    ts_min: Math.round(mean(ts.map((d) => Math.min(...d))) - K),
    pressure: +(mean(seasons.map((s) => mean(s[key(s, 'Surface pressure')]))) / 1000).toFixed(3),
    wind: +mean(seasons.map((s) => mean(s[key(s, 'Horizontal wind')]))).toFixed(1),
    humidity: +q.toFixed(4),
    // annual mean of the dust column optical depth (visible), comparable with Earth's AOD at 550 nm
    dust: +mean(dusts.map((s) => mean(s[key(s, 'Monthly mean dust column')]))).toFixed(3),
  };
}

if (process.argv[1]?.endsWith('mars-mcd.mjs')) {
  const targets = JSON.parse(fs.readFileSync(path.join(path.dirname(RAW), 'curated', 'targets.json'), 'utf8')).mars;
  await pool(targets, 2, async (t) => {
    const c = await marsClimate(t.id, t.lat, t.lon);
    log(t.id.padEnd(13), JSON.stringify(c), 'literature:', JSON.stringify(t.climate));
  });
}
