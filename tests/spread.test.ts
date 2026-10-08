import { describe, expect, it } from 'vitest';
import { eventOverlapsPeriod, periodsForEra, presentYear } from '../src/timeline';
import { clampLatitude, displayPositions, distanceKm, isValidLngLat, placementsFor, SPREAD_SEPARATION_PX } from '../src/spread';
import type { HistoryEvent } from '../src/types';
import eventsJson from '../data/events.json';

const events = eventsJson as HistoryEvent[];

describe('displayPositions', () => {
  it('keeps true coordinates and separates co-located pins in screen pixels', () => {
    const present = presentYear();
    periodsForEra('before', present).concat(periodsForEra('after', present)).forEach((period) => {
      const visible = events.filter((event) => eventOverlapsPeriod(event, period));
      const shown = displayPositions(visible);
      visible.forEach((event) => {
        const at = shown.get(event.id)!;
        expect(at.lat, event.id).toBe(event.lat);
        expect(at.lng, event.id).toBe(event.lng);
        expect(isValidLngLat(at.lat, at.lng), event.id).toBe(true);
      });
      for (let i = 0; i < visible.length; i += 1) {
        for (let j = i + 1; j < visible.length; j += 1) {
          if (distanceKm(visible[i], visible[j]) > 20) continue;
          const a = shown.get(visible[i].id)!;
          const b = shown.get(visible[j].id)!;
          const pixels = Math.hypot(a.offsetX - b.offsetX, a.offsetY - b.offsetY);
          expect(pixels, `${visible[i].id} / ${visible[j].id}`).toBeGreaterThanOrEqual(SPREAD_SEPARATION_PX - 0.01);
        }
      }
    });
  });

  it('leaves an isolated pin on its coordinates with no offset', () => {
    const hastings = events.find((event) => event.id === 'hastings')!;
    const shown = displayPositions([hastings]);
    expect(shown.get('hastings')).toEqual({ lat: hastings.lat, lng: hastings.lng, offsetX: 0, offsetY: 0 });
  });

  it('keeps Scott on the pole and a valid latitude', () => {
    const scott = events.find((event) => event.id === 'scott-pole')!;
    const amundsen = events.find((event) => event.id === 'amundsen-pole')!;
    const shown = displayPositions([scott, amundsen]);
    const at = shown.get('scott-pole')!;
    expect(at.lat).toBe(-90);
    expect(at.lng).toBe(scott.lng);
    expect(isValidLngLat(at.lat, at.lng)).toBe(true);
    const other = shown.get('amundsen-pole')!;
    expect(Math.hypot(at.offsetX - other.offsetX, at.offsetY - other.offsetY)).toBeGreaterThan(20);
  });

  it('clamps a latitude that would fall outside the pole', () => {
    expect(clampLatitude(-90.1176)).toBe(-90);
    const shown = displayPositions([{ id: 'past-pole', lat: -90.1176, lng: 0 }]);
    expect(shown.get('past-pole')!.lat).toBe(-90);
    expect(isValidLngLat(shown.get('past-pole')!.lat, shown.get('past-pole')!.lng)).toBe(true);
  });
});

describe('placementsFor', () => {
  it('skips one bad pin and still places the others', () => {
    const scott = events.find((event) => event.id === 'scott-pole')!;
    const { kept, skipped } = placementsFor([
      scott,
      { id: 'bad-pin', lat: -90.1176, lng: 0, title: 'bad' },
    ]);
    expect(skipped.map((event) => event.id)).toEqual(['bad-pin']);
    expect(kept.map((event) => event.id)).toEqual(['scott-pole']);
    expect(kept[0].lat).toBe(-90);
    expect(isValidLngLat(kept[0].lat, kept[0].lng)).toBe(true);
  });
});
