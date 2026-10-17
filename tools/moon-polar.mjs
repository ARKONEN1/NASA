// LRO LOLA south-polar DEM (LDEM_75S_240M): polar stereographic, 3812 x 3812, 240 m/px, LSB int16 × 0.5 m.
// Covers 75°S–90°S at 240 m — far sharper near the pole than the 16 px/deg cylindrical grid.
import fs from 'node:fs';
import path from 'node:path';
import { RAW } from './lib.mjs';

const N = 3812, SCALE_KM = 0.24, OFF = 1905.5 - 1, R = 1737.4;
const D2R = Math.PI / 180;

export function moonSouthPolar({ sx = 1, sy = 1 } = { sx: 1, sy: 1 }) {
  const buf = fs.readFileSync(path.join(RAW, 'moon_ldem_75s_240m.img'));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.length);
  const get = (l, s) => dv.getInt16((l * N + s) * 2, true) * 0.5;
  return function sample(lat, lon) {
    if (lat > -75.2) return NaN;
    const rho = 2 * R * Math.tan(Math.PI / 4 + (lat * D2R) / 2);
    const x = rho * Math.sin(lon * D2R), y = rho * Math.cos(lon * D2R);
    const fs_ = OFF + (sx * x) / SCALE_KM, fl = OFF + (sy * y) / SCALE_KM;
    const s0 = Math.floor(fs_), l0 = Math.floor(fl);
    if (s0 < 0 || l0 < 0 || s0 >= N - 1 || l0 >= N - 1) return NaN;
    const ts = fs_ - s0, tl = fl - l0;
    return (get(l0, s0) * (1 - ts) + get(l0, s0 + 1) * ts) * (1 - tl) + (get(l0 + 1, s0) * (1 - ts) + get(l0 + 1, s0 + 1) * ts) * tl;
  };
}
