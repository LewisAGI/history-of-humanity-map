import { describe, expect, it } from 'vitest';
import { eventOverlapsPeriod, periodsForEra, presentYear } from '../src/timeline';
import { distanceKm, displayPositions } from '../src/spread';
import type { HistoryEvent } from '../src/types';
import eventsJson from '../data/events.json';

const events = eventsJson as HistoryEvent[];

describe('displayPositions', () => {
  it('separates pins that share a period and a spot', () => {
    const present = presentYear();
    periodsForEra('before', present).concat(periodsForEra('after', present)).forEach((period) => {
      const visible = events.filter((event) => eventOverlapsPeriod(event, period));
      const shown = displayPositions(visible);
      for (let i = 0; i < visible.length; i += 1) {
        for (let j = i + 1; j < visible.length; j += 1) {
          const raw = distanceKm(visible[i], visible[j]);
          if (raw > 20) continue;
          const apart = distanceKm(shown.get(visible[i].id)!, shown.get(visible[j].id)!);
          expect(apart, `${visible[i].id} / ${visible[j].id}`).toBeGreaterThan(20);
        }
      }
    });
  });

  it('leaves an isolated pin on its coordinates', () => {
    const hastings = events.find((event) => event.id === 'hastings')!;
    const shown = displayPositions([hastings]);
    expect(shown.get('hastings')).toEqual({ lat: hastings.lat, lng: hastings.lng });
  });
});
