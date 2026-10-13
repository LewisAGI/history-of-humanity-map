import { describe, expect, it } from 'vitest';
import { distanceKm } from '../src/spread';
import type { HistoryEvent } from '../src/types';
import eventsJson from '../data/events.json';

const events = eventsJson as HistoryEvent[];

/**
 * Wikipedia coordinates for named places. The pin must fall within 25 km.
 * Islands and regions that are not a single town are checked more loosely below.
 */
const PLACES: { id: string; lat: number; lng: number; km?: number }[] = [
  { id: 'galileo-moons', lat: 45.407, lng: 11.876 },
  { id: 'fall-of-rome', lat: 44.418, lng: 12.203 },
  { id: 'gupta-empire', lat: 25.611, lng: 85.144 },
  { id: 'phoenician-alphabet', lat: 34.123, lng: 35.651 },
  { id: 'copernicus', lat: 54.357, lng: 19.681 },
  { id: 'pizarro', lat: -7.157, lng: -78.518 },
  { id: 'mabo-decision', lat: -9.916, lng: 144.053 },
  { id: 'ashoka-edicts', lat: 25.594, lng: 85.137 },
  { id: 'ghana-empire', lat: 15.766, lng: -7.969 },
  { id: 'olmec', lat: 17.75, lng: -94.758 },
  { id: 'beowulf', lat: 55.604, lng: 11.975 },
  { id: 'australian-federation', lat: -33.896, lng: 151.223 },
  { id: 'hastings', lat: 50.914, lng: 0.487, km: 40 },
  { id: 'fall-of-constantinople', lat: 41.013, lng: 28.955 },
  { id: 'tenochtitlan', lat: 19.433, lng: -99.133 },
  { id: 'chaco', lat: 36.06, lng: -107.96 },
  { id: 'petra', lat: 30.328, lng: 35.444 },
  { id: 'great-pyramid', lat: 29.979, lng: 31.134 },
  { id: 'pompeii', lat: 40.751, lng: 14.487 },
  { id: 'qin-unification', lat: 34.3297, lng: 108.7092 },
  { id: 'zhou-conquest', lat: 35.315, lng: 113.909 },
  { id: 'homo-floresiensis', lat: -8.5342, lng: 120.4603 },
  { id: 'el-dorado', lat: 4.9772, lng: -73.7756 },
  { id: 'muisca-raft', lat: 4.9772, lng: -73.7756 },
  { id: 'holocene-start', lat: 75.0167, lng: -42.5333 },
  { id: 'maori-kingitanga', lat: -37.668, lng: 175.147 },
  { id: 'homo-naledi', lat: -26.0204, lng: 27.7092 },
  { id: 'majapahit', lat: -7.55, lng: 112.3667 },
  { id: 'zhang-qian', lat: 34.3083, lng: 108.8583 },
  { id: 'xuanzang', lat: 34.3083, lng: 108.8583 },
  { id: 'colombia-peace', lat: 4.6097, lng: -74.0818 },
  { id: 'cabral-brazil', lat: -16.45, lng: -39.065 },
  { id: 'sassanid-empire', lat: 29.9808, lng: 52.9094 },
];

describe('known places', () => {
  it('pins named sites within a tolerance of their Wikipedia coordinates', () => {
    PLACES.forEach((place) => {
      const event = events.find((item) => item.id === place.id);
      expect(event, place.id).toBeTruthy();
      const km = distanceKm(event!, place);
      expect(km, place.id).toBeLessThanOrEqual(place.km ?? 25);
    });
  });
});
