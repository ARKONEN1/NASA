// Small static downloads: LOLA and MOLA global DEMs (16 px/deg), Smithsonian Holocene volcanoes,
// Natural Earth country borders.
import path from 'node:path';
import { RAW, download, log } from './lib.mjs';

const FILES = {
  'moon_ldem_16.img': 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_16.img',
  'mars_megt_16.img': 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.img',
  'gvp_holocene.csv': 'https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=csv',
  'moon_ldem_75s_240m.img': 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_75s_240m.img',
  'ne_50m_countries.geojson': 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson',
};
for (const [name, url] of Object.entries(FILES)) {
  await download(url, path.join(RAW, name));
  log('ok', name);
}
