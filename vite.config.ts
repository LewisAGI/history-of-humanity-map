import { defineConfig, type Plugin } from 'vitest/config';

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

function slimContent(data: {
  pins: Record<string, unknown>[];
  migrations: Record<string, unknown>[];
  eras: unknown;
  people: unknown;
  timeline: unknown;
  furtherReading: unknown;
}) {
  return {
    pins: data.pins.map((pin) => pick(pin, ['id', 'title', 'type', 'start', 'end', 'place', 'lat', 'lng', 'summary', 'dateNote', 'dateStatus', 'sensitivity', 'sources', 'coordMethod'])),
    migrations: data.migrations.map((migration) => ({
      ...pick(migration, ['id', 'title', 'start', 'end', 'summary', 'debate', 'sensitivity', 'sources']),
      path: (migration.path as Record<string, unknown>[]).map((stop) => pick(stop, ['name', 'lat', 'lng', 'coordMethod'])),
    })),
    eras: data.eras,
    people: data.people,
    timeline: data.timeline,
    furtherReading: data.furtherReading,
  };
}

function slimSources(data: { sources: Record<string, unknown>[] }) {
  return { sources: data.sources.map((source) => pick(source, ['id', 'type', 'title', 'url', 'doi', 'year', 'authors'])) };
}

function slimMapping(data: { mappings: Record<string, unknown>[] }) {
  return { mappings: data.mappings.map((row) => pick(row, ['packId', 'appId', 'confidence'])) };
}

function slimVerdicts(data: { accept: unknown; reject: unknown }) {
  return { accept: data.accept, reject: data.reject };
}

function pick(value: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  keys.forEach((key) => {
    if (key in value) out[key] = value[key];
  });
  return out;
}

export default defineConfig({
  plugins: [stripPackMetadata()],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
