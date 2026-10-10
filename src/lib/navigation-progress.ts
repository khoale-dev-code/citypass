export type NavPoint = [number, number];
export type VehicleMode = "motorcycle" | "car";
export type NavigationInstruction = {
  offsetMeters: number;
  maneuver: string;
  street?: string;
};

export function instructionForProgress(
  instructions: readonly NavigationInstruction[], completedPercent: number, routeDistanceMeters: number
): { instruction: NavigationInstruction; distanceMeters: number } | null {
  if (!Number.isFinite(completedPercent) || !Number.isFinite(routeDistanceMeters) || routeDistanceMeters <= 0) return null;
  const traveled = Math.min(1, Math.max(0, completedPercent / 100)) * routeDistanceMeters;
  for (const instruction of instructions) {
    if (!Number.isFinite(instruction.offsetMeters) || instruction.offsetMeters < 0 || instruction.offsetMeters > routeDistanceMeters * 1.15) continue;
    if (instruction.maneuver === "DEPART" || instruction.maneuver === "FOLLOW") continue;
    const remaining = instruction.offsetMeters - traveled;
    if (remaining > -22) return { instruction, distanceMeters: Math.max(0, remaining) };
  }
  return null;
}

const MOVE_LABELS: Record<string, string> = {
  STRAIGHT: "Tiếp tục đi thẳng", TURN_LEFT: "Rẽ trái", TURN_RIGHT: "Rẽ phải",
  SHARP_LEFT: "Rẽ gấp bên trái", SHARP_RIGHT: "Rẽ gấp bên phải",
  BEAR_LEFT: "Chếch sang trái", BEAR_RIGHT: "Chếch sang phải",
  KEEP_LEFT: "Giữ bên trái", KEEP_RIGHT: "Giữ bên phải",
  MAKE_UTURN: "Quay đầu tại nơi cho phép", TRY_MAKE_UTURN: "Quay đầu tại nơi cho phép",
  TAKE_EXIT: "Đi theo lối ra", MOTORWAY_EXIT_LEFT: "Ra lối bên trái", MOTORWAY_EXIT_RIGHT: "Ra lối bên phải",
  ROUNDABOUT_LEFT: "Qua vòng xoay, rẽ trái", ROUNDABOUT_RIGHT: "Qua vòng xoay, rẽ phải",
  ROUNDABOUT_CROSS: "Đi qua vòng xoay", ROUNDABOUT_BACK: "Quay lại qua vòng xoay",
  ARRIVE: "Đã đến điểm đến", ARRIVE_LEFT: "Điểm đến bên trái", ARRIVE_RIGHT: "Điểm đến bên phải",
  ENTER_MOTORWAY: "Vào đường cao tốc", ENTER_FREEWAY: "Vào đường cao tốc", ENTER_HIGHWAY: "Đi vào đường lớn",
  ENTRANCE_RAMP: "Đi lên đường nhánh", SWITCH_PARALLEL_ROAD: "Chuyển sang đường song hành", SWITCH_MAIN_ROAD: "Chuyển sang đường chính"
};
export function instructionText(step: NavigationInstruction): string {
  const verb = MOVE_LABELS[step.maneuver] ?? "Đi theo tuyến phía trước";
  return step.street?.trim() ? `${verb} vào ${step.street.trim()}` : verb;
}

export type NavigationRequest = {
  routeId: string;
  geometry: NavPoint[];
  instructions?: NavigationInstruction[];
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
    && typeof obj.trafficAware === "boolean" && typeof obj.floodDataAvailable === "boolean"
    && (obj.instructions === undefined || (Array.isArray(obj.instructions) && obj.instructions.length <= 400 && obj.instructions.every(step => step && typeof step === "object"
      && typeof step.maneuver === "string" && step.maneuver.length <= 64
      && Number.isFinite(step.offsetMeters) && step.offsetMeters >= 0 && step.offsetMeters <= obj.distanceMeters! * 1.2
      && (step.street === undefined || (typeof step.street === "string" && step.street.length <= 180)))));
}

export function navigationProgress(geometry: readonly NavPoint[], gps: NavPoint): {
  remainingMeters: number;
  offRouteMeters: number;
  completedPercent: number;
  distanceToDestination: number;
  traveledMeters: number;
  totalMeters: number;
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
    distanceToDestination: distanceMeters(gps, geometry[geometry.length - 1]),
    traveledMeters: coveredAtNearest, totalMeters: total
  };
}
