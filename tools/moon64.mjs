// LRO LOLA LDEM_64 (64 px/deg ≈ 474 m, 11520 x 23040 LSB int16 × 0.5 m, rows north→south, 0°E first).
// The file is 530 MB, so only a band of rows around each site is fetched with HTTP Range and cached.
import fs from 'node:fs';
import path from 'node:path';
import { RAW, log } from './lib.mjs';

const URL64 = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_64.img';
const PPD = 64, ROWS = 11520, COLS = 23040, ROW_BYTES = COLS * 2;
const DIR = path.join(RAW, 'lola64');
fs.mkdirSync(DIR, { recursive: true });

export async function moon64Sampler(id, lat, halfDeg = 0.6) {
  const r0 = Math.max(0, Math.floor((90 - (lat + halfDeg)) * PPD));
  const r1 = Math.min(ROWS - 1, Math.ceil((90 - (lat - halfDeg)) * PPD));
  const file = path.join(DIR, `${id}_${r0}_${r1}.i16`);
  if (!fs.existsSync(file)) {
    log(`LOLA 64: ${id} rows ${r0}–${r1}`);
    const res = await fetch(URL64, { headers: { Range: `bytes=${r0 * ROW_BYTES}-${(r1 + 1) * ROW_BYTES - 1}` } });
    if (res.status !== 206) throw new Error(`LOLA 64 range: HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const buf = fs.readFileSync(file);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.length);
  return (la, lo) => {
    const fr = (90 - la) * PPD - 0.5 - r0, fc = ((((lo % 360) + 360) % 360) * PPD - 0.5 + COLS) % COLS;
    const r = Math.round(fr), c = Math.round(fc) % COLS;
    if (r < 0 || r > r1 - r0) return NaN;
    return dv.getInt16((r * COLS + c) * 2, true) * 0.5;
  };
}
