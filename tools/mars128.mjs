// Sharper Mars relief around each target: MGS MOLA MEGDR at 128 px/deg (~460 m).
// The tiles are 44° x 90° (5632 x 11520 MSB int16, rows north→south), far too big to fetch whole,
// so only the band of rows around a site is fetched with HTTP Range requests and cached.
import fs from 'node:fs';
import path from 'node:path';
import { RAW, log, sleep } from './lib.mjs';

const BASE = 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128/';
const PPD = 128, ROWS = 5632, COLS = 11520, ROW_BYTES = COLS * 2;
const DIR = path.join(RAW, 'mola128');
fs.mkdirSync(DIR, { recursive: true });

// Tile name → north edge latitude: 88n covers 88..44, 44n 44..0, 00n 0..-44, 44s -44..-88.
const BANDS = [['88n', 88], ['44n', 44], ['00n', 0], ['44s', -44]];
function tileFor(lat, lon) {
  const band = BANDS.find(([, top]) => lat <= top && lat > top - 44);
  if (!band) return null;
  const lon360 = ((lon % 360) + 360) % 360;
  const west = Math.floor(lon360 / 90) * 90;
  return { name: `megt${band[0]}${String(west).padStart(3, '0')}hb`, top: band[1], west };
}

async function fetchRange(url, start, end) {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(300000) });
      if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) { log('retry', e.message); await sleep(3000 * (i + 1)); }
  }
  throw new Error('range fetch failed: ' + url);
}

/** Make sure rows covering [latMin, latMax] of every tile touched by the site's box are cached. */
export async function ensureMars128(id, lat, lon, halfDeg) {
  const lonHalf = Math.min(45, halfDeg / Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const tiles = new Map();
  for (const la of [lat - halfDeg, lat, lat + halfDeg])
    for (const lo of [lon - lonHalf, lon, lon + lonHalf]) {
      const t = tileFor(Math.max(-87.99, Math.min(87.99, la)), lo);
      if (t) tiles.set(t.name, t);
    }
  const parts = [];
  for (const t of tiles.values()) {
    const r0 = Math.max(0, Math.floor((t.top - (lat + halfDeg)) * PPD));
    const r1 = Math.min(ROWS - 1, Math.ceil((t.top - (lat - halfDeg)) * PPD));
    if (r1 < r0) continue;
    const file = path.join(DIR, `${id}_${t.name}_${r0}_${r1}.i16`);
    if (!fs.existsSync(file)) {
      log(`MOLA 128: ${id} ${t.name} rows ${r0}–${r1} (${((r1 - r0 + 1) * ROW_BYTES / 1e6).toFixed(1)} MB)`);
      fs.writeFileSync(file, await fetchRange(BASE + t.name + '.img', r0 * ROW_BYTES, (r1 + 1) * ROW_BYTES - 1));
    }
    parts.push({ ...t, r0, r1, file });
  }
  return parts;
}

/** Bilinear sampler over the cached bands; NaN outside them. */
export function mars128Sampler(parts) {
  const loaded = parts.map((p) => {
    const buf = fs.readFileSync(p.file);
    return { ...p, dv: new DataView(buf.buffer, buf.byteOffset, buf.length) };
  });
  return function sample(lat, lon) {
    const lon360 = ((lon % 360) + 360) % 360;
    for (const p of loaded) {
      if (lat > p.top || lat <= p.top - 44 || lon360 < p.west || lon360 >= p.west + 90) continue;
      const fr = (p.top - lat) * PPD - 0.5 - p.r0, fc = (lon360 - p.west) * PPD - 0.5;
      const r = Math.floor(fr), c = Math.floor(fc);
      if (r < 0 || r + 1 > p.r1 - p.r0 || c < 0 || c + 1 >= COLS) continue;
      const tr = fr - r, tc = fc - c;
      const g = (rr, cc) => p.dv.getInt16((rr * COLS + cc) * 2, false);
      return (g(r, c) * (1 - tc) + g(r, c + 1) * tc) * (1 - tr) + (g(r + 1, c) * (1 - tc) + g(r + 1, c + 1) * tc) * tr;
    }
    return NaN;
  };
}
