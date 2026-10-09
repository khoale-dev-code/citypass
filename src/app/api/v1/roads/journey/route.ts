import { NextRequest, NextResponse } from "next/server";
import { GET as calculateCandidateRoutes } from "@/app/api/v1/routes/route";
import { haversineMeters } from "@/lib/config";
import { inHcm } from "@/lib/road-insight";
import { compareJourneyRoutes, extractPrecipitation, scoreJourneyRoute, selectRouteSamples, type Point, type RainSample } from "@/lib/journey-analysis";
import type { RouteOption } from "@/lib/types";

export const dynamic = "force-dynamic";

type CandidateResponse = {
  routes?: RouteOption[];
  traffic_aware?: boolean;
  routing_provider?: string;
  flood_data_available?: boolean;
  warning?: string;
  error?: string;
};

function inputPoint(q: URLSearchParams, prefix: "from" | "to"): Point | null {
  const latText = q.get(`${prefix}_lat`), lngText = q.get(`${prefix}_lng`);
  if (latText == null || lngText == null || !latText.trim() || !lngText.trim()) return null;
  const lat = Number(latText), lng = Number(lngText);
  return inHcm(lat, lng) ? [lat, lng] : null;
}

async function readRainAt(points: Point[]): Promise<RainSample[]> {
  if (!points.length) return [];
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: points.map(p => p[0].toFixed(4)).join(","),
    longitude: points.map(p => p[1].toFixed(4)).join(","),
    current: "precipitation",
    timezone: "Asia/Ho_Chi_Minh",
    forecast_days: "1"
  }).toString();
  const response = await fetch(url, { next: { revalidate: 180 }, signal: AbortSignal.timeout(5500) });
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
  return extractPrecipitation(await response.json(), points.length);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const from = inputPoint(params, "from"), to = inputPoint(params, "to");
  if (!from || !to || haversineMeters(from, to) < 30 || haversineMeters(from, to) > 60_000) {
    return NextResponse.json({ error: "Chọn hai điểm khác nhau tại TP.HCM, cách nhau từ 30 m đến 60 km." }, { status: 400 });
  }

  // Reuse the existing traffic-aware, flood-aware routing service and avoid reimplementing credentials.
  const candidateUrl = new URL("http://citypass.internal/api/v1/routes");
  candidateUrl.search = new URLSearchParams({ from_lat: String(from[0]), from_lng: String(from[1]), to_lat: String(to[0]), to_lng: String(to[1]) }).toString();
  let base: CandidateResponse;
  try {
    const candidateResponse = await calculateCandidateRoutes(new NextRequest(candidateUrl));
    base = await candidateResponse.json() as CandidateResponse;
    if (!candidateResponse.ok) return NextResponse.json({ error: base.error ?? "Không lấy được đường từ nhà cung cấp định tuyến." }, { status: candidateResponse.status });
  } catch {
    return NextResponse.json({ error: "Dịch vụ tính tuyến chưa phản hồi. Vui lòng thử lại." }, { status: 503 });
  }
  const candidates = (base.routes ?? []).filter((r): r is RouteOption =>
    Array.isArray(r.geometry) && r.geometry.length >= 2 && r.geometry.length <= 25000 &&
    Number.isFinite(r.distance_m) && Number.isFinite(r.duration_s) && Number.isFinite(r.risk_score)
  ).slice(0, 4);
  if (!candidates.length) return NextResponse.json({ error: "Chưa tìm được tuyến hợp lệ giữa hai điểm." }, { status: 503 });
  const samplesByRoute = candidates.map(route => selectRouteSamples(route.geometry, 5));
  const flattened = samplesByRoute.flat();
  let rainSamples: RainSample[] = flattened.map(() => ({ mm: null, time: null }));
  let weatherAvailable = false;
  try {
    rainSamples = await readRainAt(flattened);
    weatherAvailable = rainSamples.some(row => row.mm !== null);
  } catch { /* Rain is unknown; never assume no rain. Traffic/flood comparison still works. */ }
  let offset = 0;
  const scored = candidates.map((route, i) => {
    const routeRain = rainSamples.slice(offset, offset + samplesByRoute[i].length);
    offset += samplesByRoute[i].length;
    return scoreJourneyRoute(route, routeRain, base.flood_data_available === true);
  });
  const ranked = compareJourneyRoutes(scored);
  return NextResponse.json({
    routes: ranked,
    selected_route_id: ranked[0]?.id ?? null,
    routing_provider: base.routing_provider ?? "Unknown",
    traffic_aware: base.traffic_aware === true,
    weather_available: weatherAvailable,
    flood_data_available: base.flood_data_available === true,
    checked_at: new Date().toISOString(),
    ranking_note: "Xếp hạng tương đối theo cảnh báo ngập đã ghi nhận, lượng mưa ước tính dọc tuyến và ETA giao thông; tuyến dài hơn vẫn có thể xếp trước.",
    warning: base.warning ?? null,
    disclaimer: "KHÔNG bảo đảm đường không ngập, hết mưa hoặc đi được bằng xe máy. Thiếu dữ liệu không có nghĩa là an toàn. Google Maps tự tính lại tuyến khi dẫn đường."
  }, { headers: { "Cache-Control": "private, no-store" } });
}
