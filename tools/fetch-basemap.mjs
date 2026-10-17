// Base map: NASA Blue Marble shaded relief + bathymetry (GIBS WMS), plate carrée,
// saved as two 4096 x 4096 JPEGs (west and east hemispheres) so the app works offline.
import fs from 'node:fs';
import path from 'node:path';
import { WEB_DATA, download, log } from './lib.mjs';

for (const [name, bbox] of [['basemap-west.jpg', '-180,-90,0,90'], ['basemap-east.jpg', '0,-90,180,90']]) {
  const url = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1' +
    `&LAYERS=BlueMarble_ShadedRelief_Bathymetry&SRS=EPSG:4326&BBOX=${bbox}&WIDTH=4096&HEIGHT=4096&FORMAT=image/jpeg&STYLES=`;
  await download(url, path.join(WEB_DATA, name));
  log(name, (fs.statSync(path.join(WEB_DATA, name)).size / 1e6).toFixed(1), 'MB');
}
