import { NextRequest, NextResponse } from "next/server";
import { adminDb, isDatabaseReady } from "@/lib/supabase/server";
import { haversineMeters } from "@/lib/config";
import { classifyFlow } from "@/lib/traffic";
import { classifyModelRain, inHcm } from "@/lib/road-insight";
import { CAMERA_SHEET_GID, CAMERA_SHEET_ID, nearbyPublicCameras, parseCameraSheet } from "@/lib/camera-catalog";

export const dynamic = "force-dynamic";
type Choice = "traffic" | "rain" | "flood" | "camera";
type Result = { state: "ok" | "warning" | "unknown"; label: string; detail: string; updated_at: string | null; source: string; items?: { title: string; image_url: string | null }[] };
type IncidentRow = { type?: string; status?: string; latitude?: number; longitude?: number; severity?: number; water_depth_cm?: number | null; created_at?: string };
const TIMEOUT = 6000;
const allowed = new Set<Choice>(["traffic", "rain", "flood", "camera"]);
function round(num: number, decimalPlaces = 2) { return Number(num.toFixed(decimalPlaces)); }
function failure(source: string, detail: string): Result { return { state: "unknown", label: "Chưa có dữ liệu", detail, updated_at: null, source }; }

async function getTraffic(lat: number, lng: number): Promise<Result> {
  const key = process.env.TOMTOM_API_KEY?.trim();
  if (!key) return failure("TomTom Traffic", "Chưa cấu hình TOMTOM_API_KEY.");
  const url = new URL("https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/14/json");
  url.search = new URLSearchParams({ point: `${lat},${lng}`, unit: "kmph", key }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
    if (!response.ok) return failure("TomTom Traffic", `Không lấy được mẫu giao thông (HTTP ${response.status}).`);
    const raw = await response.json() as { flowSegmentData?: { currentSpeed?: number; freeFlowSpeed?: number; roadClosure?: boolean; confidence?: number } };
    const f = raw.flowSegmentData;
    if (!f || typeof f.currentSpeed !== "number" || typeof f.freeFlowSpeed !== "number") return failure("TomTom Traffic", "Không nhận được tốc độ cho đoạn đường gần vị trí chọn.");
    const flow = classifyFlow(f.currentSpeed, f.freeFlowSpeed, f.roadClosure === true);
    if (!flow) return failure("TomTom Traffic", "Tốc độ trả về không hợp lệ.");
    return {
      state: flow.level === "clear" ? "ok" : "warning",
      label: flow.label,
      detail: `Mẫu đoạn đường gần điểm chọn: ${round(f.currentSpeed, 0)}/${round(f.freeFlowSpeed, 0)} km/h (hiện tại/bình thường). Không đại diện toàn bộ tuyến.`,
      updated_at: new Date().toISOString(), source: "TomTom Traffic Flow"
    };
  } catch { return failure("TomTom Traffic", "Nguồn giao thông đang chậm hoặc lỗi kết nối."); }
}

async function getRain(lat: number, lng: number): Promise<Result> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(round(lat, 3)), longitude: String(round(lng, 3)),
    current: "precipitation,rain,temperature_2m,cloud_cover", timezone: "Asia/Ho_Chi_Minh", forecast_days: "1"
  }).toString();
  try {
    const response = await fetch(url, { next: { revalidate: 240 }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!response.ok) return failure("Open-Meteo", `Dự báo thời tiết tạm lỗi (HTTP ${response.status}).`);
    const raw = await response.json() as { current?: { precipitation?: number; rain?: number; cloud_cover?: number; time?: string } };
    const current = raw.current;
    if (!current || typeof current.precipitation !== "number") return failure("Open-Meteo", "Chưa nhận được ước tính mưa tại vị trí chọn.");
    const rain = current.precipitation;
    const rainSignal = classifyModelRain(rain);
    if (rainSignal === "unknown") return failure("Open-Meteo", "Dữ liệu mưa không hợp lệ.");
    const isRain = rainSignal === "rain";
    return {
      state: isRain ? "warning" : "ok", label: isRain ? "Mô hình có tín hiệu mưa" : "Mô hình chưa thấy mưa",
      detail: `Mưa ước tính ${round(rain)} mm theo bước thời gian của mô hình; mây ${typeof current.cloud_cover === "number" ? round(current.cloud_cover, 0) + "%" : "không rõ"}. KHÔNG phải trạm mưa tại đường này.`,
      updated_at: current.time ? `${current.time}+07:00` : null, source: "Open-Meteo · dữ liệu mô hình"
    };
  } catch { return failure("Open-Meteo", "Không kết nối được nguồn dự báo mưa."); }
}

async function getFlood(lat: number, lng: number): Promise<Result> {
  if (!isDatabaseReady) return failure("CityPass / Supabase", "Chưa có nguồn ngập thực tế. Điểm ngập mô phỏng không được sử dụng để kết luận.");
  try {
    const db = adminDb();
    if (!db) return failure("CityPass / Supabase", "Chưa kết nối được cơ sở dữ liệu ngập.");
    const { data, error } = await db.rpc("nearby_incidents", { p_lat: lat, p_lng: lng, p_radius_km: 0.6 });
    if (error) return failure("CityPass / Supabase", "Lỗi truy vấn cảnh báo ngập khu vực.");
    const reports = ((data ?? []) as IncidentRow[]).filter(item => item.type === "FLOOD" && typeof item.latitude === "number" && typeof item.longitude === "number" && haversineMeters([lat, lng], [item.latitude, item.longitude]) <= 600);
    const credible = reports.filter(item => item.status === "VERIFIED" || item.status === "ACTIVE");
    const pending = reports.filter(item => item.status === "PENDING");
    if (credible.length) return { state: "warning", label: "Có cảnh báo ngập gần đây", detail: `${credible.length} cảnh báo cảm biến/đã xác minh trong bán kính 600 m; tình trạng tại toàn bộ tuyến vẫn có thể khác.`, source: "CityPass · báo cáo và cảm biến", updated_at: credible[0].created_at ?? null };
    if (pending.length) return { state: "warning", label: "Có báo cáo chưa xác minh", detail: `${pending.length} báo cáo cộng đồng chưa xác minh trong 600 m; không suy ra mực nước thật.`, source: "CityPass · báo cáo cộng đồng", updated_at: pending[0].created_at ?? null };
    return failure("CityPass / Supabase", "Không có cảnh báo trong dữ liệu hiện có bán kính 600 m; CHƯA đủ cơ sở kết luận đường không ngập.");
  } catch { return failure("CityPass / Supabase", "Không đọc được nguồn cảnh báo ngập tại điểm chọn."); }
}

async function getCamera(lat: number, lng: number): Promise<Result> {
  if (process.env.CITYPASS_PUBLIC_CAMERAS === "false") return failure("Danh mục camera công khai", "Nguồn camera công khai đang bị tắt trong cấu hình.");
  try {
    const uri = `https://docs.google.com/spreadsheets/d/${CAMERA_SHEET_ID}/gviz/tq?tqx=out:json&gid=${CAMERA_SHEET_GID}`;
    const res = await fetch(uri, { next: { revalidate: 120 }, signal: AbortSignal.timeout(4500) });
    if (!res.ok) return failure("Camera công khai", "Không truy cập được danh sách camera lúc này.");
    const nearby = nearbyPublicCameras(parseCameraSheet(await res.text()), lat, lng, 1).slice(0, 3);
    if (!nearby.length) return failure("Danh mục camera công khai", "Không tìm thấy camera trong bán kính 1 km.");
    return { state: "ok", label: `Có ${nearby.length} camera gần vị trí`, detail: "Có thể mở ảnh camera để tự quan sát. CityPass chưa có AI xác minh kẹt xe/ngập từ ảnh; ảnh có thể cũ hoặc lỗi.", source: "Camera công khai (danh mục ngoài)", updated_at: null,
      items: nearby.map(item => ({ title: item.title, image_url: item.snapshot_url || null })) };
  } catch { return failure("Camera công khai", "Danh mục camera phản hồi chậm hoặc tạm ngừng."); }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const lat = Number(q.get("lat")), lng = Number(q.get("lng"));
  const chosen = (q.get("checks") || "").split(",").filter((x): x is Choice => allowed.has(x as Choice));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inHcm(lat, lng) || !chosen.length || chosen.length > 4) {
    return NextResponse.json({ error: "Vị trí hoặc mục kiểm tra không hợp lệ." }, { status: 400 });
  }
  const tasks = {
    traffic: () => getTraffic(lat, lng), rain: () => getRain(lat, lng),
    flood: () => getFlood(lat, lng), camera: () => getCamera(lat, lng)
  };
  const unique = [...new Set(chosen)];
  const settled = await Promise.allSettled(unique.map(async name => [name, await tasks[name]()] as const));
  const checks: Partial<Record<Choice, Result>> = {};
  for (let i = 0; i < unique.length; i++) {
    const result = settled[i];
    checks[unique[i]] = result.status === "fulfilled" ? result.value[1] : failure("CityPass", "Nguồn dữ liệu không phản hồi.");
  }
  return NextResponse.json({
    location: { lat, lng }, checked_at: new Date().toISOString(), radius_note: "Chỉ đánh giá gần điểm tọa độ được chọn, không bao phủ toàn bộ con đường.", checks
  }, { headers: { "Cache-Control": "private, max-age=25" } });
}
