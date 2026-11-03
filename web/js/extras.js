// Visual helpers for the comparison panel and the dossier: the factor "fingerprint" radar,
// the detailed-terrain table and logistics. Pure functions that return HTML strings.
import { FACTORS, FACTOR_KEYS, earthPos, distanceKm } from './model.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Radar of every factor on Earth's scale (0 = lowest on Earth, 1 = highest): the target as a dashed
 * outline, the Earth place as a filled shape. Where the two shapes coincide, the place is alike.
 */
export function radarSvg(model, prof, weights, i, { label, earthLabel, targetLabel, size = 400 }) {
  const keys = FACTOR_KEYS.filter((f) => prof[f]);
  const n = keys.length, c = size / 2, R = size / 2 - 46;
  const pt = (k, v) => {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / n, r = R * (0.12 + 0.88 * Math.min(1, Math.max(0, v)));
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const poly = (vals) => vals.map((v, k) => pt(k, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  const earth = keys.map((f) => { const v = earthPos(model, f, i); return Number.isFinite(v) ? v : 0; });
  const tgt = keys.map((f) => prof[f].pos);
  const rings = [0.25, 0.5, 0.75, 1].map((v) => `<polygon points="${poly(keys.map(() => v))}" class="rd-ring"/>`).join('');
  const spokes = keys.map((_, k) => { const [x, y] = pt(k, 1); return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="rd-spoke"/>`; }).join('');
  // Labels: long names wrap onto two lines; a label that would touch one already placed moves outward along its spoke.
  const FS = 12, LH = 14.5, CW = 6.6; // font size, line height, average glyph width
  const placed = [];
  const labels = keys.map((f, k) => {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / n, cos = Math.cos(a), sin = Math.sin(a);
    const words = label(f).split(' ');
    const lines = words.length > 1 && label(f).length > 11 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [label(f)];
    const w = Math.max(...lines.map((l) => l.length)) * CW, h = lines.length * LH;
    const anchor = Math.abs(cos) < 0.15 ? 'middle' : cos > 0 ? 'start' : 'end';
    let box;
    for (let r = R + 10; r < R + 80; r += 3) {
      const x = c + r * cos, y = c + r * sin;
      const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'start' ? x : x - w;
      const y0 = sin > 0.15 ? y : sin < -0.15 ? y - h : y - h / 2; // below the spoke end at the bottom, above it at the top
      box = { x, x0, y0, w, h };
      if (!placed.some((p) => x0 < p.x0 + p.w + 4 && p.x0 < x0 + w + 4 && y0 < p.y0 + p.h + 1 && p.y0 < y0 + h + 1)) break;
    }
    placed.push(box);
    const tspans = lines.map((l, j) => `<tspan x="${box.x.toFixed(1)}" y="${(box.y0 + FS - 1 + j * LH).toFixed(1)}">${esc(l)}</tspan>`).join('');
    return `<text text-anchor="${anchor}" class="rd-label${weights[f] > 0 ? '' : ' off'}">${tspans}</text>`;
  }).join('');
  const x0 = Math.min(0, ...placed.map((p) => p.x0)) - 4, x1 = Math.max(size, ...placed.map((p) => p.x0 + p.w)) + 4;
  const y0 = Math.min(0, ...placed.map((p) => p.y0)) - 2, y1 = Math.max(size, ...placed.map((p) => p.y0 + p.h)) + 2;
  return `<svg viewBox="${x0.toFixed(0)} ${y0.toFixed(0)} ${(x1 - x0).toFixed(0)} ${(y1 - y0).toFixed(0)}" class="radar" role="img" aria-label="${esc(earthLabel)} / ${esc(targetLabel)}">
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
