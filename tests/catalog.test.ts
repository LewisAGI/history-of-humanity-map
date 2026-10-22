import { describe, expect, it } from 'vitest';
import { buildCatalog, catalog, countInSpan, doiHref, eventVisible, OPEN_FILTERS, searchCatalog, standInFromMethod } from '../src/catalog';
import { continentFor } from '../src/continent';
import { markPin, popupHtml, waypointText } from '../src/present';
import { CONTINENTS } from '../src/types';
import verdicts from '../data/match-verdicts.json';
import mapping from '../data/pack/app-id-mapping.json';
import content from '../data/pack/content.json';
import sources from '../data/pack/sources.json';

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
    expect(catalog.sources.size).toBe(451);
    const bySource = new Map(sources.sources.map((source) => [source.id, source]));
    const scholarlyPins = content.pins.filter((pin) => pin.sources.some((id) => bySource.get(id)?.doi));
    expect(sources.sources).toHaveLength(451);
    expect(scholarlyPins).toHaveLength(108);
    const sample = catalog.sources.get('doi-10-1038-nature22968');
    expect(sample?.doi).toBe('10.1038/nature22968');
    expect(doiHref(sample!)).toBe('https://doi.org/10.1038/nature22968');
    expect(doiHref({ doi: '10.1038/nature22968', url: 'javascript:alert(1)//doi.org' })).toBe('https://doi.org/10.1038/nature22968');
    const madjedbebe = catalog.events.find((event) => event.id === 'madjedbebe');
    expect(madjedbebe?.sourceIds).toContain('doi-10-1038-nature22968');

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
      expect(event?.matchConfidence).toBe('medium');
      expect(event?.matchReason).toBe(row.reason);
      expect(catalog.events.some((item) => item.id === row.packId && item.id !== row.appId)).toBe(false);
      const html = popupHtml(event!);
      expect(html).toContain('data-tip="Matched by review"');
      expect(html).toContain('review-mark');
      expect(html).not.toContain(row.reason);
    });
    const exact = catalog.events.find((event) => event.id === 'hastings')!;
    expect(exact.matchConfidence).toBe('exact');
    expect(exact.matchReason).toBeUndefined();
    expect(popupHtml(exact)).not.toContain('review-mark');
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
    expect(hastings.standIn).toBe('Town stand-in, not the site');
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

    const leang = catalog.events.find((event) => event.packId === 'leang-tedongnge')!;
    expect(leang.id).toBe('sulawesi-cave-art');
    expect(leang.standIn).toMatch(/Region centroid/);
    expect(leang.lat).toBeCloseTo(-5, 2);
    expect(popupHtml(leang)).toContain('Region centroid, not the site');
    const leangPin = { dataset: {} as { standIn?: string; status?: string } };
    markPin(leangPin, leang);
    expect(leangPin.dataset.standIn).toBe('true');
    const plain = { dataset: {} as { standIn?: string; status?: string } };
    markPin(plain, { standIn: undefined });
    expect(plain.dataset.standIn).toBeUndefined();
    expect(waypointText(aotearoa!)).toBe('Aotearoa · Country centroid, not a landing site');
    expect(popupHtml(hastings)).toContain('Town stand-in, not the site');
    expect(popupHtml(hastings)).not.toMatch(/battlefield/i);

    const paracas = catalog.events.find((event) => event.packId === 'paracas')!;
    expect(paracas.standIn).toBe('District stand-in, not the site');
    const indo = catalog.migrations.find((item) => item.id === 'indo-european')!;
    expect(indo.waypoints.find((stop) => stop.name === 'Sintashta culture')?.standIn).toBe('Approximate regional point, not the site');
    expect(indo.waypoints.find((stop) => stop.name === 'Swat District')?.standIn).toBe('District stand-in, not the site');

    const flagged = catalog.standIns.filter((item) => item.treatment === 'flagged').map((item) => item.id);
    const hidden = catalog.standIns.filter((item) => item.treatment === 'hidden').map((item) => item.id);
    expect(flagged).toEqual(['leang-tedongnge', 'hastings', 'paracas', 'aotearoa', 'sintashta-culture', 'swat-district']);
    expect(hidden).toEqual(['rising-star']);
  });

  it('does not merge a medium match that has no verdict', () => {
    const built = buildCatalog({ verdicts: { accept: [], reject: verdicts.reject } });
    verdicts.accept.forEach((row) => {
      const appEvent = built.events.find((event) => event.id === row.appId)!;
      expect(appEvent.packId, row.packId).not.toBe(row.packId);
      expect(appEvent.matchConfidence).toBeUndefined();
      expect(appEvent.matchReason).toBeUndefined();
      expect(built.events.some((event) => event.packId === row.packId && event.provenance === 'pack')).toBe(true);
    });
    expect(built.events.find((event) => event.id === 'hastings')?.matchConfidence).toBe('exact');
    expect(built.events.find((event) => event.id === 'homo-naledi')?.packId).toBe('rising-star');
  });

  it('reads stand-ins from coordMethod and builds only https DOI links', () => {
    expect(standInFromMethod('PROXY: nearest named feature')).toEqual({ treatment: 'hidden', note: 'Proxy location is not plotted' });
    expect(standInFromMethod('REGION centroid only; exact site not given')).toEqual({ treatment: 'flagged', note: 'Region centroid, not the site' });
    expect(standInFromMethod('Country-level centroid only.')).toEqual({ treatment: 'flagged', note: 'Country centroid, not a landing site' });
    expect(standInFromMethod('Town of Battle, East Sussex; town-level.')).toEqual({ treatment: 'flagged', note: 'Town stand-in, not the site' });
    expect(standInFromMethod("GeoNames id 8349869 ('Paracas (district)'): District-level; Paracas peninsula area.")).toEqual({
      treatment: 'flagged',
      note: 'District stand-in, not the site',
    });
    expect(standInFromMethod("GeoNames id 1164211 ('Swat'): District-level.")).toEqual({
      treatment: 'flagged',
      note: 'District stand-in, not the site',
    });
    expect(standInFromMethod("GeoNames id 1490435 ('Syntasty (Sintashta river)'): River after which the type site is named; approximate.")).toEqual({
      treatment: 'flagged',
      note: 'Approximate regional point, not the site',
    });
    expect(standInFromMethod('site-level')).toBeNull();
    expect(standInFromMethod('City-level point for the capital.')).toBeNull();
    expect(standInFromMethod('Lake (dry lakebed) where the remains were found; lake-level precision.')).toBeNull();
    expect(standInFromMethod('Park-level point (one of two GeoNames entries); footprints lie within the park.')).toBeNull();

    const tricky = '10.1002/(sici)1520-6505(1998)6:4<132::aid-evan3>3.0.co;2-f';
    const slash = tricky.indexOf('/');
    expect(doiHref({ doi: tricky, url: 'javascript:alert(1)//doi.org/10.1000/x' })).toBe(
      `https://doi.org/${encodeURIComponent(tricky.slice(0, slash))}/${encodeURIComponent(tricky.slice(slash + 1))}`,
    );
    expect(doiHref({ doi: 'javascript:alert(1)', url: 'https://doi.org/10.1000/xyz' })).toBeUndefined();
    expect(doiHref({ url: 'https://doi.org/10.1038/nature22968' })).toBeUndefined();
    expect(doiHref({ doi: '10.1038/nature22968' })?.startsWith('https://doi.org/')).toBe(true);
    expect(doiHref({ doi: '10.1000/...' })).toBeUndefined();
    expect(doiHref({ doi: '10.1000/.' })).toBeUndefined();
    expect(doiHref({ doi: '10.1000/a.b' })).toBe('https://doi.org/10.1000/a.b');
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
