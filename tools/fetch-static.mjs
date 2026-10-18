// Small static downloads: LOLA and MOLA global DEMs (16 px/deg), Smithsonian Holocene volcanoes,
// Natural Earth country borders.
import path from 'node:path';
import { RAW, download, log } from './lib.mjs';

const FILES = {
  'moon_ldem_16.img': 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_16.img',
  'mars_megt_16.img': 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.img',
  'gvp_holocene.csv': 'https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=csv',
  'moon_ldem_75s_240m.img': 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_75s_240m.img',
  'ne_10m_populated_places_simple.geojson': 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places_simple.geojson',
  'ne_10m_airports.geojson': 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_airports.geojson',
  'glim_0.5deg.zip': 'https://hdl.handle.net/10013/epic.39939.d001',
  'ne_50m_countries.geojson': 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson',
};
for (const [name, url] of Object.entries(FILES)) {
  await download(url, path.join(RAW, name));
  log('ok', name);
}

// GLiM ships as a zip: unpack it into data/raw/glim/x with a minimal reader (stored or deflated entries).
import fs from 'node:fs';
import zlib from 'node:zlib';
function unzip(file, dir) {
  const b = fs.readFileSync(file);
  fs.mkdirSync(dir, { recursive: true });
  for (let o = 0; o + 30 < b.length && b.readUInt32LE(o) === 0x04034b50;) {
    const method = b.readUInt16LE(o + 8), size = b.readUInt32LE(o + 18);
    const nameLen = b.readUInt16LE(o + 26), extraLen = b.readUInt16LE(o + 28);
    const name = b.toString('utf8', o + 30, o + 30 + nameLen), start = o + 30 + nameLen + extraLen;
    const data = b.subarray(start, start + size);
    if (!name.endsWith('/')) fs.writeFileSync(path.join(dir, path.basename(name)), method === 8 ? zlib.inflateRawSync(data) : data);
    o = start + size;
  }
}
unzip(path.join(RAW, 'glim_0.5deg.zip'), path.join(RAW, 'glim', 'x'));
log('ok', 'glim unpacked');
