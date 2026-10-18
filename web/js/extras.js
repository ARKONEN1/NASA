// Visual helpers for the comparison panel and the dossier: the factor "fingerprint" radar,
// the detailed-terrain table and logistics. Pure functions that return HTML strings.
import { FACTORS, FACTOR_KEYS, earthPos, distanceKm } from './model.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Radar of every factor on Earth's scale (0 = lowest on Earth, 1 = highest): the target as a dashed
 * outline, the Earth place as a filled shape. Where the two shapes coincide, the place is alike.
 */
export function radarSvg(model, prof, weights, i, { label, earthLabel, targetLabel, size = 300 }) {
  const keys = FACTOR_KEYS.filter((f) => prof[f]);
  const n = keys.length, c = size / 2, R = size / 2 - 58;
  const pt = (k, v) => {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / n, r = R * (0.12 + 0.88 * Math.min(1, Math.max(0, v)));
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const poly = (vals) => vals.map((v, k) => pt(k, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  const earth = keys.map((f) => { const v = earthPos(model, f, i); return Number.isFinite(v) ? v : 0; });
  const tgt = keys.map((f) => prof[f].pos);
  const rings = [0.25, 0.5, 0.75, 1].map((v) => `<polygon points="${poly(keys.map(() => v))}" class="rd-ring"/>`).join('');
  const spokes = keys.map((_, k) => { const [x, y] = pt(k, 1); return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="rd-spoke"/>`; }).join('');
  const labels = keys.map((f, k) => {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / n, x = c + (R + 12) * Math.cos(a), y = c + (R + 12) * Math.sin(a);
    const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
    return `<text x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="${anchor}" class="rd-label${weights[f] > 0 ? '' : ' off'}">${esc(label(f))}</text>`;
  }).join('');
  return `<svg viewBox="-84 0 ${size + 168} ${size}" class="radar" role="img" aria-label="${esc(earthLabel)} / ${esc(targetLabel)}">
    ${rings}${spokes}
    <polygon points="${poly(earth)}" class="rd-earth"/>
    <polygon points="${poly(tgt)}" class="rd-target"/>
    ${labels}
  </svg>
  <div class="rd-legend"><span><i class="sw earth"></i>${esc(earthLabel)}</span><span><i class="sw target"></i>${esc(targetLabel)}</span></div>`;
}

/** Detailed terrain (0.48 km baseline, 20 km window): Earth cell vs target. */
export const DETAIL_ROWS = ['medSlope', 'p90Slope', 'pct10', 'pct20', 'relief'];
export function detailRows(earth, target) {
  return DETAIL_ROWS.map((k, j) => {
    const a = earth?.[j], b = target?.[j];
    const ok = Number.isFinite(a) && Number.isFinite(b);
    const sim = ok ? Math.max(0, 1 - Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), k.startsWith('pct') ? 5 : k === 'relief' ? 50 : 1)) : NaN;
    return { k, earth: a, target: b, sim };
  });
}

/** Nearest town (any size) and nearest airport. */
export function logistics(logi, la, lo) {
  const near = (list, li, oi) => {
    let best = null, bd = Infinity;
    for (const p of list) {
      if (Math.abs(p[li] - la) > 12) continue;
      const d = distanceKm(la, lo, p[li], p[oi]);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { p: best, d: bd } : null;
  };
  return { town: near(logi.towns, 1, 2), airport: near(logi.airports, 3, 4) };
}
