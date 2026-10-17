// Small relief maps of the Moon and Mars for picking a site, rendered from the same DEMs the
// scores use: a global plate carrée map per body, plus a polar-stereographic inset of the lunar
// south pole (the Artemis candidates sit within ~170 km of the pole and would collapse into a
// line on a global map). Output: web/data/map-moon.png, map-mars.png, map-moon-south.png, bodymaps.json
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { RAW, WEB_DATA, log } from './lib.mjs';

const D2R = Math.PI / 180;

function readPds16(file, littleEndian, scale) {
  const buf = fs.readFileSync(path.join(RAW, file));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.length);
  return (r, c) => dv.getInt16((r * 5760 + c) * 2, littleEndian) * scale;
}

/** Hillshade + hypsometric tint of a height grid z (W x H), cell sizes in metres per pixel. */
function render(z, W, H, cellX, cellY, tint, file) {
  let lo = Infinity, hi = -Infinity;
  for (const v of z) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  // Clip the tint range to the 1st–99th percentile so a few peaks do not wash everything out.
  const sorted = Float64Array.from(z.filter(Number.isFinite)).sort();
  const p1 = sorted[Math.floor(sorted.length * 0.01)], p99 = sorted[Math.floor(sorted.length * 0.99)];
  const png = new PNG({ width: W, height: H });
  const az = 315 * D2R, alt = 35 * D2R;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const at = (a, b) => z[Math.min(H - 1, Math.max(0, b)) * W + ((a + W) % W)];
      const dzdx = ((at(i + 1, j) - at(i - 1, j)) / (2 * cellX(j))) * 6;
      const dzdy = ((at(i, j - 1) - at(i, j + 1)) / (2 * cellY)) * 6;
      const slope = Math.atan(Math.hypot(dzdx, dzdy)), aspect = Math.atan2(dzdy, -dzdx);
      const shade = Math.max(0, Math.cos(alt) * Math.cos(slope) + Math.sin(alt) * Math.sin(slope) * Math.cos(az - aspect - Math.PI / 2));
      const h = Math.min(1, Math.max(0, (z[j * W + i] - p1) / (p99 - p1)));
      const [r, g, b] = tint(h);
      const s = 0.35 + 0.75 * shade;
      const k = (j * W + i) * 4;
      png.data[k] = Math.min(255, r * s); png.data[k + 1] = Math.min(255, g * s); png.data[k + 2] = Math.min(255, b * s); png.data[k + 3] = 255;
    }
  fs.writeFileSync(path.join(WEB_DATA, file), PNG.sync.write(png, { colorType: 2 }));
  log(file, `${W}x${H}`, (fs.statSync(path.join(WEB_DATA, file)).size / 1e6).toFixed(2), 'MB');
}

const lerp = (stops) => (h) => {
  const x = h * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  return stops[i].map((c, k) => c + (stops[i + 1][k] - c) * f);
};
const MOON_TINT = lerp([[70, 74, 84], [128, 130, 136], [176, 176, 172], [214, 212, 204]]);
const MARS_TINT = lerp([[60, 70, 110], [120, 80, 60], [178, 102, 60], [206, 150, 96], [236, 214, 180]]);

// ---------- global maps (plate carrée, −180°..180° like the site coordinates) ----------
const W = 1440, H = 720; // 4 px/deg
for (const [body, file, le, scale, radiusKm, tint] of [
  ['moon', 'moon_ldem_16.img', true, 0.5, 1737.4, MOON_TINT],
  ['mars', 'mars_megt_16.img', false, 1, 3389.5, MARS_TINT],
]) {
  const get = readPds16(file, le, scale);
  const z = new Float64Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      // Average the 4x4 source pixels under each output pixel (16 → 4 px/deg).
      const lon360 = (((i / 4 - 180) % 360) + 360) % 360;
      let s = 0;
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) s += get(j * 4 + a, (Math.floor(lon360 * 16) + b) % 5760);
      z[j * W + i] = s / 16;
    }
  const mPerDeg = (radiusKm * 1000 * Math.PI) / 180;
  render(z, W, H, (j) => (mPerDeg / 4) * Math.max(0.05, Math.cos((90 - (j + 0.5) / 4) * D2R)), mPerDeg / 4, tint, `map-${body}.png`);
}

// ---------- lunar south pole inset (polar stereographic, from LDEM_75S_240M) ----------
const INSET_KM = 220, INSET_PX = 440, N = 3812, OFF = 1905.5 - 1, SCALE_KM = 0.24;
const pbuf = fs.readFileSync(path.join(RAW, 'moon_ldem_75s_240m.img'));
const pdv = new DataView(pbuf.buffer, pbuf.byteOffset, pbuf.length);
const z = new Float64Array(INSET_PX * INSET_PX);
const kmPerPx = (2 * INSET_KM) / INSET_PX;
for (let j = 0; j < INSET_PX; j++)
  for (let i = 0; i < INSET_PX; i++) {
    // Image x → map x (km), image y downwards → map y = −y; same convention as tools/moon-polar.mjs.
    const x = (i + 0.5) * kmPerPx - INSET_KM, y = INSET_KM - (j + 0.5) * kmPerPx;
    const s = Math.round(OFF + x / SCALE_KM), l = Math.round(OFF - y / SCALE_KM);
    z[j * INSET_PX + i] = pdv.getInt16((l * N + s) * 2, true) * 0.5;
  }
render(z, INSET_PX, INSET_PX, () => kmPerPx * 1000, kmPerPx * 1000, MOON_TINT, 'map-moon-south.png');

fs.writeFileSync(path.join(WEB_DATA, 'bodymaps.json'), JSON.stringify({
  global: { width: W, height: H },
  moonSouth: { px: INSET_PX, halfKm: INSET_KM, radiusKm: 1737.4, minLat: -84 },
}));
log('wrote bodymaps.json');
