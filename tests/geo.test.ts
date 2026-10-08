import { describe, expect, it } from 'vitest';
import { arrivalBearing, bearing, greatCircle, pathCoordinates, splitAntimeridian } from '../src/geo';

describe('greatCircle', () => {
  it('starts and ends on the waypoints', () => {
    const points = greatCircle({ lat: 6, lng: 36 }, { lat: 31, lng: 35 }, 8);
    expect(points[0].lat).toBeCloseTo(6, 5);
    expect(points[0].lng).toBeCloseTo(36, 5);
    expect(points[points.length - 1].lat).toBeCloseTo(31, 5);
    expect(points[points.length - 1].lng).toBeCloseTo(35, 5);
    expect(points.length).toBe(9);
  });

  it('meets itself on the antimeridian', () => {
    const parts = pathCoordinates(
      [
        { lat: 66, lng: 170 },
        { lat: 65, lng: -168 },
        { lat: 64, lng: -155 },
      ],
      8,
    );
    expect(parts.length).toBeGreaterThan(1);
    const ends = parts.slice(0, -1).map((part) => part[part.length - 1]);
    const starts = parts.slice(1).map((part) => part[0]);
    ends.forEach((end, index) => {
      expect(Math.abs(Math.abs(end[0]) - 180)).toBeLessThan(1e-6);
      expect(Math.abs(Math.abs(starts[index][0]) - 180)).toBeLessThan(1e-6);
      expect(end[0]).toBe(-starts[index][0]);
      expect(end[1]).toBeCloseTo(starts[index][1], 5);
    });
    parts.forEach((part) => {
      for (let i = 1; i < part.length; i += 1) {
        expect(Math.abs(part[i][0] - part[i - 1][0])).toBeLessThanOrEqual(180);
      }
    });
  });

  it('aims the arrowhead along the end of a long curve', () => {
    const path = [
      { lat: 37.2, lng: -6.9 },
      { lat: 24.5, lng: -76.0 },
    ];
    const initial = bearing(path[0], path[1]);
    const arrival = arrivalBearing(path);
    const final = (bearing(path[1], path[0]) + 180) % 360;
    const gap = Math.min(Math.abs(arrival - initial), 360 - Math.abs(arrival - initial));
    expect(gap).toBeGreaterThan(5);
    const error = Math.min(Math.abs(arrival - final), 360 - Math.abs(arrival - final));
    expect(error).toBeLessThan(2);
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
