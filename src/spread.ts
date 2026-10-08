import type { Waypoint } from './types';

/** Pins closer than this, in the same period, cannot be told apart on screen. */
export const COLOCATION_KM = 20;

/**
 * Centre-to-centre gap, in screen pixels, after a co-located group is opened
 * into a ring. The stored coordinates are not moved.
 */
export const SPREAD_SEPARATION_PX = 36;

export interface ScreenPosition extends Waypoint {
  offsetX: number;
  offsetY: number;
}

export function isValidLngLat(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function distanceKm(a: Waypoint, b: Waypoint): number {
  const earth = 6371;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const dφ = toRad(b.lat - a.lat);
  const dλ = toRad(b.lng - a.lng);
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Co-located pins keep their true coordinates and are drawn on a pixel ring
 * around that point so each can be clicked at every zoom. The ring is
 * deterministic (sorted by id).
 */
export function displayPositions<T extends Waypoint & { id: string }>(events: T[]): Map<string, ScreenPosition> {
  const parent = events.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  const unite = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      if (distanceKm(events[i], events[j]) <= COLOCATION_KM) unite(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  events.forEach((_, index) => {
    const root = find(index);
    const list = groups.get(root) ?? [];
    list.push(index);
    groups.set(root, list);
  });

  const positions = new Map<string, ScreenPosition>();
  groups.forEach((indexes) => {
    const members = indexes
      .map((index) => events[index])
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (members.length === 1) {
      const only = members[0];
      positions.set(only.id, { ...clamped(only), offsetX: 0, offsetY: 0 });
      return;
    }
    const radius = SPREAD_SEPARATION_PX / (2 * Math.sin(Math.PI / members.length));
    members.forEach((event, order) => {
      const angle = (2 * Math.PI * order) / members.length;
      positions.set(event.id, {
        ...clamped(event),
        offsetX: radius * Math.cos(angle),
        offsetY: radius * Math.sin(angle),
      });
    });
  });
  return positions;
}

/** Valid pins keep a placement. Invalid coordinates are skipped, not drawn. */
export function placementsFor<T extends Waypoint & { id: string }>(
  events: T[],
): { kept: (T & ScreenPosition)[]; skipped: T[] } {
  const keptEvents = events.filter((event) => isValidLngLat(event.lat, event.lng));
  const skipped = events.filter((event) => !isValidLngLat(event.lat, event.lng));
  const positions = displayPositions(keptEvents);
  const kept = keptEvents.map((event) => ({ ...event, ...positions.get(event.id)! }));
  return { kept, skipped };
}

function clamped(point: Waypoint): Waypoint {
  return {
    lat: point.lat >= -90 && point.lat <= 90 ? point.lat : clampLatitude(point.lat),
    lng: point.lng >= -180 && point.lng <= 180 ? point.lng : clampLongitude(point.lng),
  };
}

/** MapLibre rejects latitudes outside -90..90, including a ring pushed past the pole. */
export function clampLatitude(lat: number): number {
  if (!Number.isFinite(lat)) return 0;
  return Math.min(90, Math.max(-90, lat));
}

function clampLongitude(lng: number): number {
  if (!Number.isFinite(lng)) return 0;
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
