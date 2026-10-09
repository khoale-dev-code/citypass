import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/server";
import { floodSeverity, SENSOR_TTL_MINUTES } from "@/lib/config";
import { parseAfscPayload } from "@/lib/afsc/adapter";
import { jsonError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) return jsonError("Không được phép", 401);
  const endpoint = process.env.AFSC_API_URL, token = process.env.AFSC_API_TOKEN;
  const db = adminDb();
  if (!endpoint || !token || !db) return jsonError("Chưa thiết lập AFSC hoặc cơ sở dữ liệu", 503);
  let url: URL;
  try { url = new URL(endpoint); if (url.protocol !== "https:") throw Error(); }
  catch { return jsonError("AFSC_API_URL phải là HTTPS", 503); }
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!response.ok) throw Error("Không nhận được dữ liệu cảm biến");
    const readings = parseAfscPayload(await response.json());
    if (readings.length > 2000) return jsonError("Quá nhiều mẫu cảm biến trong một lượt", 413);
    let updated = 0, cleared = 0;
    for (const r of readings) {
      if (r.observed_at) {
        const ageMs = Date.now() - Date.parse(r.observed_at);
        if (ageMs > 15 * 60_000 || ageMs < -5 * 60_000) continue;
      }
      const severity = floodSeverity(r.water_level_cm);
      if (severity === 0) {
        const { error } = await db.from("incidents").update({ status: "HIDDEN", expires_at: new Date().toISOString() }).eq("sensor_id", r.sensor_id);
        if (error) throw error;
        cleared++;
        continue;
      }
      const { error } = await db.from("incidents").upsert({
        sensor_id: r.sensor_id, type: "FLOOD", severity, water_depth_cm: r.water_level_cm,
        latitude: r.lat, longitude: r.lng, source: "AFSC_SENSOR", status: "ACTIVE",
        title: `Điểm đo ${r.sensor_id}`, description: "Ghi nhận từ nguồn cảm biến đã cấu hình", created_at: r.observed_at || new Date().toISOString(),
        expires_at: new Date(Date.now() + SENSOR_TTL_MINUTES * 60_000).toISOString()
      }, { onConflict: "sensor_id" });
      if (error) throw error;
      updated++;
    }
    return NextResponse.json({ ok: true, updated, cleared, received: readings.length });
  } catch (error) { console.error("AFSC ingest failed", error); return jsonError("Không thể đồng bộ dữ liệu cảm biến. Kiểm tra định dạng API và quyền truy cập.", 502); }
}
