// Earth feature grid on the NASA POWER (MERRA-2) 0.5° x 0.625° lattice, land cells only.
// Inputs (data/raw): power/*.json, etopo_2min.i16, landcover_005.u8, gvp_holocene.csv,
//                    ne_50m_countries.geojson, ../curated/impact-structures.json, ../curated/lava-tubes.json
// Output (web/data): earth-cells.bin (Float32, N x FEATURES.length, row-major) + earth-meta.json
//                    + places.json (named volcanoes, craters and lava tubes for the site cards)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, RAW, WEB_DATA, log } from './lib.mjs';
import { makeDem, terrainAt } from './terrain.mjs';
import { POWER_PARAMS } from './power-params.mjs';

const EARTH_R = 6371;
export const FEATURES = [
  'lat', 'lon', 'land',                         // cell centre, land fraction
  'ts_mean', 'ts_max', 'ts_min', 'ts_range', 'ts_coldest',
  'precip', 'humidity', 'pressure', 'uv', 'wind',
  'elev', 'relief', 'slope',
  'barren', 'icecover', 'frozen', 'volcanic', 'impact', 'polar', 'cave',
  'country', 'lc_major',                        // country index, most common IGBP land-cover class
];

// ---------- NASA POWER ----------
const power = {};
for (const p of POWER_PARAMS) power[p] = new Map();
const key = (lat, lon) => `${lat.toFixed(3)},${lon.toFixed(3)}`;
let missing = 0;
for (const f of fs.readdirSync(path.join(RAW, 'power'))) {
  const p = f.match(/^(.*)_-?\d+_-?\d+\.json$/)?.[1];
  if (!power[p]) continue;
  for (const row of JSON.parse(fs.readFileSync(path.join(RAW, 'power', f), 'utf8'))) {
    const [lat, lon, ...vals] = row;
    power[p].set(key(lat, lon), vals.map((v) => (v === -999 || v == null ? NaN : v)));
  }
}
log('POWER points per param:', POWER_PARAMS.map((p) => `${p}=${power[p].size}`).join(' '));

// ---------- ETOPO (2′) and land cover (0.05°) ----------
const eb = fs.readFileSync(path.join(RAW, 'etopo_2min.i16'));
const etopo = new Int16Array(eb.buffer, eb.byteOffset, eb.length / 2);
const lc = fs.readFileSync(path.join(RAW, 'landcover_005.u8'));
const lcAt = (lat, lon) => {
  const r = Math.min(3599, Math.max(0, Math.floor((lat + 90) * 20)));
  const c = ((Math.floor((lon + 180) * 20) % 7200) + 7200) % 7200;
  return lc[r * 7200 + c];
};
// Ocean/lake pixels are flattened to 0 m so coastlines do not read as cliffs.
const earthDem = makeDem({
  rows: 5400, cols: 10800, lat0: -90, dLat: 1 / 30, lon0: -180, dLon: 1 / 30,
  get: (r, c) => {
    const z = etopo[r * 10800 + c];
    if (z >= 0) return z;
    return lcAt(-90 + r / 30, -180 + c / 30) === 0 ? 0 : z;
  },
});

// ---------- Volcanoes (Smithsonian GVP, Holocene, basaltic) ----------
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const gvp = parseCsv(fs.readFileSync(path.join(RAW, 'gvp_holocene.csv'), 'utf8'));
const H = gvp[0];
const iLat = H.indexOf('Latitude'), iLon = H.indexOf('Longitude'), iRock = H.indexOf('Major_Rock_Type');
const iName = H.indexOf('Volcano_Name');
const volcanoes = gvp.slice(1).map((r) => [r[iName], +r[iLat], +r[iLon], /basalt/i.test(r[iRock] || '') ? 1 : 0])
  .filter(([n, a, b]) => n && Number.isFinite(a) && Number.isFinite(b));
const basalt = gvp.slice(1).filter((r) => /basalt/i.test(r[iRock] || '')).map((r) => [+r[iLat], +r[iLon]])
  .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
log(`basaltic Holocene volcanoes: ${basalt.length} of ${gvp.length - 1}`);

const caves = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'curated', 'lava-tubes.json'), 'utf8')).caves;
const craters = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'curated', 'impact-structures.json'), 'utf8')).craters;

const D2R = Math.PI / 180;
function gcKm(a1, o1, a2, o2) {
  const s = Math.sin((a2 - a1) * D2R / 2) ** 2 + Math.cos(a1 * D2R) * Math.cos(a2 * D2R) * Math.sin((o2 - o1) * D2R / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// ---------- Countries (Natural Earth 50m) ----------
const ne = JSON.parse(fs.readFileSync(path.join(RAW, 'ne_50m_countries.geojson'), 'utf8'));
const countries = [];
const polys = []; // {ci, bbox, rings}
for (const f of ne.features) {
  const pr = f.properties, en = pr.NAME_EN || pr.NAME || pr.ADMIN;
  const ci = countries.push([en, pr.NAME_UK || en]) - 1; // [English, Ukrainian]
  const g = f.geometry;
  const parts = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const rings of parts) {
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    for (const [x, y] of rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    polys.push({ ci, bbox: [x0, y0, x1, y1], rings });
  }
}
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function countryAt(lat, lon) {
  for (const p of polys) {
    const [x0, y0, x1, y1] = p.bbox;
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    if (inRing(lon, lat, p.rings[0]) && !p.rings.slice(1).some((h) => inRing(lon, lat, h))) return p.ci;
  }
  return -1;
}

// ---------- Cells ----------
const DLAT = 0.5, DLON = 0.625;
const rows = [];
for (let lat = -90; lat <= 90; lat += DLAT) {
  for (let lon = -180; lon < 180; lon += DLON) {
    const k = key(lat, lon);
    const ts = power.TS.get(k);
    if (!ts) continue;
    // Land cover inside the cell.
    let land = 0, total = 0, barren = 0, ice = 0;
    const classCount = new Map();
    for (let a = lat - DLAT / 2 + 0.025; a < lat + DLAT / 2; a += 0.05) {
      if (a < -90 || a > 90) continue;
      for (let o = lon - DLON / 2 + 0.025; o < lon + DLON / 2; o += 0.05) {
        const v = lcAt(a, o);
        if (v === 255) continue;
        total++;
        if (v === 0) continue;
        land++;
        classCount.set(v, (classCount.get(v) || 0) + 1);
        if (v === 16) barren++;
        else if (v === 15) ice++;
      }
    }
    if (!total || land / total < 0.25) continue;

    // UV comes from CERES on a 1° grid (centres at x.5°), the rest from MERRA-2 at 0.5° x 0.625°.
    const coarse = key(Math.min(89.5, Math.floor(lat) + 0.5), Math.min(179.5, Math.floor(lon) + 0.5));
    const P = Object.fromEntries(POWER_PARAMS.map((p) => [p, power[p].get(k) ?? power[p].get(coarse)]));
    if (POWER_PARAMS.some((p) => !P[p])) missing++;
    for (const p of POWER_PARAMS) P[p] ||= new Array(13).fill(NaN);
    const terr = terrainAt(earthDem, lat, lon, EARTH_R);
    if (!terr) continue;

    const monthsBelow0 = P.TS.slice(1).filter((v) => v < 0).length;
    let dBasalt = Infinity;
    for (const [a, o] of basalt) if (Math.abs(a - lat) < 10) dBasalt = Math.min(dBasalt, gcKm(lat, lon, a, o));
    let impact = 0;
    for (const [, a, o, d] of craters) {
      if (Math.abs(a - lat) > 8) continue;
      impact = Math.max(impact, Math.exp(-Math.max(0, gcKm(lat, lon, a, o) - d / 2) / 40));
    }
    let ci = countryAt(lat, lon);
    for (const [da, dl] of [[0.2, 0], [-0.2, 0], [0, 0.25], [0, -0.25], [0.2, 0.25], [-0.2, -0.25], [0.2, -0.25], [-0.2, 0.25]]) {
      if (ci >= 0) break;
      ci = countryAt(lat + da, lon + dl);
    }
    const icecover = ice / land;
    let dCave = Infinity;
    for (const c of caves) dCave = Math.min(dCave, gcKm(lat, lon, c.lat, c.lon));
    const lcMajor = [...classCount].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    // POWER's "ANN" is the annual extreme for *_MAX/_MIN parameters, so average the 12 months
    // to get the mean daily max/min (comparable with the Moon/Mars figures).
    const mean12 = (a) => a.slice(1).reduce((s, v) => s + v, 0) / 12;
    const tsMax = mean12(P.TS_MAX), tsMin = mean12(P.TS_MIN);
    rows.push([
      lat, lon, land / total,
      P.TS[0], tsMax, tsMin, tsMax - tsMin, Math.min(...P.TS_MIN.slice(1)),
      P.PRECTOTCORR[0], P.QV2M[0], P.PS[0], P.ALLSKY_SFC_UV_INDEX[0], P.WS10M[0],
      terr.elev, terr.relief, terr.slope,
      barren / land, icecover, Math.max(icecover, monthsBelow0 / 12),
      Math.exp(-dBasalt / 60), impact, Math.abs(lat), Math.exp(-dCave / 50),
      ci, lcMajor,
    ]);
  }
}
log(`cells: ${rows.length} (with some POWER parameter missing: ${missing})`);

const F = FEATURES.length;
const data = new Float32Array(rows.length * F);
rows.forEach((r, i) => r.forEach((v, j) => { data[i * F + j] = Number.isFinite(v) ? v : NaN; }));
fs.writeFileSync(path.join(WEB_DATA, 'earth-cells.bin'), Buffer.from(data.buffer));
fs.writeFileSync(path.join(WEB_DATA, 'earth-meta.json'), JSON.stringify({
  n: rows.length, features: FEATURES, grid: { dLat: DLAT, dLon: DLON }, countries,
  sources: {
    climate: 'NASA POWER climatology 2001–2025 (MERRA-2; UV from CERES), power.larc.nasa.gov',
    relief: 'NOAA ETOPO1 ice-surface relief via NOAA CoastWatch ERDDAP, sampled at 2′',
    landcover: 'MODIS Combined IGBP Land Cover 2024 (MCD12Q1) via NASA GIBS',
    volcanoes: 'Smithsonian Global Volcanism Program, Holocene volcanoes (basaltic)',
    impacts: 'Earth Impact Database (PASSC, UNB), exposed confirmed structures',
    caves: 'Lava tubes and volcanic caves: hand-compiled list of well-documented systems (incomplete, approximate)',
    countries: 'Natural Earth 1:50m admin-0 countries',
  },
}));
fs.writeFileSync(path.join(WEB_DATA, 'places.json'), JSON.stringify({
  volcanoes: volcanoes.map(([n, a, o, b]) => [n, +a.toFixed(3), +o.toFixed(3), b]),
  craters: craters.map(([n, a, o, d]) => [n, a, o, d]),
  caves: caves.map((c) => [c.name, c.uk, c.lat, c.lon]),
}));
const kb = (data.byteLength / 1024).toFixed(0);
log(`wrote earth-cells.bin (${kb} KB) and earth-meta.json`);

// Quick look at a few known places.
for (const [name, la, lo] of [['Atacama', -24.1, -70.0], ['Dry Valleys', -77.5, 161.8], ['Devon Island', 75.4, -89.7], ['Amazon', -3, -60]]) {
  let best = null, bd = Infinity;
  for (const r of rows) { const d = gcKm(la, lo, r[0], r[1]); if (d < bd) { bd = d; best = r; } }
  console.log(name.padEnd(13), FEATURES.map((f, j) => `${f}=${typeof best[j] === 'number' ? +best[j].toFixed(2) : best[j]}`).join(' '));
}
