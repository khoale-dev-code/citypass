"use client";
import { useEffect, useRef, useState } from "react";
import { CloudRain, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";
import type { Verification } from "@/lib/weather-verification";

type Report = Verification & { checked_at: string; coordinate: { lat: number; lng: number }; sources_configured: { openweather: boolean } };
const SOURCES = [
  { name: "KTTV Quốc gia", detail: "Cảnh báo mưa lớn và dự báo chính thức", url: "https://www.nchmf.gov.vn/kttv/" },
  { name: "VNDMS", detail: "Trạm mưa, mực nước, cảnh báo thiên tai", url: "https://vndms.gov.vn/" },
  { name: "Phòng chống thiên tai TP.HCM", detail: "Thông báo thủy văn và thiên tai địa phương", url: "https://www.phongchonglutbaotphcm.gov.vn/" },
  { name: "Giao thông TP.HCM", detail: "Bản đồ giao thông, sự cố và camera", url: "https://giaothong.hochiminhcity.gov.vn/" },
  { name: "Thông tin TP.HCM", detail: "Bài đăng cộng đồng/cơ quan: cần xác minh từng tin", url: "https://www.facebook.com/thongtinhochiminhcity/" }
] as const;

export default function OfficialWeatherPanel({ lat, lng }: { lat: number; lng: number }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  const location = `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
  async function verify() {
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    setBusy(true); setMessage(""); setReport(null);
    try {
      const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
      const response = await fetch(`/api/v1/weather/verify?${params}`, { signal: controller.signal });
      const result = await response.json() as Report & { error?: string };
      if (!response.ok) throw new Error(result.error || "Không kiểm tra được thời tiết.");
      if (!controller.signal.aborted) setReport(result);
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Không thể kết nối.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className="citypass-official-shell" aria-label="Đối chiếu mưa và nguồn chính thức">
    <button type="button" className="citypass-official-expander" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      <CloudRain size={18} aria-hidden="true"/><strong>Đối chiếu thời tiết & cảnh báo chính thức</strong><span>{expanded ? "Thu gọn ▲" : "Mở tra cứu ▼"}</span>
    </button>
    {expanded && <div className="citypass-official-content">
      <div className="citypass-official-left">
        <p>Kiểm tra tại vùng gần <strong>{location}</strong> (độ phân giải xấp xỉ 1 km). Di chuyển bản đồ hoặc chọn đường rồi bấm kiểm tra.</p>
        <button type="button" className="citypass-official-check" disabled={busy} onClick={() => void verify()}><RefreshCw size={15} /> {busy ? "Đang đối chiếu..." : "So sánh hai nguồn mưa"}</button>
        {message && <p className="citypass-official-warning" role="alert">{message}</p>}
        {report && <div className="citypass-official-verdict" role="status"><strong>{report.label}</strong><p>{report.detail}</p><div className="citypass-official-evidence">{report.evidence.map(item => <div key={item.source}><b>{item.source}</b><span>{item.description}</span><small>{item.checkedAt ? new Date(item.checkedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "Không rõ thời gian"}</small></div>)}</div>{!report.sources_configured.openweather && <small>Chưa cấu hình OPENWEATHER_API_KEY: chỉ một nguồn mưa được dùng để đối chiếu.</small>}</div>}
      </div>
      <div className="citypass-official-right">
        <strong><ShieldAlert size={16}/> Nguồn cảnh báo để tự kiểm chứng</strong>
        <div className="citypass-official-links">{SOURCES.map(source => <a key={source.url} href={source.url} rel="noopener noreferrer" target="_blank"><b>{source.name}<ExternalLink size={12}/></b><small>{source.detail}</small></a>)}</div>
        <small>Chưa kết nối API cảnh báo chính thức của các cổng trên. Các trang này là liên kết tham khảo, không phải tín hiệu ngập từng đường do CityPass xác minh.</small>
      </div>
    </div>}
  </section>;
}
