// Earth surface cover: MODIS Combined (Terra+Aqua) IGBP land cover, 2024, from NASA GIBS (WMS).
// The layer is categorical, so every pixel colour maps exactly to one IGBP class.
// Output: data/raw/landcover_005.u8 — Uint8 class codes, 3600 x 7200 at 0.05°, row 0 = -90° (south→north).
//   0 water · 1–14 vegetation/urban/wetland/crop · 15 permanent snow & ice · 16 barren · 255 no data
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { RAW, fetchRetry, pool, log } from './lib.mjs';

const OUT = path.join(RAW, 'landcover_005.u8');
if (fs.existsSync(OUT)) { log('landcover exists, skip'); process.exit(0); }

// Palette from https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_IGBP_Land_Cover_Type.xml
const PALETTE = [
  [[33, 138, 33], 1], [[49, 204, 49], 2], [[152, 204, 49], 3], [[150, 250, 150], 4], [[141, 186, 141], 5],
  [[186, 141, 141], 6], [[245, 222, 179], 7], [[218, 235, 157], 8], [[255, 213, 0], 9], [[240, 185, 103], 10],
  [[71, 131, 181], 11], [[250, 239, 115], 12], [[255, 0, 0], 13], [[153, 147, 86], 14], [[255, 255, 255], 15],
  [[191, 191, 189], 16], [[134, 202, 227], 0], [[100, 100, 100], 255],
];
const lut = new Map(PALETTE.map(([c, v]) => [(c[0] << 16) | (c[1] << 8) | c[2], v]));
function classify(r, g, b) {
  const exact = lut.get((r << 16) | (g << 8) | b);
  if (exact !== undefined) return exact;
  let best = 255, bd = Infinity;
  for (const [c, v] of PALETTE) {
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < bd) { bd = d; best = v; }
  }
  return bd < 300 ? best : 255;
}

const W = 7200, H = 3600, T = 45, PX = 900; // 45° tiles of 900 px = 0.05°
const grid = new Uint8Array(W * H).fill(255);
const tiles = [];
for (let la = -90; la < 90; la += T) for (let lo = -180; lo < 180; lo += T) tiles.push([la, lo]);

await pool(tiles, 4, async ([la, lo]) => {
  const url = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1' +
    `&LAYERS=MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual&SRS=EPSG:4326&BBOX=${lo},${la},${lo + T},${la + T}` +
    `&WIDTH=${PX}&HEIGHT=${PX}&FORMAT=image/png&TIME=2024-01-01&STYLES=`;
  const png = PNG.sync.read(Buffer.from(await fetchRetry(url)));
  for (let y = 0; y < PX; y++) {
    const row = (la + 90) * 20 + (PX - 1 - y); // image is north-up
    for (let x = 0; x < PX; x++) {
      const i = (y * PX + x) * 4;
      if (png.data[i + 3] < 128) continue; // transparent = no data
      grid[row * W + (lo + 180) * 20 + x] = classify(png.data[i], png.data[i + 1], png.data[i + 2]);
    }
  }
  log('landcover tile', la, lo);
});
fs.writeFileSync(OUT, grid);
const counts = new Map();
for (const v of grid) counts.set(v, (counts.get(v) || 0) + 1);
log('class counts', JSON.stringify([...counts].sort((a, b) => a[0] - b[0])));
