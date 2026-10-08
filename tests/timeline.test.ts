import { describe, expect, it } from 'vitest';
import { formatYearRange, parseDateInput } from '../src/dates';
import {
  AFTER_STEP,
  BEFORE_STEP,
  ERA_BOUNDARY,
  TIMELINE_START,
  allPeriods,
  eventOverlapsPeriod,
  periodByIndex,
  periodsForEra,
  resolvePeriod,
  shiftPeriod,
} from '../src/timeline';

const PRESENT = 2026;

describe('period resolution', () => {
  it('shows 1066 inside 1050–1099', () => {
    for (const input of ['1066', '1066 AD', '1066 CE']) {
      const year = parseDateInput(input)!;
      const period = resolvePeriod(year, PRESENT);
      expect(period.era).toBe('after');
      expect(period.start).toBe(1050);
      expect(period.end).toBe(1099);
      expect(formatYearRange(period.start, period.end)).toBe('1050–1099 CE');
    }
  });

  it('resolves 500 BC, 500 BCE, and -500 to the same period', () => {
    const periods = ['500 BC', '500 BCE', '-500'].map((input) =>
      resolvePeriod(parseDateInput(input)!, PRESENT),
    );
    expect(periods.every((period) => period.start === -500 && period.end === -451)).toBe(true);
    expect(formatYearRange(periods[0].start, periods[0].end)).toBe('500–451 BCE');
  });

  it('resolves 120000 BCE inside the before-civilisation era', () => {
    const period = resolvePeriod(parseDateInput('120000 BCE')!, PRESENT);
    expect(period.era).toBe('before');
    expect(period.start).toBe(-120000);
    expect(period.end).toBe(-115001);
  });

  it('puts the era boundary at 3000 BCE', () => {
    const before = resolvePeriod(-3001, PRESENT);
    const after = resolvePeriod(ERA_BOUNDARY, PRESENT);
    expect(before.era).toBe('before');
    expect(before.end).toBe(ERA_BOUNDARY - 1);
    expect(after.era).toBe('after');
    expect(after.start).toBe(ERA_BOUNDARY);
    expect(after.end - after.start + 1).toBe(AFTER_STEP);
  });

  it('starts at 300,000 BCE', () => {
    const period = resolvePeriod(TIMELINE_START, PRESENT);
    expect(period.era).toBe('before');
    expect(period.start).toBe(TIMELINE_START);
    expect(period.end).toBe(TIMELINE_START + BEFORE_STEP - 1);
    expect(period.index).toBe(0);
    expect(periodsForEra('before', PRESENT)[0]).toEqual(period);
  });

  it('ends at the present year', () => {
    const period = resolvePeriod(PRESENT, PRESENT);
    expect(period.era).toBe('after');
    expect(period.end).toBe(PRESENT);
    expect(period.start).toBe(2000);
    const after = periodsForEra('after', PRESENT);
    expect(after[after.length - 1].end).toBe(PRESENT);
    expect(resolvePeriod(PRESENT + 40, PRESENT).end).toBe(PRESENT);
  });

  it('covers every year from the start to the present without gaps', () => {
    const periods = allPeriods(PRESENT);
    expect(periods[0].start).toBe(TIMELINE_START);
    expect(periods[periods.length - 1].end).toBe(PRESENT);
    for (let i = 1; i < periods.length; i += 1) {
      const previous = periods[i - 1];
      const current = periods[i];
      expect(current.index).toBe(i < periodsForEra('before', PRESENT).length ? i : i - periodsForEra('before', PRESENT).length);
      if (previous.end === -1) expect(current.start).toBe(1);
      else expect(current.start).toBe(previous.end + 1);
    }
  });

  it('uses 5,000-year steps before civilisation and 50-year steps after', () => {
    const before = periodsForEra('before', PRESENT);
    expect(before[1].start - before[0].start).toBe(BEFORE_STEP);
    expect(before[before.length - 1].end).toBe(-3001);
    expect(before[before.length - 1].start).toBe(-5000);
    const after = periodsForEra('after', PRESENT);
    const highMedieval = after.find((period) => period.start === 1050);
    const next = after.find((period) => period.start === 1100);
    expect(highMedieval?.end).toBe(1099);
    expect(next && highMedieval && next.start - highMedieval.start).toBe(AFTER_STEP);
    const bceCe = after.find((period) => period.start === -50);
    const firstCe = after.find((period) => period.start === 1);
    expect(bceCe).toMatchObject({ start: -50, end: -1 });
    expect(firstCe).toMatchObject({ start: 1, end: 49 });
  });

  it('scales the slider by period so both eras use the full range', () => {
    const before = periodsForEra('before', PRESENT);
    const after = periodsForEra('after', PRESENT);
    expect(before.length).toBeGreaterThan(20);
    expect(after.length).toBeGreaterThan(20);
    expect(periodByIndex('before', 0, PRESENT).start).toBe(TIMELINE_START);
    expect(periodByIndex('before', before.length - 1, PRESENT).end).toBe(-3001);
    expect(periodByIndex('after', 0, PRESENT).start).toBe(ERA_BOUNDARY);
    expect(periodByIndex('after', after.length - 1, PRESENT).end).toBe(PRESENT);
    expect(periodByIndex('after', after.length + 10, PRESENT).end).toBe(PRESENT);
  });
});

describe('period overlap rule', () => {
  const period = resolvePeriod(1066, PRESENT);

  it('includes an event that only touches the period', () => {
    expect(eventOverlapsPeriod({ start: 1066, end: 1066 }, period)).toBe(true);
    expect(eventOverlapsPeriod({ start: 1000, end: 1050 }, period)).toBe(true);
    expect(eventOverlapsPeriod({ start: 1099, end: 1200 }, period)).toBe(true);
  });

  it('excludes an event that ends before or starts after the period', () => {
    expect(eventOverlapsPeriod({ start: 900, end: 1049 }, period)).toBe(false);
    expect(eventOverlapsPeriod({ start: 1100, end: 1140 }, period)).toBe(false);
  });

  it('shows an event that spans a period in that period, including across 3000 BCE', () => {
    const spanning = { start: -3400, end: -3000 };
    const lastBefore = resolvePeriod(-3001, PRESENT);
    const firstAfter = resolvePeriod(-3000, PRESENT);
    expect(eventOverlapsPeriod(spanning, lastBefore)).toBe(true);
    expect(eventOverlapsPeriod(spanning, firstAfter)).toBe(true);
    expect(eventOverlapsPeriod(spanning, resolvePeriod(-6000, PRESENT))).toBe(false);
  });
});

describe('shiftPeriod', () => {
  it('crosses the era boundary one step at a time', () => {
    const lastBefore = resolvePeriod(-3001, PRESENT);
    const next = shiftPeriod(lastBefore, 1, PRESENT);
    expect(next).toMatchObject({ era: 'after', start: ERA_BOUNDARY });
    expect(shiftPeriod(next, -1, PRESENT)).toEqual(lastBefore);
  });

  it('does not move past the start or the present', () => {
    const first = resolvePeriod(TIMELINE_START, PRESENT);
    const last = resolvePeriod(PRESENT, PRESENT);
    expect(shiftPeriod(first, -1, PRESENT)).toEqual(first);
    expect(shiftPeriod(last, 1, PRESENT)).toEqual(last);
  });
});
