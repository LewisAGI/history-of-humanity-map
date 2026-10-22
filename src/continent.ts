import type { Continent } from './types';

/** A few sites the latitude bands cannot see: Sinai, and nothing else once the bands are right. */
const OVERRIDES: Record<string, Continent> = {
  sinai: 'Asia',
};

/**
 * Coarse continent for a pack pin that has no continent of its own.
 * The bands follow the continents already used on the app events.
 */
export function continentFor(lat: number, lng: number, id = ''): Continent {
  const forced = OVERRIDES[id];
  if (forced) return forced;
  if (lat <= -60) return 'Antarctica';

  // Hawaii, Tonga, Raiatea, and the rest of the remote Pacific.
  if (lat < 30 && lat > -50 && lng < -125) return 'Oceania';
  // Rapa Nui sits west of South America and east of that remote band.
  if (lng < -100 && lng > -140 && lat < 5 && lat > -45 && !(lng > -92 && lng < -89)) return 'Oceania';

  if (lng <= -30) {
    if (lat >= 13) return 'North America';
    return 'South America';
  }

  // Crete and the Aegean are Europe. Carthage, on the same latitude, is not.
  if (lat > 34 && lat < 37 && lng > 23 && lng < 28) return 'Europe';
  if (lat > 30 && lat < 37.5 && lng > -10 && lng < 20) return 'Africa';

  // Europe stops at the Bosporus. Anatolia is Asia. Crimea and St Petersburg stay in Europe.
  if (lat > 36 && lng >= -25 && lng <= 40) {
    if (lng > 29 && lat < 42.5) return 'Asia';
    return 'Europe';
  }

  // Arabia and the Levant are Asia. The Horn of Africa is not.
  if (lat > 12 && lat < 38 && lng >= 34 && lng <= 60) {
    if (lng < 43 && lat < 18) return 'Africa';
    return 'Asia';
  }

  if (lat <= 38 && lat >= -36 && lng >= -20 && lng <= 52) return 'Africa';

  if (lat < 12 && lng >= 110) {
    // Java and Sumatra stay with Asia. Australia, New Guinea, and the islands do not.
    if (lat > -8 && lng < 130) return 'Asia';
    return 'Oceania';
  }

  return 'Asia';
}
