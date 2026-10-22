import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import { pagesPathMatches, parsePagesHeaders } from './src/pages-headers';
import { standInFromMethod } from './src/stand-in';

/**
 * Editor notes stay in this build config. The client receives a short code.
 * Unknown notes collapse to "notice" so a new phrase cannot ship verbatim.
 */
const SENSITIVITY_CODE: Record<string, string> = {
  'Deceased persons: Aboriginal ancestral remains.': 'ancestors-aboriginal',
  'Genocide; handle respectfully.': 'genocide',
  'Anangu ask that Tjukurpa stories are not retold; link to Parks Australia only.': 'uluru',
  'Ancestral Māori remains; deceased-person sensitivity.': 'ancestors-maori',
  'Gunditjmara Country; follow Traditional Owner guidance.': 'owners',
  'Colonial encounter; Gweagal perspective.': 'colonial',
  'Massacre; handle respectfully.': 'massacre',
  'Mass atrocity; handle respectfully.': 'atrocity',
  'Enslavement; handle respectfully.': 'enslavement',
};

const SENSITIVITY_CODES = new Set(Object.values(SENSITIVITY_CODE));

/** Drop pack fields the map never renders so they stay out of the JS bundle. */
function stripPackMetadata(): Plugin {
  return {
    name: 'strip-pack-metadata',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0];
      if (file.endsWith('/data/pack/content.json')) return JSON.stringify(slimContent(JSON.parse(code)));
      if (file.endsWith('/data/pack/sources.json')) return JSON.stringify(slimSources(JSON.parse(code)));
      if (file.endsWith('/data/pack/app-id-mapping.json')) return JSON.stringify(slimMapping(JSON.parse(code)));
      if (file.endsWith('/data/match-verdicts.json')) return JSON.stringify(slimVerdicts(JSON.parse(code)));
      return null;
    },
  };
}

function pagesHeaders(): Plugin {
  const rules = parsePagesHeaders(readFileSync('public/_headers', 'utf8'));
  return {
    name: 'pages-headers',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL((req as { url?: string }).url ?? '/', 'http://127.0.0.1').pathname;
        rules.forEach((rule) => {
          if (!pagesPathMatches(rule.path, pathname)) return;
          Object.entries(rule.headers).forEach(([name, value]) => res.setHeader(name, value));
        });
        next();
      });
    },
  };
}

function slimContent(data: {
  pins: Record<string, unknown>[];
  migrations: Record<string, unknown>[];
  eras: unknown;
  people: unknown;
  timeline: unknown;
  furtherReading: unknown;
}) {
  return scrub({
    pins: data.pins.map((pin) => {
      const placement = standInFromMethod(typeof pin.coordMethod === 'string' ? pin.coordMethod : undefined);
      const slim = pick(pin, ['id', 'title', 'type', 'start', 'end', 'place', 'lat', 'lng', 'summary', 'dateNote', 'dateStatus', 'sources']);
      slim.sensitivity = sensitivityCode(pin.sensitivity);
      if (placement) slim.placement = placement;
      return slim;
    }),
    migrations: data.migrations.map((migration) => ({
      ...pick(migration, ['id', 'title', 'start', 'end', 'summary', 'debate', 'sources']),
      sensitivity: sensitivityCode(migration.sensitivity),
      path: (migration.path as Record<string, unknown>[]).map((stop) => {
        const placed = standInFromMethod(typeof stop.coordMethod === 'string' ? stop.coordMethod : undefined);
        const slim = pick(stop, ['name', 'lat', 'lng']);
        if (placed?.treatment === 'flagged' && stop.lat != null && stop.lng != null) slim.standIn = placed.note;
        return slim;
      }),
    })),
    eras: data.eras,
    people: data.people,
    timeline: data.timeline,
    furtherReading: data.furtherReading,
  });
}

function slimSources(data: { sources: Record<string, unknown>[] }) {
  return scrub({ sources: data.sources.map((source) => pick(source, ['id', 'type', 'title', 'url', 'doi', 'year', 'authors'])) });
}

function slimMapping(data: { mappings: Record<string, unknown>[] }) {
  return { mappings: data.mappings.map((row) => pick(row, ['packId', 'appId', 'confidence'])) };
}

function slimVerdicts(data: { accept: unknown; reject: unknown }) {
  return { accept: data.accept, reject: data.reject };
}

function sensitivityCode(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  if (SENSITIVITY_CODES.has(value)) return value;
  return SENSITIVITY_CODE[value] ?? 'notice';
}

/** Gazetteer and Pleiades ids are join keys only. The digits stay out of the bundle. */
function publicSourceId(id: string): string {
  const match = id.match(/^(geonames|pleiades)-(\d+)$/);
  if (!match) return id;
  const letters = match[2].replace(/\d/g, (digit) => 'abcdefghij'[Number(digit)]);
  return `gazetteer-${match[1] === 'pleiades' ? 'p' : 'g'}-${letters}`;
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') return scrubText(value);
    return value;
  }
  const out: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    if (key === 'coordMethod' || key === 'revision' || key === 'retrieved' || key === 'verified' || key === 'reliability') return;
    if (key === 'url' && typeof child === 'string' && /geonames\.org|pleiades\.stoa\.org/i.test(child)) return;
    if (key === 'id' && typeof child === 'string') {
      out.id = publicSourceId(child);
      return;
    }
    if (key === 'title' && typeof child === 'string') {
      out.title = child.replace(/^GeoNames:\s*/i, '').replace(/^Pleiades:\s*/i, '');
      return;
    }
    if (key === 'sources' && Array.isArray(child) && child.every((item) => typeof item === 'string')) {
      out.sources = child.map((id) => publicSourceId(id));
      return;
    }
    if (key === 'sensitivity') {
      out.sensitivity = sensitivityCode(child);
      return;
    }
    out[key] = scrub(child);
  });
  return out;
}

function scrubText(value: string): string {
  return value.replace(/GeoNames id \d+/g, '').replace(/Pleiades id \d+/g, '').replace(/\(rev \d+\)/g, '');
}

function pick(value: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  keys.forEach((key) => {
    if (key in value) out[key] = value[key];
  });
  return out;
}

export default defineConfig({
  plugins: [stripPackMetadata(), pagesHeaders()],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
