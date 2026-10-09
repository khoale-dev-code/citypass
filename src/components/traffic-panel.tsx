"use client";
import { CarFront, RefreshCw } from "lucide-react";
import type { TrafficAreaResponse, TrafficPoint } from "@/lib/traffic";
type Props = { data: TrafficAreaResponse | null; loading: boolean; error: string; selectedId: string | null; onSelect: (point: TrafficPoint) => void; onReload: () => void };
export default function TrafficPanel({ data, loading, error, selectedId, onSelect, onReload }: Props) {
  return <section className="traffic-areas-panel" aria-label="Mức độ giao thông tại các điểm khảo sát">
    <div className="section-row" style={{ margin: 0 }}><span className="section-title"><CarFront size={15} style={{ display: "inline", verticalAlign: "middle" }} /> Tình trạng giao thông</span><button className="btn" aria-label="Làm mới giao thông" onClick={onReload} style={{ padding: "6px 9px" }}><RefreshCw size={15}/></button></div>
    <p className="traffic-hint">Dữ liệu gần thời gian thực từ đoạn đường gần điểm đo, cập nhật tối đa mỗi 90 giây. Không đại diện cho cả quận.</p>
    {loading && !data && <p className="traffic-hint">Đang tải tốc độ giao thông…</p>}
    {(error || data?.error) && <p className="notice-error" role="status">{error || data?.error}</p>}
    {data?.configured === false && <p className="traffic-hint">Để xem mật độ giao thông và chọn tuyến có xét kẹt xe, cần thêm <code>TOMTOM_API_KEY</code> vào <code>.env.local</code>.</p>}
    {data?.points && data.points.length > 0 && <>
      <div className="traffic-area-list">{data.points.map(item => <button key={item.id} className={`traffic-area-item ${selectedId === item.id ? "active" : ""}`} onClick={() => onSelect(item)}><span className={`traffic-spot ${item.level}`} aria-hidden="true"/><span><strong>{item.name}</strong><small>{item.label} · {item.currentSpeed} / {item.freeFlowSpeed} km/h</small></span></button>)}</div>
      <p className="traffic-hint">Các điểm chỉ là mẫu tốc độ đoạn đường gần nhất; một tuyến phố khác trong cùng khu vực có thể khác hẳn.</p>
    </>}
  </section>;
}
