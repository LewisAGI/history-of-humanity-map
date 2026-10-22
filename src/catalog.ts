import { continentFor } from './continent';
import type { Continent, DateStatus, HistoryEvent, LensId, Provenance } from './types';
import eventsJson from '../data/events.json';
import contentJson from '../data/pack/content.json';
import sourcesJson from '../data/pack/sources.json';
import mappingJson from '../data/pack/app-id-mapping.json';
import verdictsJson from '../data/match-verdicts.json';

export interface PackPin {
  id: string;
  title: string;
  type: string;
  start: number;
  end: number;
  place: string;
  lat: number | null;
  lng: number | null;
  summary: string;
  dateNote: string;
  dateStatus: DateStatus;
  sensitivity: string | null;
  sources: string[];
  coordMethod?: string;
}

interface PackMigration {
  id: string;
  title: string;
  start: number;
  end: number;
  summary: string;
  path: { name: string; lat: number | null; lng: number | null; coordMethod?: string; sources?: string[] }[];
  pathMethod: string;
  debate?: string;
  uncertainty?: string;
  sensitivity?: string | null;
  sources: string[];
}

interface PackEra {
  id: string;
  title: string;
  start: number;
  end: number;
  note: string;
  sources: string[];
}

interface PackPerson {
  id: string;
  name: string;
  born: number;
  died: number;
  summary: string;
  dateNote: string;
  sources: string[];
}

interface PackTimeline {
  t: number;
  ref: string;
  label: string;
  type: string;
}

interface PackReading {
  id: string;
  label: string;
  sources: string[];
}

interface PackSource {
  id: string;
  type: string;
  title: string;
  url?: string;
  doi?: string;
  year?: number;
  authors?: string[];
}

interface MappingRow {
  packId: string;
  appId: string;
  appTitle: string;
  confidence: string;
  basis: string;
}

interface VerdictRow {
  packId: string;
  appId: string;
  verdict: 'accept' | 'reject';
  reason: string;
}

const content = contentJson as {
  pins: PackPin[];
  migrations: PackMigration[];
  eras: PackEra[];
  people: PackPerson[];
  timeline: PackTimeline[];
  furtherReading: PackReading[];
};

const sourceList = (sourcesJson as { sources: PackSource[] }).sources;
const mapping = mappingJson as { mappings: MappingRow[] };
const verdictFile = verdictsJson as { accept: VerdictRow[]; reject: VerdictRow[] };

export const LENS_MEMBERS: Record<LensId, readonly string[]> = {
  'africa-medieval': [
    'koumbi-saleh',
    'igbo-ukwu',
    'lalibela',
    'mapungubwe',
    'benin-walls',
    'djenne',
    'qarawiyyin',
    'old-dongola',
    'mbanza-kongo',
    'gedi',
    'sijilmasa',
    'ezana-christianity',
  ],
  oceania: [
    'nan-madol',
    'haamonga',
    'wairau-bar',
    'budj-bim',
    'puuhonua',
    'mua-tonga',
    'botany-bay',
    'waitangi',
    'guadalcanal',
  ],
  andes: [
    'huaca-prieta',
    'kotosh',
    'sechin',
    'paracas',
    'nazca-lines',
    'huaca-luna',
    'sipan',
    'tiwanaku',
    'wari',
    'pachacamac',
    'kuelap',
    'chan-chan',
  ],
  'asia-20c': [
    'jallianwala',
    'ccp-founding',
    'ankara-1923',
    'dandi',
    'yanan',
    'nanjing',
    'pearl-harbor',
    'indonesia-1945',
    'panmunjom',
    'dien-bien-phu',
    'bandung',
    'merdeka',
    'shinkansen',
    'dhaka-1971',
    'saigon-1975',
    'tuol-sleng',
    'tehran-1979',
    'bhopal',
    'tiananmen-1989',
    'hong-kong-1997',
  ],
};

/** Movements the pack names differently from the app route pins. */
const MIGRATION_ALIASES: Record<string, string> = {
  bantu: 'bantu-expansion',
  mongol: 'mongol-conquests',
  'atlantic-slave': 'atlantic-slave-trade',
  thule: 'thule-migration',
  austronesian: 'austronesian-voyages',
  'austronesian-madagascar': 'madagascar-settlement',
  beringia: 'peopling-of-the-americas',
  sahul: 'madjedbebe',
};

export interface CatalogWaypoint {
  name: string;
  lat: number;
  lng: number;
  standIn?: string;
}

export interface CatalogMigration {
  id: string;
  title: string;
  start: number;
  end: number;
  summary: string;
  pathMethod: string;
  debate?: string;
  uncertainty?: string;
  sensitivity?: string;
  sourceIds: string[];
  waypoints: CatalogWaypoint[];
  dropped: string[];
  eventIds: string[];
}

export interface CatalogEra {
  id: string;
  title: string;
  start: number;
  end: number;
  note: string;
  sourceIds: string[];
}

export interface CatalogPerson {
  id: string;
  name: string;
  born: number;
  died: number;
  summary: string;
  dateNote: string;
  sourceIds: string[];
  eventIds: string[];
}

export interface CatalogSource {
  id: string;
  type: string;
  title: string;
  url?: string;
  doi?: string;
  year?: number;
  authors?: string[];
}

/** Resolvable DOI link. The pack stores the resolver URL when Crossref verified it. */
export function doiHref(source: { doi?: string; url?: string }): string | undefined {
  if (!source.doi) return undefined;
  if (source.url && source.url.includes('doi.org')) return source.url;
  return `https://doi.org/${source.doi}`;
}

export interface CatalogEntry {
  t: number;
  ref: string;
  label: string;
  type: string;
  kind: 'event' | 'migration' | 'missing';
  targetId?: string;
}

export interface CatalogReading {
  id: string;
  label: string;
  sourceIds: string[];
}

export interface StandInReport {
  id: 'rising-star' | 'hastings' | 'aotearoa';
  treatment: 'flagged' | 'hidden';
  eventId?: string;
  migrationId?: string;
  note: string;
}

export interface Verdict {
  packId: string;
  appId: string;
  verdict: 'accept' | 'reject';
  reason: string;
}

export interface Catalog {
  events: HistoryEvent[];
  migrations: CatalogMigration[];
  eras: CatalogEra[];
  people: CatalogPerson[];
  timeline: CatalogEntry[];
  reading: CatalogReading[];
  sources: Map<string, CatalogSource>;
  verdicts: Verdict[];
  standIns: StandInReport[];
  /** Pack pins with no coordinates. Herto stays on the app pin. */
  unlocated: { packId: string; appId?: string; title: string }[];
  counts: {
    packPins: number;
    mergedPins: number;
    addedPins: number;
    events: number;
  };
}

export type LensChoice = 'all' | LensId;

export interface MapFilters {
  history: boolean;
  myth: boolean;
  established: boolean;
  approximate: boolean;
  traditional: boolean;
  contested: boolean;
  unsourced: boolean;
  lens: LensChoice;
}

export const OPEN_FILTERS: MapFilters = {
  history: true,
  myth: true,
  established: true,
  approximate: true,
  traditional: true,
  contested: true,
  unsourced: true,
  lens: 'all',
};

export function eventVisible(event: HistoryEvent, filters: MapFilters): boolean {
  if (event.type === 'history' && !filters.history) return false;
  if (event.type === 'myth' && !filters.myth) return false;
  const status = event.dateStatus ?? 'unsourced';
  if (!filters[status]) return false;
  if (filters.lens !== 'all' && !(event.lenses ?? []).includes(filters.lens)) return false;
  return true;
}

export function filtersAreOpen(filters: MapFilters): boolean {
  return (
    filters.history &&
    filters.myth &&
    filters.established &&
    filters.approximate &&
    filters.traditional &&
    filters.contested &&
    filters.unsourced &&
    filters.lens === 'all'
  );
}

export interface SearchHit {
  kind: 'event' | 'person' | 'migration' | 'era';
  id: string;
  label: string;
  detail: string;
}

export function searchCatalog(catalog: Catalog, raw: string): SearchHit[] {
  const query = normalize(raw);
  if (query.length < 2) return [];
  const hits: SearchHit[] = [];
  for (const event of catalog.events) {
    const hay = normalize(`${event.title} ${event.place} ${event.summary}`);
    if (hay.includes(query)) hits.push({ kind: 'event', id: event.id, label: event.title, detail: event.place });
    if (hits.length >= 8) return hits;
  }
  for (const person of catalog.people) {
    if (normalize(person.name).includes(query)) {
      hits.push({ kind: 'person', id: person.id, label: person.name, detail: 'Person' });
    }
  }
  for (const migration of catalog.migrations) {
    if (normalize(`${migration.title} ${migration.summary}`).includes(query)) {
      hits.push({ kind: 'migration', id: migration.id, label: migration.title, detail: 'Route' });
    }
  }
  for (const era of catalog.eras) {
    if (normalize(era.title).includes(query)) {
      hits.push({ kind: 'era', id: era.id, label: era.title, detail: 'Era' });
    }
  }
  return hits.slice(0, 12);
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function lensesFor(packId: string): LensId[] {
  const found: LensId[] = [];
  (Object.keys(LENS_MEMBERS) as LensId[]).forEach((lens) => {
    if (LENS_MEMBERS[lens].includes(packId)) found.push(lens);
  });
  return found;
}

function appStatus(event: { type: string; dateNote: string }): DateStatus {
  if (/\bapproximate\b/i.test(event.dateNote)) return 'approximate';
  if (event.type === 'myth') return 'traditional';
  return 'unsourced';
}

function cloneEvent(event: HistoryEvent): HistoryEvent {
  const next: HistoryEvent = {
    ...event,
    provenance: 'app',
    dateStatus: appStatus(event),
    sourceIds: [],
    lenses: [],
    personIds: [],
    migrationIds: [],
  };
  if (event.path) next.path = JSON.parse(JSON.stringify(event.path)) as HistoryEvent['path'];
  return next;
}

export function buildCatalog(): Catalog {
  const appEvents = (eventsJson as HistoryEvent[]).map(cloneEvent);
  const byApp = new Map(appEvents.map((event) => [event.id, event]));
  const pins = new Map(content.pins.map((pin) => [pin.id, pin]));
  const verdicts: Verdict[] = [...verdictFile.accept, ...verdictFile.reject];
  const verdictByPack = new Map(verdicts.map((row) => [row.packId, row]));
  const accepted = new Set<string>();
  const mergedPinIds = new Set<string>();

  mapping.mappings.forEach((row) => {
    const verdict = row.confidence === 'medium' ? verdictByPack.get(row.packId) : undefined;
    const take = row.confidence !== 'medium' || verdict?.verdict === 'accept';
    if (!take) return;
    const event = byApp.get(row.appId);
    if (!event) return;
    const pin = pins.get(row.packId);
    accepted.add(row.packId);
    event.provenance = 'merged';
    event.packId = row.packId;
    if (pin) {
      mergedPinIds.add(pin.id);
      event.dateStatus = pin.dateStatus;
      event.sourceIds = [...pin.sources];
      if (pin.sensitivity) event.sensitivity = pin.sensitivity;
      const lenses = lensesFor(pin.id);
      if (lenses.length) event.lenses = lenses;
    }
  });

  const hastings = byApp.get('hastings');
  if (hastings) hastings.standIn = 'Town of Battle, not the battlefield';

  const added: HistoryEvent[] = [];
  const unlocated: Catalog['unlocated'] = [];
  content.pins.forEach((pin) => {
    if (accepted.has(pin.id)) {
      if (pin.lat == null || pin.lng == null) {
        unlocated.push({ packId: pin.id, appId: byApp.get(pin.id)?.id ?? pin.id, title: pin.title });
      }
      return;
    }
    if (pin.lat == null || pin.lng == null) {
      unlocated.push({ packId: pin.id, title: pin.title });
      return;
    }
    const id = byApp.has(pin.id) ? `pack-${pin.id}` : pin.id;
    const event: HistoryEvent = {
      id,
      title: pin.title,
      type: pin.type === 'myth' ? 'myth' : 'history',
      start: pin.start,
      end: pin.end,
      lat: pin.lat,
      lng: pin.lng,
      place: pin.place,
      continent: continentFor(pin.lat, pin.lng, pin.id) as Continent,
      summary: pin.summary,
      dateNote: pin.dateNote,
      packId: pin.id,
      dateStatus: pin.dateStatus,
      sourceIds: [...pin.sources],
      provenance: 'pack' as Provenance,
      lenses: lensesFor(pin.id),
      personIds: [],
      migrationIds: [],
    };
    if (pin.sensitivity) event.sensitivity = pin.sensitivity;
    added.push(event);
    byApp.set(event.id, event);
  });

  const events = [...appEvents, ...added];

  const migrations: CatalogMigration[] = content.migrations.map((migration) => {
    const waypoints: CatalogWaypoint[] = [];
    const dropped: string[] = [];
    migration.path.forEach((stop) => {
      if (stop.lat == null || stop.lng == null) {
        dropped.push(stop.name);
        return;
      }
      const point: CatalogWaypoint = { name: stop.name, lat: stop.lat, lng: stop.lng };
      if (stop.name === 'Aotearoa') point.standIn = 'Country centroid, not a landing site';
      waypoints.push(point);
    });
    const eventIds = new Set<string>();
    if (byApp.has(migration.id)) eventIds.add(migration.id);
    const alias = MIGRATION_ALIASES[migration.id];
    if (alias && byApp.has(alias)) eventIds.add(alias);
    const record: CatalogMigration = {
      id: migration.id,
      title: migration.title,
      start: migration.start,
      end: migration.end,
      summary: migration.summary,
      pathMethod: migration.pathMethod,
      sourceIds: [...migration.sources],
      waypoints,
      dropped,
      eventIds: [...eventIds],
    };
    if (migration.debate) record.debate = migration.debate;
    if (migration.uncertainty) record.uncertainty = migration.uncertainty;
    if (migration.sensitivity) record.sensitivity = migration.sensitivity;
    return record;
  });

  migrations.forEach((migration) => {
    migration.eventIds.forEach((id) => {
      const event = byApp.get(id);
      if (!event) return;
      event.migrationIds = [...(event.migrationIds ?? []), migration.id];
      if (!event.packId) event.packId = migration.id;
      if (event.provenance === 'app') event.provenance = 'merged';
      event.sourceIds = [...new Set([...(event.sourceIds ?? []), ...migration.sourceIds])];
    });
  });

  const people: CatalogPerson[] = content.people.map((person) => ({
    id: person.id,
    name: person.name,
    born: person.born,
    died: person.died,
    summary: person.summary,
    dateNote: person.dateNote,
    sourceIds: [...person.sources],
    eventIds: [],
  }));

  people.forEach((person) => {
    const pattern = new RegExp(`\\b${person.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    events.forEach((event) => {
      if (!pattern.test(`${event.title} ${event.summary}`)) return;
      person.eventIds.push(event.id);
      event.personIds = [...(event.personIds ?? []), person.id];
    });
  });

  const refKind = (ref: string): Pick<CatalogEntry, 'kind' | 'targetId'> => {
    const event = events.find((item) => item.id === ref || item.packId === ref);
    if (event) return { kind: 'event', targetId: event.id };
    if (migrations.some((item) => item.id === ref)) return { kind: 'migration', targetId: ref };
    return { kind: 'missing' };
  };

  const timeline: CatalogEntry[] = content.timeline.map((entry) => ({
    t: entry.t,
    ref: entry.ref,
    label: entry.label,
    type: entry.type,
    ...refKind(entry.ref),
  }));

  const sources = new Map<string, CatalogSource>();
  sourceList.forEach((source) => {
    sources.set(source.id, {
      id: source.id,
      type: source.type,
      title: source.title,
      url: source.url,
      doi: source.doi,
      year: source.year,
      authors: source.authors,
    });
  });

  const standIns: StandInReport[] = [
    {
      id: 'hastings',
      treatment: 'flagged',
      eventId: 'hastings',
      note: 'Town of Battle, not the battlefield',
    },
    {
      id: 'aotearoa',
      treatment: 'flagged',
      migrationId: 'austronesian',
      note: 'Country centroid, not a landing site',
    },
    {
      id: 'rising-star',
      treatment: 'hidden',
      eventId: 'homo-naledi',
      note: 'Sterkfontein Caves proxy is not plotted; the pin is the Rising Star cave',
    },
  ];

  return {
    events,
    migrations,
    eras: content.eras.map((era) => ({
      id: era.id,
      title: era.title,
      start: era.start,
      end: era.end,
      note: era.note,
      sourceIds: [...era.sources],
    })),
    people,
    timeline,
    reading: content.furtherReading.map((item) => ({
      id: item.id,
      label: item.label,
      sourceIds: [...item.sources],
    })),
    sources,
    verdicts,
    standIns,
    unlocated,
    counts: {
      packPins: content.pins.length,
      mergedPins: mergedPinIds.size,
      addedPins: added.length,
      events: events.length,
    },
  };
}

export const catalog = buildCatalog();

export function countInSpan(start: number, end: number): number {
  return catalog.events.filter((event) => event.start <= end && event.end >= start).length;
}
