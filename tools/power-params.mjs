// NASA POWER climatology parameters used for Earth cells.
export const POWER_PARAMS = [
  'TS',                  // Earth skin (surface) temperature, °C
  'TS_MAX',              // monthly mean of daily max skin temperature, °C
  'TS_MIN',              // monthly mean of daily min skin temperature, °C
  'PRECTOTCORR',         // precipitation, mm/day
  'QV2M',                // specific humidity at 2 m, g/kg
  'PS',                  // surface pressure, kPa
  'ALLSKY_SFC_UV_INDEX', // all-sky UV index
  'WS10M',               // wind speed at 10 m, m/s
  'AOD_55',              // aerosol optical depth at 550 nm (MERRA-2)
  'AOD_84',              // ... and at 840 nm: the ratio (Angstrom exponent) tells coarse dust from fine smoke and smog
];
