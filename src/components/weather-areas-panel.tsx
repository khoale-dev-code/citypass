"use client";
import { Cloud, CloudRain, CloudSun, RefreshCw, Sun } from "lucide-react";
import type { WeatherArea } from "@/lib/weather-areas";

type Props = {
  areas: WeatherArea[];
  selectedId: string | null;
  updatedAt: string | null;
  loading: boolean;
  error: string;
  onSelect: (area: WeatherArea) => void;
  onReload: () => void;
};
const displayTime = (value: string) => {
  const [date, time] = value.split("T");
  return date && time ? `${time.slice(0, 5)} · ${date.split("-").reverse().join("/")}` : value;
};
export default function WeatherAreasPanel({ areas, selectedId, updatedAt, loading, error, onSelect, onReload }: Props) {
  const rain = areas.filter(a => a.condition === "rain").length;
  const clear = areas.filter(a => a.condition === "clear").length;
  const ordered = [...areas].sort((a, b) => (b.condition === "rain" ? 1 : 0) - (a.condition === "rain" ? 1 : 0) || b.precipitationMm - a.precipitationMm || a.name.localeCompare(b.name, "vi"));
  return <section className="weather-areas-panel" aria-label="Thời tiết mô hình tại các khu vực TP.HCM">
    <div className="weather-areas-header"><div><strong>Thời tiết từng khu vực</strong><span>Ước tính hiện tại · cập nhật mỗi 5 phút</span></div>
      <button type="button" className="icon-inline" aria-label="Làm mới thời tiết" onClick={onReload} disabled={loading}><RefreshCw size={16} /></button>
    </div>
    {loading && !areas.length && <p className="weather-areas-message" role="status">Đang tải thời tiết các khu vực…</p>}
    {error && <p className="weather-areas-error" role="alert">{error} <button type="button" onClick={onReload}>Thử lại</button></p>}
    {!!areas.length && <>
      <div className="weather-counts"><span><CloudRain size={15} /> <b>{rain}</b> vùng có tín hiệu mưa</span><span><Sun size={15} /> <b>{clear}</b> vùng ít mây/quang</span></div>
      <div className="weather-areas-list">{ordered.map(area => <button key={area.id} type="button" onClick={() => onSelect(area)} className={`weather-area-row ${selectedId === area.id ? "active" : ""}`}>
        <span className={`weather-area-icon ${area.condition}`}>{area.condition === "rain" ? <CloudRain size={18} /> : area.condition === "cloud" ? <Cloud size={18} /> : area.isDay ? <CloudSun size={18} /> : <Sun size={18} />}</span>
        <span className="weather-area-name"><b>{area.name}</b><small>{area.conditionLabel} · Mưa {area.precipitationMm.toFixed(1)} mm / 15 phút</small></span>
        <span className="weather-area-temp">{Math.round(area.temperatureC)}°</span>
      </button>)}</div>
      <p className="weather-areas-foot">Giờ mô hình: {displayTime(areas[0].time)} (TP.HCM). {updatedAt ? `Tải lúc ${new Date(updatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}.` : ""}</p>
    </>}
    <p className="weather-areas-disclaimer">Dữ liệu <b>mô hình Open-Meteo</b>, không phải quan trắc mưa từng con đường. Khu vực ít mây không có nghĩa chắc chắn không mưa.</p>
  </section>;
}
