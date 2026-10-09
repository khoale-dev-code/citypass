import { NextRequest, NextResponse } from "next/server";
import { adminDb, isDatabaseReady } from "@/lib/supabase/server";
import { getNumber, haversineMeters, routeNearPoint } from "@/lib/config";
import { jsonError } from "@/lib/http";
import type { RouteOption } from "@/lib/types";
export const dynamic = "force-dynamic";
type UpstreamRoute = { distance: number; duration: number; geometry: { coordinates: [number, number][]; type: string } };
type Hazard = { id: string; severity: number; latitude: number; longitude: number; status: string; type?: string };
type Candidate = { distance: number; duration: number; coords: [number, number][]; delay?: number };

async function tomtomCandidates(from: [number, number], to: [number, number], key: string, vehicle: "motorcycle" | "car"): Promise<Candidate[]> {
  const url = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${from[0]},${from[1]}:${to[0]},${to[1]}/json`);
  url.search = new URLSearchParams({ key, traffic: "true", departAt: "now", routeType: "fastest", maxAlternatives: "2", travelMode: vehicle === "car" ? "car" : "motorcycle", routeRepresentation: "polyline" }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(8500), cache: "no-store" });
  if (!response.ok) throw Error(`TomTom Routing lỗi HTTP ${response.status}`);
  const body = await response.json() as { routes?: { summary?: { lengthInMeters?: number; travelTimeInSeconds?: number; trafficDelayInSeconds?: number }; legs?: { points?: { latitude: number; longitude: number }[] }[] }[] };
  if (!Array.isArray(body.routes)) throw Error("Không có kết quả TomTom");
  return body.routes.slice(0, 3).flatMap(route => {
    const summary = route.summary;
    const coords: [number, number][] = (route.legs ?? []).flatMap(leg => (leg.points ?? []).map(p => [p.latitude, p.longitude] as [number, number]));
    if (!summary || !Number.isFinite(summary.lengthInMeters) || !Number.isFinite(summary.travelTimeInSeconds) || coords.length < 2 || coords.some(p => !p.every(Number.isFinite))) return [];
    return [{ distance: summary.lengthInMeters!, duration: summary.travelTimeInSeconds!, coords, delay: summary.trafficDelayInSeconds }];
  });
}
async function osrmCandidates(from: [number, number], to: [number, number]): Promise<Candidate[]> {
  const upstream = process.env.ROUTING_BASE_URL || (process.env.NODE_ENV === "production" ? "" : "https://router.project-osrm.org");
  if (!upstream) throw Error("Chưa cấu hình ROUTING_BASE_URL; không thể chuyển sang chế độ định tuyến dự phòng.");
  let base: URL;
  try { base = new URL(upstream); if (base.protocol !== "https:" && base.hostname !== "localhost") throw Error(); }
  catch { throw Error("Máy chủ OSRM cấu hình không hợp lệ"); }
  const url = new URL(`/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}`, base);
  url.search = new URLSearchParams({ alternatives: "true", steps: "false", geometries: "geojson", overview: "full" }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(9000), cache: "no-store", headers: { "User-Agent": "CityPass/0.5 (traffic prototype)" } });
  if (!response.ok) throw Error("Dịch vụ OSRM đang tạm ngưng");
  const data = await response.json() as { code?: string; routes?: UpstreamRoute[] };
  if (data.code !== "Ok" || !Array.isArray(data.routes)) throw Error("Không tìm được tuyến đường");
  return data.routes.slice(0, 4).filter(r => Array.isArray(r.geometry?.coordinates) && r.geometry.coordinates.length > 1).map(r => ({
    distance: r.distance, duration: r.duration, coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])
  }));
}
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const vehicle = p.get("vehicle") ?? "motorcycle";
  if (vehicle !== "motorcycle" && vehicle !== "car") return jsonError("Phương tiện không hợp lệ", 400);
  const a = getNumber(p.get("from_lat"), -90, 90), b = getNumber(p.get("from_lng"), -180, 180);
  const c = getNumber(p.get("to_lat"), -90, 90), d = getNumber(p.get("to_lng"), -180, 180);
  if ([a,b,c,d].some(n => n === null)) return jsonError("Tọa độ không hợp lệ");
  const from: [number, number] = [a!, b!], to: [number, number] = [c!, d!];
  if (haversineMeters(from, to) > 60_000 || haversineMeters(from, to) < 30) return jsonError("Chỉ hỗ trợ tuyến 30 m đến 60 km trong MVP");
  let trafficAware = false;
  let warning = "OSRM ô tô dự phòng: không có giao thông trực tiếp và chưa xác nhận phù hợp xe máy.";
  let options: Candidate[] = [];
  const key = process.env.TOMTOM_API_KEY?.trim();
  if (key) {
    try {
      options = await tomtomCandidates(from, to, key, vehicle);
      if (!options.length) throw Error("TomTom không trả tuyến hợp lệ");
      trafficAware = true; warning = "TomTom xe máy (beta): ETA có xét giao thông; có thể thiếu dữ liệu giới hạn đường, không bảo đảm tránh ngập.";
    } catch { warning = "TomTom xe máy chưa sẵn sàng; dùng OSRM ô tô dự phòng, KHÔNG có ETA theo kẹt xe."; }
  }
  try {
    if (!options.length) options = await osrmCandidates(from, to);
    let hazards: Hazard[] = [];
    if (isDatabaseReady) {
      const db = adminDb();
      const midpoint: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
      const radius = Math.min(30, haversineMeters(from, to) / 1000 + 5);
      const { data, error } = await db!.rpc("nearby_incidents", { p_lat: midpoint[0], p_lng: midpoint[1], p_radius_km: radius });
      if (error) throw Error("Không truy vấn được dữ liệu ngập để đánh giá tuyến. Không thể so sánh rủi ro.");
      hazards = (data ?? []) as Hazard[];
    }
    const routes: RouteOption[] = options.map((r, i) => {
      const near = hazards.filter(h => h.type === "FLOOD" && routeNearPoint(r.coords, [Number(h.latitude), Number(h.longitude)]));
      const risk_score = near.reduce((sum, h) => sum + h.severity * (h.status === "PENDING" ? 0.5 : 1), 0);
      return { id: `route-${i}`, distance_m: r.distance, duration_s: r.duration, geometry: r.coords, risk_count: near.length, risk_score, nearby_incidents: near.map(h => h.id), traffic_delay_s: trafficAware && typeof r.delay === "number" ? r.delay : undefined };
    });
    // Flood risk always takes precedence over ETA when reliable incident data exist.
    routes.sort((x, y) => x.risk_score - y.risk_score || x.duration_s - y.duration_s);
    return NextResponse.json({ routes, traffic_aware: trafficAware, routing_provider: trafficAware ? `TomTom Traffic (${vehicle})` : "OSRM driving fallback", warning, flood_data_available: isDatabaseReady, disclaimer: "Không bảo đảm tuyến an toàn hoặc không ngập. TomTom xe máy đang thử nghiệm; OSRM dự phòng dùng hồ sơ ô tô." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error instanceof Error ? error.message : "Dịch vụ định tuyến chưa sẵn sàng", 503); }
}
