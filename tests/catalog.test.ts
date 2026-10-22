import { describe, expect, it } from 'vitest';
import { catalog, countInSpan, eventVisible, OPEN_FILTERS, searchCatalog } from '../src/catalog';
import { continentFor } from '../src/continent';
import { CONTINENTS } from '../src/types';
import verdicts from '../data/match-verdicts.json';
import mapping from '../data/pack/app-id-mapping.json';

describe('pack merge', () => {
  it('keeps every pack pin and the reviewed medium matches', () => {
    expect(catalog.counts.packPins).toBe(220);
    expect(catalog.counts.mergedPins + catalog.counts.addedPins).toBe(220);
    expect(catalog.counts.events).toBe(321 + catalog.counts.addedPins);
    expect(catalog.migrations).toHaveLength(13);
    expect(catalog.eras).toHaveLength(13);
    expect(catalog.people).toHaveLength(30);
    expect(catalog.timeline).toHaveLength(233);
    expect(catalog.reading).toHaveLength(11);
    expect(catalog.sources.size).toBe(364);

    const medium = mapping.mappings.filter((row) => row.confidence === 'medium');
    expect(medium).toHaveLength(20);
    expect(verdicts.accept).toHaveLength(10);
    expect(verdicts.reject).toHaveLength(10);
    const reviewed = new Set([...verdicts.accept, ...verdicts.reject].map((row) => row.packId));
    medium.forEach((row) => expect(reviewed.has(row.packId), row.packId).toBe(true));
    catalog.verdicts.forEach((row) => expect(row.reason.length).toBeGreaterThan(20));
  });

  it('accepts same episodes and keeps rejected pairs apart', () => {
    verdicts.accept.forEach((row) => {
      const event = catalog.events.find((item) => item.id === row.appId);
      expect(event?.packId, row.packId).toBe(row.packId);
      expect(catalog.events.some((item) => item.id === row.packId && item.id !== row.appId)).toBe(false);
    });
    verdicts.reject.forEach((row) => {
      const appEvent = catalog.events.find((item) => item.id === row.appId);
      const packEvent = catalog.events.find((item) => item.id === row.packId);
      expect(appEvent, row.appId).toBeTruthy();
      expect(packEvent, row.packId).toBeTruthy();
      expect(appEvent?.packId).not.toBe(row.packId);
    });
  });

  it('flags Hastings and the Aotearoa centroid and does not plot the Rising Star proxy', () => {
    const hastings = catalog.events.find((event) => event.id === 'hastings')!;
    expect(hastings.standIn).toMatch(/Town of Battle/);
    expect(hastings.lat).toBeCloseTo(50.91, 2);

    const cave = catalog.events.find((event) => event.id === 'homo-naledi')!;
    expect(cave.standIn).toBeUndefined();
    expect(cave.lat).toBeCloseTo(-26.0204, 3);
    expect(cave.lng).toBeCloseTo(27.7092, 3);
    expect(catalog.events.some((event) => event.lat === -26.016 && event.lng === 27.7346)).toBe(false);

    const route = catalog.migrations.find((item) => item.id === 'austronesian')!;
    const aotearoa = route.waypoints.find((stop) => stop.name === 'Aotearoa');
    expect(aotearoa?.standIn).toMatch(/Country centroid/);
    expect(aotearoa).toMatchObject({ lat: -42, lng: 174 });

    const flagged = catalog.standIns.filter((item) => item.treatment === 'flagged').map((item) => item.id);
    const hidden = catalog.standIns.filter((item) => item.treatment === 'hidden').map((item) => item.id);
    expect(flagged).toEqual(['hastings', 'aotearoa']);
    expect(hidden).toEqual(['rising-star']);
  });

  it('leaves Herto on the app pin and drops culture waypoints with no point', () => {
    const herto = catalog.events.find((event) => event.id === 'herto')!;
    expect(herto.lat).toBeCloseTo(10.26, 2);
    expect(catalog.unlocated.map((item) => item.packId)).toEqual(['herto']);
    const indo = catalog.migrations.find((item) => item.id === 'indo-european')!;
    expect(indo.dropped).toEqual(['Pontic–Caspian steppe', 'Yamnaya culture', 'Corded Ware culture']);
    expect(indo.waypoints.map((stop) => stop.name)).toEqual(['Sintashta culture', 'Swat District']);
  });

  it('gives every plotted event a continent and a unique id', () => {
    const ids = new Set<string>();
    catalog.events.forEach((event) => {
      expect(ids.has(event.id), event.id).toBe(false);
      ids.add(event.id);
      expect(CONTINENTS, event.id).toContain(event.continent);
      expect(event.lat === 0 && event.lng === 0, event.id).toBe(false);
      expect(event.summary.length, event.id).toBeGreaterThan(0);
    });
  });

  it('links search, people, and the open filters', () => {
    const hits = searchCatalog(catalog, 'Lalibela');
    expect(hits.some((hit) => hit.kind === 'event' && hit.label.match(/Lalibela/))).toBe(true);
    const musa = catalog.people.find((person) => person.id === 'mansa-musa')!;
    expect(musa.eventIds).toContain('mansa-musa');
    expect(eventVisible(catalog.events[0], OPEN_FILTERS)).toBe(true);
    const lens = catalog.events.find((event) => event.lenses?.includes('andes'));
    expect(lens).toBeTruthy();
    expect(eventVisible(lens!, { ...OPEN_FILTERS, lens: 'oceania' })).toBe(false);
    expect(countInSpan(1900, 1949)).toBe(46);
    expect(countInSpan(1950, 1999)).toBe(49);
  });
});

describe('continent bands', () => {
  it('places the awkward sites', () => {
    expect(continentFor(36.85, 10.32, 'carthage')).toBe('Africa');
    expect(continentFor(35.3, 25.16, 'knossos-labyrinth')).toBe('Europe');
    expect(continentFor(28.54, 33.98, 'sinai')).toBe('Asia');
    expect(continentFor(59.94, 30.31, 'petrograd')).toBe('Europe');
    expect(continentFor(39.91, 32.85, 'ankara-1923')).toBe('Asia');
    expect(continentFor(41.01, 28.98, 'constantinople')).toBe('Europe');
    expect(continentFor(64.25, -21.04, 'thingvellir')).toBe('Europe');
    expect(continentFor(-16.84, -151.36, 'hawaiki-raiatea')).toBe('Oceania');
    expect(continentFor(-21.14, -175.05, 'haamonga')).toBe('Oceania');
    expect(continentFor(21.36, -157.95, 'pearl-harbor')).toBe('Oceania');
    expect(continentFor(-0.5, -90.5, 'galapagos')).toBe('South America');
    expect(continentFor(14.12, 38.73, 'aksum')).toBe('Africa');
    expect(continentFor(21.42, 39.82, 'mecca')).toBe('Asia');
    expect(continentFor(-6.21, 106.85, 'indonesia-1945')).toBe('Asia');
    expect(continentFor(6.84, 158.33, 'nan-madol')).toBe('Oceania');
    expect(continentFor(45.03, 35.38, 'black-death-caffa')).toBe('Europe');
  });
});
