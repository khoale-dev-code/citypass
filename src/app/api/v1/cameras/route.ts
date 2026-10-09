import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/server";
import { getNumber } from "@/lib/config";
import { jsonError } from "@/lib/http";
import { CAMERA_SHEET_GID, CAMERA_SHEET_ID, nearbyPublicCameras, parseCameraSheet } from "@/lib/camera-catalog";
import type { Camera } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Public source is best-effort and can be disabled without affecting the map. */
async function getPublicCameras(lat: number, lng: number, radiusKm: number): Promise<Camera[]> {
  if (process.env.CITYPASS_PUBLIC_CAMERAS === "false") return [];
  const uri = `https://docs.google.com/spreadsheets/d/${CAMERA_SHEET_ID}/gviz/tq?tqx=out:json&gid=${CAMERA_SHEET_GID}`;
  const response = await fetch(uri, { next: { revalidate: 60 }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Camera catalog unavailable (${response.status})`);
  const text = await response.text();
  return nearbyPublicCameras(parseCameraSheet(text), lat, lng, radiusKm);
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const lat = getNumber(q.get("lat"), -90, 90), lng = getNumber(q.get("lng"), -180, 180);
  const radius = q.has("radius_km") ? getNumber(q.get("radius_km"), .1, 30) : 5;
  if (lat === null || lng === null || radius === null) return jsonError("Tọa độ / bán kính không hợp lệ");

  // Data from the city's own database, if configured, is independent of the external sheet.
  const db = adminDb();
  const [publicResult, databaseResult] = await Promise.allSettled([
    getPublicCameras(lat, lng, radius),
    db ? db.rpc("nearby_cameras", { p_lat: lat, p_lng: lng, p_radius_km: radius }) : Promise.resolve({ data: [] as Camera[], error: null })
  ]);
  const publicCameras = publicResult.status === "fulfilled" ? publicResult.value : [];
  const fromDb = databaseResult.status === "fulfilled" && !databaseResult.value.error
    ? (databaseResult.value.data ?? []) as Camera[] : [];
  const cameras = [...fromDb, ...publicCameras];
  const warning = publicResult.status === "rejected"
    ? "Danh sách camera công khai tạm thời không truy cập được hoặc không cho phép đọc. Thử lại sau."
    : databaseResult.status === "rejected" || databaseResult.value.error
      ? "Không tải được một phần camera từ cơ sở dữ liệu."
      : null;
  return NextResponse.json({ cameras, mode: db ? "mixed" : "public_snapshots", warning }, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=30" }
  });
}
