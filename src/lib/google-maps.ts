/**
 * Google Maps Directions handoff from a CityPass-selected route.
 * Google Maps ALWAYS computes its own route: waypoints can only suggest a corridor.
 * Maps URLs need no Google Maps API key. Never include TomTom credentials here.
 */
export type MapPoint = readonly [number, number]; // [latitude, longitude]
export type GoogleTravelMode = "driving" | "two-wheeler";

export interface GoogleMapsDirectionsInput {
  from: MapPoint;
  to: MapPoint;
  geometry: readonly MapPoint[];
  mode?: GoogleTravelMode;
  includeWaypoints?: boolean;
}

const WAYPOINT_FRACTIONS = [0.25, 0.5, 0.75] as const;
const METERS_PER_DEGREE = 111_195;

export function isValidMapPoint(point: MapPoint): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1])
    && point[0] >= -90 && point[0] <= 90
    && point[1] >= -180 && point[1] <= 180;
}

function formatPoint(point: MapPoint): string {
  return `${point[0].toFixed(5)},${point[1].toFixed(5)}`;
}

function approxMeters(a: MapPoint, b: MapPoint): number {
  const latDistance = (b[0] - a[0]) * METERS_PER_DEGREE;
  const lngDistance = (b[1] - a[1]) * METERS_PER_DEGREE * Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180);
  return Math.hypot(latDistance, lngDistance);
}

/** Sample by traveled distance, preserving original order (not by array index). */
export function sampleRouteWaypoints(geometry: readonly MapPoint[]): MapPoint[] {
  if (geometry.length < 3 || geometry.length > 20_000 || !geometry.every(isValidMapPoint)) return [];
  const distances: number[] = [0];
  for (let index = 1; index < geometry.length; index++) {
    distances.push(distances[index - 1] + approxMeters(geometry[index - 1], geometry[index]));
  }
  const total = distances[distances.length - 1];
  if (!Number.isFinite(total) || total < 450) return [];
  const chosen: MapPoint[] = [];
  for (const fraction of WAYPOINT_FRACTIONS) {
    const target = fraction * total;
    const end = distances.findIndex(distance => distance >= target);
    if (end < 1) continue;
    const segment = distances[end] - distances[end - 1];
    if (segment <= 0) continue;
    const progress = (target - distances[end - 1]) / segment;
    const a = geometry[end - 1], b = geometry[end];
    const candidate: MapPoint = [a[0] + progress * (b[0] - a[0]), a[1] + progress * (b[1] - a[1])];
    if (approxMeters(candidate, geometry[0]) < 80 || approxMeters(candidate, geometry[geometry.length - 1]) < 80) continue;
    if (chosen.some(previous => approxMeters(previous, candidate) < 100)) continue;
    chosen.push(candidate);
  }
  return chosen;
}

export function buildGoogleMapsDirectionsUrl(input: GoogleMapsDirectionsInput): string | null {
  if (!isValidMapPoint(input.from) || !isValidMapPoint(input.to)) return null;
  if (approxMeters(input.from, input.to) < 1) return null;
  if (input.mode && input.mode !== "driving" && input.mode !== "two-wheeler") return null;
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", formatPoint(input.from));
  url.searchParams.set("destination", formatPoint(input.to));
  url.searchParams.set("travelmode", input.mode ?? "driving");
  url.searchParams.set("dir_action", "navigate");
  if (input.includeWaypoints !== false) {
    const waypoints = sampleRouteWaypoints(input.geometry);
    if (waypoints.length > 0) url.searchParams.set("waypoints", waypoints.map(formatPoint).join("|"));
  }
  return url.toString().length <= 2048 ? url.toString() : null;
}
