# Analog Atlas

**Find places on Earth that share conditions with future Moon bases and Mars landing sites — from open NASA data.**

Built for the NASA Space Apps Challenge 2026: *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*.

> Independent student project. Not an official NASA product and not endorsed by NASA.

## Why

Choosing a test site whose conditions are as close as possible to the conditions a vehicle or a habitat will meet takes a lot of data and a lot of effort. Not every unit and component needs a perfect match, so part of the testing can be done on Earth. Analog Atlas makes that choice easier: it compares a chosen place on the Moon or Mars with every piece of Earth’s land and shows where the conditions are closest. It uses 20 criteria, among them temperature and its swings, dust in the air, the type of surface and rock, relief, pressure, rain and ultraviolet light. It also says what Earth cannot give, which is low gravity, vacuum and cosmic radiation, so those tests still have to be done in space or in a laboratory.

*Українською:* Підбір випробувального полігону з умовами, максимально наближеними до цільових умов експлуатації, вимагає аналізу великого обсягу даних і значних зусиль. Водночас частина агрегатів і вузлів не потребує стовідсоткового збігу умов, тож частину випробувань можна провести на Землі. «Атлас аналогів» спрощує цей вибір: він порівнює обране місце на Місяці чи Марсі з кожною ділянкою суходолу Землі та показує, де умови найближчі. Критеріїв усього 20, зокрема температура та її перепади, запиленість повітря, тип поверхні й порід, рельєф, тиск, опади й ультрафіолет. Також він показує, щого Земля відтворити не може: низької гравітації, вакууму й космічної радіації, тож такі випробування все одно треба проводити в космосі або в лабораторії.

## What it does

The interface is in English and Ukrainian (switch in the header).

1. Pick a destination (Moon or Mars) and a site on its relief map (built from LOLA and MOLA, with a polar inset for the Artemis candidates near the lunar south pole) or from the list: Artemis south-pole candidates, Apollo sites, a lunar lava-tube skylight, Jezero, Gale, the ice-rich plains proposed for human crews, Arsia Mons caves and more.
2. Pick what you want to test: rovers and spacewalks, habitats, ice mining, field geology, or light and power.
3. The map colours every land cell on Earth (about 55 km) by how alike it is. The best places are listed, each tagged **new** or **known** (within 150 km of an established analog site).
4. Each place gets a card: land cover, height, climate in one line, the nearest named volcano, impact crater and lava tube, a factor-by-factor comparison, and shaded relief of both places side by side.
5. Each place also gets a **fingerprint** (radar of all factors on Earth's scale, target vs place), **terrain up close** (20 km window, 0.48 km baseline: ESA Copernicus DEM on Earth, LOLA on the Moon, MOLA on Mars), **robustness** (see below) and **logistics** (nearest town and airport).
   The card also gives a **verdict**: where the analogy is strong and where it breaks down (factor matches in percent), what no place on Earth can give (gravity, air pressure and radiation dose, Earth vs the Moon or Mars), and the three purposes this place is best suited to rehearse.
   **Life at the limits:** a map layer and a card block with 23 places where peer-reviewed studies document extremophiles or ancient traces of life, each with its reference (`data/curated/life-sites.json`). Hand-compiled, shown for context, not part of the score.
6. **Dossier (PDF):** one printable page per candidate, with score, robustness, logistics, images, fingerprint, fit for every purpose and all factors.
7. **Discoveries:** a five-step guided tour of the main findings. Every view has a shareable link, e.g. `#/mars/arsia/geology/25.5,40`.
8. The top 50 places can be downloaded as CSV or GeoJSON, with every factor value, its match, robustness, logistics and terrain up close.
9. **Does the method work?** Established NASA/ESA field sites are never shown to the model. The app reports where they rank for the current choice; a random place would sit at 50 %. The app also shows which factors make the known sites stand out and which do not. Where they give no lift, those sites were picked for other reasons and cannot vouch for that factor.

**Written report** in English and Ukrainian: `web/docs/en.html` and `web/docs/uk.html`, linked from the header of the app ("Report").

## Method

| Factor | Earth (per cell) | Moon / Mars (per site) |
|---|---|---|
| Relief, slope | ETOPO1, sampled on the same 15×15 grid, 3.7 km apart, as the other bodies | LRO LOLA LDEM_16 (LDEM_75S_240M near the south pole); MGS MOLA MEGDR 128 px/deg around each site |
| Ground temperature: mean, day–night swing, night | NASA POWER climatology 2001–2025 (MERRA-2 skin temperature) | Moon: LRO Diviner Global Cumulative Products (bolometric temperature, 96 local-time bins, 3 × 3 cells of 0.5°). Mars: Mars Climate Database v6.2, 12 seasons × 24 h |
| Air pressure, moisture, wind | NASA POWER | Mars: Mars Climate Database v6.2 (surface pressure, water vapour, 10 m wind). Moon: no air |
| Precipitation, UV | NASA POWER (UV from CERES) | none falls on either body; surface UV is beyond any Earth value on both |
| Bare ground, ice cover | MODIS IGBP land cover 2024 via NASA GIBS | always bare |
| Frozen ground | share of months below 0 °C, or ice cover | 0–1 from known ground ice |
| Basaltic volcanism | basic volcanic rock in GLiM (3 × 3 cells), or distance to Holocene basaltic volcanoes (Smithsonian GVP) | 0–1 from site geology |
| Plutonic rock (like lunar highlands) | acid, intermediate and basic plutonic rock in the GLiM lithological map | 0–1 from site geology (1 for the anorthositic south-pole highlands) |
| Sedimentary rock and evaporites | sedimentary rock, unconsolidated sediment and evaporites in GLiM | 0–1 from site geology (lake deposits at Gale and Jezero, sulfates at Meridiani) |
| Impact cratering | distance to exposed confirmed craters (Earth Impact Database) | 0–1 from site geology |
| Low sun | latitude | latitude |
| Lava tube nearby | distance to a hand-compiled list of 22 well-documented lava tubes | only for cave sites (Marius Hills, Arsia Mons, Hadley Rille) |
| Terrain up close (shown, not scored) | ESA Copernicus DEM GLO-30, 240 m level, for about 2,000 candidates | LOLA 240 m / LDEM_64; MOLA 128 px/deg |

Earth can't match the Moon or Mars in absolute terms. So each factor is ranked among Earth's land (area-weighted percentile), and a value beyond Earth's range points to Earth's most extreme end. Similarity per factor = 1 − |percentile difference|, and the score is a weighted mean with weights set by the chosen purpose.

**Method check:** for every body × purpose the app and `npm run validate` report the ROC AUC, the chance that a known analog site outranks a random place on land given the same "best cell within 60 km" treatment (0.5 = chance). On the original 19 sites the AUC ranges from 0.60 to 0.80 (Geology 0.80 / 0.76, Rovers 0.75 / 0.75 for Moon / Mars); on the extended list of 31 sites it is 0.56–0.77. The weakest case is Moon × Habitats (AUC 0.60, or 0.56 on the extended list). The diagnosis is that known lunar analogs (Hawaiʻi, Arizona, Ries, Sudbury) were chosen for geology and terrain, not climate, so they show no lift in temperature, rain or air pressure. There is no ground truth for lunar thermal analogs on Earth.

**Robustness:** every candidate is re-scored 60 times with each weight scaled by a random factor in [0.5, 1.5] and each target position shifted by ±0.05 on Earth's scale (seeded, reproducible). Across all 90 top-10 lists (15 sites × 6 purposes), 94.2 % of places stay in the top 1 % of Earth's land in at least 90 % of runs, and the first place does so in 88 of 90 lists. Run `node tools/robustness.mjs`.

**Limits:** gravity, vacuum and radiation can't be matched, so every analog is partial. The 0.5° grid doesn't resolve single caves or crater rims. Moon and Mars climate comes from LRO Diviner and the Mars Climate Database (a model fitted to spacecraft data), not from ground measurements. Switching from rounded literature values to these products barely changed the method check, so the results do not hinge on them. The lava-tube list is hand-compiled and incomplete. The geology check is partly circular, because some known analogs are famous for the very craters and volcanoes in the catalogues.

## Run locally

Requires Node 18+. The site in `web/` is static and its data is prebuilt, so serving it is enough:

```bash
npm install
npm run serve     # http://localhost:5180
```

To rebuild the data from the sources:

```bash
npm run data        # download NASA/NOAA/Smithsonian data (~20 min, POWER is rate-limited)
npm run build:data  # Earth grid, Moon/Mars targets, site maps → web/data
npm run validate    # method check printed to the console
```

## Deploy (Cloudflare Workers)

`wrangler.jsonc` serves `web/` as static assets, with no server code. In Workers Builds, set the build command to `npm run build` (it only checks that every data file is present and under the 25 MiB asset limit) and the deploy command to `npx wrangler deploy`.
