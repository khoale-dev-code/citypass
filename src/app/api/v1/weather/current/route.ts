import { NextRequest, NextResponse } from "next/server";
import { getNumber } from "@/lib/config";
import { jsonError } from "@/lib/http";
export async function GET(req: NextRequest) {
  const lat = getNumber(req.nextUrl.searchParams.get("lat"), -90, 90);
  const lng = getNumber(req.nextUrl.searchParams.get("lng"), -180, 180);
  if (lat === null || lng === null) return jsonError("Tọa độ không hợp lệ");
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({ latitude: String(Math.round(lat * 100) / 100), longitude: String(Math.round(lng * 100) / 100), current: "precipitation,temperature_2m", timezone: "Asia/Bangkok", forecast_days: "1" }).toString();
    const r = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("Weather unavailable");
    const d = await r.json() as { current?: { precipitation?: number; temperature_2m?: number; time?: string } };
    return NextResponse.json({ weather: { precipitation: d.current?.precipitation ?? null, temperature: d.current?.temperature_2m ?? null, time: d.current?.time ?? null }, source: "Open-Meteo forecast model, not a rain gauge" });
  } catch { return NextResponse.json({ weather: null, source: "Open-Meteo" }); }
}
