// Earth relief: NOAA ETOPO1 (ice surface; land from SRTM30/GLOBE) via ERDDAP,
// subsampled to 2 arc-minutes (~3.7 km) — the same scale as the Mars MOLA 16 ppd grid.
// Output: data/raw/etopo_2min.i16 — Int16 rows south→north, 5400 x 10800, row 0 = -90°.
import fs from 'node:fs';
import path from 'node:path';
import { NetCDFReader } from 'netcdfjs';
import { RAW, fetchRetry, log } from './lib.mjs';

const OUT = path.join(RAW, 'etopo_2min.i16');
const ROWS = 5400, COLS = 10800, CHUNK = 900; // 900 rows = 30°
if (fs.existsSync(OUT)) { log('etopo exists, skip'); process.exit(0); }

const grid = new Int16Array(ROWS * COLS);
for (let r0 = 0; r0 < ROWS; r0 += CHUNK) {
  const i0 = r0 * 2, i1 = (r0 + CHUNK - 1) * 2;
  const url = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.nc?altitude[${i0}:2:${i1}][0:2:21598]`;
  log('etopo rows', r0, '…', r0 + CHUNK - 1);
  const buf = await fetchRetry(url);
  const nc = new NetCDFReader(new Uint8Array(buf));
  const v = nc.getDataVariable('altitude');
  const lat = nc.getDataVariable('latitude');
  if (v.length !== CHUNK * COLS) throw new Error(`unexpected size ${v.length}`);
  const southFirst = lat[0] < lat[lat.length - 1];
  for (let r = 0; r < CHUNK; r++) {
    const src = southFirst ? r : CHUNK - 1 - r;
    grid.set(v.slice(src * COLS, (src + 1) * COLS), (r0 + r) * COLS);
  }
}
fs.writeFileSync(OUT, Buffer.from(grid.buffer));
log('wrote', OUT);
