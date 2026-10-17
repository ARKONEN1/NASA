import {
  FACTORS, FACTOR_KEYS, PURPOSES, buildModel, targetProfile, scoreAll, rankAll,
  topSites, nearestCell, bestCellNear, explain, distanceKm,
} from './model.js';
import { t, getLang, setLang, applyStatic, STRINGS } from './i18n.js';

const $ = (s) => document.querySelector(s);
const state = { body: 'moon', targetId: null, purpose: 'balanced', weights: { ...PURPOSES.balanced.w }, selected: -1 };
let model, targets, known, meta, places, bodymaps, scores, ranks, prof, tops = [];

// ---------- text helpers ----------
const S = () => STRINGS[getLang()];
const fName = (f) => S().factors[f][0];
const fShort = (f) => S().factors[f][1];
const pName = (p) => S().purposes[p][0];
const tx = (obj, key) => (getLang() === 'uk' && obj.uk?.[key]) || obj[key]; // translated field of a target / known site
const lowerFirst = (x) => (x.length > 1 && x[1] === x[1].toUpperCase() && x[1] !== x[1].toLowerCase() ? x : x.charAt(0).toLowerCase() + x.slice(1));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const hemi = (v, pos, neg) => (getLang() === 'uk' ? ` ${v >= 0 ? pos[1] : neg[1]}` : (v >= 0 ? pos[0] : neg[0]));
const fmtLat = (v) => `${Math.abs(v).toFixed(1).replace('.', getLang() === 'uk' ? ',' : '.')}°${hemi(v, ['N', 'пн. ш.'], ['S', 'пд. ш.'])}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(1).replace('.', getLang() === 'uk' ? ',' : '.')}°${hemi(v, ['E', 'сх. д.'], ['W', 'зх. д.'])}`;
const fmtCoords = (la, lo) => `${fmtLat(la)} ${fmtLon(lo)}`;
const num = (v, d) => (getLang() === 'uk' ? v.toFixed(d).replace('.', ',').replace('-', '−') : v.toFixed(d).replace('-', '−'));
const pct = (x) => `${Math.round(x * 100)}%`;
function topShare(rank) {
  const top = (1 - rank) * 100;
  const x = top < 1 ? (top < 0.1 ? '0.1' : top.toFixed(1)) : String(Math.round(top));
  return t('top', { x: getLang() === 'uk' ? x.replace('.', ',') : x });
}
function fmtValue(f, v) {
  const d = FACTORS[f];
  if (v == null || !Number.isFinite(v)) return '—';
  if (d.degree) return pct(v);
  const u = S().units[d.unit] ?? d.unit;
  return `${num(v, d.digits)}${u ? (u === '°' || u === '°C' ? '' : ' ') + u : ''}`;
}
function countryOf(i) {
  const c = meta.countries[model.col.country[i]];
  if (c) return Array.isArray(c) ? c[getLang() === 'uk' ? 1 : 0] : c;
  return model.col.lat[i] < -60 ? t('antarctica') : t('unknownLand');
}

// Inferno-like ramp for the score layer.
const RAMP = ['#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4']
  .map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
function ramp(x0) {
  const x = Math.min(1, Math.max(0, x0)) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(x)), f = x - i;
  return RAMP[i].map((c, k) => Math.round(c + (RAMP[i + 1][k] - c) * f));
}

// ---------- map ----------
const map = L_map();
function L_map() {
  const m = L.map('map', { crs: L.CRS.Simple, minZoom: 1, maxZoom: 7, zoomSnap: 0.25, attributionControl: false });
  // The west half overlaps the east by a hair so no seam shows at 0°.
  L.imageOverlay('data/basemap-west.jpg', [[-90, -180], [90, 0.06]]).addTo(m);
  L.imageOverlay('data/basemap-east.jpg', [[-90, 0], [90, 180]]).addTo(m);
  m.setMaxBounds([[-120, -240], [120, 240]]);
  m.fitBounds([[-60, -170], [80, 170]]);
  return m;
}
let scoreLayer = null, selRect = null;
const pinLayer = L.layerGroup().addTo(map);
const knownLayer = L.layerGroup().addTo(map);

function drawScoreLayer() {
  const { dLat, dLon } = meta.grid;
  const W = Math.round(360 / dLon), H = Math.round(180 / dLat) + 1;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H);
  for (let i = 0; i < model.n; i++) {
    const r = ranks[i];
    if (!Number.isFinite(r) || r < 0.6) continue;
    const k01 = (r - 0.6) / 0.4;
    const x = Math.round((model.col.lon[i] + 180) / dLon), y = Math.round((90 - model.col.lat[i]) / dLat);
    const k = (y * W + x) * 4, [cr, cg, cb] = ramp(k01);
    img.data[k] = cr; img.data[k + 1] = cg; img.data[k + 2] = cb;
    img.data[k + 3] = Math.round(255 * (0.2 + 0.72 * k01));
  }
  ctx.putImageData(img, 0, 0);
  const bounds = [[-90 - dLat / 2, -180 - dLon / 2], [90 + dLat / 2, 180 - dLon / 2]];
  if (scoreLayer) scoreLayer.setUrl(cv.toDataURL());
  else scoreLayer = L.imageOverlay(cv.toDataURL(), bounds, { className: 'score-layer', interactive: false }).addTo(map);
}

function drawPins() {
  pinLayer.clearLayers();
  tops.forEach((i, k) => {
    L.marker([model.col.lat[i], model.col.lon[i]], {
      icon: L.divIcon({ className: '', html: `<div class="pin${i === state.selected ? ' active' : ''}">${k + 1}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }),
      keyboard: false,
    }).on('click', () => select(i))
      .bindTooltip(`${k + 1}. ${esc(countryOf(i))} · ${fmtCoords(model.col.lat[i], model.col.lon[i])}`, { direction: 'top', offset: [0, -12] })
      .addTo(pinLayer);
  });
}

function drawKnown() {
  knownLayer.clearLayers();
  for (const s of known.filter((s) => s.bodies.includes(state.body))) {
    L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html: '<div class="known-pin"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), keyboard: false })
      .bindTooltip(`${t('knownPrefix')}: ${esc(tx(s, 'name'))}`, { direction: 'top', offset: [0, -6] })
      .on('click', () => { const i = bestCellNear(model, scores, s.lat, s.lon); if (i >= 0) select(i); })
      .addTo(knownLayer);
  }
}
$('#show-known').addEventListener('change', (e) => (e.target.checked ? knownLayer.addTo(map) : knownLayer.remove()));

// Lava tubes and volcanic caves (hand-compiled list, off by default).
const caveLayer = L.layerGroup();
function drawCaves() {
  caveLayer.clearLayers();
  for (const [name, uk, la, lo] of places.caves) {
    L.marker([la, lo], { icon: L.divIcon({ className: '', html: '<div class="cave-pin"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), keyboard: false })
      .bindTooltip(`${t('cavePrefix')}: ${esc(getLang() === 'uk' ? uk : name)}`, { direction: 'top', offset: [0, -6] })
      .on('click', () => { const i = nearestCell(model, la, lo, 80); if (i >= 0) select(i); })
      .addTo(caveLayer);
  }
}
$('#show-caves').addEventListener('change', (e) => (e.target.checked ? caveLayer.addTo(map) : caveLayer.remove()));
map.on('click', (e) => {
  const i = nearestCell(model, e.latlng.lat, e.latlng.lng, 60);
  if (i >= 0) select(i, { pan: false });
});

// ---------- controls ----------
const target = () => targets[state.body].find((x) => x.id === state.targetId);

function renderLang() {
  document.querySelectorAll('.lang button').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.lang === getLang()));
    b.onclick = () => { if (b.dataset.lang !== getLang()) { setLang(b.dataset.lang); renderAll(); } };
  });
}

function renderBodies() {
  document.querySelectorAll('.segmented button').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.body === state.body));
    b.onclick = () => {
      if (state.body === b.dataset.body) return;
      state.body = b.dataset.body;
      state.targetId = targets[state.body][0].id;
      document.body.dataset.body = state.body;
      renderBodies(); renderTargets(); renderWeights(); recompute(); drawKnown();
    };
  });
  $('#site-h').textContent = t(`stepSite_${state.body}`);
}

// ---------- site map: where the sites are on the Moon / Mars ----------
// Plate carrée map of the body; on the Moon, sites south of 84°S go into a polar-stereographic inset
// (same projection as the LOLA polar DEM: x = ρ·sin λ, y = ρ·cos λ, north of the image = 0°E).
function sitePos(tg) {
  const south = bodymaps.moonSouth;
  if (state.body === 'moon' && tg.lat < south.minLat) {
    const rho = 2 * south.radiusKm * Math.tan(Math.PI / 4 + (tg.lat * Math.PI) / 360);
    const x = rho * Math.sin((tg.lon * Math.PI) / 180), y = rho * Math.cos((tg.lon * Math.PI) / 180);
    return { inset: true, left: 50 + (x / south.halfKm) * 50, top: 50 - (y / south.halfKm) * 50 };
  }
  return { inset: false, left: ((tg.lon + 180) / 360) * 100, top: ((90 - tg.lat) / 180) * 100 };
}
function pickTarget(id) { state.targetId = id; renderTargets(); renderWeights(); recompute(); }
function renderSiteMap() {
  const box = $('#site-map'), list = targets[state.body];
  const hasInset = list.some((tg) => sitePos(tg).inset);
  const marker = (tg, k) => {
    const p = sitePos(tg);
    return `<button class="smk" style="left:${p.left}%;top:${p.top}%" data-id="${tg.id}" aria-pressed="${tg.id === state.targetId}" title="${esc(tx(tg, 'name'))}" aria-label="${esc(tx(tg, 'name'))}">${k + 1}</button>`;
  };
  const inset = list.filter((tg) => sitePos(tg).inset);
  box.innerHTML = `<div class="globe"><img src="data/map-${state.body}.png" alt="${esc(t('siteMapAlt_' + state.body))}">
      ${list.map((tg, k) => (sitePos(tg).inset ? '' : marker(tg, k))).join('')}
      ${hasInset ? `<div class="pole-box"><span>${t('poleBelow')}</span></div>` : ''}</div>
    ${hasInset ? `<div class="pole"><div class="inset"><img src="data/map-moon-south.png" alt="">
        ${list.map((tg, k) => (sitePos(tg).inset ? marker(tg, k) : '')).join('')}</div>
      <p class="pole-cap">${t('poleCaption', { n: inset.length })}</p></div>` : ''}`;
  box.querySelectorAll('.smk').forEach((b) => (b.onclick = () => pickTarget(b.dataset.id)));
}

function renderTargets() {
  renderSiteMap();
  const ul = $('#targets');
  ul.innerHTML = '';
  for (const [k, tg] of targets[state.body].entries()) {
    const li = document.createElement('li');
    li.className = 'target';
    li.setAttribute('role', 'option');
    li.tabIndex = 0;
    li.setAttribute('aria-selected', String(tg.id === state.targetId));
    li.innerHTML = `<div class="thumb"><img src="data/thumbs/${tg.id}.png" alt=""><span class="num-badge">${k + 1}</span></div><div><div class="name">${esc(tx(tg, 'name'))}</div><div class="sub">${esc(tx(tg, 'mission'))}</div></div>`;
    const pick = () => pickTarget(tg.id);
    li.onclick = pick;
    li.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
    ul.append(li);
  }
}

function renderPurposes() {
  const box = $('#purposes');
  box.innerHTML = '';
  for (const [id, p] of Object.entries(PURPOSES)) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(id === state.purpose));
    b.textContent = pName(id);
    b.onclick = () => {
      state.purpose = id;
      state.weights = Object.fromEntries(FACTOR_KEYS.map((f) => [f, p.w[f] || 0]));
      renderPurposes(); renderWeights(); recompute();
    };
    box.append(b);
  }
  $('#purpose-blurb').textContent = S().purposes[state.purpose][1];
}

function renderWeights() {
  const box = $('#weights'), p = targetProfile(model, target());
  box.innerHTML = '';
  for (const f of FACTOR_KEYS) {
    const row = document.createElement('label');
    row.className = 'wrow' + (p[f] ? '' : ' na');
    const v = state.weights[f] || 0;
    row.innerHTML = `<span>${esc(fShort(f))}${p[f] ? '' : ` <small>(${t('na')})</small>`}</span><input type="range" min="0" max="3" step="0.5" value="${v}" ${p[f] ? '' : 'disabled'} aria-label="${esc(fName(f))}"><output>${v}</output>`;
    const input = row.querySelector('input'), out = row.querySelector('output');
    input.oninput = () => { state.weights[f] = +input.value; out.textContent = input.value; scheduleRecompute(); };
    box.append(row);
  }
}
let timer;
const scheduleRecompute = () => { clearTimeout(timer); timer = setTimeout(recompute, 120); };

// ---------- results ----------
// "Alike in …" names the factors where this place beats a typical land cell the most,
// so trivial matches that hold almost everywhere (e.g. "no volcano nearby") are not reported.
let meanSim = {};
function computeMeanSim() {
  meanSim = {};
  for (const f of FACTOR_KEYS) {
    if (!prof[f]) continue;
    let s = 0, w = 0;
    for (let i = 0; i < model.n; i += 7) {
      const e = FACTORS[f].degree ? model.col[f][i] : model.pct[f][i];
      if (!Number.isFinite(e)) continue;
      s += model.w[i] * (1 - Math.abs(e - prof[f].pos)); w += model.w[i];
    }
    meanSim[f] = w ? s / w : 0;
  }
}
function whyLine(i) {
  const rows = explain(model, i, prof, state.weights).filter((r) => r.weight > 0 && Number.isFinite(r.sim));
  const lift = (r) => (r.sim - (meanSim[r.f] ?? 0)) * r.weight;
  const good = rows.filter((r) => lift(r) > 0.05).sort((a, b) => lift(b) - lift(a)).slice(0, 3).map((r) => lowerFirst(fShort(r.f)));
  const bad = [...rows].sort((a, b) => a.sim - b.sim)[0];
  return (good.length ? t('alike', { list: good.join(', ') }) : t('alikeMany')) +
    (bad && bad.sim < 0.6 ? ` · ${t('differs', { f: lowerFirst(fShort(bad.f)) })}` : '');
}
const knownNear = (i, km = 150) => known.find((s) => distanceKm(s.lat, s.lon, model.col.lat[i], model.col.lon[i]) < km);

function renderSites() {
  const ol = $('#sites');
  ol.innerHTML = '';
  tops.forEach((i, k) => {
    const li = document.createElement('li');
    li.className = 'site';
    li.tabIndex = 0;
    li.setAttribute('aria-selected', String(i === state.selected));
    const kn = knownNear(i);
    li.innerHTML = `<span class="n">${k + 1}</span>
      <div><div class="where">${esc(countryOf(i))}${kn ? `<span class="tag known" title="${esc(t('knownNear', { name: tx(kn, 'name') }))}">${t('tagKnown')}</span>` : `<span class="tag new">${t('tagNew')}</span>`}</div>
      <div class="why">${fmtCoords(model.col.lat[i], model.col.lon[i])} · ${esc(whyLine(i))}</div></div>
      <div class="score">${Math.round(scores[i] * 100)}<small>${topShare(ranks[i])}</small></div>`;
    li.onclick = () => select(i);
    li.onkeydown = (e) => { if (e.key === 'Enter') select(i); };
    ol.append(li);
  });
  $('#top-hint').textContent = t('topHint', { n: tops.filter((i) => !knownNear(i)).length, total: tops.length });
}

function gibs(layer, la, lo, km = 150, px = 320) {
  const dLa = km / 111.2 / 2, dLo = dLa / Math.max(0.15, Math.cos(la * Math.PI / 180));
  const bbox = [lo - dLo, Math.max(-90, la - dLa), lo + dLo, Math.min(90, la + dLa)].map((v) => v.toFixed(4)).join(',');
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=${layer}&SRS=EPSG:4326&BBOX=${bbox}&WIDTH=${px}&HEIGHT=${px}&FORMAT=image/jpeg&STYLES=`;
}

// ---------- site card: what the place is ----------
function siteFacts(i) {
  const c = model.col, cls = S().landcover[c.lc_major[i]] ?? '';
  const rain = c.precip[i] * 365;
  return [
    `<b>${esc(cls)}</b>`,
    t('factElev', { v: num(c.elev[i], 0) }),
    t('factTemp', { v: num(c.ts_mean[i], 0), lo: num(c.ts_min[i], 0), hi: num(c.ts_max[i], 0) }),
    t('factRain', { v: num(rain < 10 ? rain : Math.round(rain / 10) * 10, rain < 10 ? 1 : 0) }),
  ].join(' · ');
}
function nearest(list, la, lo, latIdx, lonIdx, maxKm, filter = () => true) {
  let best = null, bd = Infinity;
  for (const p of list) {
    if (!filter(p) || Math.abs(p[latIdx] - la) > maxKm / 100) continue;
    const d = distanceKm(la, lo, p[latIdx], p[lonIdx]);
    if (d < bd) { bd = d; best = p; }
  }
  return bd <= maxKm ? { p: best, d: bd } : null;
}
function nearbyHtml(la, lo) {
  const items = [];
  const v = nearest(places.volcanoes, la, lo, 1, 2, 300);
  if (v) items.push(t(v.p[3] ? 'nearBasalt' : 'nearVolcano', { name: v.p[0], d: Math.round(v.d) }));
  const cr = nearest(places.craters, la, lo, 1, 2, 300);
  if (cr) items.push(t('nearCrater', { name: cr.p[0], d: Math.round(Math.max(0, cr.d)), size: num(cr.p[3], cr.p[3] < 10 ? 1 : 0) }));
  const cv = nearest(places.caves, la, lo, 2, 3, 300);
  if (cv) items.push(t('nearCave', { name: getLang() === 'uk' ? cv.p[1] : cv.p[0], d: Math.round(cv.d) }));
  return items.length ? `<ul class="near-list">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
}

function renderCompare() {
  const body = $('#compare-body'), tg = target(), i = state.selected;
  if (i < 0) { body.innerHTML = ''; return; }
  const la = model.col.lat[i], lo = model.col.lon[i];
  const kn = knownNear(i);
  const tName = tx(tg, 'name');
  let html = `
    <div class="cmp-head">
      <div class="cmp-side">
        <span class="label">${t(state.body)} · ${esc(tx(tg, 'kind'))}</span>
        <span class="title">${esc(tName)}</span>
        <span class="coords">${fmtCoords(tg.lat, tg.lon)}</span>
        <div class="cmp-imgs">
          <div class="cmp-img"><img src="data/thumbs/${tg.id}.png" alt=""><span>${t('relief')} · ${targets.thumbKm} km</span></div>
          <p class="cmp-why">${esc(tx(tg, 'why'))}</p>
        </div>
      </div>
      <div class="cmp-side">
        <span class="label">${t('earth')}${kn ? ` · ${esc(t('near', { name: tx(kn, 'name') }))}` : ''}</span>
        <span class="title">${esc(countryOf(i))}</span>
        <span class="coords">${fmtCoords(la, lo)}</span>
        <p class="site-facts">${siteFacts(i)}</p>
        ${nearbyHtml(la, lo)}
        <div class="cmp-imgs">
          <div class="cmp-img"><img loading="lazy" src="${gibs('ASTER_GDEM_Greyscale_Shaded_Relief', la, lo)}" alt=""><span>${t('relief')} · 150 km</span></div>
          <div class="cmp-img"><img loading="lazy" src="${gibs('BlueMarble_NextGeneration', la, lo)}" alt=""><span>${t('blueMarble')}</span></div>
        </div>
      </div>
    </div>
    <div class="cmp-score"><strong>${Math.round(scores[i] * 100)}</strong><span>${esc(t('scoreLine', { share: topShare(ranks[i]), purpose: lowerFirst(pName(state.purpose)) }))}</span></div>
    <table class="factors"><thead><tr><th>${t('colFactor')}</th><th class="num">${t('colEarth')}</th><th class="num">${esc(t(state.body))}</th><th>${t('colMatch')}</th></tr></thead><tbody>`;
  let group = '';
  for (const r of explain(model, i, prof, state.weights)) {
    const d = FACTORS[r.f];
    if (d.group !== group) { group = d.group; html += `<tr class="group-row"><td colspan="4">${S().groups[group]}</td></tr>`; }
    const sim = Number.isFinite(r.sim) ? r.sim : 0;
    const [cr, cg, cb] = ramp(0.25 + sim * 0.75);
    const beyond = r.beyond ? `<span class="beyond">${t(r.beyond === 'below' ? 'lower' : 'higher')}</span>` : '';
    html += `<tr class="${r.weight > 0 ? '' : 'off'}" title="${esc(fName(r.f))}${r.weight > 0 ? '' : ` (${t('notCounted')})`}">
      <td>${esc(fShort(r.f))}</td><td class="num">${fmtValue(r.f, r.earth)}</td><td class="num">${fmtValue(r.f, r.target)}${beyond}</td>
      <td><div class="bar"><i style="width:${Math.max(3, sim * 100)}%;background:rgb(${cr},${cg},${cb})"></i></div></td></tr>`;
  }
  body.innerHTML = html + '</tbody></table>';
}

// Which factors make the known sites stand out from ordinary land — and which do not.
// When a factor gives no lift, the known sites were chosen for something else and cannot vouch for it.
function liftHtml(res) {
  const keys = FACTOR_KEYS.filter((f) => prof[f] && (state.weights[f] || 0) > 0);
  if (!res.length || !keys.length) return '';
  const lift = keys.map((f) => {
    let s = 0, n = 0;
    for (const x of res) for (const r of explain(model, x.i, prof, state.weights)) if (r.f === f && Number.isFinite(r.sim)) { s += r.sim; n++; }
    return { f, l: (n ? s / n : 0) - (meanSim[f] ?? 0) };
  });
  const up = lift.filter((x) => x.l > 0.08).sort((a, b) => b.l - a.l);
  const flat = lift.filter((x) => x.l <= 0.03);
  const chips = (a, cls) => a.map((x) => `<span class="${cls}">${esc(fShort(x.f))}</span>`).join('') || '—';
  return `<div class="lift">
    <div><h3>${t('liftUp')}</h3><div class="chips">${chips(up, 'up')}</div></div>
    <div><h3>${t('liftFlat')}</h3><div class="chips">${chips(flat, '')}</div></div>
    ${flat.length ? `<p>${t('liftNote')}</p>` : ''}
  </div>`;
}

function renderCheck() {
  const sites = known.filter((s) => s.bodies.includes(state.body));
  const res = sites.map((s) => { const i = bestCellNear(model, scores, s.lat, s.lon); return { s, i, r: i >= 0 ? ranks[i] : NaN }; })
    .filter((x) => Number.isFinite(x.r)).sort((a, b) => b.r - a.r);
  const median = res.length ? res[Math.floor(res.length / 2)].r : NaN;
  const inTop10 = res.filter((x) => x.r >= 0.9).length;
  $('#check').innerHTML = `
    <div class="check-summary">
      <div><strong>${topShare(median)}</strong> <span>${t('checkMedian', { n: res.length, body: t(`adj_${state.body}`) })}</span></div>
      <div><strong>${inTop10}/${res.length}</strong> <span>${t('checkTop10')}</span></div>
    </div>
    <ul class="check-list">${res.map((x) => {
      const [cr, cg, cb] = ramp(x.r);
      return `<li data-i="${x.i}" title="${esc(tx(x.s, 'use'))}"><span class="nm">${esc(tx(x.s, 'name'))}</span><div class="bar"><i style="width:${x.r * 100}%;background:rgb(${cr},${cg},${cb})"></i></div><span class="pc">${topShare(x.r).replace(/^\D+/, '')}</span></li>`;
    }).join('')}</ul>
    ${liftHtml(res)}`;
  document.querySelectorAll('.check-list li').forEach((li) => (li.onclick = () => select(+li.dataset.i)));
}

function renderSources() {
  $('#sources').innerHTML = [...Object.values(meta.sources), targets.sources.moon, targets.sources.mars, t('srcClimateBodies'), t('srcThumbs')]
    .map((s) => `<li>${esc(s)}</li>`).join('');
}

function select(i, { pan = true } = {}) {
  state.selected = i;
  const la = model.col.lat[i], lo = model.col.lon[i], { dLat, dLon } = meta.grid;
  if (selRect) selRect.remove();
  selRect = L.rectangle([[la - dLat / 2, lo - dLon / 2], [la + dLat / 2, lo + dLon / 2]], { color: '#fff', weight: 2, fill: false, interactive: false }).addTo(map);
  if (pan) map.panTo([la, lo]);
  drawPins(); renderSites(); renderCompare();
}

function recompute() {
  prof = targetProfile(model, target());
  scores = scoreAll(model, prof, state.weights);
  ranks = rankAll(model, scores);
  tops = topSites(model, scores, 10, 400);
  computeMeanSim();
  drawScoreLayer();
  renderCheck();
  select(tops[0], { pan: false });
}

// ---------- export ----------
function exportRows() {
  const list = topSites(model, scores, 50, 250);
  const tg = target();
  return list.map((i, k) => {
    const kn = knownNear(i);
    const row = {
      rank: k + 1, lat: +model.col.lat[i].toFixed(3), lon: +model.col.lon[i].toFixed(3),
      country: meta.countries[model.col.country[i]]?.[0] ?? '', score: Math.round(scores[i] * 100),
      top_percent: +((1 - ranks[i]) * 100).toFixed(2), status: kn ? 'known' : 'new', known_site: kn?.name ?? '',
      land_cover: STRINGS.en.landcover[model.col.lc_major[i]] ?? '', elevation_m: Math.round(model.col.elev[i]),
      target: tg.name, target_lat: tg.lat, target_lon: tg.lon, purpose: STRINGS.en.purposes[state.purpose][0],
    };
    for (const r of explain(model, i, prof, state.weights)) {
      row[r.f] = Number.isFinite(r.earth) ? +r.earth.toFixed(3) : '';
      row[`${r.f}_match`] = Number.isFinite(r.sim) ? +r.sim.toFixed(3) : '';
    }
    return row;
  });
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const exportName = (ext) => `analog-atlas_${state.targetId}_${state.purpose}.${ext}`;
$('#export-csv').onclick = () => {
  const rows = exportRows(), cols = Object.keys(rows[0]);
  const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  download(exportName('csv'), [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n'), 'text/csv');
};
$('#export-geojson').onclick = () => {
  const features = exportRows().map(({ lat, lon, ...p }) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { lat, lon, ...p } }));
  download(exportName('geojson'), JSON.stringify({ type: 'FeatureCollection', features }, null, 1), 'application/geo+json');
};

/** Re-render every text after a language switch (scores stay as they are). */
function renderAll() {
  applyStatic(); renderLang(); renderBodies(); renderTargets(); renderPurposes(); renderWeights(); renderSources(); drawKnown(); drawCaves();
  if (scores) { renderCheck(); drawPins(); renderSites(); renderCompare(); }
}

// ---------- intro (can be hidden; remembered per browser) ----------
try { if (localStorage.getItem('introHidden') === '1') $('#intro').hidden = true; } catch {}
$('#intro-hide').onclick = () => { $('#intro').hidden = true; try { localStorage.setItem('introHidden', '1'); } catch {} };
$('.method-link').addEventListener('click', () => { $('#intro').hidden = false; });

// ---------- boot ----------
applyStatic(); renderLang();
(async () => {
  try {
    const [m, bin, tg, kn, pl, bm] = await Promise.all([
      fetch('data/earth-meta.json').then((r) => r.json()),
      fetch('data/earth-cells.bin').then((r) => r.arrayBuffer()),
      fetch('data/targets.json').then((r) => r.json()),
      fetch('data/known-analogs.json').then((r) => r.json()),
      fetch('data/places.json').then((r) => r.json()),
      fetch('data/bodymaps.json').then((r) => r.json()),
    ]);
    places = pl;
    bodymaps = bm;
    meta = m;
    model = buildModel(meta, bin);
    targets = tg;
    known = kn.sites;
    state.targetId = targets.moon[0].id;
    renderAll();
    recompute();
    $('#map-status').classList.add('hidden');
  } catch (e) {
    console.error(e);
    $('#map-status').textContent = t('loadError');
  }
})();
