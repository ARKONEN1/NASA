// Logistics for field campaigns: towns and airports from Natural Earth 1:10m, so a site card can say
// how far the nearest settlement and runway are. Output: web/data/logistics.json
import fs from 'node:fs';
import path from 'node:path';
import { RAW, WEB_DATA, log } from './lib.mjs';

const read = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')).features;
const towns = read('ne_10m_populated_places_simple.geojson').map((f) => {
  const p = f.properties, [lon, lat] = f.geometry.coordinates;
  return [p.name, +lat.toFixed(3), +lon.toFixed(3), p.pop_max || 0];
});
const airports = read('ne_10m_airports.geojson').map((f) => {
  const p = f.properties, [lon, lat] = f.geometry.coordinates;
  return [p.name_en || p.name, p.name_uk || p.name_en || p.name, p.iata_code || '', +lat.toFixed(3), +lon.toFixed(3)];
});
fs.writeFileSync(path.join(WEB_DATA, 'logistics.json'), JSON.stringify({ towns, airports }));
log(`logistics.json: ${towns.length} towns, ${airports.length} airports`);
