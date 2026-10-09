/** Stateless marker culling shared by Leaflet layers; never mutates original data. */
export type GeoBounds = { south: number; north: number; west: number; east: number };
export function selectVisible<T>(items: readonly T[], at: (item: T) => readonly [number, number], bounds: GeoBounds, limit: number): T[] {
  if (!Number.isSafeInteger(limit) || limit < 1) return [];
  const chosen: T[] = [];
  for (const item of items) {
    const [lat, lng] = at(item);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const inLongitude = bounds.west <= bounds.east
      ? lng >= bounds.west && lng <= bounds.east
      : lng >= bounds.west || lng <= bounds.east;
    if (lat < bounds.south || lat > bounds.north || !inLongitude) continue;
    chosen.push(item);
    if (chosen.length >= limit) break;
  }
  return chosen;
}
