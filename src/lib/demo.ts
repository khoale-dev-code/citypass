import type { Incident } from "./types";
// MẪU HOÀN TOÀN HƯ CẤU, KHÔNG PHẢI MỰC NƯỚC / SỰ CỐ ĐANG DIỄN RA.
const samples: Array<[string, number, number, 1 | 2 | 3, number]> = [
  ["Điểm minh hoạ tại Quận 1", 10.7746, 106.7023, 1, 14],
  ["Điểm minh hoạ tại Bình Thạnh", 10.8011, 106.7152, 3, 42],
  ["Điểm minh hoạ tại Thủ Đức", 10.8275, 106.7611, 2, 26],
  ["Điểm minh hoạ tại Quận 7", 10.7338, 106.7229, 2, 22],
  ["Điểm minh hoạ tại Phú Nhuận", 10.7955, 106.6815, 1, 12],
  ["Điểm minh hoạ tại Tân Bình", 10.8127, 106.6631, 3, 39]
];
export const DEMO_INCIDENTS: Incident[] = samples.map(([title, lat, lng, severity, cm], i) => ({
  id: `demo-${i + 1}`, type: "FLOOD", severity: severity as 1 | 2 | 3,
  status: "PENDING", title: title as string, description: "Dữ liệu hư cấu để kiểm thử giao diện, không dùng quyết định di chuyển.",
  water_depth_cm: cm as number,
  geometry: { type: "Point", coordinates: [lng as number, lat as number] },
  source: "COMMUNITY", crowd_verifications: { confirms: 0, rejects: 0 },
  created_at: new Date("2026-10-01T00:00:00.000Z").toISOString(), expires_at: null, is_demo: true
}));
