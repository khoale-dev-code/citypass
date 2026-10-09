export const HCMC = { lat: 10.7769, lng: 106.7009 } as const;
export const FLOOD_THRESHOLDS = { level1: 10, level2: 20, level3: 35 } as const;
export const REPORT_TTL_MINUTES = 90;
export const SENSOR_TTL_MINUTES = 120; // Giá trị tạm cho adapter, cần xác minh với AFSC
export const CONFIRM_WINDOW_MINUTES = 15;
export const VERIFY_RADIUS_METERS = 200;

export function floodSeverity(cm: number): 0 | 1 | 2 | 3 {
  if (!Number.isFinite(cm) || cm < 0) throw new Error("Mực nước không hợp lệ");
  if (cm < FLOOD_THRESHOLDS.level1) return 0;
  if (cm < FLOOD_THRESHOLDS.level2) return 1;
  if (cm <= FLOOD_THRESHOLDS.level3) return 2;
  return 3;
}

export function pointIsValid(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function getNumber(value: string | null, min: number, max: number): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function haversineMeters(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Nội suy xấp xỉ khoảng cách đến đoạn tuyến; tránh bỏ sót sự cố ở giữa 2 đỉnh polyline.
export function routeNearPoint(route: [number, number][], point: [number, number], meters = 130): boolean {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const midLat = ((a[0] + b[0]) / 2) * Math.PI / 180;
    const scaleX = 111320 * Math.cos(midLat), scaleY = 110540;
    const vx = (b[1] - a[1]) * scaleX, vy = (b[0] - a[0]) * scaleY;
    const wx = (point[1] - a[1]) * scaleX, wy = (point[0] - a[0]) * scaleY;
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy || 1)));
    if (Math.hypot(wx - t * vx, wy - t * vy) <= meters) return true;
  }
  return false;
}
