/** Weather agreement is not a street-level observation or proof of dry roads. */
export type RainEvidence = { source: string; signal: "rain" | "no_signal"; checkedAt: string | null; description: string };
export type Verification = { verdict: "two_sources_rain" | "one_source_rain" | "no_rain_signal" | "disagreement" | "unknown"; label: string; detail: string; agreement: "agree" | "disagree" | "insufficient"; evidence: RainEvidence[] };
const wetWmo = (code: number) => (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99);
const wetOwm = (code: number) => (code >= 200 && code < 600);
function stampValid(timestamp: number, nowMs: number): boolean { return Number.isFinite(timestamp) && timestamp <= nowMs + 10 * 60_000 && timestamp >= nowMs - 90 * 60_000; }
export function parseMeteo(value: unknown, nowMs = Date.now()): RainEvidence | null {
  if (typeof value !== "object" || value === null) return null;
  const current = (value as { current?: unknown }).current;
  if (!current || typeof current !== "object") return null;
  const data = current as { precipitation?: unknown; weather_code?: unknown; time?: unknown };
  if (typeof data.precipitation !== "number" || !Number.isFinite(data.precipitation) || data.precipitation < 0 || typeof data.weather_code !== "number" || !Number.isFinite(data.weather_code)) return null;
  if (typeof data.time !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(data.time)) return null;
  // Open-Meteo local clock is explicitly requested in Asia/Ho_Chi_Minh.
  const observed = Date.parse(data.time + "+07:00");
  if (!stampValid(observed, nowMs)) return null;
  const rain = data.precipitation >= 0.1 || wetWmo(data.weather_code);
  return { source: "Open-Meteo (mô hình)", signal: rain ? "rain" : "no_signal", checkedAt: new Date(observed).toISOString(), description: `Mưa ước tính ${data.precipitation.toFixed(1)} mm / bước mô hình · WMO ${data.weather_code}` };
}
export function parseOwm(value: unknown, nowMs = Date.now()): RainEvidence | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as { dt?: unknown; weather?: { id?: unknown }[]; rain?: { "1h"?: unknown } };
  if (typeof obj.dt !== "number" || !stampValid(obj.dt * 1000, nowMs)) return null;
  const code = obj.weather?.[0]?.id;
  if (typeof code !== "number" || !Number.isFinite(code)) return null;
  const rawRain = obj.rain?.["1h"];
  const rainMm = typeof rawRain === "number" && Number.isFinite(rawRain) && rawRain >= 0 ? rawRain : null;
  const raining = wetOwm(code) || (rainMm !== null && rainMm >= 0.1);
  return { source: "OpenWeatherMap (tổng hợp)", signal: raining ? "rain" : "no_signal", checkedAt: new Date(obj.dt * 1000).toISOString(), description: `Mã thời tiết ${code}${rainMm === null ? " · không có số đo mưa 1h" : ` · mưa ${rainMm.toFixed(1)} mm / 1h`}` };
}
export function compareWeather(evidence: (RainEvidence | null)[]): Verification {
  const available = evidence.filter((item): item is RainEvidence => !!item);
  const rains = available.filter(item => item.signal === "rain").length;
  if (!available.length) return { verdict: "unknown", label: "Chưa đủ dữ liệu mưa", detail: "Hai nguồn không sẵn sàng hoặc dữ liệu quá cũ. Không được suy ra là trời khô ráo.", agreement: "insufficient", evidence: available };
  if (available.length === 1) return { verdict: rains ? "one_source_rain" : "no_rain_signal", label: rains ? "Một nguồn báo tín hiệu mưa" : "Một nguồn chưa ghi nhận tín hiệu mưa", detail: "Chỉ có một nguồn mới; cần xem cảnh báo chính thức và kiểm tra thực tế.", agreement: "insufficient", evidence: available };
  if (rains === 2) return { verdict: "two_sources_rain", label: "Hai nguồn cùng có tín hiệu mưa", detail: "Hai nguồn trùng nhận định; đây vẫn không phải quan trắc trực tiếp tại từng con đường.", agreement: "agree", evidence: available };
  if (rains === 1) return { verdict: "disagreement", label: "Hai nguồn đang khác nhau", detail: "Khả năng mưa cục bộ hoặc khác độ phân giải/thời điểm. Nên kiểm tra thực tế trước khi đi xe máy.", agreement: "disagree", evidence: available };
  return { verdict: "no_rain_signal", label: "Hai nguồn chưa báo tín hiệu mưa", detail: "Không đồng nghĩa chắc chắn không mưa, không ngập ở khu vực đã chọn.", agreement: "agree", evidence: available };
}
