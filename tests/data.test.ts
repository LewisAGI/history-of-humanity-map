import { describe, expect, it } from 'vitest';
import { sentenceCount } from '../src/dates';
import { routeLines } from '../src/geo';
import { ERA_BOUNDARY, TIMELINE_START, eventOverlapsPeriod, presentYear, resolvePeriod } from '../src/timeline';
import { CONTINENTS, type Continent, type HistoryEvent, type Waypoint } from '../src/types';
import eventsJson from '../data/events.json';

const events = eventsJson as HistoryEvent[];
const present = presentYear();

const MIGRATIONS = [
  'out-of-africa',
  'peopling-of-the-americas',
  'bantu-expansion',
  'austronesian-voyages',
  'silk-road',
  'mongol-conquests',
  'thule-migration',
  'atlantic-slave-trade',
  'trail-of-tears',
  'zheng-he',
  'ibn-battuta',
  'xuanzang',
  'cook-pacific',
  'madagascar-settlement',
  'zhang-qian',
  'mansa-musa',
  'lapita',
  'madjedbebe',
  'hawaii-settlement',
  'aotearoa-settlement',
  'rapa-nui',
  'inca-expansion',
  'cortes',
];

describe('event data', () => {
  it('matches the schema and keeps ids unique', () => {
    const ids = new Set<string>();
    events.forEach((event) => {
      expect(event.id, event.id).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(event.id), event.id).toBe(false);
      ids.add(event.id);
      expect(['history', 'myth']).toContain(event.type);
      expect(event.title.length).toBeGreaterThan(0);
      expect(Number.isInteger(event.start)).toBe(true);
      expect(Number.isInteger(event.end)).toBe(true);
      expect(event.start).toBeLessThanOrEqual(event.end);
      expect(event.start).toBeGreaterThanOrEqual(TIMELINE_START);
      expect(event.end).toBeLessThanOrEqual(present);
      expect(event.start).not.toBe(0);
      expect(event.end).not.toBe(0);
      expect(event.lat).toBeGreaterThanOrEqual(-90);
      expect(event.lat).toBeLessThanOrEqual(90);
      expect(event.lng).toBeGreaterThanOrEqual(-180);
      expect(event.lng).toBeLessThanOrEqual(180);
      expect(event.lat === 0 && event.lng === 0).toBe(false);
      expect(event.place.length).toBeGreaterThan(0);
      expect(CONTINENTS).toContain(event.continent);
      expect(sentenceCount(event.summary), event.id).toBeGreaterThanOrEqual(2);
      expect(sentenceCount(event.summary), event.id).toBeLessThanOrEqual(4);
      expect(event.dateNote.length).toBeGreaterThan(0);
      if (event.type === 'myth') {
        expect(event.dateNote, event.id).toMatch(/Traditional date|Earliest written source/);
      }
      if (event.path) {
        const lines = pathBranches(event.path);
        expect(lines.length, event.id).toBeGreaterThanOrEqual(1);
        lines.forEach((line) => {
          expect(line.length, event.id).toBeGreaterThanOrEqual(2);
          line.forEach((point) => {
            expect(point.lat).toBeGreaterThanOrEqual(-90);
            expect(point.lat).toBeLessThanOrEqual(90);
            expect(point.lng).toBeGreaterThanOrEqual(-180);
            expect(point.lng).toBeLessThanOrEqual(180);
          });
        });
      }
    });
    expect(events.length).toBeGreaterThanOrEqual(300);
  });

  it('prints a per-continent and per-era count and stays globally balanced', () => {
    const eras = ['before', 'after'] as const;
    const table = Object.fromEntries(
      CONTINENTS.map((continent) => [
        continent,
        Object.fromEntries(eras.map((era) => [era, 0])),
      ]),
    ) as Record<Continent, Record<(typeof eras)[number], number>>;

    const bins = [
      '300,000–50,000 BCE',
      '50,000–3000 BCE',
      '3000–500 BCE',
      '500 BCE–500 CE',
      '500–1500 CE',
      '1500–1900 CE',
      '1900 CE–present',
    ];
    const binCounts = Object.fromEntries(CONTINENTS.map((continent) => [continent, Object.fromEntries(bins.map((bin) => [bin, 0]))]));

    let history = 0;
    let myth = 0;
    events.forEach((event) => {
      const era = event.start < ERA_BOUNDARY ? 'before' : 'after';
      table[event.continent][era] += 1;
      if (event.type === 'history') history += 1;
      else myth += 1;
      const bin = eraBin(event.start);
      binCounts[event.continent][bin] += 1;
    });

    const lines = CONTINENTS.map((continent) => {
      const before = table[continent].before;
      const after = table[continent].after;
      return `${continent}: before ${before}, after ${after}, total ${before + after}`;
    });
    console.log(`Events: ${events.length} (history ${history}, myth ${myth})`);
    console.log(lines.join('\n'));
    console.log(JSON.stringify(binCounts, null, 2));

    expect(history).toBeGreaterThanOrEqual(250);
    expect(myth).toBeGreaterThanOrEqual(30);
    CONTINENTS.filter((continent) => continent !== 'Antarctica').forEach((continent) => {
      const total = table[continent].before + table[continent].after;
      expect(total, continent).toBeGreaterThanOrEqual(24);
    });
    expect(table.Antarctica.before + table.Antarctica.after).toBeGreaterThanOrEqual(6);
    const europe = table.Europe.before + table.Europe.after;
    const asia = table.Asia.before + table.Asia.after;
    const africa = table.Africa.before + table.Africa.after;
    expect(europe).toBeLessThan(asia);
    expect(europe).toBeLessThanOrEqual(africa + 5);
    expect(europe / events.length).toBeLessThan(0.2);
    expect(events.filter((event) => event.start < ERA_BOUNDARY).length).toBeGreaterThanOrEqual(28);
    bins.forEach((bin) => {
      const count = CONTINENTS.reduce((sum, continent) => sum + binCounts[continent][bin], 0);
      expect(count, bin).toBeGreaterThan(0);
    });
  });

  it('includes the named migrations and an event that spans the era boundary', () => {
    MIGRATIONS.forEach((id) => {
      const event = events.find((item) => item.id === id);
      expect(event, id).toBeTruthy();
      expect(routeLines(event?.path).length).toBeGreaterThanOrEqual(1);
    });
    const spanning = events.find((event) => event.start < ERA_BOUNDARY && event.end >= ERA_BOUNDARY);
    expect(spanning).toBeTruthy();
    expect(eventOverlapsPeriod(spanning!, resolvePeriod(ERA_BOUNDARY - 1, present))).toBe(true);
    expect(eventOverlapsPeriod(spanning!, resolvePeriod(ERA_BOUNDARY, present))).toBe(true);
  });
});

describe('corrected routes and wording', () => {
  it('starts the Trail of Tears at New Echota and Lapita in the Bismarck Archipelago', () => {
    const tears = events.find((event) => event.id === 'trail-of-tears')!;
    expect(routeLines(tears.path)[0][0]).toMatchObject({ lat: 34.541, lng: -84.909 });
    const lapita = events.find((event) => event.id === 'lapita')!;
    expect(routeLines(lapita.path)[0][0]).toMatchObject({ lat: -1.45, lng: 149.62 });
  });

  it('draws the slave trade from Elmina to the Caribbean and from Luanda to Brazil', () => {
    const slave = events.find((event) => event.id === 'atlantic-slave-trade')!;
    const lines = routeLines(slave.path);
    expect(lines).toHaveLength(2);
    const starts = lines.map((line) => line[0]);
    expect(starts).toContainEqual({ lat: 5.08, lng: -1.35 });
    expect(starts).toContainEqual({ lat: -8.839, lng: 13.234 });
    const ends = lines.map((line) => line[line.length - 1]);
    expect(ends).toContainEqual({ lat: 13.1, lng: -59.62 });
    expect(ends).toContainEqual({ lat: -12.97, lng: -38.5 });
    expect(sentenceCount(slave.summary)).toBeGreaterThanOrEqual(2);
    expect(sentenceCount(slave.summary)).toBeLessThanOrEqual(4);
  });

  it('keeps history in the text and leaves out the drawing', () => {
    const banned = /\bthe line\b|\bthe arrow\b|\bschematic\b|\bpin\b|marked separately|separate historical|\bseparately\b|elsewhere on|separate event|separate tradition|this map|the timeline|timescale/i;
    events.forEach((event) => {
      expect(event.summary, event.id).not.toMatch(banned);
      expect(event.dateNote, event.id).not.toMatch(banned);
      expect(event.dateNote, event.id).not.toMatch(/stored here/i);
    });
    const nazca = events.find((event) => event.id === 'nazca-lines')!;
    expect(nazca.dateNote).toMatch(/lines are widely dated/i);
    const journey = events.find((event) => event.id === 'journey-to-the-west')!;
    expect(journey.summary).toContain('Xuanzang made the real pilgrimage to India in the 7th century.');
    const sundiata = events.find((event) => event.id === 'sundiata-epic')!;
    expect(sundiata.summary).toContain('Sundiata founded Mali after the battle of Kirina, about 1235.');
    const troy = events.find((event) => event.id === 'troy-bronze-age')!;
    expect(troy.summary).toContain('Archaeology does not confirm the Homeric war.');
    const moriori = events.find((event) => event.id === 'chatham-moriori')!;
    expect(moriori.summary).toContain('In 1835 Māori groups from Taranaki invaded and killed or enslaved many Moriori.');
    const knossos = events.find((event) => event.id === 'knossos')!;
    expect(knossos.summary).toContain('Later Greek myth placed the Minotaur in the palace.');
    const flood = events.find((event) => event.id === 'genesis-flood')!;
    expect(flood.summary).toContain('Related flood stories are older in Mesopotamia.');
    const lucy = events.find((event) => event.id === 'lucy-discovery')!;
    expect(lucy.summary).toContain('The fossil itself is about 3.2 million years old.');
    const naledi = events.find((event) => event.id === 'homo-naledi')!;
    expect(naledi.summary).toContain('The remains are dated to roughly 335,000 to 236,000 years ago.');
    const qafzeh = events.find((event) => event.id === 'qafzeh-skhul')!;
    expect(qafzeh.summary).toContain('A later dispersal peopled the rest of the world.');
  });

  it('says the Australian parliament first sat in Melbourne', () => {
    const federation = events.find((event) => event.id === 'australian-federation')!;
    expect(federation.summary).toContain('Parliament first sat in Melbourne; Canberra became the capital in 1927.');
  });
});

describe('years ago are stored as BCE', () => {
  it('keeps every years-ago figure within 300 years of the stored span', () => {
    events.forEach((event) => {
      const figures = yearsAgo(event.summary + ' ' + event.dateNote);
      if (figures.length === 0) return;
      figures.forEach((bp) => {
        const year = 1950 - bp;
        if (year < TIMELINE_START) {
          expect(event.start, event.id).toBe(TIMELINE_START);
          return;
        }
        const gap = year < event.start ? event.start - year : year > event.end ? year - event.end : 0;
        expect(gap, `${event.id} ${bp} years ago`).toBeLessThanOrEqual(300);
      });
      const earliest = 1950 - Math.max(...figures);
      const expectedStart = Math.max(earliest, TIMELINE_START);
      expect(Math.abs(event.start - expectedStart), event.id).toBeLessThanOrEqual(300);
    });
  });
});

/** Numbers that the wording treats as "years ago", including both ends of a range. */
function yearsAgo(text: string): number[] {
  const range = /(\d{1,3}(?:,\d{3})+|\d+)\s*(?:to|–|-|and)\s*(?:more than\s+|about\s+|around\s+|roughly\s+|at least\s+)?(\d{1,3}(?:,\d{3})+|\d+)\s+years ago/gi;
  const found: number[] = [];
  const stripped = text.replace(range, (_match, start: string, end: string) => {
    found.push(Number(start.replaceAll(',', '')), Number(end.replaceAll(',', '')));
    return ' ';
  });
  const single = /(\d{1,3}(?:,\d{3})+|\d+)\s+years ago/gi;
  for (const match of stripped.matchAll(single)) {
    found.push(Number(match[1].replaceAll(',', '')));
  }
  return found;
}

function pathBranches(path: HistoryEvent['path']): Waypoint[][] {
  if (!path || path.length === 0) return [];
  return Array.isArray(path[0]) ? (path as Waypoint[][]) : [path as Waypoint[]];
}

function eraBin(start: number): string {
  if (start < -50000) return '300,000–50,000 BCE';
  if (start < ERA_BOUNDARY) return '50,000–3000 BCE';
  if (start < -500) return '3000–500 BCE';
  if (start < 500) return '500 BCE–500 CE';
  if (start < 1500) return '500–1500 CE';
  if (start < 1900) return '1500–1900 CE';
  return '1900 CE–present';
}
