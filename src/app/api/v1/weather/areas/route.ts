import { NextResponse } from "next/server";
import { WEATHER_POINTS, parseAreaWeather } from "@/lib/weather-areas";

// A single shared batched request, cached on the server for five minutes.
// Never send live-unverified weather/sensor claims to clients.
export async function GET() {
  const api = new URL("https://api.open-meteo.com/v1/forecast");
  api.search = new URLSearchParams({
    latitude: WEATHER_POINTS.map(p => p.lat).join(","),
    longitude: WEATHER_POINTS.map(p => p.lng).join(","),
    current: "temperature_2m,precipitation,weather_code,cloud_cover,is_day",
    hourly: "precipitation_probability",
    forecast_hours: "3",
    timezone: "Asia/Ho_Chi_Minh"
  }).toString();
  try {
    const response = await fetch(api, { next: { revalidate: 300 }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || payload.length !== WEATHER_POINTS.length) throw new Error("Unexpected weather data format");
    const areas = WEATHER_POINTS.flatMap((point, i) => {
      const area = parseAreaWeather(point, payload[i]);
      return area ? [area] : [];
    });
    if (areas.length < WEATHER_POINTS.length / 2) throw new Error("Missing model data for too many areas");
    return NextResponse.json({
      areas,
      updated_at: new Date().toISOString(),
      source: "Open-Meteo forecast model",
      disclaimer: "Ước tính theo ô lưới mô hình, không phải trạm đo mưa trực tiếp. Không dùng làm xác nhận an toàn đường."
    });
  } catch {
    return NextResponse.json({ error: "Chưa lấy được thời tiết theo khu vực. Vui lòng thử lại sau.", areas: [] }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
