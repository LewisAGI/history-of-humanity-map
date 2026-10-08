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

/** Prefixes "approx." when the dating note says the year is approximate. */
export function formatEventDate(start: number, end: number, dateNote: string): string {
  const range = formatYearRange(start, end);
  return dateIsApproximate(dateNote) ? `approx. ${range}` : range;
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
