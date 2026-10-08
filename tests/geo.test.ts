import { describe, expect, it } from 'vitest';
import { bearing, greatCircle, pathCoordinates, splitAntimeridian } from '../src/geo';

describe('greatCircle', () => {
  it('starts and ends on the waypoints', () => {
    const points = greatCircle({ lat: 6, lng: 36 }, { lat: 31, lng: 35 }, 8);
    expect(points[0].lat).toBeCloseTo(6, 5);
    expect(points[0].lng).toBeCloseTo(36, 5);
    expect(points[points.length - 1].lat).toBeCloseTo(31, 5);
    expect(points[points.length - 1].lng).toBeCloseTo(35, 5);
    expect(points.length).toBe(9);
  });

  it('splits a path that crosses the antimeridian', () => {
    const parts = pathCoordinates(
      [
        { lat: 66, lng: 170 },
        { lat: 65, lng: -168 },
        { lat: 64, lng: -155 },
      ],
      4,
    );
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((part) => {
      for (let i = 1; i < part.length; i += 1) {
        expect(Math.abs(part[i][0] - part[i - 1][0])).toBeLessThanOrEqual(180);
      }
    });
  });

  it('keeps a short path in one piece', () => {
    const parts = splitAntimeridian([
      [10, 20],
      [12, 22],
      [14, 24],
    ]);
    expect(parts).toHaveLength(1);
  });
});

describe('bearing', () => {
  it('points north when the destination is due north', () => {
    expect(bearing({ lat: 0, lng: 10 }, { lat: 10, lng: 10 })).toBeCloseTo(0, 5);
  });

  it('points east when the destination is due east', () => {
    expect(bearing({ lat: 0, lng: 10 }, { lat: 0, lng: 20 })).toBeCloseTo(90, 5);
  });
});
