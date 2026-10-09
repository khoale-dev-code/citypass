import { NextRequest, NextResponse } from "next/server";
import { adminDb, isDatabaseReady } from "@/lib/supabase/server";
import { DEMO_INCIDENTS } from "@/lib/demo";
import { getNumber, haversineMeters } from "@/lib/config";
import { jsonError, noStoreHeaders } from "@/lib/http";
import type { Incident, IncidentStatus, IncidentType, IncidentSource } from "@/lib/types";

export const dynamic = "force-dynamic";
type Row = {
  id: string; type: IncidentType; severity: 1 | 2 | 3; title: string;
  description: string | null; water_depth_cm: number | null; latitude: number; longitude: number;
  source: IncidentSource; sensor_id: string | null; status: IncidentStatus;
  photo_url: string | null; confirms: number; rejects: number;
  created_at: string; expires_at: string | null;
};
function serialize(row: Row): Incident {
  return {
    id: row.id, type: row.type, severity: row.severity, title: row.title,
    description: row.description, water_depth_cm: row.water_depth_cm,
    geometry: { type: "Point", coordinates: [Number(row.longitude), Number(row.latitude)] },
    source: row.source, sensor_id: row.sensor_id, status: row.status,
    photo_url: row.photo_url, crowd_verifications: { confirms: Number(row.confirms), rejects: Number(row.rejects) },
    created_at: row.created_at, expires_at: row.expires_at
  };
}
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const lat = getNumber(p.get("lat"), -90, 90), lng = getNumber(p.get("lng"), -180, 180);
  const radius = p.has("radius_km") ? getNumber(p.get("radius_km"), .1, 30) : 5;
  if (lat === null || lng === null || radius === null) return jsonError("Tọa độ hoặc bán kính không hợp lệ");
  if (!isDatabaseReady) return NextResponse.json({ mode: "demo", incidents: DEMO_INCIDENTS.filter(x => haversineMeters([lat, lng], [x.geometry.coordinates[1], x.geometry.coordinates[0]]) <= radius * 1000) }, { headers: noStoreHeaders });
  const db = adminDb();
  if (!db) return jsonError("Cơ sở dữ liệu chưa sẵn sàng", 503);
  const { data, error } = await db.rpc("nearby_incidents", { p_lat: lat, p_lng: lng, p_radius_km: radius });
  if (error) return jsonError("Không truy vấn được sự cố. Kiểm tra migration Supabase.", 503);
  return NextResponse.json({ mode: "live", incidents: ((data ?? []) as Row[]).map(serialize) }, { headers: noStoreHeaders });
}
