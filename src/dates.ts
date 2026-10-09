/**
 * Historical signed years: -500 is 500 BCE, 1066 is 1066 CE. There is no year 0.
 */

import { resolvePeriod } from './timeline';

export function parseDateInput(raw: string): number | null {
  const text = raw.trim().replace(/,/g, '').replace(/\s+/g, ' ');
  if (!text) return null;

  const numeric = text.match(/^(-?\d+)$/);
  if (numeric) {
    const year = Number(numeric[1]);
    if (!Number.isInteger(year) || year === 0) return null;
    return year;
  }

  const named = text.match(/^(-?\d+)\s*(BCE|BC|CE|AD)$/i);
  if (!named) return null;
  const magnitude = Math.abs(Number(named[1]));
  if (!Number.isInteger(magnitude) || magnitude === 0) return null;
  const era = named[2].toUpperCase();
  if (era === 'BCE' || era === 'BC') return -magnitude;
  return magnitude;
}

export function formatYear(year: number): string {
  const body = formatMagnitude(Math.abs(year));
  return year < 0 ? `${body} BCE` : `${body} CE`;
}

export function formatYearRange(start: number, end: number): string {
  if (start === end) return formatYear(start);
  if (start < 0 && end < 0) {
    return `${formatMagnitude(-start)}–${formatMagnitude(-end)} BCE`;
  }
  if (start > 0 && end > 0) {
    return `${formatMagnitude(start)}–${formatMagnitude(end)} CE`;
  }
  return `${formatYear(start)} – ${formatYear(end)}`;
}

/**
 * Prefixes "approx." when the dating note says the year is approximate.
 * Deep-time years are rounded for display only. Filtering still uses the stored year.
 * From 10,000 years onward the card shows the nearest 500 years, which is also
 * the nearest 1,000. It never rounds by 5,000 or 10,000.
 */
export function formatEventDate(start: number, end: number, dateNote: string): string {
  const shownStart = roundDisplayYear(start);
  const shownEnd = roundDisplayYear(end);
  const range = shownStart === shownEnd ? formatYear(shownStart) : formatYearRange(shownStart, shownEnd);
  return dateIsApproximate(dateNote) ? `approx. ${range}` : range;
}

/**
 * Rounded year used on the card. Years under 10,000 stay exact.
 * From 10,000 years the card uses the nearest 500, then stays inside the
 * timeline step that contains the stored year. 15,000 BCE is the first year
 * of the next step after Lascaux's 20,000–15,001 BCE step, so Lascaux shows
 * 15,500 BCE.
 */
export function roundDisplayYear(year: number): number {
  if (year === 0) return 1;
  const magnitude = Math.abs(year);
  if (magnitude < 10_000) return year;
  const negative = year < 0;
  let rounded = Math.round(magnitude / 500) * 500;
  if (rounded === 0) rounded = 500;
  let shown = negative ? -rounded : rounded;
  const period = resolvePeriod(year);
  if (shown < period.start || shown > period.end) shown = nearestGridInPeriod(year, period);
  return shown === 0 ? (year < 0 ? -500 : 500) : shown;
}

function nearestGridInPeriod(stored: number, period: { start: number; end: number }): number {
  const first = Math.ceil(period.start / 500) * 500;
  let best = period.start;
  let bestDist = Infinity;
  for (let candidate = first; candidate <= period.end; candidate += 500) {
    if (candidate === 0) continue;
    const dist = Math.abs(candidate - stored);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return bestDist === Infinity ? (stored < 0 ? period.start : period.end) : best;
}

export function dateIsApproximate(dateNote: string): boolean {
  return /\bapproximate\b/i.test(dateNote);
}

function formatMagnitude(value: number): string {
  if (value >= 10000) return value.toLocaleString('en-GB');
  return String(value);
}

export function sentenceCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/(?<=[.!?])\s+/).filter((part) => part.length > 0).length;
}
