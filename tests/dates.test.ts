import { describe, expect, it } from 'vitest';
import { dateIsApproximate, formatEventDate, formatYearRange, parseDateInput, roundDisplayYear, sentenceCount } from '../src/dates';
import { resolvePeriod } from '../src/timeline';
import type { HistoryEvent } from '../src/types';
import eventsJson from '../data/events.json';

const events = eventsJson as HistoryEvent[];

const PRESENT = 2026;

describe('parseDateInput', () => {
  it('accepts the brief examples', () => {
    expect(parseDateInput('1066')).toBe(1066);
    expect(parseDateInput('1066 AD')).toBe(1066);
    expect(parseDateInput('1066AD')).toBe(1066);
    expect(parseDateInput('1066 CE')).toBe(1066);
    expect(parseDateInput('500 BC')).toBe(-500);
    expect(parseDateInput('500 BCE')).toBe(-500);
    expect(parseDateInput('-500')).toBe(-500);
    expect(parseDateInput('120000 BCE')).toBe(-120000);
    expect(parseDateInput('120,000 BCE')).toBe(-120000);
  });

  it('ignores case and extra space', () => {
    expect(parseDateInput('  500   bce  ')).toBe(-500);
    expect(parseDateInput('1066 ad')).toBe(1066);
  });

  it('rejects empty, zero, and unknown text', () => {
    expect(parseDateInput('')).toBeNull();
    expect(parseDateInput('0')).toBeNull();
    expect(parseDateInput('0 CE')).toBeNull();
    expect(parseDateInput('yesterday')).toBeNull();
    expect(parseDateInput('1066 BCE AD')).toBeNull();
  });
});

describe('formatYearRange', () => {
  it('formats the off-boundary example as the containing period', () => {
    const period = resolvePeriod(parseDateInput('1066')!, PRESENT);
    expect(formatYearRange(period.start, period.end)).toBe('1050–1099 CE');
  });

  it('formats deep BCE ranges with grouping', () => {
    const period = resolvePeriod(parseDateInput('120000 BCE')!, PRESENT);
    expect(formatYearRange(period.start, period.end)).toBe('120,000–115,001 BCE');
  });

  it('prefixes approx. only when the note says the date is approximate', () => {
    expect(dateIsApproximate('Approximate. Fossils are widely dated to about 300,000 years ago.')).toBe(true);
    expect(dateIsApproximate('Traditional date.')).toBe(false);
    expect(formatEventDate(-300000, -300000, 'Approximate. Widely dated.')).toBe('approx. 300,000 BCE');
    expect(formatEventDate(-753, -753, 'Traditional date.')).toBe('753 BCE');
    expect(formatEventDate(1066, 1066, 'The battle was in 1066.')).toBe('1066 CE');
  });

  it('rounds deep-time display without changing the stored precision of later years', () => {
    expect(formatEventDate(-298050, -298050, 'Approximate. Fossils.')).toBe('approx. 300,000 BCE');
    expect(formatEventDate(-43550, -43550, 'Approximate. Occupation.')).toBe('approx. 43,500 BCE');
    expect(formatEventDate(-298050, -297000, 'Approximate. A span.')).toBe('approx. 300,000 BCE');
    expect(formatEventDate(-43550, -43000, 'Dated from the layer.')).toBe('43,500–43,000 BCE');
  });

  it('keeps every displayed year inside the step that contains the stored year', () => {
    events.forEach((event) => {
      for (const stored of [event.start, event.end]) {
        const shown = roundDisplayYear(stored);
        const period = resolvePeriod(stored, PRESENT);
        expect(shown, `${event.id} ${stored}`).toBeGreaterThanOrEqual(period.start);
        expect(shown, `${event.id} ${stored}`).toBeLessThanOrEqual(period.end);
        expect(shown, event.id).not.toBe(0);
      }
    });
  });
});

describe('sentenceCount', () => {
  it('counts sentences', () => {
    expect(sentenceCount('One. Two.')).toBe(2);
    expect(sentenceCount('One. Two! Three?')).toBe(3);
  });
});
