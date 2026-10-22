import { catalog, pinLinkHref } from './catalog';
import { formatEventDate, formatYear } from './dates';
import { externalRel, isUluruPin } from './links';
import type { HistoryEvent } from './types';

export function markPin(
  element: { dataset: { standIn?: string; status?: string } },
  event: { standIn?: string; dateStatus?: string },
) {
  if (event.standIn) element.dataset.standIn = 'true';
  if (event.dateStatus) element.dataset.status = event.dateStatus;
}

export function waypointText(stop: { name: string; standIn?: string }): string {
  return stop.standIn ? `${stop.name} · ${stop.standIn}` : stop.name;
}

/** Uluru's 1900 is a pack placeholder, not a date to show. Other 1900 dates stay. */
export function shownEventDate(event: HistoryEvent): string {
  if (isUluruPin(event)) return '';
  return formatEventDate(event.start, event.end, event.dateNote);
}

export function shownTimelineYear(ref: string, year: number): string {
  if (ref === 'uluru-link') return '';
  return formatYear(year);
}

export function popupHtml(event: HistoryEvent): string {
  const stand = event.standIn ? `<p class="popup-standin">${escapeHtml(event.standIn)}</p>` : '';
  const when = shownEventDate(event);
  const date = when
    ? `<p class="popup-date" data-status="${escapeHtml(event.dateStatus ?? '')}">${escapeHtml(when)}</p>`
    : '';
  return `
    <h2 class="popup-title">${escapeHtml(event.title)}${reviewMark(event)}</h2>
    ${date}
    <p class="popup-place">${escapeHtml(event.place)}</p>
    ${doiLinks(event)}
    <p class="popup-summary">${escapeHtml(event.summary)}</p>
    <p class="popup-note">${escapeHtml(event.dateNote)}</p>
    ${stand}
  `;
}

function reviewMark(event: HistoryEvent): string {
  if (event.matchConfidence !== 'medium') return '';
  return `<button type="button" class="review-mark" data-tip="Matched by review" aria-label="Matched by review"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16l-5-3-5 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button>`;
}

function doiLinks(event: HistoryEvent): string {
  const links = (event.sourceIds ?? []).flatMap((id) => {
    const source = catalog.sources.get(id);
    const href = source ? pinLinkHref(event, source) : undefined;
    if (!source || !href) return [];
    const label = source.doi && href.startsWith('https://doi.org/') ? source.doi : source.title;
    return `<a class="doi-link" href="${escapeHtml(href)}" target="_blank" rel="${externalRel()}">${escapeHtml(label)}</a>`;
  });
  if (!links.length) return '';
  return `<div class="source-list">${links.join('')}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
