import type { RouteOption } from "./types";

export type Point = [number, number];
export type RainSample = { mm: number | null; time: string | null };
export type JourneyRoute = RouteOption & {
  weather_checked: number;
  weather_expected: number;
  rain_hits: number;
  rain_max_mm: number | null;
  rain_mean_mm: number | null;
  priority_score: number;
};

/** Evenly select sample positions along the traveled polyline, not by vertex index. */
export function selectRouteSamples(geometry: readonly Point[], count = 5): Point[] {
  if (geometry.length < 2 || count < 2 || count > 10) return [];
  const earth = 111_195;
  const segments: number[] = [0];
  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1], b = geometry[i];
    if (![a[0], a[1], b[0], b[1]].every(Number.isFinite)) return [];
    const avgLat = (a[0] + b[0]) / 2 * Math.PI / 180;
    const meters = earth * Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos(avgLat));
    segments.push(segments[i - 1] + meters);
  }
  const total = segments[segments.length - 1];
  if (!Number.isFinite(total) || total <= 0) return [];
  const points: Point[] = [];
  let cursor = 1;
  for (let i = 0; i < count; i++) {
    const target = i / (count - 1) * total;
    while (cursor < segments.length - 1 && segments[cursor] < target) cursor++;
    const low = segments[cursor - 1], high = segments[cursor];
    const f = high <= low ? 0 : (target - low) / (high - low);
    const a = geometry[cursor - 1], b = geometry[cursor];
    points.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return points;
}

export function extractPrecipitation(value: unknown, expected: number): RainSample[] {
  const docs: unknown[] = Array.isArray(value) ? value : [value];
  return Array.from({ length: expected }, (_, i) => {
    const doc = docs[i];
    if (!doc || typeof doc !== "object" || !("current" in doc)) return { mm: null, time: null };
    const current = (doc as { current?: unknown }).current;
    if (!current || typeof current !== "object") return { mm: null, time: null };
    const { precipitation, time } = current as { precipitation?: unknown; time?: unknown };
    const mm = typeof precipitation === "number" && Number.isFinite(precipitation) && precipitation >= 0 ? precipitation : null;
    return { mm, time: typeof time === "string" ? time : null };
  });
}

/** Heuristic ranking, NOT a validated vehicle-safety or flood-clearance estimate. */
export function scoreJourneyRoute(route: RouteOption, samples: RainSample[], floodAvailable: boolean): JourneyRoute {
  const valid = samples.filter((sample): sample is { mm: number; time: string | null } => sample.mm !== null);
  const rainHits = valid.filter(s => s.mm > 0.05).length;
  const rainMax = valid.length ? Math.max(...valid.map(s => s.mm)) : null;
  const rainMean = valid.length ? valid.reduce((sum, s) => sum + s.mm, 0) / valid.length : null;
  const risk = floodAvailable ? Math.max(0, route.risk_score) : 0;
  const delayMinutes = Number.isFinite(route.traffic_delay_s) ? Math.max(0, route.traffic_delay_s ?? 0) / 60 : 0;
  const baseMinutes = Math.max(0, route.duration_s) / 60;
  // A longer route may win when it passes fewer known flood reports or rainfall signals.
  // The traffic-aware ETA already includes congestion; avoid double-counting its full delay.
  const rainPenalty = valid.length ? (rainHits / valid.length) * 13 + Math.min(rainMean ?? 0, 5) * 3 : 0;
  const floodPenalty = Math.min(risk, 20) * 24;
  const priority = baseMinutes + rainPenalty + floodPenalty + delayMinutes * 0.35;
  return {
    ...route,
    weather_checked: valid.length,
    weather_expected: samples.length,
    rain_hits: rainHits,
    rain_max_mm: rainMax,
    rain_mean_mm: rainMean,
    priority_score: Number(priority.toFixed(2))
  };
}

export function compareJourneyRoutes(routes: JourneyRoute[]): JourneyRoute[] {
  return [...routes].sort((a, b) => a.priority_score - b.priority_score || a.duration_s - b.duration_s || a.distance_m - b.distance_m);
}
