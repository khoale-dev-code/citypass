/** RainViewer supplies recent historical radar frames, not a flooding forecast. */
export interface RadarFrame { time: number; tile_url: string }
interface RadarManifest {
  host?: unknown;
  radar?: { past?: { time?: unknown; path?: unknown }[] };
}

export function parseRadarFrames(value: unknown): RadarFrame[] {
  if (!value || typeof value !== "object") return [];
  const manifest = value as RadarManifest;
  const inputFrames = manifest.radar?.past;
  if (manifest.host !== "https://tilecache.rainviewer.com" || !Array.isArray(inputFrames)) return [];
  const frames = inputFrames.flatMap(frame => {
    if (typeof frame.time !== "number" || !Number.isSafeInteger(frame.time) ||
      typeof frame.path !== "string" || !/^\/v2\/radar\/\d+$/.test(frame.path)) return [];
    return [{ time: frame.time, tile_url: `${manifest.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png` }];
  });
  return frames.sort((a, b) => a.time - b.time).filter((frame, i, all) => i === 0 || frame.time !== all[i - 1].time).slice(-12);
}

export function clampRadarIndex(index: number, length: number): number {
  return length === 0 ? 0 : Math.min(length - 1, Math.max(0, Math.trunc(index) || 0));
}
