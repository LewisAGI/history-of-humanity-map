import { catalog, doiHref } from './catalog';
import { formatEventDate } from './dates';
import type { HistoryEvent } from './types';

const EXTERNAL_REL = 'noopener noreferrer';

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

export function popupHtml(event: HistoryEvent): string {
  const stand = event.standIn ? `<p class="popup-standin">${escapeHtml(event.standIn)}</p>` : '';
  return `
    <h2 class="popup-title">${escapeHtml(event.title)}${reviewMark(event)}</h2>
    <p class="popup-date" data-status="${escapeHtml(event.dateStatus ?? '')}">${escapeHtml(formatEventDate(event.start, event.end, event.dateNote))}</p>
    <p class="popup-place">${escapeHtml(event.place)}</p>
    ${doiLinks(event)}
    <p class="popup-summary">${escapeHtml(event.summary)}</p>
    <p class="popup-note">${escapeHtml(event.dateNote)}</p>
    ${stand}
  `;
}

function reviewMark(event: HistoryEvent): string {
  if (event.matchConfidence !== 'medium') return '';
  return `<span class="review-mark" role="img" data-tip="Matched by review" aria-label="Matched by review"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
}

function doiLinks(event: HistoryEvent): string {
  const links = (event.sourceIds ?? []).flatMap((id) => {
    const source = catalog.sources.get(id);
    const href = source ? doiHref(source) : undefined;
    if (!source?.doi || !href) return [];
    return `<a class="doi-link" href="${escapeHtml(href)}" target="_blank" rel="${EXTERNAL_REL}">${escapeHtml(source.doi)}</a>`;
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
