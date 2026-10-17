# Analog Atlas

**Find places on Earth that share conditions with future Moon bases and Mars landing sites — from open NASA data.**

Built for the NASA Space Apps Challenge 2026: *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*.

> Independent student project. Not an official NASA product and not endorsed by NASA.

## What it does

The interface is in English and Ukrainian (switch in the header).

1. Pick a destination (Moon or Mars) and a site on its relief map (built from LOLA and MOLA, with a polar inset for the Artemis candidates near the lunar south pole) or from the list: Artemis south-pole candidates, Apollo sites, a lunar lava-tube skylight, Jezero, Gale, the ice-rich plains proposed for human crews, Arsia Mons caves and more.
2. Pick what you want to test: rovers and spacewalks, habitats, ice mining, field geology, or light and power.
3. The map colours every land cell on Earth (about 55 km) by how alike it is. The best places are listed, each tagged **new** or **known** (within 150 km of an established analog site).
4. Each place gets a card: land cover, height, climate in one line, the nearest named volcano, impact crater and lava tube, a factor-by-factor comparison, and shaded relief of both places side by side.
5. The top 50 places can be downloaded as CSV or GeoJSON, with every factor value and its match.
6. **Does the method work?** Established NASA/ESA field sites are never shown to the model. The app reports where they rank for the current choice; a random place would sit at 50 %. The app also shows which factors make the known sites stand out and which do not. Where they give no lift, those sites were picked for other reasons and cannot vouch for that factor.

## Method

| Factor | Earth (per cell) | Moon / Mars (per site) |
|---|---|---|
| Relief, slope | ETOPO1, sampled on the same 15×15 grid, 3.7 km apart, as the other bodies | LRO LOLA LDEM_16 (LDEM_75S_240M near the south pole); MGS MOLA MEGDR 128 px/deg around each site |
| Ground temperature: mean, day–night swing, night | NASA POWER climatology 2001–2025 (MERRA-2 skin temperature) | LRO Diviner; Curiosity REMS, Perseverance MEDA, Phoenix, InSight, Mars Climate Database (rounded) |
| Precipitation, air moisture, pressure, UV, wind | NASA POWER (UV from CERES) | literature values (no rain, almost no water vapour, 0–0.9 kPa) |
| Bare ground, ice cover | MODIS IGBP land cover 2024 via NASA GIBS | always bare |
| Frozen ground | share of months below 0 °C, or ice cover | 0–1 from known ground ice |
| Basaltic volcanism | distance to Holocene basaltic volcanoes (Smithsonian GVP) | 0–1 from site geology |
| Impact cratering | distance to exposed confirmed craters (Earth Impact Database) | 0–1 from site geology |
| Low sun | latitude | latitude |
| Lava tube nearby | distance to a hand-compiled list of 22 well-documented lava tubes | only for cave sites (Marius Hills, Arsia Mons, Hadley Rille) |

Earth can't match the Moon or Mars in absolute terms. So each factor is ranked among Earth's land (area-weighted percentile), and a value beyond Earth's range points to Earth's most extreme end. Similarity per factor = 1 − |percentile difference|, and the score is a weighted mean with weights set by the chosen purpose.

**Method check (full data):** across all sites and purposes, known analogs have a median rank between 64 % and 98 % (random = 50 %). The weakest case is Moon × Habitats (64 %). The diagnosis is that known lunar analogs (Hawaiʻi, Arizona, Ries, Sudbury) were chosen for geology and terrain, not climate, so they show no lift in temperature, rain or air pressure. There is no ground truth for lunar thermal analogs on Earth.

**Limits:** gravity, vacuum and radiation can't be matched, so every analog is partial. The 0.5° grid doesn't resolve single caves or crater rims. Moon and Mars climate figures are rounded literature values. The lava-tube list is hand-compiled and incomplete. The geology check is partly circular, because some known analogs are famous for the very craters and volcanoes in the catalogues.

## Run locally

Requires Node 18+.

```bash
npm install
npm run data      # download NASA/NOAA/Smithsonian data (~20 min, POWER is rate-limited)
npm run build     # build the Earth grid and Moon/Mars targets
npm run validate  # method check printed to the console
npm run serve     # http://localhost:5180
```
