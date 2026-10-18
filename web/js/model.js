// Analog scoring model — runs in the browser and in Node (tools/validate.mjs).
//
// Earth cannot match the Moon or Mars in absolute terms (no place on Earth has 0.7 kPa air or
// −180 °C nights), so each factor is compared on Earth's own scale: every value is turned into its
// area-weighted percentile among Earth's land cells. A target value beyond anything on Earth lands
// at 0 % or 100 %, i.e. "the most extreme end Earth has". Similarity for a factor is
// 1 − |percentile(Earth cell) − percentile(target)|; 0–1 degree factors (bare ground, frozen ground,
// volcanism, cratering) are compared directly. The analog score is the weighted mean.

export const FACTORS = {
  ts_mean:  { label: 'Mean ground temperature', short: 'Mean temp', unit: '°C', digits: 0, group: 'Thermal' },
  ts_range: { label: 'Day–night temperature swing', short: 'Day–night swing', unit: '°C', digits: 0, group: 'Thermal' },
  ts_min:   { label: 'Night-time ground temperature', short: 'Night temp', unit: '°C', digits: 0, group: 'Thermal' },
  precip:   { label: 'Precipitation', short: 'Precipitation', unit: 'mm/day', digits: 2, group: 'Water' },
  humidity: { label: 'Moisture in the air', short: 'Air moisture', unit: 'g/kg', digits: 2, group: 'Water' },
  frozen:   { label: 'Frozen ground / ice', short: 'Frozen ground', degree: true, group: 'Water' },
  pressure: { label: 'Air pressure', short: 'Air pressure', unit: 'kPa', digits: 1, group: 'Sky' },
  uv:       { label: 'UV at the surface', short: 'UV', unit: 'index', digits: 1, group: 'Sky' },
  wind:     { label: 'Wind', short: 'Wind', unit: 'm/s', digits: 1, group: 'Sky' },
  polar:    { label: 'Low sun angle (latitude)', short: 'Low sun', unit: '°', digits: 0, group: 'Sky' },
  relief:   { label: 'Terrain relief (52 km window)', short: 'Relief', unit: 'm', digits: 0, group: 'Terrain' },
  slope:    { label: 'Typical slope (3.7 km scale)', short: 'Slope', unit: '°', digits: 1, group: 'Terrain' },
  barren:   { label: 'Bare ground, no vegetation', short: 'Bare ground', degree: true, group: 'Surface' },
  volcanic: { label: 'Basaltic volcanism nearby', short: 'Basaltic volcanism', degree: true, group: 'Surface' },
  impact:   { label: 'Impact crater nearby', short: 'Impact crater', degree: true, group: 'Surface' },
  cave:     { label: 'Lava tube nearby', short: 'Lava tube', degree: true, group: 'Surface' },
  plutonic: { label: 'Crystalline plutonic rock (like lunar highlands)', short: 'Plutonic rock', degree: true, group: 'Surface' },
  sediment: { label: 'Sedimentary rock and evaporites', short: 'Sedimentary rock', degree: true, group: 'Surface' },
};
export const FACTOR_KEYS = Object.keys(FACTORS);

export const PURPOSES = {
  balanced: { label: 'All conditions', blurb: 'Every factor counts equally.',
    w: Object.fromEntries(FACTOR_KEYS.map((k) => [k, 1])) },
  rover: { label: 'Rovers & spacewalks', blurb: 'Terrain to drive and walk on: relief, slopes, bare rocky ground.',
    w: { relief: 3, slope: 3, barren: 3, impact: 1, volcanic: 1, precip: 1, humidity: 0.5 } },
  habitat: { label: 'Habitats & long stays', blurb: 'Harsh thermal cycles, thin dry air and strong UV for living and working.',
    w: { ts_mean: 2, ts_range: 2, ts_min: 2, pressure: 2, uv: 1.5, humidity: 1, precip: 1, barren: 1, wind: 1, cave: 1.5 } },
  ice: { label: 'Ice & resource mining', blurb: 'Frozen ground in cold, dry places — for drills and water extraction.',
    // Ground ice on Mars and the Moon lies under bare regolith, so bare ground weighs as much as the ice
    // itself: otherwise Earth's ice sheets win, though polar deserts with permafrost are the real match.
    w: { frozen: 3, ts_mean: 2, ts_min: 2, humidity: 1, precip: 1, barren: 3, relief: 1 } },
  geology: { label: 'Geology & sampling', blurb: 'Basaltic lava and impact craters on bare ground — field-geology training.',
    w: { volcanic: 3, impact: 3, barren: 2, relief: 1, slope: 1, precip: 1, cave: 2, plutonic: 2, sediment: 2 } },
  light: { label: 'Light & power', blurb: 'Low sun and long shadows for solar power, cameras and navigation.',
    w: { polar: 3, ts_min: 1, ts_mean: 1, relief: 1.5, barren: 1 } },
};

const D2R = Math.PI / 180;

/** Columnar Earth model with area weights and per-factor percentiles. */
export function buildModel(meta, buffer) {
  const F = meta.features.length, n = meta.n;
  const data = new Float32Array(buffer);
  const col = {};
  meta.features.forEach((f, j) => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = data[i * F + j];
    col[f] = a;
  });
  const w = new Float64Array(n);
  let totalW = 0;
  for (let i = 0; i < n; i++) { w[i] = Math.cos(col.lat[i] * D2R) * col.land[i]; totalW += w[i]; }

  const cdf = {}, pct = {};
  for (const f of FACTOR_KEYS) {
    if (FACTORS[f].degree) continue;
    const v = col[f];
    const idx = Array.from({ length: n }, (_, i) => i).filter((i) => Number.isFinite(v[i])).sort((a, b) => v[a] - v[b]);
    const vals = new Float64Array(idx.length), cum = new Float64Array(idx.length);
    const p = new Float32Array(n).fill(NaN);
    let acc = 0;
    idx.forEach((i, k) => {
      vals[k] = v[i];
      p[i] = (acc + w[i] / 2) / totalW;
      acc += w[i];
      cum[k] = acc;
    });
    cdf[f] = { vals, cum };
    pct[f] = p;
  }
  return { meta, n, col, w, totalW, cdf, pct };
}

/** Area-weighted percentile of value v among Earth land cells (0 = lowest on Earth). */
export function percentileOf(model, f, v) {
  const { vals, cum } = model.cdf[f];
  let lo = 0, hi = vals.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m] < v) lo = m + 1; else hi = m; }
  const below = lo > 0 ? cum[lo - 1] : 0;
  return below / model.totalW;
}

/** The target's factor values, in Earth units (null = does not apply). */
export function targetFactors(t) {
  const c = t.climate;
  return {
    ts_mean: c.ts_mean, ts_range: c.ts_max - c.ts_min, ts_min: c.ts_min,
    precip: c.precip, humidity: c.humidity, frozen: t.ice,
    pressure: c.pressure, uv: c.uv, wind: c.wind ?? null, polar: Math.abs(t.lat),
    relief: t.terrain.relief, slope: t.terrain.slope,
    barren: 1, volcanic: t.volcanic, impact: t.impact, cave: t.cave ?? null,
    plutonic: t.plutonic ?? 0, sediment: t.sediment ?? 0,
  };
}

/** Per-factor target position on Earth's scale, plus whether the value is beyond Earth's range. */
export function targetProfile(model, t) {
  const tv = targetFactors(t), prof = {};
  for (const f of FACTOR_KEYS) {
    const v = tv[f];
    if (v == null) { prof[f] = null; continue; }
    if (FACTORS[f].degree) { prof[f] = { value: v, pos: v, beyond: null }; continue; }
    const { vals } = model.cdf[f];
    const beyond = v < vals[0] ? 'below' : v > vals[vals.length - 1] ? 'above' : null;
    prof[f] = { value: v, pos: percentileOf(model, f, v), beyond };
  }
  return prof;
}

export function earthPos(model, f, i) {
  return FACTORS[f].degree ? model.col[f][i] : model.pct[f][i];
}

/** Analog score (0–1) for every Earth cell. */
export function scoreAll(model, prof, weights) {
  const keys = FACTOR_KEYS.filter((f) => prof[f] && (weights[f] || 0) > 0);
  const s = new Float32Array(model.n);
  for (let i = 0; i < model.n; i++) {
    let num = 0, den = 0;
    for (const f of keys) {
      const e = earthPos(model, f, i);
      if (!Number.isFinite(e)) continue;
      num += weights[f] * (1 - Math.abs(e - prof[f].pos));
      den += weights[f];
    }
    s[i] = den ? num / den : NaN;
  }
  return s;
}

/** Area-weighted rank of each cell's score: 0.99 = more alike than 99 % of Earth's land. */
export function rankAll(model, scores) {
  const idx = Array.from({ length: model.n }, (_, i) => i).filter((i) => Number.isFinite(scores[i]))
    .sort((a, b) => scores[a] - scores[b]);
  const r = new Float32Array(model.n).fill(NaN);
  let acc = 0;
  for (const i of idx) { r[i] = (acc + model.w[i] / 2) / model.totalW; acc += model.w[i]; }
  return r;
}

export function distanceKm(a1, o1, a2, o2) {
  const s = Math.sin((a2 - a1) * D2R / 2) ** 2 + Math.cos(a1 * D2R) * Math.cos(a2 * D2R) * Math.sin((o2 - o1) * D2R / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Best cells, at least minKm apart so one region does not fill the list. */
export function topSites(model, scores, k = 10, minKm = 400) {
  const order = Array.from({ length: model.n }, (_, i) => i).filter((i) => Number.isFinite(scores[i]))
    .sort((a, b) => scores[b] - scores[a]);
  const out = [];
  for (const i of order) {
    const la = model.col.lat[i], lo = model.col.lon[i];
    if (out.every((j) => distanceKm(la, lo, model.col.lat[j], model.col.lon[j]) >= minKm)) out.push(i);
    if (out.length >= k) break;
  }
  return out;
}

export function nearestCell(model, lat, lon, maxKm = 80) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < model.n; i++) {
    if (Math.abs(model.col.lat[i] - lat) > 2) continue;
    const d = distanceKm(lat, lon, model.col.lat[i], model.col.lon[i]);
    if (d < bd) { bd = d; best = i; }
  }
  return bd <= maxKm ? best : -1;
}

/** Best-scoring cell within radiusKm of a point (a site is judged by its best nearby cell). */
export function bestCellNear(model, scores, lat, lon, radiusKm = 60) {
  let best = -1;
  for (let i = 0; i < model.n; i++) {
    if (Math.abs(model.col.lat[i] - lat) > 1.5) continue;
    if (distanceKm(lat, lon, model.col.lat[i], model.col.lon[i]) > radiusKm) continue;
    if (best < 0 || scores[i] > scores[best]) best = i;
  }
  return best;
}

// ---------- robustness ----------
// Is a place a good analog only because of the exact weights we picked? Re-score everything many
// times with every weight scaled by a random factor in [0.5, 1.5] and every target position shifted by
// up to ±0.05 on Earth's scale (the Moon/Mars climate figures are rounded literature values), and count
// how often each place stays within the top 1 % of Earth's land. Seeded, so results are reproducible.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export const STABILITY_RUNS = 60;
export const STABILITY_TOP = 0.01;

/** Returns an object with step() → true when finished, and result() → Map(cell → share of runs in the top 1 %). */
export function stabilityRunner(model, prof, weights, cells, runs = STABILITY_RUNS) {
  const rnd = mulberry32(20261017);
  const hits = new Map(cells.map((i) => [i, 0]));
  let done = 0;
  return {
    step() {
      if (done >= runs) return true;
      const w = {}, p = {};
      for (const f of FACTOR_KEYS) {
        if (!prof[f] || !(weights[f] > 0)) continue;
        w[f] = weights[f] * (0.5 + rnd());
        p[f] = prof[f].beyond ? prof[f] : { ...prof[f], pos: Math.min(1, Math.max(0, prof[f].pos + (rnd() - 0.5) * 0.1)) };
      }
      const s = scoreAll(model, p, w);
      // Area-weighted share of land that scores higher than each candidate.
      for (const i of cells) {
        let above = 0;
        const si = s[i];
        for (let k = 0; k < model.n; k++) if (s[k] > si) above += model.w[k];
        if (above / model.totalW < STABILITY_TOP) hits.set(i, hits.get(i) + 1);
      }
      done++;
      return done >= runs;
    },
    progress: () => done / runs,
    result: () => new Map([...hits].map(([i, h]) => [i, h / Math.max(1, done)])),
  };
}

// ---------- method check: ROC AUC ----------
// Probability that a known analog site ranks above a random place on land. Random places get the
// same treatment as the known sites (best cell within 60 km), so the comparison is fair.
/** n random land points, area-weighted, seeded. */
export function randomLandPoints(model, n = 400, seed = 7) {
  const rnd = mulberry32(seed);
  const cum = new Float64Array(model.n);
  let acc = 0;
  for (let i = 0; i < model.n; i++) { acc += model.w[i]; cum[i] = acc; }
  const pts = [];
  for (let k = 0; k < n; k++) {
    const x = rnd() * acc;
    let lo = 0, hi = model.n - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m; }
    pts.push([model.col.lat[lo], model.col.lon[lo]]);
  }
  return pts;
}
/** AUC of known-site ranks against random-place ranks (0.5 = no better than chance). */
export function aucOf(known, random) {
  if (!known.length || !random.length) return NaN;
  let s = 0;
  for (const k of known) for (const r of random) s += k > r ? 1 : k === r ? 0.5 : 0;
  return s / (known.length * random.length);
}
/** Ranks of the best cell within 60 km of each point. */
export function ranksNear(model, scores, ranks, points) {
  return points.map(([la, lo]) => bestCellNear(model, scores, la, lo)).filter((i) => i >= 0).map((i) => ranks[i]);
}

/** Score and rank of one cell for every purpose (for the site dossier). */
export function allPurposes(model, prof, cell) {
  const out = {};
  for (const [id, p] of Object.entries(PURPOSES)) {
    const w = Object.fromEntries(FACTOR_KEYS.map((f) => [f, p.w[f] || 0]));
    const s = scoreAll(model, prof, w);
    let above = 0;
    for (let k = 0; k < model.n; k++) if (s[k] > s[cell]) above += model.w[k];
    out[id] = { score: s[cell], top: above / model.totalW };
  }
  return out;
}

/** Factor-by-factor comparison of one Earth cell with the target. */
export function explain(model, i, prof, weights) {
  return FACTOR_KEYS.filter((f) => prof[f]).map((f) => {
    const e = earthPos(model, f, i);
    return {
      f, weight: weights[f] || 0, earth: model.col[f][i], target: prof[f].value, beyond: prof[f].beyond,
      sim: Number.isFinite(e) ? 1 - Math.abs(e - prof[f].pos) : NaN,
    };
  });
}
