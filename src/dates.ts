/**
 * Historical signed years: -500 is 500 BCE, 1066 is 1066 CE. There is no year 0.
 */

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
 * 100,000 years and older round to the nearest 10,000. 10,000 and older round to the nearest 500.
 */
export function formatEventDate(start: number, end: number, dateNote: string): string {
  const shownStart = roundDisplayYear(start);
  const shownEnd = roundDisplayYear(end);
  const range = shownStart === shownEnd ? formatYear(shownStart) : formatYearRange(shownStart, shownEnd);
  return dateIsApproximate(dateNote) ? `approx. ${range}` : range;
}

function roundDisplayYear(year: number): number {
  const negative = year < 0;
  const magnitude = Math.abs(year);
  let rounded = magnitude;
  if (magnitude >= 100_000) rounded = Math.round(magnitude / 10_000) * 10_000;
  else if (magnitude >= 10_000) rounded = Math.round(magnitude / 500) * 500;
  if (rounded === 0) return negative ? -1 : 1;
  return negative ? -rounded : rounded;
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
