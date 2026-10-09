import type { Waypoint } from './types';

/** One drawn line, or several lines that leave the same journey (a branching route). */
export type RoutePath = Waypoint[] | Waypoint[][];

/** Each branch that has at least two points. A single line is one branch. */
export function routeLines(path: RoutePath | undefined): Waypoint[][] {
  if (!path || path.length === 0) return [];
  const branches = isBranchList(path) ? path : [path];
  return branches.filter((line) => line.length >= 2);
}

function isBranchList(path: RoutePath): path is Waypoint[][] {
  return Array.isArray(path[0]);
}

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
 * One continuous line. Longitudes are unwrapped (they may leave -180..180).
 * Used for bearings and framing. The globe wraps each vertex, so drawing uses
 * pathCoordinates, which splits this line on the antimeridian.
 */
export function unwrappedPath(path: Waypoint[], segments = 24): [number, number][] {
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
  return coords;
}

/**
 * Lines the globe can draw. A path that crosses the antimeridian is cut there,
 * and both pieces end on the meridian so they meet instead of leaving a gap.
 */
export function pathCoordinates(path: Waypoint[], segments = 24): [number, number][][] {
  const line = unwrappedPath(path, segments);
  if (line.length < 2) return [];
  const parts: [number, number][][] = [[]];
  const push = (lng: number, lat: number) => {
    const part = parts[parts.length - 1];
    const last = part[part.length - 1];
    if (last && last[0] === lng && last[1] === lat) return;
    part.push([lng, lat]);
  };
  push(wrapLongitude(line[0][0]), line[0][1]);
  for (let i = 1; i < line.length; i += 1) {
    const prev = line[i - 1];
    const curr = line[i];
    const prevLng = wrapLongitude(prev[0]);
    const currLng = wrapLongitude(curr[0]);
    if (Math.abs(currLng - prevLng) > 180) {
      const edge = antimeridianBetween(prev[0], curr[0]);
      const span = curr[0] - prev[0];
      const t = span === 0 ? 0 : (edge - prev[0]) / span;
      const lat = prev[1] + t * (curr[1] - prev[1]);
      const leaving = curr[0] > prev[0] ? 180 : -180;
      push(leaving, lat);
      parts.push([]);
      push(-leaving, lat);
    }
    push(currLng, curr[1]);
  }
  return parts.filter((part) => part.length >= 2);
}

/** Bearing at the arrival end of the drawn curve, clockwise from north. */
export function arrivalBearing(path: Waypoint[]): number {
  const line = unwrappedPath(path);
  if (line.length < 2) return 0;
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

function wrapLongitude(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** Antimeridian (±180 + 360k) strictly between two unwrapped longitudes. */
function antimeridianBetween(from: number, to: number): number {
  if (to > from) {
    let edge = 180 + 360 * Math.floor((from - 180) / 360);
    if (edge <= from) edge += 360;
    return edge;
  }
  let edge = 180 + 360 * Math.ceil((from - 180) / 360);
  if (edge >= from) edge -= 360;
  return edge;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}
