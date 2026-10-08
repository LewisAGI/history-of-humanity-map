import type { Waypoint } from './types';

/** Pins closer than this, in the same period, cannot be told apart at maximum zoom. */
export const COLOCATION_KM = 20;

/** Centre-to-centre gap after a co-located group is opened into a ring. */
export const SPREAD_SEPARATION_KM = 26;

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
 * Co-located pins in one period are drawn on a small ring so each can be clicked.
 * Pins farther apart keep their coordinates. The ring is deterministic (sorted by id).
 */
export function displayPositions<T extends Waypoint & { id: string }>(events: T[]): Map<string, Waypoint> {
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

  const positions = new Map<string, Waypoint>();
  groups.forEach((indexes) => {
    const members = indexes
      .map((index) => events[index])
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (members.length === 1) {
      positions.set(members[0].id, { lat: members[0].lat, lng: members[0].lng });
      return;
    }
    const lat0 = members.reduce((sum, event) => sum + event.lat, 0) / members.length;
    const lng0 = meanLongitude(members.map((event) => event.lng));
    const radius = SPREAD_SEPARATION_KM / (2 * Math.sin(Math.PI / members.length));
    members.forEach((event, order) => {
      const angle = (2 * Math.PI * order) / members.length;
      const lat = lat0 + (radius / 110.574) * Math.cos(angle);
      const cosLat = Math.cos((lat0 * Math.PI) / 180) || 1e-6;
      const lng = lng0 + (radius / (111.32 * cosLat)) * Math.sin(angle);
      positions.set(event.id, { lat, lng });
    });
  });
  return positions;
}

function meanLongitude(lngs: number[]): number {
  const vectors = lngs.map((lng) => toRad(lng));
  const x = vectors.reduce((sum, λ) => sum + Math.cos(λ), 0);
  const y = vectors.reduce((sum, λ) => sum + Math.sin(λ), 0);
  return (toDeg(Math.atan2(y, x)) + 540) % 360 - 180;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}
