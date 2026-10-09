import { NextResponse } from "next/server";
import { adminDb, readAuthorizedUser } from "@/lib/supabase/server";
import { pointIsValid } from "@/lib/config";
import { jsonError } from "@/lib/http";

function approvedPhotoUrl(value: unknown, userId: string): value is string | null {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string" || value.length > 1000) return false;
  try {
    const storageHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://invalid.local").host;
    const url = new URL(value);
    return url.protocol === "https:" && url.host === storageHost && url.pathname.startsWith(`/storage/v1/object/public/report-photos/${userId}/`) && !url.username && !url.password;
  } catch { return false; }
}
export async function POST(request: Request) {
  const user = await readAuthorizedUser(request);
  if (!user) return jsonError("Cần đăng nhập để báo cáo", 401);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError("JSON không hợp lệ"); }
  const { type, lat, lng, severity, note, photo_url } = body;
  if (type !== "FLOOD" && type !== "TRAFFIC_JAM") return jsonError("Loại báo cáo không hợp lệ");
  if (typeof lat !== "number" || typeof lng !== "number" || !pointIsValid(lat, lng)) return jsonError("Tọa độ không hợp lệ");
  if (typeof severity !== "number" || ![1, 2, 3].includes(severity) || !Number.isInteger(severity)) return jsonError("Mức độ chỉ nhận 1, 2 hoặc 3");
  if (typeof note !== "string" || note.trim().length < 10 || note.length > 500) return jsonError("Mô tả cần từ 10 đến 500 ký tự");
  if (!approvedPhotoUrl(photo_url, user)) return jsonError("Ảnh không thuộc Supabase Storage đã cấu hình");
  const db = adminDb();
  if (!db) return jsonError("Chưa kết nối cơ sở dữ liệu", 503);
  const { data, error } = await db.rpc("submit_community_report", { p_actor: user, p_type: type, p_lat: lat, p_lng: lng, p_severity: severity, p_note: note.trim(), p_photo_url: photo_url ?? null });
  if (error) return jsonError(error.message.includes("RATE_LIMIT") ? "Bạn đang báo cáo quá nhanh. Thử lại sau ít phút." : "Không tạo được báo cáo", error.message.includes("RATE_LIMIT") ? 429 : 400);
  return NextResponse.json({ id: data, status: "PENDING" }, { status: 201 });
}
