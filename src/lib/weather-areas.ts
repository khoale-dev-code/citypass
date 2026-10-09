/** Fixed sampling points across HCMC; these are model grid estimates, NOT physical sensors. */
export const WEATHER_POINTS = [
  { id: "q1", name: "Trung tâm · Quận 1", lat: 10.7769, lng: 106.7009 },
  { id: "q3", name: "Quận 3", lat: 10.7845, lng: 106.6855 },
  { id: "q5", name: "Quận 5 · Chợ Lớn", lat: 10.754, lng: 106.6657 },
  { id: "q6", name: "Quận 6", lat: 10.748, lng: 106.6366 },
  { id: "q7", name: "Quận 7 · Phú Mỹ Hưng", lat: 10.7275, lng: 106.7219 },
  { id: "q8", name: "Quận 8", lat: 10.722, lng: 106.628 },
  { id: "q10", name: "Quận 10", lat: 10.7727, lng: 106.6675 },
  { id: "q12", name: "Quận 12", lat: 10.8635, lng: 106.6588 },
  { id: "bt", name: "Bình Thạnh", lat: 10.8083, lng: 106.7137 },
  { id: "pn", name: "Phú Nhuận", lat: 10.7992, lng: 106.6784 },
  { id: "tb", name: "Tân Bình", lat: 10.803, lng: 106.6501 },
  { id: "tp", name: "Tân Phú", lat: 10.7907, lng: 106.6293 },
  { id: "gv", name: "Gò Vấp", lat: 10.8387, lng: 106.6651 },
  { id: "btan", name: "Bình Tân", lat: 10.7671, lng: 106.6035 },
  { id: "tdwest", name: "Thủ Đức · Hiệp Bình", lat: 10.8337, lng: 106.7338 },
  { id: "tdeast", name: "Thủ Đức · Long Phước", lat: 10.8002, lng: 106.8357 },
  { id: "tn", name: "Thủ Đức · Tăng Nhơn Phú", lat: 10.8461, lng: 106.7786 },
  { id: "nb", name: "Nhà Bè", lat: 10.694, lng: 106.7332 },
  { id: "bc", name: "Bình Chánh", lat: 10.6875, lng: 106.5938 },
  { id: "hm", name: "Hóc Môn", lat: 10.8892, lng: 106.5942 },
  { id: "cc", name: "Củ Chi", lat: 11.0063, lng: 106.509 },
  { id: "cg", name: "Cần Giờ", lat: 10.4114, lng: 106.9539 }
] as const;

export type WeatherCondition = "rain" | "cloud" | "clear";
export type WeatherArea = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  time: string;
  condition: WeatherCondition;
  conditionLabel: string;
  precipitationMm: number;
  temperatureC: number;
  cloudCover: number;
  isDay: boolean;
  rainChanceNextHours: number | null;
};

export type AreaWeatherResponse = {
  areas: WeatherArea[];
  updated_at: string;
  source: string;
  disclaimer: string;
};

export function classifyWeather(mm: number, code: number, cloudCover: number, isDay: boolean): { condition: WeatherCondition; conditionLabel: string } {
  if (mm >= 0.1 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) {
    return { condition: "rain", conditionLabel: "Có mưa (mô hình)" };
  }
  if (cloudCover >= 55 || [2, 3, 45, 48].includes(code)) {
    return { condition: "cloud", conditionLabel: "Nhiều mây" };
  }
  return { condition: "clear", conditionLabel: isDay ? "Nắng / ít mây" : "Quang mây" };
}

export function parseAreaWeather(point: { id: string; name: string; lat: number; lng: number }, data: unknown): WeatherArea | null {
  if (typeof data !== "object" || data === null || !("current" in data)) return null;
  const root = data as Record<string, unknown>;
  if (typeof root.current !== "object" || root.current === null) return null;
  const current = root.current as Record<string, unknown>;
  const mm = current.precipitation, temp = current.temperature_2m;
  const cloud = current.cloud_cover, code = current.weather_code, time = current.time;
  if (typeof mm !== "number" || !Number.isFinite(mm) || mm < 0 || mm > 500 ||
      typeof temp !== "number" || !Number.isFinite(temp) || temp < -40 || temp > 65 ||
      typeof cloud !== "number" || !Number.isFinite(cloud) || cloud < 0 || cloud > 100 ||
      typeof code !== "number" || !Number.isFinite(code) || typeof time !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(time)) return null;
  const isDay = current.is_day === 1;
  const hourly = typeof root.hourly === "object" && root.hourly !== null ? root.hourly as Record<string, unknown> : null;
  const odds = hourly && Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability.slice(0, 3).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100) : [];
  const { condition, conditionLabel } = classifyWeather(mm, code, cloud, isDay);
  return { ...point, time, condition, conditionLabel, precipitationMm: mm, temperatureC: temp, cloudCover: cloud, isDay, rainChanceNextHours: odds.length ? Math.max(...odds) : null };
}
