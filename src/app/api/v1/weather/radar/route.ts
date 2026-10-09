import { NextResponse } from "next/server";
import { precipitationStatus } from "@/lib/precipitation-provider";

// CityPass no longer calls RainViewer. OpenWeatherMap raster is optional.
// Without a key, Open-Meteo weather-area samples draw modeled rain circles.
export const dynamic = "force-dynamic";
export async function GET() {
  const owmStatus = await precipitationStatus();
  const configured = owmStatus.available;
  const bucket = Math.floor(Date.now() / 600000) * 600;
  const frames = configured ? [{
    time: bucket,
    tile_url: "/api/v1/weather/precipitation/tiles/{z}/{x}/{y}"
  }] : [];
  return NextResponse.json({
    frames,
    radar: frames[0] ?? null,
    source: configured ? "OpenWeatherMap Maps 1.0" : "Open-Meteo",
    kind: "modeled precipitation, NOT weather radar or measured road flooding",
    provider_status: owmStatus.code,
    error: null
  }, { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } });
}
