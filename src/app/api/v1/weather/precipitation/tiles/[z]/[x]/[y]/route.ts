import { NextRequest, NextResponse } from "next/server";
import { precipitationStatus } from "@/lib/precipitation-provider";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ z: string; x: string; y: string }> };

export async function GET(_request: NextRequest, context: Context) {
  // CityPass OWM preflight v0.7.1 compat: cache readiness and fall back before requesting many tiles.
  const owmCheck = await precipitationStatus();
  if (!owmCheck.available) {
    return NextResponse.json({
      error: owmCheck.message, provider_status: owmCheck.code,
      upstream_http_status: owmCheck.upstream_http_status, fallback: "Open-Meteo"
    }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }

  const key = process.env.OPENWEATHER_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: "OpenWeatherMap map key is not configured" }, { status: 503 });
  const { z: rawZ, x: rawX, y: rawY } = await context.params;
  const z = Number(rawZ), x = Number(rawX), y = Number(rawY);
  const max = 2 ** z;
  if (![z,x,y].every(Number.isSafeInteger) || z < 0 || z > 10 || x < 0 || y < 0 || x >= max || y >= max)
    return NextResponse.json({ error: "Invalid map tile" }, { status: 400 });
  try {
    const url = new URL(
      `https://tile.openweathermap.org/map/precipitation_new/` + z + `/` + x + `/` + y + `.png`
    );
    url.searchParams.set("appid", key);
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), next: { revalidate: 600 } });
    if (!res.ok) return NextResponse.json({ error: "Precipitation map unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    const mime = (res.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (mime !== "image/png") return NextResponse.json({ error: "Invalid map tile type" }, { status: 502 });
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > 1000000) return NextResponse.json({ error: "Map tile too large" }, { status: 502 });
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 1000000) return NextResponse.json({ error: "Map tile too large" }, { status: 502 });
    return new NextResponse(bytes, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300, s-maxage=600" }
    });
  } catch {
    return NextResponse.json({ error: "Precipitation upstream timeout" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
