import { NextResponse } from "next/server";
import { TRAFFIC_POINTS, parseFlow, type TrafficPoint, type TrafficAreaResponse } from "@/lib/traffic";
export const dynamic = "force-dynamic";
let cached: { time: number; data: TrafficAreaResponse } | null = null;
let inFlight: Promise<TrafficAreaResponse> | null = null;
async function queryTraffic(key: string): Promise<TrafficAreaResponse> {
  // Ten representative road readings, limited concurrency to avoid API bursts.
  const output: TrafficPoint[] = [];
  for (let i = 0; i < TRAFFIC_POINTS.length; i += 3) {
    const responses = await Promise.allSettled(TRAFFIC_POINTS.slice(i, i + 3).map(async point => {
      const url = new URL("https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/14/json");
      url.searchParams.set("point", `${point.lat},${point.lng}`);
      url.searchParams.set("unit", "kmph");
      url.searchParams.set("key", key);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000), cache: "no-store"
      });
      if (!response.ok) throw Error(`Traffic API HTTP ${response.status}`);
      return parseFlow(point, await response.json() as unknown);
    }));
    for (const item of responses) if (item.status === "fulfilled" && item.value) output.push(item.value);
  }
  return { configured: true, points: output, updated_at: new Date().toISOString(), source: "TomTom Traffic Flow (nearest road sample)", ...(output.length ? {} : { error: "Chưa lấy được mẫu tốc độ giao thông từ TomTom. Kiểm tra API key/quota." }) };
}
export async function GET() {
  const key = process.env.TOMTOM_API_KEY?.trim();
  if (!key) return NextResponse.json({ configured: false, points: [], updated_at: null, source: "TomTom", error: "Chưa cấu hình TOMTOM_API_KEY trên máy chủ." } satisfies TrafficAreaResponse, { headers: { "Cache-Control": "no-store" } });
  if (cached && Date.now() - cached.time < 90_000) return NextResponse.json(cached.data, { headers: { "Cache-Control": "private, max-age=25" } });
  try {
    if (!inFlight) inFlight = queryTraffic(key);
    const data = await inFlight;
    cached = { data, time: Date.now() };
    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=25" } });
  } catch { return NextResponse.json({ configured: true, points: [], updated_at: null, source: "TomTom", error: "Không kết nối được dữ liệu ùn tắc." } satisfies TrafficAreaResponse, { status: 503 }); }
  finally { inFlight = null; }
}
