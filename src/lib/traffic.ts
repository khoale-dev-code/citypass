/** CityPass traffic samples: point readings on nearest road, NOT district-wide measurements. */
export const TRAFFIC_POINTS = [
  { id: "q1", name: "Quận 1 · Nguyễn Thị Minh Khai", lat: 10.7828, lng: 106.6969 },
  { id: "q3", name: "Quận 3 · Điện Biên Phủ", lat: 10.7828, lng: 106.6781 },
  { id: "binhthanh", name: "Bình Thạnh · Điện Biên Phủ", lat: 10.8012, lng: 106.7118 },
  { id: "phunhuan", name: "Phú Nhuận · Phan Đăng Lưu", lat: 10.7992, lng: 106.6849 },
  { id: "tanbinh", name: "Tân Bình · Cộng Hòa", lat: 10.8018, lng: 106.6539 },
  { id: "q10", name: "Quận 10 · Lý Thường Kiệt", lat: 10.7769, lng: 106.6613 },
  { id: "q5", name: "Quận 5 · Trần Hưng Đạo", lat: 10.7528, lng: 106.6652 },
  { id: "q7", name: "Quận 7 · Nguyễn Văn Linh", lat: 10.7289, lng: 106.7151 },
  { id: "thuduc", name: "Thủ Đức · Võ Nguyên Giáp", lat: 10.8313, lng: 106.7594 },
  { id: "q12", name: "Quận 12 · Trường Chinh", lat: 10.8366, lng: 106.6286 },
] as const;
export type TrafficLevel = "clear" | "slow" | "jam" | "heavy" | "closed";
export interface TrafficPoint {
  id: string; name: string; lat: number; lng: number;
  currentSpeed: number; freeFlowSpeed: number;
  ratio: number; level: TrafficLevel; label: string;
  updatedAt: string;
}
export interface TrafficAreaResponse {
  configured: boolean; points: TrafficPoint[]; updated_at: string | null;
  source: string; error?: string;
}
export function classifyFlow(speed: number, freeFlow: number, isClosed = false): { level: TrafficLevel; label: string; ratio: number } | null {
  if (isClosed) return { level: "closed", label: "Đóng đường (theo nguồn)", ratio: 0 };
  if (!Number.isFinite(speed) || !Number.isFinite(freeFlow) || speed < 0 || freeFlow <= 0) return null;
  const ratio = Math.min(1, speed / freeFlow);
  if (ratio < 0.25) return { level: "heavy", label: "Ùn tắc nặng", ratio };
  if (ratio < 0.5) return { level: "jam", label: "Ùn tắc", ratio };
  if (ratio < 0.75) return { level: "slow", label: "Di chuyển chậm", ratio };
  return { level: "clear", label: "Thông thoáng", ratio };
}
export function parseFlow(point: (typeof TRAFFIC_POINTS)[number], json: unknown): TrafficPoint | null {
  if (!json || typeof json !== "object" || !("flowSegmentData" in json)) return null;
  const flow = (json as { flowSegmentData?: unknown }).flowSegmentData;
  if (!flow || typeof flow !== "object") return null;
  const data = flow as { currentSpeed?: unknown; freeFlowSpeed?: unknown; roadClosure?: unknown };
  if (typeof data.currentSpeed !== "number" || typeof data.freeFlowSpeed !== "number") return null;
  const state = classifyFlow(data.currentSpeed, data.freeFlowSpeed, data.roadClosure === true);
  if (!state) return null;
  return { ...point, currentSpeed: data.currentSpeed, freeFlowSpeed: data.freeFlowSpeed, ...state, updatedAt: new Date().toISOString() };
}
