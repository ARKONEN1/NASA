// Every data source shown in the app, with a link to the official page. Order inside a group is the order on screen.
// Each item: name, what we take from it (en / uk), url of the data provider or of the paper (doi.org).
const GH = 'https://github.com/ARKONEN1/NASA/blob/main/data/curated/';

export const SRC = {
  apollo: { url: 'https://ntrs.nasa.gov/citations/19730010172', en: 'NASA Apollo crew dosimetry (English et al. 1973)', uk: 'дозиметрія екіпажів NASA Apollo (English et al. 1973)' },
  rad: { url: 'https://doi.org/10.1126/science.1244797', en: 'Curiosity RAD (Hassler et al. 2014)', uk: 'Curiosity RAD (Hassler et al. 2014)' },
  unscear: { url: 'https://www.unscear.org/unscear/en/publications/2008_1.html', en: 'UNSCEAR 2008', uk: 'UNSCEAR 2008' },
  power: { url: 'https://power.larc.nasa.gov/', en: 'NASA POWER', uk: 'NASA POWER' },
};

export const GROUPS = [
  { id: 'nasa', en: 'NASA', uk: 'NASA', items: [
    { url: 'https://power.larc.nasa.gov/', en: 'NASA POWER, climatology 2001–2025 (MERRA-2; UV from CERES)', uk: 'NASA POWER, кліматологія 2001–2025 (MERRA-2; УФ з CERES)',
      wen: 'ground temperature, rain, moisture, pressure, wind and UV of every Earth cell', wuk: 'температура ґрунту, опади, вологість, тиск, вітер і УФ кожної ділянки Землі' },
    { url: 'https://gmao.gsfc.nasa.gov/gmao-products/merra-2/', en: 'MERRA-2 aerosol optical depth (via POWER)', uk: 'MERRA-2, аерозольна оптична товщина (через POWER)',
      wen: 'dust in the air', wuk: 'пил у повітрі' },
    { url: 'https://www.earthdata.nasa.gov/data/catalog/lpcloud-mcd12q1-061', en: 'MODIS Land Cover MCD12Q1 2024 (via NASA GIBS)', uk: 'MODIS Land Cover MCD12Q1 2024 (через NASA GIBS)',
      wen: 'bare ground, ice, land mask, land cover class', wuk: 'голий ґрунт, лід, маска суходолу, клас покриву' },
    { url: 'https://pds-geosciences.wustl.edu/missions/lro/lola.htm', en: 'LRO LOLA: LDEM_16, LDEM_64, LDEM_75S_240M (PDS)', uk: 'LRO LOLA: LDEM_16, LDEM_64, LDEM_75S_240M (PDS)',
      wen: 'lunar relief, polar model of the Artemis areas', wuk: 'рельєф Місяця, полярна модель районів Artemis' },
    { url: 'https://pds-geosciences.wustl.edu/missions/lro/diviner.htm', en: 'LRO Diviner Global Cumulative Products (PDS)', uk: 'LRO Diviner Global Cumulative Products (PDS)',
      wen: 'lunar surface temperature, 96 local-time bins', wuk: 'температура поверхні Місяця за 96 проміжками часу доби',
      extra: ['https://doi.org/10.1016/j.icarus.2016.08.012', 'Williams et al. 2017'] },
    { url: 'https://pds-geosciences.wustl.edu/missions/mgs/megdr.html', en: 'MGS MOLA MEGDR, 16 and 128 px/deg (PDS)', uk: 'MGS MOLA MEGDR, 16 і 128 точок/° (PDS)',
      wen: 'Mars relief', wuk: 'рельєф Марса' },
    { url: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api', en: 'NASA GIBS: Blue Marble Next Generation', uk: 'NASA GIBS: Blue Marble Next Generation',
      wen: 'satellite images of Earth places and the base map', wuk: 'супутникові знімки земних місць і підкладка карти' },
    { url: 'https://asterweb.jpl.nasa.gov/gdem.asp', en: 'ASTER GDEM (NASA and METI, via GIBS)', uk: 'ASTER GDEM (NASA і METI, через GIBS)',
      wen: 'shaded relief of Earth places', wuk: 'відмивка рельєфу земних місць' },
    { url: 'https://ntrs.nasa.gov/citations/19730010172', en: 'Apollo crew dosimetry, NASA TN D-7080 (English et al. 1973)', uk: 'Дозиметрія екіпажів Apollo, NASA TN D-7080 (English et al. 1973)',
      wen: 'radiation dose on the Moon', wuk: 'доза радіації на Місяці' },
    { url: 'https://doi.org/10.1126/science.1244797', en: 'Curiosity RAD, Hassler et al. 2014 (Science 343)', uk: 'Curiosity RAD, Hassler et al. 2014 (Science 343)',
      wen: 'radiation dose on Mars', wuk: 'доза радіації на Марсі' },
  ] },
  { id: 'agencies', en: 'ESA and other space agencies', uk: 'ESA та інші космічні агентства', items: [
    { url: 'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM', en: 'ESA Copernicus DEM GLO-30 (AWS Open Data)', uk: 'ESA Copernicus DEM GLO-30 (AWS Open Data)',
      wen: 'terrain up close for 1,525 candidates', wuk: 'рельєф зблизька для 1 525 кандидатів' },
    { url: 'https://www-mars.lmd.jussieu.fr/mcd_python/', en: 'Mars Climate Database v6.2 (LMD, University of Oxford, IAA, ESA, CNES)', uk: 'Mars Climate Database v6.2 (LMD, Оксфордський університет, IAA, ESA, CNES)',
      wen: 'Mars temperature, pressure, wind, water vapour, dust', wuk: 'температура, тиск, вітер, водяна пара й пил на Марсі' },
  ] },
  { id: 'other', en: 'Other organisations', uk: 'Інші організації', items: [
    { url: 'https://www.ncei.noaa.gov/products/etopo-global-relief-model', en: 'NOAA ETOPO1 (via CoastWatch ERDDAP)', uk: 'NOAA ETOPO1 (через CoastWatch ERDDAP)',
      wen: 'Earth relief, ~3.7 km step', wuk: 'рельєф Землі, крок ~3,7 км' },
    { url: 'https://volcano.si.edu/', en: 'Smithsonian Global Volcanism Program', uk: 'Smithsonian Global Volcanism Program',
      wen: 'Holocene volcanoes with rock type', wuk: 'голоценові вулкани з типом породи' },
    { url: 'https://www.unb.ca/fredericton/science/research/passc/', en: 'Earth Impact Database (PASSC, University of New Brunswick)', uk: 'Earth Impact Database (PASSC, Університет Нью-Брансвіка)',
      wen: 'confirmed exposed impact structures', wuk: 'підтверджені відкриті ударні структури' },
    { url: 'https://doi.org/10.1594/PANGAEA.788537', en: 'GLiM v1.0 Global Lithological Map (Hartmann & Moosdorf 2012, PANGAEA, CC BY 3.0)', uk: 'GLiM v1.0, глобальна літологічна карта (Hartmann & Moosdorf 2012, PANGAEA, CC BY 3.0)',
      wen: 'plutonic, sedimentary rock and evaporites', wuk: 'плутонічні, осадові породи й евапорити',
      extra: ['https://doi.org/10.1029/2012gc004370', 'paper'] },
    { url: 'https://www.naturalearthdata.com/', en: 'Natural Earth 1:50m and 1:10m', uk: 'Natural Earth 1:50m і 1:10m',
      wen: 'countries, populated places, airports', wuk: 'країни, населені пункти, аеропорти' },
    { url: 'https://www.unscear.org/unscear/en/publications/2008_1.html', en: 'UNSCEAR 2008 report', uk: 'Звіт UNSCEAR 2008',
      wen: 'natural radiation background on Earth', wuk: 'природний радіаційний фон на Землі' },
  ] },
  { id: 'hand', en: 'Compiled by hand', uk: 'Складено вручну', items: [
    { url: GH + 'known-analogs.json', en: 'Known analog sites (31)', uk: 'Відомі земні аналоги (31)',
      wen: 'NASA and ESA field campaigns; only for the method check, never in the score', wuk: 'польові кампанії NASA та ESA; лише для перевірки методу, в оцінку не входять' },
    { url: GH + 'lava-tubes.json', en: 'Lava tubes (22 systems)', uk: 'Лавові трубки (22 системи)',
      wen: 'park, geological-survey and caving literature', wuk: 'література парків, геологічних служб і спелеологів' },
    { url: GH + 'life-sites.json', en: 'Life at the limits (23 sites)', uk: 'Життя на межі (23 місця)',
      wen: 'peer-reviewed papers; the DOI link is given with each site, not in the score', wuk: 'рецензовані статті; посилання на DOI є біля кожного місця, в оцінку не входить' },
    { url: GH + 'targets.json', en: 'Targets on the Moon and Mars (15)', uk: 'Цілі на Місяці й Марсі (15)',
      wen: 'LOLA and MOLA data plus mission descriptions', wuk: 'дані LOLA і MOLA та описи місій' },
  ] },
];
