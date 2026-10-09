export type NavPoint = [number, number];
export type VehicleMode = "motorcycle" | "car";
export type NavigationRequest = {
  routeId: string;
  geometry: NavPoint[];
  from: NavPoint;
  to: NavPoint;
  vehicle: VehicleMode;
  durationSeconds: number;
  distanceMeters: number;
  trafficAware: boolean;
  floodDataAvailable: boolean;
};

const R = 111_195;

export function distanceMeters(a: readonly number[], b: readonly number[]): number {
  const x = (a[1] - b[1]) * R * Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180);
  const y = (a[0] - b[0]) * R;
  return Math.hypot(x, y);
}

export function isValidNavigationRequest(value: unknown): value is NavigationRequest {
  if (!value || typeof value !== "object") return false;
  const obj = value as Partial<NavigationRequest>;
  const validPoint = (p: unknown): p is NavPoint => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
  return typeof obj.routeId === "string" && obj.routeId.length > 0
    && (obj.vehicle === "motorcycle" || obj.vehicle === "car")
    && Array.isArray(obj.geometry) && obj.geometry.length >= 2 && obj.geometry.length <= 25_000
    && obj.geometry.every(validPoint) && validPoint(obj.from) && validPoint(obj.to)
    && typeof obj.durationSeconds === "number" && Number.isFinite(obj.durationSeconds) && obj.durationSeconds >= 0
    && typeof obj.distanceMeters === "number" && Number.isFinite(obj.distanceMeters) && obj.distanceMeters >= 0
    && typeof obj.trafficAware === "boolean" && typeof obj.floodDataAvailable === "boolean";
}

export function navigationProgress(geometry: readonly NavPoint[], gps: NavPoint): {
  remainingMeters: number;
  offRouteMeters: number;
  completedPercent: number;
  distanceToDestination: number;
} | null {
  if (geometry.length < 2 || !Number.isFinite(gps[0]) || !Number.isFinite(gps[1])) return null;
  const segmentLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < geometry.length; i++) {
    const d = distanceMeters(geometry[i - 1], geometry[i]);
    if (!Number.isFinite(d)) return null;
    segmentLengths.push(d);
    total += d;
  }
  if (total < 1) return null;
  const cos = Math.cos(gps[0] * Math.PI / 180);
  let covered = 0;
  let nearest = Infinity;
  let coveredAtNearest = 0;
  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1], b = geometry[i];
    const ax = (a[1] - gps[1]) * R * cos, ay = (a[0] - gps[0]) * R;
    const bx = (b[1] - gps[1]) * R * cos, by = (b[0] - gps[0]) * R;
    const dx = bx - ax, dy = by - ay;
    const length2 = dx * dx + dy * dy;
    const t = length2 < 1 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / length2));
    const gap = Math.hypot(ax + t * dx, ay + t * dy);
    if (gap < nearest) { nearest = gap; coveredAtNearest = covered + segmentLengths[i - 1] * t; }
    covered += segmentLengths[i - 1];
  }
  return {
    remainingMeters: Math.max(0, total - coveredAtNearest),
    offRouteMeters: nearest,
    completedPercent: Math.min(100, Math.max(0, Math.round(coveredAtNearest / total * 100))),
    distanceToDestination: distanceMeters(gps, geometry[geometry.length - 1])
  };
}
