import { NextResponse } from "next/server";
import { adminDb, readAuthorizedUser } from "@/lib/supabase/server";
import { pointIsValid } from "@/lib/config";
import { jsonError } from "@/lib/http";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await readAuthorizedUser(request);
  if (!actor) return jsonError("Cần đăng nhập để xác minh", 401);
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("ID không hợp lệ");
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonError("JSON không hợp lệ"); }
  const { vote_type, lat, lng, accuracy_m } = body;
  if (vote_type !== "confirm" && vote_type !== "false_alarm") return jsonError("Phiếu không hợp lệ");
  if (typeof lat !== "number" || typeof lng !== "number" || !pointIsValid(lat, lng)) return jsonError("Cần tọa độ GPS hợp lệ");
  if (typeof accuracy_m !== "number" || !Number.isFinite(accuracy_m) || accuracy_m < 0 || accuracy_m > 100) return jsonError("Cần GPS độ chính xác tối đa 100 m");
  const db = adminDb();
  if (!db) return jsonError("Chưa kết nối cơ sở dữ liệu", 503);
  const { data, error } = await db.rpc("verify_community_report", { p_actor: actor, p_report_id: id, p_vote_type: vote_type, p_lat: lat, p_lng: lng, p_accuracy_m: accuracy_m });
  if (error) return jsonError(error.message.includes("duplicate key") ? "Bạn đã xác minh điểm này." : "Không chấp nhận phiếu: chỉ người dùng ở gần, không phải tác giả, chưa bỏ phiếu và còn trong thời hạn mới được xác minh.", 400);
  return NextResponse.json({ status: data?.status ?? "PENDING", ok: true });
}
