import { NextRequest, NextResponse } from "next/server";
import { compareWeather, parseMeteo, parseOwm } from "@/lib/weather-verification";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rawLat = request.nextUrl.searchParams.get("lat");
  const rawLng = request.nextUrl.searchParams.get("lng");
  if (!rawLat || !rawLng) return NextResponse.json({ error: "Thiếu tọa độ." }, { status: 400 });
  const lat = Number(rawLat), lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 10.25 || lat > 11.3 || lng < 106.2 || lng > 107.25) {
    return NextResponse.json({ error: "Chỉ hỗ trợ tọa độ vùng TP.HCM và lân cận." }, { status: 400 });
  }
  // Coarse gridding improves cache reuse and avoids one upstream call per tiny map movement.
  const a = Number(lat.toFixed(2)), b = Number(lng.toFixed(2));
  const meteo = new URL("https://api.open-meteo.com/v1/forecast");
  meteo.search = new URLSearchParams({ latitude: String(a), longitude: String(b), current: "precipitation,weather_code", timezone: "Asia/Ho_Chi_Minh" }).toString();
  const key = process.env.OPENWEATHER_API_KEY?.trim();
  const owm = new URL("https://api.openweathermap.org/data/2.5/weather");
  if (key) owm.search = new URLSearchParams({ lat: String(a), lon: String(b), units: "metric", appid: key }).toString();
  const checks = await Promise.allSettled([
    fetch(meteo, { next: { revalidate: 300 }, signal: AbortSignal.timeout(6000) }).then(async response => response.ok ? response.json() as Promise<unknown> : null),
    key ? fetch(owm, { next: { revalidate: 300 }, signal: AbortSignal.timeout(6000) }).then(async response => response.ok ? response.json() as Promise<unknown> : null) : Promise.resolve(null)
  ]);
  const value = (index: number): unknown => checks[index].status === "fulfilled" ? checks[index].value : null;
  const now = Date.now();
  const verification = compareWeather([parseMeteo(value(0), now), parseOwm(value(1), now)]);
  return NextResponse.json({
    ...verification,
    coordinate: { lat: a, lng: b },
    checked_at: new Date(now).toISOString(),
    sources_configured: { open_meteo: true, openweather: !!key },
    usage: "Ước tính mưa từ 2 nguồn; bản tin chính thức ở các liên kết chỉ để đối chiếu. Không tự suy ra độ sâu ngập hoặc đường an toàn."
  }, { headers: { "Cache-Control": "private, max-age=60" } });
}
