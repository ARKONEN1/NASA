import {
  FACTORS, FACTOR_KEYS, PURPOSES, buildModel, targetProfile, scoreAll, rankAll,
  topSites, nearestCell, bestCellNear, explain, distanceKm, stabilityRunner, allPurposes,
  randomLandPoints, ranksNear, aucOf,
} from './model.js';
import { t, getLang, setLang, applyStatic, STRINGS } from './i18n.js';
import { radarSvg, detailRows, logistics } from './extras.js';
import { studiedRegion } from './studied.js';

const $ = (s) => document.querySelector(s);
const state = { body: 'moon', targetId: null, purpose: 'balanced', weights: { ...PURPOSES.balanced.w }, selected: -1, onlyNew: false };
let model, targets, known, meta, places, bodymaps, detail = {}, logi, scores, ranks, prof, tops = [];
let stab = new Map(), stabJob = 0, randomPts = null; // robustness results for the current choice

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
function beatPct(rank) {
  const b = Math.min(99.9, Math.max(0, rank * 100));
  const x = b >= 99 ? (Math.floor(b * 10) / 10).toFixed(1) : String(Math.floor(b));
  return getLang() === 'uk' ? x.replace('.', ',') : x;
}
const topShare = (rank) => t('top', { x: beatPct(rank) });
function fmtValue(f, v) {
  const d = FACTORS[f];
  if (v == null || !Number.isFinite(v)) return '—';
  if (d.degree) return pct(v);
  const u = S().units[d.unit] ?? d.unit;
  return `${num(v, d.digits)}${u ? (u === '°' || u === '°C' ? '' : ' ') + u : ''}`;
}
function meter(sim) {
  const v = Number.isFinite(sim) ? sim : 0;
  return `<div class="meter"><div class="bar"><i style="width:${Math.max(3, v * 100)}%;--v:${v.toFixed(3)}"></i></div><b>${Number.isFinite(sim) ? Math.round(sim * 100) + '%' : '—'}</b></div>`;
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
  const m = L.map('map', { crs: L.CRS.Simple, minZoom: 0, maxZoom: 7, zoomSnap: 0, zoomDelta: 0.5, attributionControl: false });
  // The west half overlaps the east by a hair so no seam shows at 0°.
  L.imageOverlay('data/basemap-west.jpg', [[-90, -180], [90, 0.06]]).addTo(m);
  L.imageOverlay('data/basemap-east.jpg', [[-90, 0], [90, 180]]).addTo(m);
  m.setMaxBounds([[-120, -240], [120, 240]]);
  const fit = () => m.fitBounds([[-58, -180], [84, 180]], { animate: false });
  fit();
  // Refit when the frame changes size (window resize, sidebar collapsing on phones).
  let w0 = m.getSize().x;
  new ResizeObserver(() => { m.invalidateSize(); const w = m.getSize().x; if (Math.abs(w - w0) > 40 && tourStep < 0) fit(); w0 = w; }).observe(document.getElementById('map'));
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

let themeTimer;
function setTheme(body) {
  if (document.body.dataset.body === body) return false;
  document.body.classList.add('theme-shift');
  document.body.dataset.body = body;
  clearTimeout(themeTimer);
  themeTimer = setTimeout(() => document.body.classList.remove('theme-shift'), 1000);
  return true;
}
// Re-scoring blocks the page for a moment; run it after the colour fade so the fade stays smooth.
const afterFade = (changed, fn) => (changed ? setTimeout(fn, 950) : fn());

function renderBodies() {
  document.querySelectorAll('.segmented button').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.body === state.body));
    b.onclick = () => {
      if (state.body === b.dataset.body) return;
      state.body = b.dataset.body;
      state.targetId = targets[state.body][0].id;
      const changed = setTheme(state.body);
      renderBodies(); renderTargets(); renderWeights();
      afterFade(changed, () => { recompute(); drawKnown(); });
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
// "new" = no test site within 150 km AND outside the regions the challenge names as well known.
function statusOf(i) {
  const kn = knownNear(i);
  if (kn) return { kind: 'known', kn };
  const region = studiedRegion(model.col.lat[i], model.col.lon[i]);
  return region ? { kind: 'studied', region } : { kind: 'new' };
}
const isNew = (i) => statusOf(i).kind === 'new';
const regionName = (r) => (getLang() === 'uk' ? r.uk : r.en);
function tagHtml(i, long = false) {
  const st = statusOf(i);
  if (st.kind === 'known') return `<span class="tag known" title="${esc(t('knownNear', { name: tx(st.kn, 'name') }))}">${t('tagKnown')}${long ? ': ' + esc(tx(st.kn, 'name')) : ''}</span>`;
  if (st.kind === 'studied') return `<span class="tag studied" title="${esc(t('studiedHint', { name: regionName(st.region) }))}">${t('tagStudied')}${long ? ': ' + esc(regionName(st.region)) : ''}</span>`;
  return `<span class="tag new" title="${esc(t('newHint'))}">${t('tagNew')}</span>`;
}

function renderSites() {
  const ol = $('#sites');
  ol.innerHTML = '';
  tops.forEach((i, k) => {
    const li = document.createElement('li');
    li.className = 'site';
    li.tabIndex = 0;
    li.setAttribute('aria-selected', String(i === state.selected));
    li.title = fmtCoords(model.col.lat[i], model.col.lon[i]);
    li.innerHTML = `<div class="site-top"><span class="n">${k + 1}</span><span class="where">${esc(countryOf(i))}</span><span class="score" title="${esc(t('scoreHint'))}">${Math.round(scores[i] * 100)}<small>${t('scoreWord')}</small></span></div>
      <div class="site-meta">${tagHtml(i)}
        <span>${topShare(ranks[i])}</span><span class="stab${(stab.get(i) ?? 1) < 0.8 ? ' weak' : ''}" title="${esc(t('stabilityHint'))}">${stabText(i)}</span></div>
      <div class="why">${esc(whyLine(i))}</div>`;
    li.onclick = () => select(i);
    li.onkeydown = (e) => { if (e.key === 'Enter') select(i); };
    ol.append(li);
  });
  $('#top-hint').textContent = t('topHint', { n: tops.filter(isNew).length, total: tops.length });
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
  const tName = tx(tg, 'name');
  let html = `
    <div class="cmp-media">
      <div class="cmp-side" style="grid-area:th">
        <span class="label">${t(state.body)} · ${esc(tx(tg, 'kind'))}</span>
        <span class="title">${esc(tName)}</span>
        <span class="coords">${fmtCoords(tg.lat, tg.lon)}</span>
      </div>
      <div class="cmp-side" style="grid-area:eh">
        <span class="label">${t('earth')} · ${tagHtml(i, true)}</span>
        <span class="title">${esc(countryOf(i))}</span>
        <span class="coords">${fmtCoords(la, lo)}</span>
      </div>
      <div class="cmp-img" style="grid-area:ti"><img src="data/thumbs/${tg.id}.png" alt=""><span>${t('relief')} · ${targets.thumbKm} ${t('km')}</span></div>
      <div class="cmp-img" style="grid-area:er"><img loading="lazy" src="${gibs('ASTER_GDEM_Greyscale_Shaded_Relief', la, lo)}" alt=""><span>${t('relief')} · 150 ${t('km')}</span></div>
      <div class="cmp-img" style="grid-area:es"><img loading="lazy" src="${gibs('BlueMarble_NextGeneration', la, lo)}" alt=""><span>${t('blueMarble')}</span></div>
      <div class="cmp-text" style="grid-area:tw">${esc(tx(tg, 'why'))}</div>
      <div class="cmp-text" style="grid-area:ef"><p class="site-facts">${siteFacts(i)}</p>${nearbyHtml(la, lo)}${logisticsHtml(la, lo)}</div>
    </div>
    <div class="cmp-score"><span class="score-word">${t('scoreWord')}</span><strong>${Math.round(scores[i] * 100)}</strong><span>${esc(t('scoreLine', { share: topShare(ranks[i]), purpose: lowerFirst(pName(state.purpose)) }))}</span>
      <span class="stab-line" title="${esc(t('stabilityHint'))}">${stabText(i)}</span>
      <button class="dossier-btn" id="dossier-btn">${t('dossierBtn')}</button></div>
    <div class="cmp-grid">
      <div class="cmp-col">
        <div class="radar-box"><h3>${t('radarTitle')} <span class="info" title="${esc(t('radarHint'))}">?</span></h3>${radarSvg(model, prof, state.weights, i, { label: fShort, earthLabel: t('earth'), targetLabel: tName })}</div>
        <div class="detail-box"><h3>${t('detailTitle')} <span class="info" title="${esc(t('detailHint'))}">?</span></h3>${detailHtml(i, tg)}</div>
      </div>
      <div class="cmp-col">
    <table class="factors"><thead><tr><th>${t('colFactor')}</th><th class="num">${t('colEarth')}</th><th class="num">${esc(t(state.body))}</th><th class="match">${t('colMatch')}</th></tr></thead><tbody>`;
  let group = '';
  for (const r of explain(model, i, prof, state.weights)) {
    const d = FACTORS[r.f];
    if (d.group !== group) { group = d.group; html += `<tr class="group-row"><td colspan="4">${S().groups[group]}</td></tr>`; }
    const beyond = r.beyond ? `<span class="beyond" title="${esc(t(r.beyond === 'below' ? 'lower' : 'higher'))}">${r.beyond === 'below' ? '↓' : '↑'}</span>` : '';
    html += `<tr class="${r.weight > 0 ? '' : 'off'}" title="${esc(fName(r.f))}${r.weight > 0 ? '' : ` (${t('notCounted')})`}">
      <td>${esc(fShort(r.f))}</td><td class="num">${fmtValue(r.f, r.earth)}</td><td class="num">${fmtValue(r.f, r.target)}${beyond}</td>
      <td class="match">${meter(r.sim)}</td></tr>`;
  }
  body.innerHTML = html + '</tbody></table></div></div>';
  $('#dossier-btn').onclick = () => openDossier(i);
}

const cellKey = (i) => `${model.col.lat[i]},${model.col.lon[i]}`;
function detailHtml(i, tg) {
  const e = detail[cellKey(i)];
  if (!e) return `<p class="hint">${t('detailNone')}</p>`;
  const rows = detailRows(e, tg.detail);
  const fmt = (k, v) => (!Number.isFinite(v) ? '—' : k === 'relief' ? `${num(v, 0)} ${t('m')}` : k.startsWith('pct') ? `${num(v, v < 10 ? 1 : 0)}%` : `${num(v, 1)}°`);
  return `<table class="factors compact"><thead><tr><th></th><th class="num">${t('colEarth')}</th><th class="num">${esc(t(state.body))}</th><th class="match">${t('colMatch')}</th></tr></thead><tbody>${rows.map((r) =>
    `<tr><td>${t('d_' + r.k)}</td><td class="num">${fmt(r.k, r.earth)}</td><td class="num">${fmt(r.k, r.target)}</td><td class="match">${meter(r.sim)}</td></tr>`).join('')}</tbody></table>`;
}
function logisticsHtml(la, lo) {
  const { town, airport } = logistics(logi, la, lo);
  const items = [];
  if (town) items.push(t('nearTown', { name: town.p[0], d: Math.round(town.d) }));
  if (airport) items.push(t('nearAirport', { name: getLang() === 'uk' ? airport.p[1] : airport.p[0], code: airport.p[2] ? ` (${airport.p[2]})` : '', d: Math.round(airport.d) }));
  return items.length ? `<ul class="near-list logi">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
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
    <div><h3>${t('liftFlat')} <span class="info" title="${esc(t('liftNote'))}">?</span></h3><div class="chips">${chips(flat, '')}</div></div>
  </div>`;
}

function renderCheck() {
  const sites = known.filter((s) => s.bodies.includes(state.body));
  const res = sites.map((s) => { const i = bestCellNear(model, scores, s.lat, s.lon); return { s, i, r: i >= 0 ? ranks[i] : NaN }; })
    .filter((x) => Number.isFinite(x.r)).sort((a, b) => b.r - a.r);
  const median = res.length ? res[Math.floor(res.length / 2)].r : NaN;
  const inTop10 = res.filter((x) => x.r >= 0.9).length;
  // Fair baseline: random land places get the same "best cell within 60 km" treatment as the sites.
  randomPts ||= randomLandPoints(model, 300);
  const rnd = ranksNear(model, scores, ranks, randomPts).sort((a, b) => a - b);
  const rndMedian = rnd[Math.floor(rnd.length / 2)];
  const auc = aucOf(res.map((x) => x.r), rnd);
  $('#check').innerHTML = `
    <div class="check-summary">
      <div><strong>${num(auc, 2)}</strong> <span>${t('checkAuc')}</span></div>
      <div><strong>${beatPct(median)}%</strong> <span>${t('checkMedian', { n: res.length, rnd: beatPct(rndMedian) + '%' })}</span></div>
      <div><strong>${inTop10}/${res.length}</strong> <span>${t('checkTop10')}</span></div>
    </div>
    <ul class="check-list">${res.map((x) => {
      return `<li data-i="${x.i}" title="${esc(tx(x.s, 'use'))}"><span class="nm">${esc(tx(x.s, 'name'))}</span><div class="bar"><i style="width:${x.r * 100}%;--v:${x.r.toFixed(3)}"></i></div><span class="pc">${beatPct(x.r)}%</span></li>`;
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
  // Pan only when the place is out of view, so the whole-world view stays filled edge to edge.
  if (pan && !map.getBounds().pad(-0.08).contains([la, lo])) map.panTo([la, lo]);
  drawPins(); renderSites(); renderCompare();
  writeHash();
  if (stabAsked.size) runStability([i]);
}

// ---------- robustness (runs in the background, a few re-scorings per frame) ----------
const worker = new Worker('js/stability-worker.js', { type: 'module' });
const stabSig = () => `${state.targetId}|${state.purpose}|${JSON.stringify(state.weights)}`;
const stabAsked = new Set();
function runStability(cells) {
  const todo = cells.filter((i) => !stab.has(i) && !stabAsked.has(i));
  if (!todo.length) return;
  todo.forEach((i) => stabAsked.add(i));
  worker.postMessage({ sig: stabSig(), prof, weights: state.weights, cells: todo });
}
worker.onmessage = (e) => {
  if (e.data.sig !== stabSig()) return; // a newer choice was made meanwhile
  for (const [i, v] of e.data.result) stab.set(i, v);
  renderSites(); renderCompare();
};
const stabText = (i) => (stab.has(i) ? t('stability', { v: Math.round(stab.get(i) * 100) }) : t('stabilityPending'));

function recompute() {
  prof = targetProfile(model, target());
  scores = scoreAll(model, prof, state.weights);
  ranks = rankAll(model, scores);
  tops = topSites(model, scores, 10, 400, state.onlyNew ? isNew : undefined);
  computeMeanSim();
  drawScoreLayer();
  renderCheck();
  stab = new Map();
  stabAsked.clear();
  select(state.pendingCell ?? tops[0], { pan: !!state.pendingCell });
  state.pendingCell = null;
  runStability(tops);
  runStability([state.selected]);
}

// ---------- export ----------
function exportRows() {
  const list = topSites(model, scores, 50, 250, state.onlyNew ? isNew : undefined);
  const tg = target();
  return list.map((i, k) => {
    const kn = knownNear(i);
    const row = {
      rank: k + 1, lat: +model.col.lat[i].toFixed(3), lon: +model.col.lon[i].toFixed(3),
      country: meta.countries[model.col.country[i]]?.[0] ?? '', score: Math.round(scores[i] * 100),
      top_percent: +((1 - ranks[i]) * 100).toFixed(2), status: statusOf(i).kind, known_site: kn?.name ?? '',
      studied_region: statusOf(i).region?.en ?? '',
      land_cover: STRINGS.en.landcover[model.col.lc_major[i]] ?? '', elevation_m: Math.round(model.col.elev[i]),
      target: tg.name, target_lat: tg.lat, target_lon: tg.lon, purpose: STRINGS.en.purposes[state.purpose][0],
      stability: stab.has(i) ? +stab.get(i).toFixed(2) : '',
    };
    const lg = logistics(logi, model.col.lat[i], model.col.lon[i]);
    row.nearest_town = lg.town?.p[0] ?? ''; row.nearest_town_km = lg.town ? Math.round(lg.town.d) : '';
    row.nearest_airport = lg.airport ? `${lg.airport.p[0]}${lg.airport.p[2] ? ' (' + lg.airport.p[2] + ')' : ''}` : ''; row.nearest_airport_km = lg.airport ? Math.round(lg.airport.d) : '';
    const d = detail[cellKey(i)];
    ['slope_median_deg', 'slope_p90_deg', 'slopes_over_10deg_pct', 'slopes_over_20deg_pct', 'relief_20km_m'].forEach((k, j) => { row[k] = d ? d[j] : ''; });
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
$('#only-new').addEventListener('change', (e) => { state.onlyNew = e.target.checked; recompute(); });
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
  if (tourStep >= 0) showTour(tourStep, false);
}

// ---------- shareable links: #/body/site/purpose/lat,lon ----------
function writeHash() {
  if (state.selected < 0) return;
  const h = `#/${state.body}/${state.targetId}/${state.purpose}/${model.col.lat[state.selected]},${model.col.lon[state.selected]}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}
function readHash() {
  const [body, id, purpose, cell] = location.hash.replace(/^#\/?/, '').split('/');
  if (!targets[body]?.some((x) => x.id === id)) return;
  state.body = body;
  state.targetId = id;
  if (PURPOSES[purpose]) {
    state.purpose = purpose;
    state.weights = Object.fromEntries(FACTOR_KEYS.map((f) => [f, PURPOSES[purpose].w[f] || 0]));
  }
  const [la, lo] = (cell || '').split(',').map(Number);
  if (Number.isFinite(la) && Number.isFinite(lo)) {
    const i = nearestCell(model, la, lo, 80);
    if (i >= 0) state.pendingCell = i;
  }
}

/** Switch the whole view to a body / site / purpose and open one Earth place (used by the tour). */
function goTo(body, id, purpose, la, lo, zoom = 3) {
  state.body = body;
  state.targetId = id;
  state.purpose = purpose;
  state.weights = Object.fromEntries(FACTOR_KEYS.map((f) => [f, PURPOSES[purpose].w[f] || 0]));
  const changed = setTheme(body);
  const i = nearestCell(model, la, lo, 80);
  if (i >= 0) state.pendingCell = i;
  renderBodies(); renderTargets(); renderPurposes(); renderWeights();
  afterFade(changed, () => { drawKnown(); recompute(); map.setView([la, lo], zoom); });
}

// ---------- site dossier: one printable page per candidate ----------
async function openDossier(i) {
  const tg = target(), la = model.col.lat[i], lo = model.col.lon[i];
  const all = allPurposes(model, prof, i);
  const rows = explain(model, i, prof, state.weights);
  const box = $('#dossier');
  const purposeRows = Object.keys(PURPOSES).map((p) => `<tr${p === state.purpose ? ' class="cur"' : ''}><td>${esc(pName(p))}</td><td class="num">${Math.round(all[p].score * 100)}</td><td class="num">${esc(topShare(1 - all[p].top))}</td></tr>`).join('');
  const factorRows = rows.map((r) => `<tr${r.weight > 0 ? '' : ' class="off"'}><td>${esc(fShort(r.f))}</td><td class="num">${fmtValue(r.f, r.earth)}</td><td class="num">${fmtValue(r.f, r.target)}</td><td class="num">${Number.isFinite(r.sim) ? Math.round(r.sim * 100) + '%' : '—'}</td></tr>`).join('');
  box.innerHTML = `
    <header class="ds-head">
      <div><div class="ds-kicker">${t('dossierKicker')}</div>
        <h1>${esc(countryOf(i))} · ${fmtCoords(la, lo)}</h1>
        <p>${t('dossierFor', { target: esc(tx(tg, 'name')), body: esc(t(state.body)), purpose: esc(lowerFirst(pName(state.purpose))) })}</p></div>
      <div class="ds-score"><b>${Math.round(scores[i] * 100)}</b><span>${esc(topShare(ranks[i]))}</span><span>${stabText(i)}</span>
        ${tagHtml(i, true)}</div>
    </header>
    <section class="ds-cols">
      <div><h2>${t('earth')}</h2><p class="site-facts">${siteFacts(i)}</p>${nearbyHtml(la, lo)}${logisticsHtml(la, lo)}
        <h2>${t('dossierWhy')}</h2><p>${esc(whyLine(i))}</p></div>
      <div><h2>${esc(t(state.body))} · ${esc(tx(tg, 'kind'))}</h2><p><b>${esc(tx(tg, 'name'))}</b>, ${fmtCoords(tg.lat, tg.lon)}. ${esc(tx(tg, 'mission'))}.</p><p>${esc(tx(tg, 'why'))}</p></div>
    </section>
    <section class="ds-imgs">
      <figure><img src="data/thumbs/${tg.id}.png" alt=""><figcaption>${esc(tx(tg, 'name'))} · ${t('relief')} 150 ${t('km')}</figcaption></figure>
      <figure><img src="${gibs('ASTER_GDEM_Greyscale_Shaded_Relief', la, lo, 150, 480)}" alt=""><figcaption>${t('earth')} · ${t('relief')} 150 ${t('km')}</figcaption></figure>
      <figure><img src="${gibs('BlueMarble_NextGeneration', la, lo, 150, 480)}" alt=""><figcaption>${t('earth')} · ${t('blueMarble')}</figcaption></figure>
    </section>
    <section class="ds-cols">
      <div><h2>${t('radarTitle')}</h2>${radarSvg(model, prof, state.weights, i, { label: fShort, earthLabel: t('earth'), targetLabel: tx(tg, 'name') })}</div>
      <div><h2>${t('dossierPurposes')}</h2><table class="ds-table"><thead><tr><th>${t('stepPurpose')}</th><th class="num">/100</th><th class="num">${t('dossierShare')}</th></tr></thead><tbody>${purposeRows}</tbody></table>
        <h2>${t('detailTitle')}</h2>${detailHtml(i, tg)}<p class="hint">${t('detailHint')}</p></div>
    </section>
    <section><h2>${t('dossierFactors')}</h2><table class="ds-table"><thead><tr><th>${t('colFactor')}</th><th class="num">${t('colEarth')}</th><th class="num">${esc(t(state.body))}</th><th class="num">${t('colMatch')}</th></tr></thead><tbody>${factorRows}</tbody></table></section>
    <footer class="ds-foot">${t('dossierFoot')} · ${esc(location.href)}</footer>`;
  await Promise.all([...box.querySelectorAll('img')].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
  document.body.classList.add('printing-dossier');
  window.print();
  setTimeout(() => document.body.classList.remove('printing-dossier'), 500);
}

// ---------- discoveries tour ----------
const TOUR = [
  { body: 'mars', id: 'jezero', purpose: 'balanced', ll: [-24.0, -68.75] },
  { body: 'mars', id: 'arsia', purpose: 'geology', ll: [25.5, 40.0] },
  { body: 'mars', id: 'arcadia', purpose: 'ice', ll: [82.0, -19.375] },
  { body: 'moon', id: 'shackleton', purpose: 'rover', ll: [39.0, 73.75] },
  { body: 'moon', id: 'hadley', purpose: 'rover', ll: [-24.0, -68.125] },
];
let tourStep = -1;
function showTour(k, move = true) {
  tourStep = k;
  const s = TOUR[k], box = $('#tour');
  if (move) goTo(s.body, s.id, s.purpose, s.ll[0], s.ll[1], 4);
  box.hidden = false;
  box.innerHTML = `<div class="tour-step">${k + 1} / ${TOUR.length}</div>
    <h3>${t(`tour${k}h`)}</h3><p>${t(`tour${k}p`)}</p>
    <div class="tour-nav"><button id="tour-prev" ${k === 0 ? 'disabled' : ''}>←</button>
      <button id="tour-next" class="primary">${k === TOUR.length - 1 ? t('tourDone') : t('tourNext')}</button>
      <button id="tour-close" aria-label="${t('tourClose')}">×</button></div>`;
  $('#tour-prev').onclick = () => showTour(k - 1);
  $('#tour-next').onclick = () => (k === TOUR.length - 1 ? closeTour() : showTour(k + 1));
  $('#tour-close').onclick = closeTour;
  if (move) $('.map-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeTour() { tourStep = -1; $('#tour').hidden = true; }
$('#tour-btn').onclick = () => showTour(0);

// A pasted link, or back / forward, changes only the hash: follow it.
window.addEventListener('hashchange', () => {
  if (!model) return;
  readHash();
  setTheme(state.body);
  renderBodies(); renderTargets(); renderPurposes(); renderWeights(); drawKnown();
  recompute();
});

// ---------- "How it works" modal: closes on ×, Esc or a click outside the window ----------
const methodDlg = $('#method');
$('#method-btn').onclick = () => methodDlg.showModal();
$('#method-close').onclick = () => methodDlg.close();
methodDlg.addEventListener('click', (e) => { if (e.target === methodDlg) methodDlg.close(); });

// ---------- boot ----------
applyStatic(); renderLang();
(async () => {
  try {
    const [m, bin, tg, kn, pl, bm, lg, dt] = await Promise.all([
      fetch('data/earth-meta.json').then((r) => r.json()),
      fetch('data/earth-cells.bin').then((r) => r.arrayBuffer()),
      fetch('data/targets.json').then((r) => r.json()),
      fetch('data/known-analogs.json').then((r) => r.json()),
      fetch('data/places.json').then((r) => r.json()),
      fetch('data/bodymaps.json').then((r) => r.json()),
      fetch('data/logistics.json').then((r) => r.json()),
      fetch('data/detail.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ]);
    logi = lg;
    detail = dt;
    places = pl;
    bodymaps = bm;
    meta = m;
    model = buildModel(meta, bin);
    worker.postMessage({ init: true, meta, bin: bin.slice(0) });
    targets = tg;
    known = kn.sites;
    state.targetId = targets.moon[0].id;
    readHash();
    setTheme(state.body);
    renderAll();
    recompute();
    $('#map-status').classList.add('hidden');
  } catch (e) {
    console.error(e);
    $('#map-status').textContent = t('loadError');
  }
})();
