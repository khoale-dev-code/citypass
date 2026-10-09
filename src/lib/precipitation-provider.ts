/**
 * OpenWeatherMap Maps 1.0 readiness check.
 * An env key alone does NOT mean the precipitation raster works.
 * Probes one tile in Ho Chi Minh City with a short TTL and never exposes the key.
 */
export type RainTileStatusCode =
  | "ready" | "missing_key" | "unauthorized" | "forbidden" | "rate_limited"
  | "not_found" | "upstream_error" | "invalid_image" | "timeout";

export type RainTileStatus = {
  configured: boolean;
  available: boolean;
  code: RainTileStatusCode;
  message: string;
  upstream_http_status: number | null;
  checked_at: string;
};

const SAMPLE_Z = 7;
const SAMPLE_X = 101;
const SAMPLE_Y = 60;
const READY_TTL = 5 * 60_000;
const FAILURE_TTL = 60_000;
let cache: { key: string; until: number; value: RainTileStatus } | null = null;
let pending: { key: string; promise: Promise<RainTileStatus> } | null = null;

export function makePrecipitationUrl(z: number, x: number, y: number, key: string): URL {
  const url = new URL(`https://tile.openweathermap.org/map/precipitation_new/${z}/${x}/${y}.png`);
  url.searchParams.set("appid", key);
  return url;
}

export function classifyTileResponse(status: number, contentType: string): Pick<RainTileStatus, "available" | "code" | "message"> {
  if (status === 401) return { available: false, code: "unauthorized", message: "OpenWeatherMap API Key chưa được kích hoạt hoặc không hợp lệ. Hãy xác nhận email và đợi kích hoạt." };
  if (status === 403) return { available: false, code: "forbidden", message: "API Key chưa được cấp quyền bản đồ mưa Maps 1.0 hoặc đã bị giới hạn." };
  if (status === 429) return { available: false, code: "rate_limited", message: "OpenWeatherMap đang giới hạn số yêu cầu. CityPass tạm dùng mưa ước tính Open-Meteo." };
  if (status === 404) return { available: false, code: "not_found", message: "OpenWeatherMap không tìm thấy tile mẫu. Kiểm tra endpoint Maps 1.0 và quyền của gói API." };
  if (status < 200 || status >= 300) return { available: false, code: "upstream_error", message: `OpenWeatherMap trả HTTP ${status}. CityPass chuyển sang mưa ước tính Open-Meteo.` };
  if (contentType.toLowerCase().split(";")[0].trim() !== "image/png")
    return { available: false, code: "invalid_image", message: "OpenWeatherMap không trả ảnh tile hợp lệ. CityPass chuyển sang Open-Meteo." };
  return { available: true, code: "ready", message: "Lớp lượng mưa OpenWeatherMap đã sẵn sàng." };
}

async function probe(key: string): Promise<RainTileStatus> {
  const checked_at = new Date().toISOString();
  try {
    const response = await fetch(makePrecipitationUrl(SAMPLE_Z, SAMPLE_X, SAMPLE_Y, key), {
      signal: AbortSignal.timeout(5000), cache: "no-store"
    });
    const verdict = classifyTileResponse(response.status, response.headers.get("content-type") ?? "");
    await response.body?.cancel().catch(() => undefined);
    return { configured: true, upstream_http_status: response.status, checked_at, ...verdict };
  } catch {
    return { configured: true, available: false, code: "timeout", message: "Không kết nối được OpenWeatherMap trong 5 giây. CityPass tạm dùng Open-Meteo.", upstream_http_status: null, checked_at };
  }
}

export async function precipitationStatus(): Promise<RainTileStatus> {
  const key = process.env.OPENWEATHER_API_KEY?.trim();
  if (!key) return {
    configured: false, available: false, code: "missing_key",
    message: "Chưa cấu hình OPENWEATHER_API_KEY. CityPass dùng mưa ước tính Open-Meteo.",
    upstream_http_status: null, checked_at: new Date().toISOString()
  };
  const now = Date.now();
  if (cache?.key === key && cache.until > now) return cache.value;
  if (pending?.key === key) return pending.promise;
  const promise = probe(key).then(result => {
    cache = { key, until: Date.now() + (result.available ? READY_TTL : FAILURE_TTL), value: result };
    return result;
  }).finally(() => { if (pending?.promise === promise) pending = null; });
  pending = { key, promise };
  return promise;
}

/** Stop advertising raster on the next manifest refresh after a failed tile request. */
export function markPrecipitationFailure(status: number, contentType = ""): void {
  const key = process.env.OPENWEATHER_API_KEY?.trim();
  if (!key) return;
  const verdict = classifyTileResponse(status, contentType);
  if (verdict.available) return;
  cache = { key, until: Date.now() + FAILURE_TTL, value: {
    configured: true, upstream_http_status: status, checked_at: new Date().toISOString(), ...verdict
  } };
}
