import { formatYear, formatYearRange } from './dates';
import { catalog, doiHref, filtersAreOpen, searchCatalog, type MapFilters } from './catalog';
import { waypointText } from './present';
import type { HistoryEvent } from './types';

export interface DepthHooks {
  openEvent: (id: string) => void;
  openEra: (start: number) => void;
  showRoute: (id: string) => void;
  filters: MapFilters;
  onFilters: () => void;
}

export interface DepthController {
  closePopouts: () => void;
  closeSheet: () => void;
  sync: () => void;
  ask: (event: HistoryEvent, open: (event: HistoryEvent) => void) => void;
}

export function mountDepth(app: HTMLElement, hooks: DepthHooks): DepthController {
  const searchButton = app.querySelector<HTMLButtonElement>('#search-button')!;
  const libraryButton = app.querySelector<HTMLButtonElement>('#library-button')!;
  const searchPop = app.querySelector<HTMLElement>('#search-popout')!;
  const libraryPop = app.querySelector<HTMLElement>('#library-popout')!;
  const filterPop = app.querySelector<HTMLElement>('#filter-popout')!;
  const searchInput = app.querySelector<HTMLInputElement>('#search-input')!;
  const searchResults = app.querySelector<HTMLElement>('#search-results')!;
  const sheet = app.querySelector<HTMLElement>('#depth-sheet')!;
  const body = app.querySelector<HTMLElement>('#depth-body')!;
  const gate = app.querySelector<HTMLElement>('#gate')!;
  const gateText = app.querySelector<HTMLElement>('#gate-text')!;

  let gateEvent: HistoryEvent | null = null;
  let onGate: ((event: HistoryEvent) => void) | null = null;

  function closePopouts() {
    searchPop.hidden = true;
    libraryPop.hidden = true;
    filterPop.hidden = true;
    searchButton.setAttribute('aria-expanded', 'false');
    libraryButton.setAttribute('aria-expanded', 'false');
  }

  function closeSheet() {
    sheet.hidden = true;
    body.innerHTML = '';
  }

  function closeGate() {
    gate.hidden = true;
    gateEvent = null;
    onGate = null;
  }

  function sync() {
    libraryButton.setAttribute('aria-pressed', filtersAreOpen(hooks.filters) ? 'false' : 'true');
    paintFilters();
  }

  searchButton.addEventListener('click', () => {
    const open = searchPop.hidden;
    closePopouts();
    if (!open) return;
    searchPop.hidden = false;
    searchButton.setAttribute('aria-expanded', 'true');
    searchInput.focus();
  });

  libraryButton.addEventListener('click', () => {
    const open = libraryPop.hidden;
    closePopouts();
    if (!open) return;
    libraryPop.hidden = false;
    libraryButton.setAttribute('aria-expanded', 'true');
  });

  app.querySelector('#filter-button')!.addEventListener('click', () => {
    filterPop.hidden = !filterPop.hidden;
  });

  app.querySelector('#timeline-button')!.addEventListener('click', () => {
    closePopouts();
    openTimeline(catalog.eras[0]?.id ?? '');
  });
  app.querySelector('#stories-button')!.addEventListener('click', () => {
    closePopouts();
    openStories();
  });
  app.querySelector('#routes-button')!.addEventListener('click', () => {
    closePopouts();
    openRoutes();
  });
  app.querySelector('#standins-button')!.addEventListener('click', () => {
    closePopouts();
    openStandIns();
  });

  app.querySelector('#depth-close')!.addEventListener('click', closeSheet);
  app.querySelector('#gate-no')!.addEventListener('click', closeGate);
  app.querySelector('#gate-yes')!.addEventListener('click', () => {
    const event = gateEvent;
    const open = onGate;
    closeGate();
    if (event && open) open(event);
  });

  searchInput.addEventListener('input', () => {
    const hits = searchCatalog(catalog, searchInput.value);
    searchResults.replaceChildren();
    hits.forEach((hit) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-hit';
      button.dataset.kind = hit.kind;
      button.dataset.id = hit.id;
      button.innerHTML = `<span class="hit-label">${escapeHtml(hit.label)}</span><span class="hit-detail">${escapeHtml(hit.detail)}</span>`;
      button.addEventListener('click', () => {
        closePopouts();
        if (hit.kind === 'event') hooks.openEvent(hit.id);
        else if (hit.kind === 'person') openPerson(hit.id);
        else if (hit.kind === 'migration') {
          openMigration(hit.id);
          hooks.showRoute(hit.id);
        } else {
          const era = catalog.eras.find((item) => item.id === hit.id);
          if (era) {
            hooks.openEra(era.start);
            openTimeline(era.id);
          }
        }
      });
      searchResults.append(button);
    });
  });

  app.querySelector('#search-form')?.addEventListener('submit', (event) => event.preventDefault());

  document.addEventListener('pointerdown', (event) => {
    const element = event.target instanceof Element ? event.target : null;
    if (!element) return;
    if (!searchPop.hidden && !element.closest('#search-popout, #search-button')) {
      searchPop.hidden = true;
      searchButton.setAttribute('aria-expanded', 'false');
    }
    if (!libraryPop.hidden && !element.closest('#library-popout, #library-button')) {
      libraryPop.hidden = true;
      filterPop.hidden = true;
      libraryButton.setAttribute('aria-expanded', 'false');
    }
    if (!gate.hidden && !element.closest('#gate')) closeGate();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!gate.hidden) {
      closeGate();
      return;
    }
    if (!searchPop.hidden || !libraryPop.hidden) {
      closePopouts();
      return;
    }
    if (!sheet.hidden) closeSheet();
  });

  paintFilters();
  sync();

  function paintFilters() {
    const types = app.querySelector<HTMLElement>('#filter-types')!;
    const status = app.querySelector<HTMLElement>('#filter-status')!;
    const lenses = app.querySelector<HTMLElement>('#filter-lenses')!;
    types.replaceChildren(
      toggle('History', hooks.filters.history, swatch('history'), () => {
        hooks.filters.history = !hooks.filters.history;
        changed();
      }),
      toggle('Myth', hooks.filters.myth, swatch('myth'), () => {
        hooks.filters.myth = !hooks.filters.myth;
        changed();
      }),
    );
    status.replaceChildren(
      toggle('Established', hooks.filters.established, statusMark('established'), () => {
        hooks.filters.established = !hooks.filters.established;
        changed();
      }),
      toggle('Approximate', hooks.filters.approximate, statusMark('approximate'), () => {
        hooks.filters.approximate = !hooks.filters.approximate;
        changed();
      }),
      toggle('Traditional', hooks.filters.traditional, statusMark('traditional'), () => {
        hooks.filters.traditional = !hooks.filters.traditional;
        changed();
      }),
      toggle('Contested', hooks.filters.contested, statusMark('contested'), () => {
        hooks.filters.contested = !hooks.filters.contested;
        changed();
      }),
      toggle('Unsourced', hooks.filters.unsourced, statusMark('unsourced'), () => {
        hooks.filters.unsourced = !hooks.filters.unsourced;
        changed();
      }),
    );
    const lensButtons: [string, MapFilters['lens']][] = [
      ['Medieval Africa', 'africa-medieval'],
      ['Oceania', 'oceania'],
      ['Andes', 'andes'],
      ['Twentieth-century Asia', 'asia-20c'],
    ];
    lenses.replaceChildren(
      ...lensButtons.map(([label, id]) =>
        toggle(label, hooks.filters.lens === id, lensMark(id), () => {
          hooks.filters.lens = hooks.filters.lens === id ? 'all' : id;
          changed();
        }),
      ),
    );
  }

  function changed() {
    sync();
    hooks.onFilters();
  }

  function openTimeline(eraId: string) {
    const era = catalog.eras.find((item) => item.id === eraId) ?? catalog.eras[0];
    sheet.hidden = false;
    body.innerHTML = '';
    const rail = document.createElement('div');
    rail.className = 'icon-row era-rail';
    catalog.eras.forEach((item) => {
      rail.append(
        iconButton(item.title, eraGlyph(item.id), item.id === era.id, () => {
          hooks.openEra(item.start);
          openTimeline(item.id);
        }),
      );
    });
    body.append(rail);
    const entries = catalog.timeline
      .filter((entry) => entry.t >= era.start && entry.t <= era.end)
      .sort((a, b) => a.t - b.t);
    const list = document.createElement('div');
    list.className = 'entry-list';
    entries.forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'entry-button';
      button.innerHTML = `<span class="hit-detail">${escapeHtml(formatYear(entry.t))}</span><span class="hit-label">${escapeHtml(entry.label)}</span>`;
      button.addEventListener('click', () => {
        if (entry.kind === 'event' && entry.targetId) hooks.openEvent(entry.targetId);
        if (entry.kind === 'migration' && entry.targetId) {
          openMigration(entry.targetId);
          hooks.showRoute(entry.targetId);
        }
      });
      list.append(button);
    });
    body.append(list);
  }

  function openStories() {
    sheet.hidden = false;
    body.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'entry-list';
    catalog.people.forEach((person) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'entry-button';
      button.innerHTML = `<span class="hit-label">${escapeHtml(person.name)}</span><span class="hit-detail">${escapeHtml(formatYearRange(person.born, person.died))}</span>`;
      button.addEventListener('click', () => openPerson(person.id));
      list.append(button);
    });
    const readingHead = document.createElement('p');
    readingHead.className = 'sheet-kicker';
    readingHead.textContent = 'Further reading';
    list.append(readingHead);
    catalog.reading.forEach((item) => {
      const source = catalog.sources.get(item.sourceIds[0] ?? '');
      if (source?.url) {
        const link = document.createElement('a');
        link.className = 'entry-button';
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = item.label;
        list.append(link);
      }
      const dois = doiLinkList(item.sourceIds);
      if (dois.childElementCount) list.append(dois);
    });
    body.append(list);
  }

  function openPerson(id: string) {
    const person = catalog.people.find((item) => item.id === id);
    if (!person) return;
    sheet.hidden = false;
    body.innerHTML = '';
    body.append(storyHead(person.name, formatYearRange(person.born, person.died)));
    body.append(paragraph(person.summary));
    if (person.dateNote) body.append(note(person.dateNote));
    body.append(sourceLinks(person.sourceIds));
    body.append(eventLinks(person.eventIds));
  }

  function openRoutes() {
    sheet.hidden = false;
    body.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'entry-list';
    catalog.migrations.forEach((migration) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'entry-button';
      button.innerHTML = `<span class="hit-label">${escapeHtml(migration.title)}</span><span class="hit-detail">${escapeHtml(formatYearRange(migration.start, migration.end))}</span>`;
      button.addEventListener('click', () => {
        openMigration(migration.id);
        hooks.showRoute(migration.id);
      });
      list.append(button);
    });
    body.append(list);
  }

  function openMigration(id: string) {
    const migration = catalog.migrations.find((item) => item.id === id);
    if (!migration) return;
    sheet.hidden = false;
    body.innerHTML = '';
    body.append(storyHead(migration.title, formatYearRange(migration.start, migration.end)));
    body.append(paragraph(migration.summary));
    if (migration.debate) body.append(note(migration.debate));
    const stops = document.createElement('div');
    stops.className = 'entry-list';
    migration.waypoints.forEach((stop) => {
      const row = document.createElement('p');
      row.className = 'waypoint';
      row.textContent = waypointText(stop);
      stops.append(row);
    });
    migration.dropped.forEach((name) => {
      const row = document.createElement('p');
      row.className = 'waypoint is-dropped';
      row.textContent = name;
      stops.append(row);
    });
    body.append(stops);
    body.append(eventLinks(migration.eventIds));
    body.append(sourceLinks(migration.sourceIds));
  }

  function openStandIns() {
    sheet.hidden = false;
    body.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'entry-list';
    catalog.standIns.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'entry-button';
        button.innerHTML = `<span class="hit-label">${escapeHtml(item.label)}</span><span class="hit-detail">${escapeHtml(item.treatment)}</span><span class="hit-note">${escapeHtml(item.note)}</span>`;
      button.addEventListener('click', () => {
        if (item.eventId) hooks.openEvent(item.eventId);
        if (item.migrationId) {
          openMigration(item.migrationId);
          hooks.showRoute(item.migrationId);
        }
      });
      list.append(button);
    });
    body.append(list);
  }

  function storyHead(title: string, detail: string) {
    const head = document.createElement('div');
    head.className = 'story-head';
    head.innerHTML = `<h2 class="popup-title">${escapeHtml(title)}</h2><p class="popup-date">${escapeHtml(detail)}</p>`;
    return head;
  }

  function eventLinks(ids: string[]) {
    const list = document.createElement('div');
    list.className = 'entry-list';
    ids.forEach((id) => {
      const event = catalog.events.find((item) => item.id === id);
      if (!event) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'entry-button';
      button.textContent = event.title;
      button.addEventListener('click', () => hooks.openEvent(event.id));
      list.append(button);
    });
    return list;
  }

  function sourceLinks(ids: string[]) {
    const list = document.createElement('div');
    list.className = 'entry-list source-list';
    ids.forEach((id) => {
      const source = catalog.sources.get(id);
      if (!source) return;
      const href = doiHref(source);
      if (source.doi && href) {
        const row = document.createElement('div');
        row.className = 'entry-button';
        const title = document.createElement('span');
        title.className = 'hit-label';
        title.textContent = source.title;
        const link = document.createElement('a');
        link.className = 'doi-link';
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = source.doi;
        row.append(title, link);
        list.append(row);
        return;
      }
      if (!source.url) return;
      const link = document.createElement('a');
      link.className = 'entry-button';
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = source.title;
      list.append(link);
    });
    return list;
  }

  function doiLinkList(ids: string[]) {
    const list = document.createElement('div');
    list.className = 'source-list';
    ids.forEach((id) => {
      const source = catalog.sources.get(id);
      const href = source ? doiHref(source) : undefined;
      if (!source?.doi || !href) return;
      const link = document.createElement('a');
      link.className = 'doi-link';
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = source.doi;
      list.append(link);
    });
    return list;
  }

  return {
    closePopouts,
    closeSheet,
    sync,
    ask(event: HistoryEvent, open: (event: HistoryEvent) => void) {
      if (!event.sensitivity) {
        open(event);
        return;
      }
      gateEvent = event;
      onGate = open;
      gateText.textContent = event.sensitivity;
      gate.hidden = false;
    },
  };
}

function toggle(label: string, pressed: boolean, mark: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button era-option';
  button.dataset.tip = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  button.innerHTML = mark;
  button.addEventListener('click', onClick);
  return button;
}

function iconButton(label: string, mark: string, current: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button era-option';
  button.dataset.tip = label;
  button.setAttribute('aria-label', label);
  if (current) button.setAttribute('aria-current', 'true');
  button.innerHTML = mark;
  button.addEventListener('click', onClick);
  return button;
}

function swatch(kind: string): string {
  return `<span class="mark ${kind}"></span>`;
}

function statusMark(status: string): string {
  return `<span class="status-mark" data-status="${status}"></span>`;
}

function lensMark(id: string): string {
  const paths: Record<string, string> = {
    'africa-medieval': 'M5 16c2-6 5-8 7-8s5 2 7 8',
    oceania: 'M6 14c2-2 4-6 6-6s4 4 6 6',
    andes: 'M6 18l4-10 3 6 5-8',
    'asia-20c': 'M5 8h14M5 12h14M5 16h10',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[id] ?? ''}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

function eraGlyph(id: string): string {
  const letter = id.replace(/[^a-z]/gi, '').slice(0, 1).toUpperCase() || '•';
  return `<span class="era-glyph">${letter}</span>`;
}

function paragraph(text: string): HTMLParagraphElement {
  const node = document.createElement('p');
  node.className = 'popup-summary';
  node.textContent = text;
  return node;
}

function note(text: string): HTMLParagraphElement {
  const node = document.createElement('p');
  node.className = 'popup-note';
  node.textContent = text;
  return node;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
