// Moon and Mars targets: measure terrain at each site from the global DEMs and merge with
// the curated climate/geology values. Output: web/data/targets.json
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, RAW, WEB_DATA, log } from './lib.mjs';
import { PNG } from 'pngjs';
import { makeDem, terrainAt, detailAt } from './terrain.mjs';
import { moon64Sampler } from './moon64.mjs';
import { moonClimate } from './moon-diviner.mjs';
import { marsClimate } from './mars-mcd.mjs';
import { moonSouthPolar } from './moon-polar.mjs';
import { ensureMars128, mars128Sampler } from './mars128.mjs';

// Both products: 16 px/deg, 2880 x 5760, row 0 at the north edge, column 0 at 0°E (pixel centres at 1/32°).
function pdsDem(file, { littleEndian, scale }) {
  const buf = fs.readFileSync(path.join(RAW, file));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.length);
  const cols = 5760;
  return makeDem({
    rows: 2880, cols, lat0: 90 - 1 / 32, dLat: -1 / 16, lon0: 1 / 32, dLon: 1 / 16,
    get: (r, c) => dv.getInt16((r * cols + c) * 2, littleEndian) * scale,
  });
}

// South of 75.5°S the Moon uses the 240 m polar-stereographic LOLA grid, which keeps the
// Artemis candidate areas sharp instead of the smeared rows of the cylindrical grid.
function moonDem() {
  const cyl = pdsDem('moon_ldem_16.img', { littleEndian: true, scale: 0.5 });
  const polar = moonSouthPolar({ sx: 1, sy: -1 });
  return (lat, lon) => (lat < -75.5 ? polar(lat, lon) : cyl(lat, lon));
}

export const BODIES = {
  moon: { radiusKm: 1737.4, dem: moonDem,
          demSource: 'LRO LOLA LDEM_16 and, south of 75.5°S, LDEM_75S_240M (PDS Geosciences Node)' },
  mars: { radiusKm: 3389.5, dem: () => pdsDem('mars_megt_16.img', { littleEndian: false, scale: 1 }),
          demSource: 'MGS MOLA MEGDR, 16 px/deg globally and 128 px/deg around each site (PDS Geosciences Node)' },
};

// Shaded-relief thumbnail: SIZE km square around the site, north up, light from the north-west.
const THUMB_PX = 256, THUMB_KM = 150;
const D2R = Math.PI / 180;
function hillshade(sample, lat, lon, radiusKm, file) {
  const n = THUMB_PX, step = THUMB_KM / n, z = new Float64Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = (i - n / 2) * step, y = (n / 2 - j) * step;
      const rho = Math.hypot(x, y), c = rho / radiusKm, p1 = lat * D2R;
      let la = lat, lo = lon;
      if (rho > 0) {
        la = Math.asin(Math.cos(c) * Math.sin(p1) + (y * Math.sin(c) * Math.cos(p1)) / rho) / D2R;
        lo = lon + Math.atan2(x * Math.sin(c), rho * Math.cos(p1) * Math.cos(c) - y * Math.sin(p1) * Math.sin(c)) / D2R;
      }
      z[j * n + i] = sample(la, lo);
    }
  let zmin = Infinity, zmax = -Infinity;
  for (const v of z) { zmin = Math.min(zmin, v); zmax = Math.max(zmax, v); }
  const png = new PNG({ width: n, height: n });
  const az = 315 * D2R, alt = 40 * D2R, cell = step * 1000, exag = 3;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const at = (a, b) => z[Math.min(n - 1, Math.max(0, b)) * n + Math.min(n - 1, Math.max(0, a))];
      const dzdx = ((at(i + 1, j) - at(i - 1, j)) / (2 * cell)) * exag;
      const dzdy = ((at(i, j - 1) - at(i, j + 1)) / (2 * cell)) * exag;
      const slope = Math.atan(Math.hypot(dzdx, dzdy)), aspect = Math.atan2(dzdy, -dzdx);
      const shade = Math.max(0, Math.cos(alt) * Math.cos(slope) + Math.sin(alt) * Math.sin(slope) * Math.cos(az - aspect - Math.PI / 2));
      const h = (z[j * n + i] - zmin) / Math.max(1, zmax - zmin);
      const v = Math.round(255 * Math.min(1, 0.12 + 0.68 * shade + 0.2 * h));
      const k = (j * n + i) * 4;
      png.data[k] = v; png.data[k + 1] = v; png.data[k + 2] = v; png.data[k + 3] = 255;
    }
  fs.writeFileSync(file, PNG.sync.write(png));
}

const curated = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'curated', 'targets.json'), 'utf8'));
const THUMBS = path.join(WEB_DATA, 'thumbs');
fs.mkdirSync(THUMBS, { recursive: true });
const out = {};
for (const [body, cfg] of Object.entries(BODIES)) {
  const global = cfg.dem();
  out[body] = [];
  for (const t of curated[body]) {
    let sample = global;
    if (body === 'mars') {
      // 128 px/deg band around the site (the 150 km thumbnail's corners reach ~1.8° away).
      const local = mars128Sampler(await ensureMars128(t.id, t.lat, t.lon, 1.9));
      sample = (la, lo) => { const v = local(la, lo); return Number.isFinite(v) ? v : global(la, lo); };
    }
    hillshade(sample, t.lat, t.lon, cfg.radiusKm, path.join(THUMBS, `${t.id}.png`));
    const terr = terrainAt(sample, t.lat, t.lon, cfg.radiusKm);
    log(body, t.id.padEnd(14), `relief ${terr.relief.toFixed(0)} m  slope ${terr.slope.toFixed(2)}°  elev ${terr.elev.toFixed(0)} m`);
    // Landing-ellipse scale (0.48 km): Mars from the 128 px/deg band, the Moon from the 240 m polar
    // grid near the pole and LDEM_64 (474 m) elsewhere.
    let fine = sample;
    if (body === 'moon' && t.lat >= -75.5) {
      const m64 = await moon64Sampler(t.id, t.lat);
      fine = (la, lo) => { const v = m64(la, lo); return Number.isFinite(v) ? v : sample(la, lo); };
    }
    const detail = detailAt(fine, t.lat, t.lon, cfg.radiusKm);
    log('   detail', JSON.stringify(detail));
    // Surface climate from data: LRO Diviner (Moon) and the Mars Climate Database (Mars). No rain falls
    // on either body; the Moon has no air; surface UV is beyond any Earth value on both.
    const c = body === 'moon' ? await moonClimate(t.lat, t.lon) : await marsClimate(t.id, t.lat, t.lon);
    const climate = body === 'moon'
      ? { ts_mean: c.ts_mean, ts_max: c.ts_max, ts_min: c.ts_min, precip: 0, humidity: 0, pressure: 0, uv: 20, wind: null }
      : { ts_mean: c.ts_mean, ts_max: c.ts_max, ts_min: c.ts_min, precip: 0, humidity: c.humidity, pressure: c.pressure, uv: 20, wind: c.wind };
    log('   climate', JSON.stringify(climate));
    out[body].push({ ...t, climate, climateLiterature: t.climate, terrain: { relief: +terr.relief.toFixed(1), slope: +terr.slope.toFixed(3), elev: Math.round(terr.elev) }, detail });
  }
}
fs.writeFileSync(path.join(WEB_DATA, 'targets.json'), JSON.stringify({
  sources: {
    moon: BODIES.moon.demSource, mars: BODIES.mars.demSource,
    moonClimate: 'Moon surface temperature: LRO Diviner Global Cumulative Products (Williams et al. 2017), bolometric temperature, 3 x 3 cells of 0.5°, 96 local-time bins',
    marsClimate: 'Mars surface temperature, pressure, 10 m wind and water vapour: Mars Climate Database v6.2 (LMD/OU/IAA/ESA/CNES), climatology scenario, 12 seasons x 24 h',
  },
  thumbKm: THUMB_KM, ...out,
}, null, 1));
log('wrote web/data/targets.json');

// The known analog list ships with the app (used only for the method check).
fs.copyFileSync(path.join(ROOT, 'data', 'curated', 'known-analogs.json'), path.join(WEB_DATA, 'known-analogs.json'));
