import { describe, expect, it } from 'vitest';
import { LABEL_MIN_ZOOM, visibleLabelIds, type LabelBox } from '../src/labels';

function box(id: string, left: number, top: number, size = 40): LabelBox {
  return { id, left, top, right: left + size, bottom: top + 16 };
}

describe('visibleLabelIds', () => {
  it('hides a label that overlaps an earlier one', () => {
    const visible = visibleLabelIds([box('a', 0, 0), box('b', 10, 0), box('c', 200, 0)]);
    expect([...visible]).toEqual(['a', 'c']);
  });

  it('keeps labels that only sit near each other', () => {
    const visible = visibleLabelIds([box('a', 0, 0, 20), box('b', 40, 0, 20)], 6);
    expect(visible.has('a')).toBe(true);
    expect(visible.has('b')).toBe(true);
  });
});

describe('LABEL_MIN_ZOOM', () => {
  it('is well above the default globe zoom', () => {
    expect(LABEL_MIN_ZOOM).toBeGreaterThan(2);
  });
});
