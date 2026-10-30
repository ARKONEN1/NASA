// Regions that are already widely used as Moon / Mars analogs. The challenge author names them
// as the famous ones ("Atacama, Antarctica, Iceland, Hawaii, the Mojave, Death Valley, Haughton"),
// so a match inside them is not a new discovery even with no test site within 150 km.
// Boxes are deliberately generous: [south, north, west, east] in degrees.
export const STUDIED = [
  { id: 'atacama', en: 'Atacama Desert and puna', uk: 'пустеля Атакама й пуна', box: [-30, -17.5, -71.8, -66.5] },
  { id: 'antarctica', en: 'Antarctica', uk: 'Антарктида', box: [-90, -60, -180, 180] },
  { id: 'iceland', en: 'Iceland', uk: 'Ісландія', box: [63.2, 66.7, -24.6, -13.4] },
  { id: 'hawaii', en: 'Hawaii', uk: 'Гаваї', box: [18.8, 22.3, -160.5, -154.7] },
  { id: 'mojave', en: 'Mojave Desert and Death Valley', uk: 'пустеля Мохаве й Долина Смерті', box: [33.8, 37.6, -118.6, -114.3] },
  { id: 'devon', en: 'Devon Island (Haughton crater)', uk: 'острів Девон (кратер Хоутон)', box: [74.3, 76.8, -96.5, -79.5] },
];

/** The well-studied region a point falls in, or null. */
export function studiedRegion(lat, lon) {
  return STUDIED.find(({ box: [s, n, w, e] }) => lat >= s && lat <= n && lon >= w && lon <= e) || null;
}
