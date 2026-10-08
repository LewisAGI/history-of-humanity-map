import type { Waypoint } from './types';

const EARTH_RADIUS = 1;

export function greatCircle(a: Waypoint, b: Waypoint, segments = 24): Waypoint[] {
  const start = toVector(a);
  const end = toVector(b);
  const omega = Math.acos(clamp(dot(start, end), -1, 1));
  if (omega < 1e-6) return [a, b];
  const points: Waypoint[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const sinOmega = Math.sin(omega);
    const scaleStart = Math.sin((1 - t) * omega) / sinOmega;
    const scaleEnd = Math.sin(t * omega) / sinOmega;
    points.push(
      fromVector({
        x: scaleStart * start.x + scaleEnd * end.x,
        y: scaleStart * start.y + scaleEnd * end.y,
        z: scaleStart * start.z + scaleEnd * end.z,
      }),
    );
  }
  return points;
}

/**
 * One continuous line. Longitudes are unwrapped (they may leave -180..180)
 * so a globe can draw across the antimeridian without a gap.
 */
export function pathCoordinates(path: Waypoint[], segments = 24): [number, number][][] {
  const coords: [number, number][] = [];
  let offset = 0;
  let previous: number | null = null;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = greatCircle(path[i], path[i + 1], segments);
    segment.forEach((point, index) => {
      if (i > 0 && index === 0) return;
      let lng = point.lng + offset;
      if (previous !== null) {
        while (lng - previous > 180) lng -= 360;
        while (lng - previous < -180) lng += 360;
        offset += lng - (point.lng + offset);
      }
      coords.push([lng, point.lat]);
      previous = lng;
    });
  }
  return coords.length >= 2 ? [coords] : [];
}

/** Bearing at the arrival end of the drawn curve, clockwise from north. */
export function arrivalBearing(path: Waypoint[]): number {
  const line = pathCoordinates(path)[0];
  if (!line || line.length < 2) return 0;
  const before = line[line.length - 2];
  const end = line[line.length - 1];
  return bearing({ lng: before[0], lat: before[1] }, { lng: end[0], lat: end[1] });
}

/** Initial bearing in degrees, clockwise from north, for an arrowhead. */
export function bearing(a: Waypoint, b: Waypoint): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function splitAntimeridian(coords: [number, number][]): [number, number][][] {
  if (coords.length === 0) return [];
  const parts: [number, number][][] = [[]];
  coords.forEach((coord, index) => {
    if (index > 0 && Math.abs(coord[0] - coords[index - 1][0]) > 180) {
      parts.push([]);
    }
    parts[parts.length - 1].push(coord);
  });
  return parts.filter((part) => part.length >= 2);
}

interface Vector {
  x: number;
  y: number;
  z: number;
}

function toVector(point: Waypoint): Vector {
  const λ = toRad(point.lng);
  const φ = toRad(point.lat);
  return {
    x: EARTH_RADIUS * Math.cos(φ) * Math.cos(λ),
    y: EARTH_RADIUS * Math.cos(φ) * Math.sin(λ),
    z: EARTH_RADIUS * Math.sin(φ),
  };
}

function fromVector(vector: Vector): Waypoint {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    lat: toDeg(Math.asin(vector.z / length)),
    lng: toDeg(Math.atan2(vector.y, vector.x)),
  };
}

function dot(a: Vector, b: Vector): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}
