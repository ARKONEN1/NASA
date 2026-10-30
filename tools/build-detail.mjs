// Detailed terrain (≈0.48 km baseline, 20 km window) for every candidate Earth cell, from the
// Copernicus GLO-30 DEM (ESA / Airbus, open on AWS) at its 240 m overview level.
// Candidates = every place that appears in a top-50 list for any site x purpose, plus the cells
// next to the known analog sites. Output: web/data/detail.json { "lat,lon": [5 metrics] }.
import fs from 'node:fs';
import path from 'node:path';
import { fromUrl } from 'geotiff';
import { ROOT, WEB_DATA, pool, log } from './lib.mjs';
import { detailAt } from './terrain.mjs';
import { PURPOSES, FACTOR_KEYS, buildModel, targetProfile, scoreAll, topSites, nearestCell, distanceKm } from '../web/js/model.js';
import { studiedRegion } from '../web/js/studied.js';

const meta = JSON.parse(fs.readFileSync(path.join(WEB_DATA, 'earth-meta.json'), 'utf8'));
const bin = fs.readFileSync(path.join(WEB_DATA, 'earth-cells.bin'));
const model = buildModel(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length));
const targets = JSON.parse(fs.readFileSync(path.join(WEB_DATA, 'targets.json'), 'utf8'));
const known = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'curated', 'known-analogs.json'), 'utf8')).sites;

// ---------- candidate cells ----------
// Same rule as the app: no test site within 150 km and outside the well-known analog regions.
const isNew = (i) => {
  const la = model.col.lat[i], lo = model.col.lon[i];
  return !studiedRegion(la, lo) && !known.some((k) => distanceKm(k.lat, k.lon, la, lo) < 150);
};
const cand = new Set();
for (const body of ['moon', 'mars'])
  for (const t of targets[body]) {
    const prof = targetProfile(model, t);
    for (const p of Object.values(PURPOSES)) {
      if (p.bodies && !p.bodies.includes(body)) continue;
      const w = Object.fromEntries(FACTOR_KEYS.map((f) => [f, p.w[f] || 0]));
      const scores = scoreAll(model, prof, w);
      for (const i of topSites(model, scores, 50, 250)) cand.add(i);
      // and the lists with "only little-studied places" ticked
      for (const i of topSites(model, scores, 50, 250, isNew)) cand.add(i);
    }
  }
for (const s of known) { const i = nearestCell(model, s.lat, s.lon, 80); if (i >= 0) cand.add(i); }
const cells = [...cand];
log(`${cells.length} candidate cells`);

// ---------- Copernicus tiles (240 m overview), cached on disk as Float32 ----------
const CACHE = path.join(ROOT, 'data', 'raw', 'cop240');
fs.mkdirSync(CACHE, { recursive: true });
const tileName = (la, lo) => {
  const ns = la >= 0 ? 'N' : 'S', ew = lo >= 0 ? 'E' : 'W';
  return `Copernicus_DSM_COG_10_${ns}${String(Math.abs(la)).padStart(2, '0')}_00_${ew}${String(Math.abs(lo)).padStart(3, '0')}_00_DEM`;
};
const memo = new Map();
async function loadTile(la, lo) {
  const name = tileName(la, lo), file = path.join(CACHE, name + '.f32');
  if (memo.has(name)) return memo.get(name);
  const p = (async () => {
    if (fs.existsSync(file)) {
      const buf = fs.readFileSync(file);
      if (buf.length === 0) return null; // known ocean tile
      const w = buf.readUInt32LE(0), h = buf.readUInt32LE(4);
      return { w, h, data: new Float32Array(buf.buffer.slice(buf.byteOffset + 8, buf.byteOffset + 8 + w * h * 4)) };
    }
    const url = `https://copernicus-dem-30m.s3.amazonaws.com/${name}/${name}.tif`;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (head.status === 404 || head.status === 403) { fs.writeFileSync(file, Buffer.alloc(0)); return null; }
        const tiff = await fromUrl(url);
        const im = await tiff.getImage((await tiff.getImageCount()) - 1); // coarsest overview ≈ 240 m
        const [data] = await im.readRasters();
        const w = im.getWidth(), h = im.getHeight();
        const hdr = Buffer.alloc(8); hdr.writeUInt32LE(w, 0); hdr.writeUInt32LE(h, 4);
        fs.writeFileSync(file, Buffer.concat([hdr, Buffer.from(new Float32Array(data).buffer)]));
        return { w, h, data: new Float32Array(data) };
      } catch (e) {
        if (attempt === 3) { log('tile failed', name, e.message); return null; }
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  })();
  memo.set(name, p);
  const v = await p;
  if (memo.size > 400) memo.delete(memo.keys().next().value);
  return v;
}

// Sampler over the tiles touched by one 20 km window; ocean / missing tiles count as sea level 0 m.
async function samplerAround(lat, lon) {
  const dLat = 0.12, dLon = Math.min(2, 0.12 / Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  const tiles = new Map();
  for (let la = Math.floor(lat - dLat); la <= Math.floor(lat + dLat); la++)
    for (let lo = Math.floor(lon - dLon); lo <= Math.floor(lon + dLon); lo++) {
      const L = ((lo + 180) % 360 + 360) % 360 - 180;
      if (la < -90 || la > 89) continue;
      tiles.set(`${la},${L}`, await loadTile(la, L));
    }
  return (la, lo) => {
    const lo2 = ((lo + 180) % 360 + 360) % 360 - 180;
    const ta = Math.floor(la), to = Math.floor(lo2);
    const t = tiles.get(`${ta},${to}`);
    if (t === undefined) return NaN;
    if (t === null) return 0;
    // Pixel centres: row 0 at the north edge.
    const fx = (lo2 - to) * t.w - 0.5, fy = (ta + 1 - la) * t.h - 0.5;
    const x = Math.min(t.w - 1, Math.max(0, Math.round(fx))), y = Math.min(t.h - 1, Math.max(0, Math.round(fy)));
    return t.data[y * t.w + x];
  };
}

const OUT = path.join(WEB_DATA, 'detail.json');
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
let done = 0;
await pool(cells, 6, async (i) => {
  const la = model.col.lat[i], lo = model.col.lon[i], key = `${la},${lo}`;
  if (!out[key]) {
    const d = detailAt(await samplerAround(la, lo), la, lo, 6371);
    if (d) out[key] = d;
  }
  if (++done % 100 === 0) { log(`${done}/${cells.length}`); fs.writeFileSync(OUT, JSON.stringify(out)); }
});
fs.writeFileSync(OUT, JSON.stringify(out));
log(`wrote detail.json: ${Object.keys(out).length} cells`);
