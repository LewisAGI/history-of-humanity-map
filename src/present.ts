import { catalog, pinLinkHref } from './catalog';
import { formatEventDate } from './dates';
import { externalRel } from './links';
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
