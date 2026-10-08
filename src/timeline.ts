import type { Era, Period } from './types';

/** First year on the map: 300,000 BCE. */
export const TIMELINE_START = -300_000;

/**
 * 3000 BCE. This year is the first year of the after-civilisation era.
 * 3001 BCE is the last year of the before-civilisation era.
 */
export const ERA_BOUNDARY = -3000;

export const BEFORE_STEP = 5000;
export const AFTER_STEP = 50;

export function presentYear(now: Date = new Date()): number {
  return now.getFullYear();
}

/**
 * Period-overlap rule:
 * An event is shown in a selected period when the two closed year intervals overlap:
 *   event.start <= period.end && event.end >= period.start
 * Touching at an endpoint counts. An event that runs across a boundary is shown
 * in every period it touches, including across the 3000 BCE era boundary.
 * A point event (start === end) appears in the one period that contains that year.
 */
export function eventOverlapsPeriod(
  event: { start: number; end: number },
  period: { start: number; end: number },
): boolean {
  return event.start <= period.end && event.end >= period.start;
}

/**
 * Before civilisation runs from 300,000 BCE through 3001 BCE in 5,000-year steps
 * aligned to 300,000 BCE. The last step is shorter so the era ends at 3001 BCE.
 * After civilisation runs from 3000 BCE through the present in 50-year steps.
 * From 1050 CE onward those steps are 1050–1099, 1100–1149, and so on.
 * Years 50–1 BCE are one step and years 1–49 CE are the next, because there is no year 0.
 * The final step ends at the present year rather than running into the future.
 */
export function periodsForEra(era: Era, present = presentYear()): Period[] {
  if (era === 'before') return beforePeriods();
  return afterPeriods(present);
}

export function allPeriods(present = presentYear()): Period[] {
  return [...beforePeriods(), ...afterPeriods(present)];
}

export function resolvePeriod(year: number, present = presentYear()): Period {
  const clamped = clampYear(year, present);
  const periods = allPeriods(present);
  return (
    periods.find((period) => clamped >= period.start && clamped <= period.end) ??
    periods[periods.length - 1]
  );
}

export function shiftPeriod(period: Period, delta: number, present = presentYear()): Period {
  const periods = allPeriods(present);
  const index = periods.findIndex((item) => item.era === period.era && item.start === period.start);
  if (index < 0) return period;
  const next = Math.min(periods.length - 1, Math.max(0, index + delta));
  return periods[next];
}

export function periodByIndex(era: Era, index: number, present = presentYear()): Period {
  const periods = periodsForEra(era, present);
  const clamped = Math.min(periods.length - 1, Math.max(0, index));
  return periods[clamped];
}

function beforePeriods(): Period[] {
  const periods: Period[] = [];
  let start = TIMELINE_START;
  let index = 0;
  while (start < ERA_BOUNDARY) {
    const end = Math.min(start + BEFORE_STEP - 1, ERA_BOUNDARY - 1);
    periods.push({ era: 'before', start, end, index });
    start += BEFORE_STEP;
    index += 1;
  }
  return periods;
}

function afterPeriods(present: number): Period[] {
  const periods: Period[] = [];
  let cursor = ERA_BOUNDARY;
  let index = 0;
  while (cursor <= present) {
    const period = afterPeriodContaining(cursor, present);
    periods.push({ ...period, index });
    const next = period.end === -1 ? 1 : period.end + 1;
    if (next <= cursor) break;
    cursor = next;
    index += 1;
  }
  return periods;
}

function afterPeriodContaining(year: number, present: number): Period {
  if (year < 0) {
    const start = Math.max(ERA_BOUNDARY, Math.floor(year / AFTER_STEP) * AFTER_STEP);
    const end = Math.min(start + AFTER_STEP - 1, -1, present);
    return { era: 'after', start, end, index: 0 };
  }
  const grid = Math.floor(year / AFTER_STEP) * AFTER_STEP;
  const start = grid === 0 ? 1 : grid;
  let end = start === 1 ? 49 : start + AFTER_STEP - 1;
  if (end > present) end = present;
  return { era: 'after', start, end, index: 0 };
}

function clampYear(year: number, present: number): number {
  if (year > present) return present;
  if (year < TIMELINE_START) return TIMELINE_START;
  if (year === 0) return 1;
  return year;
}
