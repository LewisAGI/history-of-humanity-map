import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import content from '../data/pack/content.json';
import sources from '../data/pack/sources.json';
import { catalog, pinLinkHref } from '../src/catalog';
import { externalRel } from '../src/links';
import { readerNotice } from '../src/notice';
import { sensitivityCode } from '../vite.config';
import { parsePagesHeaders } from '../src/pages-headers';
import { externalAnchor, mountDepth, renderDoiLinks, renderSourceLinks } from '../src/panels';
import { popupHtml } from '../src/present';

const EDITOR_NOTE = /handle respectfully|link to .* only|follow .* guidance|link (only|to Parks)|by request/i;

class FakeNode {
  id = '';
  hidden = true;
  className = '';
  textContent = '';
  innerHTML = '';
  rel = '';
  href = '';
  target = '';
  type = '';
  children: FakeNode[] = [];
  dataset: Record<string, string> = {};
  get childElementCount() {
    return this.children.length;
  }
  addEventListener() {}
  setAttribute() {}
  append(...nodes: FakeNode[]) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: FakeNode[]) {
    this.children = nodes;
  }
  focus() {}
  closest() {
    return null;
  }
}

function installDocument() {
  const nodes = new Map<string, FakeNode>();
  const documentFake = {
    createElement: () => new FakeNode(),
    addEventListener: () => {},
  };
  Object.assign(globalThis, { document: documentFake });
  const app = {
    querySelector(selector: string) {
      const id = selector.replace('#', '');
      let node = nodes.get(id);
      if (!node) {
        node = new FakeNode();
        node.id = id;
        nodes.set(id, node);
      }
      return node;
    },
  };
  return { app, nodes };
}

describe('reader-facing sensitivity', () => {
  it('shows a short notice and keeps editor notes out of rendered text', () => {
    const packed = JSON.stringify({ content, sources });
    ['handle respectfully', 'link to Parks Australia only', 'follow Traditional Owner guidance', 'coordMethod'].forEach((phrase) => {
      expect(packed.toLowerCase()).not.toContain(phrase.toLowerCase());
    });
    expect(packed).not.toMatch(/GeoNames id \d+|Pleiades id \d+|\(rev \d+\)/);
    expect(packed).not.toMatch(/geonames-\d+|pleiades-\d+/);
    expect(packed).not.toMatch(/geonames\.org\/\d+|pleiades\.stoa\.org\/places\/\d+/);

    const { app, nodes } = installDocument();
    const depth = mountDepth(app as unknown as HTMLElement, {
      openEvent: () => {},
      openEra: () => {},
      showRoute: () => {},
      filters: {
        history: true,
        myth: true,
        established: true,
        approximate: true,
        traditional: true,
        contested: true,
        unsourced: true,
        lens: 'all',
      },
      onFilters: () => {},
    });
    content.pins.forEach((pin) => {
      expect(pin.title, pin.id).not.toMatch(EDITOR_NOTE);
      expect(pin.summary, pin.id).not.toMatch(EDITOR_NOTE);
      expect(pin.dateNote, pin.id).not.toMatch(EDITOR_NOTE);
    });
    catalog.timeline.forEach((entry) => expect(entry.label, entry.ref).not.toMatch(EDITOR_NOTE));
    const seen = new Set<string>();
    catalog.events.forEach((event) => {
      expect(event.title, event.id).not.toMatch(EDITOR_NOTE);
      expect(event.summary, event.id).not.toMatch(EDITOR_NOTE);
      expect(event.dateNote, event.id).not.toMatch(EDITOR_NOTE);
      expect(popupHtml(event), event.id).not.toMatch(EDITOR_NOTE);
      if (!event.sensitivity) return;
      seen.add(event.sensitivity);
      depth.ask(event, () => {});
      const shown = nodes.get('gate-text')?.textContent ?? '';
      expect(shown).toBe(readerNotice(event.sensitivity));
      expect(shown).not.toMatch(EDITOR_NOTE);
      expect(shown).not.toBe(event.sensitivity);
      expect(event.sensitivity).not.toMatch(EDITOR_NOTE);
    });
    catalog.migrations.forEach((migration) => {
      if (!migration.sensitivity) return;
      seen.add(migration.sensitivity);
      expect(readerNotice(migration.sensitivity)).not.toMatch(EDITOR_NOTE);
    });
    catalog.standIns.forEach((item) => expect(`${item.label} ${item.note}`).not.toMatch(EDITOR_NOTE));
    expect(seen).toEqual(
      new Set([
        'ancestors-aboriginal',
        'genocide',
        'uluru',
        'ancestors-maori',
        'owners',
        'colonial',
        'massacre',
        'atrocity',
        'enslavement',
      ]),
    );
    const wording = [...seen].map((code) => readerNotice(code));
    expect(new Set(wording).size).toBe(wording.length);

    const unlisted = 'Cataloguer: mention the dispute in the editor note only.';
    expect(sensitivityCode(unlisted)).toBe('notice');
    expect(sensitivityCode(null)).toBeNull();
    expect(sensitivityCode('')).toBeNull();
    expect(sensitivityCode('genocide')).toBe('genocide');
    expect(readerNotice('notice')).toBe('This entry asks for care.');
    expect(readerNotice(unlisted)).toBe('This entry asks for care.');
    expect(readerNotice('not-a-listed-code')).toBe('This entry asks for care.');

    const mungo = catalog.events.find((event) => event.packId === 'lake-mungo' || event.id === 'lake-mungo');
    const wairau = catalog.events.find((event) => event.packId === 'wairau-bar' || event.id === 'wairau-bar');
    expect(mungo?.dateNote).toBe('Approx.; about 42-40 ka. The ancestral remains have been returned.');
    expect(wairau?.dateNote).toBe('Approx.; ~late 13th century. Ancestral remains.');
    expect(`${mungo?.dateNote} ${wairau?.dateNote}`).not.toMatch(/deceased-person sensitivity/i);
  });
});

describe('uluru link', () => {
  it('renders no external link until the pack supplies uluru.gov.au', () => {
    const uluru = catalog.events.find((event) => event.id === 'uluru-link' || event.packId === 'uluru-link');
    expect(uluru).toBeTruthy();
    expect(uluru?.title).toBe('Uluru');
    expect(uluru?.summary).toBe('A sacred Anangu place. Its Tjukurpa stories are not retold here.');
    expect(uluru?.dateNote).toBe('Living tradition.');
    const html = popupHtml(uluru!);
    expect(html).toContain('>Uluru<');
    expect(html).toContain('A sacred Anangu place. Its Tjukurpa stories are not retold here.');
    expect(html).not.toMatch(EDITOR_NOTE);
    expect(html).not.toMatch(/<a\b/i);
    expect(html).not.toContain('wikipedia.org');
    expect(html).not.toContain('uluru.gov.au');
    expect(pinLinkHref(uluru!, { url: 'https://en.wikipedia.org/wiki/Uluru' })).toBeUndefined();
    expect(pinLinkHref(uluru!, { url: 'http://uluru.gov.au/visit', doi: '10.1000/example' })).toBeUndefined();
    expect(pinLinkHref(uluru!, { url: 'https://uluru.gov.au/visit' })).toBe('https://uluru.gov.au/visit');
    expect(pinLinkHref(uluru!, { url: 'https://www.uluru.gov.au/visit' })).toBe('https://www.uluru.gov.au/visit');
    expect(pinLinkHref({ id: 'herto' }, { doi: '10.1038/nature22968', url: 'https://en.wikipedia.org/wiki/Uluru' })).toBe(
      'https://doi.org/10.1038/nature22968',
    );

    installDocument();
    expect((renderSourceLinks(['wp-uluru']) as unknown as FakeNode).childElementCount).toBe(0);
    const allowed = externalAnchor('https://uluru.gov.au/visit', 'Parks Australia', 'entry-button');
    expect(allowed?.href).toBe('https://uluru.gov.au/visit');
    expect(externalAnchor('https://en.wikipedia.org/wiki/Uluru', 'Wikipedia: Uluru', 'entry-button')).toBeUndefined();
  });
});

describe('external link rel', () => {
  it('sets noopener noreferrer from the popup and the depth sheet', () => {
    expect(externalRel()).toBe('noopener noreferrer');
    const cited = catalog.events.find((event) => event.sourceIds?.includes('doi-10-1038-nature22968'));
    expect(cited).toBeTruthy();
    expect(popupHtml(cited!)).toContain('rel="noopener noreferrer"');

    installDocument();
    const doiList = renderSourceLinks(['doi-10-1038-nature22968']) as unknown as FakeNode;
    const doiLink = doiList.children[0]?.children.find((node) => node.rel);
    expect(doiLink?.rel).toBe('noopener noreferrer');
    expect(doiLink?.target).toBe('_blank');

    const page = [...catalog.sources.values()].find((source) => source.url && !source.doi && source.id !== 'wp-uluru');
    expect(page).toBeTruthy();
    const urlList = renderSourceLinks([page!.id]) as unknown as FakeNode;
    expect(urlList.children[0]?.rel).toBe('noopener noreferrer');

    const dois = renderDoiLinks(['doi-10-1038-nature22968']) as unknown as FakeNode;
    expect(dois.children[0]?.rel).toBe('noopener noreferrer');

    const reading = externalAnchor('https://example.com/essay', 'Essay', 'entry-button');
    expect(reading?.rel).toBe('noopener noreferrer');
  });
});

describe('review mark', () => {
  it('is a focusable 44px control with its own icon', () => {
    const reviewed = catalog.events.find((event) => event.matchConfidence === 'medium');
    expect(reviewed).toBeTruthy();
    const html = popupHtml(reviewed!);
    expect(html).toContain('<button type="button" class="review-mark" data-tip="Matched by review" aria-label="Matched by review">');
    expect(html).toContain('M7 4h10v16l-5-3-5 3z');
    expect(html).not.toContain('M5 12l5 5L19 7');
    expect(html).not.toContain('M7 12.5l3 3 7-7');
    const css = readFileSync('src/style.css', 'utf8');
    expect(css).toMatch(/\.review-mark\s*\{[^}]*width:\s*44px;\s*height:\s*44px;/s);
    expect(css).toContain('.review-mark:focus-visible');
    expect(readFileSync('src/main.ts', 'utf8')).toContain('M5 12l5 5L19 7');
  });
});

describe('shipped gazetteer ids', () => {
  it('keeps GeoNames, Pleiades, and revision numbers out of the bundle', () => {
    const raw = [readFileSync('data/pack/content.json', 'utf8'), readFileSync('data/pack/sources.json', 'utf8')];
    const numbers = new Set<string>();
    const letterSwaps = new Set<string>();
    raw.forEach((text) => {
      for (const match of text.matchAll(/GeoNames id (\d+)/g)) numbers.add(match[1]);
      for (const match of text.matchAll(/Pleiades id (\d+)/g)) numbers.add(match[1]);
      for (const match of text.matchAll(/\(rev (\d+)\)/g)) numbers.add(match[1]);
      for (const match of text.matchAll(/"revision":\s*(\d+)/g)) numbers.add(match[1]);
      for (const match of text.matchAll(/\b(?:geonames|pleiades)-(\d+)\b/g)) {
        numbers.add(match[1]);
        letterSwaps.add(match[1].replace(/\d/g, (digit) => 'abcdefghij'[Number(digit)]));
      }
    });
    const packed = JSON.stringify({ content, sources });
    numbers.forEach((number) => expect(packed, number).not.toContain(number));
    letterSwaps.forEach((encoded) => expect(packed, encoded).not.toContain(encoded));
    const gazetteers = sources.sources.filter((source) => source.type === 'gazetteer');
    expect(gazetteers.length).toBeGreaterThan(0);
    gazetteers.forEach((source) => {
      expect(source.id).toMatch(/^s\d{3}$/);
      expect(source.url).toBeUndefined();
    });
  });
});

describe('pages headers', () => {
  it('puts security headers on /* only', () => {
    const rules = parsePagesHeaders(readFileSync('public/_headers', 'utf8'));
    const paths = rules.map((rule) => rule.path);
    expect(new Set(paths).size).toBe(paths.length);
    const security = ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy'];
    expect(rules.filter((rule) => security.some((name) => name in rule.headers)).map((rule) => rule.path)).toEqual(['/*']);
    expect(rules.find((rule) => rule.path === '/assets/*')?.headers['Cache-Control']).toContain('immutable');
    expect(rules.find((rule) => rule.path === '/')?.headers['Content-Security-Policy']).toBeUndefined();
  });
});
