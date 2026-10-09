// CHƯA CÓ TÀI LIỆU AFSC THỰC: chỉ nhận cấu trúc CANONICAL bên dưới.
// Phải chỉnh adapter theo hợp đồng chính thức, không giả định API thành phố có sẵn.
export interface CanonicalSensorReading { sensor_id: string; lat: number; lng: number; water_level_cm: number; observed_at?: string; }
export function parseAfscPayload(raw: unknown): CanonicalSensorReading[] {
  if (!Array.isArray(raw)) throw new Error("Chưa map định dạng AFSC vào CanonicalSensorReading[]");
  return raw.map(item => {
    if (!item || typeof item !== "object") throw new Error("Invalid reading");
    const r = item as Record<string, unknown>;
    if (typeof r.sensor_id !== "string" || r.sensor_id.length < 1 || r.sensor_id.length > 100 ||
      typeof r.lat !== "number" || typeof r.lng !== "number" || !Number.isFinite(r.lat) || !Number.isFinite(r.lng) ||
      Math.abs(r.lat) > 90 || Math.abs(r.lng) > 180 || typeof r.water_level_cm !== "number" ||
      !Number.isFinite(r.water_level_cm) || r.water_level_cm < 0 || r.water_level_cm > 500 ||
      (r.observed_at !== undefined && (typeof r.observed_at !== "string" || Number.isNaN(Date.parse(r.observed_at))))) throw new Error("Invalid AFSC canonical record");
    return { sensor_id: r.sensor_id, lat: r.lat, lng: r.lng, water_level_cm: r.water_level_cm, observed_at: r.observed_at as string | undefined };
  });
}
