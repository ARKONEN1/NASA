// One terrain measure for every body: sample the DEM on a local tangent-plane grid
// (azimuthal equidistant, STEP km apart, (2N+1)^2 points ≈ 52 x 52 km) and compute
// relief (std of elevation, m) and slope (median, degrees, over a STEP-km baseline).
// Using the same km scale on Earth, Moon and Mars keeps the numbers comparable.
export const STEP_KM = 3.7;
export const HALF = 7; // 15 x 15 samples

/**
 * A lat/lon grid reader. rows×cols, row 0 at lat0 (deg), dLat per row (signed), lon0 at col 0, dLon per col.
 * get(r, c) returns elevation in metres or NaN.
 */
export function makeDem({ rows, cols, lat0, dLat, lon0, dLon, get }) {
  return function sample(lat, lon) {
    const fr = (lat - lat0) / dLat;
    let fc = ((((lon - lon0) % 360) + 360) % 360) / dLon;
    const r0 = Math.floor(fr), c0 = Math.floor(fc);
    const tr = fr - r0, tc = fc - c0;
    const R0 = Math.min(Math.max(r0, 0), rows - 1), R1 = Math.min(Math.max(r0 + 1, 0), rows - 1);
    const C0 = ((c0 % cols) + cols) % cols, C1 = (C0 + 1) % cols;
    const a = get(R0, C0), b = get(R0, C1), c = get(R1, C0), d = get(R1, C1);
    return (a * (1 - tc) + b * tc) * (1 - tr) + (c * (1 - tc) + d * tc) * tr;
  };
}

const D2R = Math.PI / 180;
/** Inverse azimuthal-equidistant: offset (x east, y north) in km from (lat, lon) on a sphere of radius R km. */
function offset(lat, lon, x, y, R) {
  const rho = Math.hypot(x, y);
  if (rho === 0) return [lat, lon];
  const c = rho / R, phi1 = lat * D2R;
  const sinc = Math.sin(c), cosc = Math.cos(c);
  const phi = Math.asin(cosc * Math.sin(phi1) + (y * sinc * Math.cos(phi1)) / rho);
  const lam = Math.atan2(x * sinc, rho * Math.cos(phi1) * cosc - y * Math.sin(phi1) * sinc);
  return [phi / D2R, lon + lam / D2R];
}

/** Terrain metrics around (lat, lon). sample(lat, lon) → metres (NaN = no data). */
export function terrainAt(sample, lat, lon, radiusKm) {
  const n = 2 * HALF + 1;
  const z = new Float64Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const [la, lo] = offset(lat, lon, (i - HALF) * STEP_KM, (j - HALF) * STEP_KM, radiusKm);
      z[j * n + i] = sample(la, lo);
    }
  let s = 0, s2 = 0, k = 0;
  for (const v of z) if (Number.isFinite(v)) { s += v; s2 += v * v; k++; }
  if (k < n * n * 0.5) return null;
  const mean = s / k;
  const relief = Math.sqrt(Math.max(0, s2 / k - mean * mean));
  const slopes = [];
  for (let j = 1; j < n - 1; j++)
    for (let i = 1; i < n - 1; i++) {
      const gx = (z[j * n + i + 1] - z[j * n + i - 1]) / (2 * STEP_KM * 1000);
      const gy = (z[(j + 1) * n + i] - z[(j - 1) * n + i]) / (2 * STEP_KM * 1000);
      if (Number.isFinite(gx) && Number.isFinite(gy)) slopes.push(Math.atan(Math.hypot(gx, gy)) / D2R);
    }
  slopes.sort((a, b) => a - b);
  const slope = slopes.length ? slopes[slopes.length >> 1] : NaN;
  return { elev: mean, relief, slope };
}
