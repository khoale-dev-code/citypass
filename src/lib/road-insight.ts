/** Helpers for approximate point-based road checks, never a guarantee of safe travel. */
export function inHcm(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 10.35 && lat <= 11.25 && lng >= 106.3 && lng <= 107.2;
}
export function normalizeRoadQuery(input: string): string | null {
  const text = input.trim().replace(/\s+/g, " ");
  return text.length >= 3 && text.length <= 140 && !/[<>\u0000-\u001f]/.test(text) ? text : null;
}
export function classifyModelRain(value: unknown): "rain" | "no_signal" | "unknown" {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "unknown";
  return value > 0 ? "rain" : "no_signal";
}
