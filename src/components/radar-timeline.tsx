"use client";
import { RefreshCw, CloudRain } from "lucide-react";
import type { RadarFrame } from "@/lib/radar";

type Props = {
  frames: RadarFrame[];
  index: number;
  opacity: number;
  playing: boolean;
  error: string;
  onIndex: (index: number) => void;
  onOpacity: (value: number) => void;
  onPlaying: (value: boolean) => void;
  onReload: () => void;
  modelAreaCount?: number;
  modeledRainCount?: number;
};

/** Weather model estimates are not historical radar observations. */
export default function RadarTimeline({ frames, opacity, onOpacity, onReload, modelAreaCount = 0, modeledRainCount = 0 }: Props) {
  const hasTiles = frames.length > 0;
  return <section className="radar-panel" aria-label="Lớp lượng mưa ước tính">
    <div className="radar-header">
      <span className="radar-title"><CloudRain size={17} /> Vùng mưa ước tính</span>
      <button type="button" className="icon-inline" title="Làm mới lớp mưa" aria-label="Làm mới lớp mưa" onClick={onReload}><RefreshCw size={16} /></button>
    </div>
    {hasTiles ? <>
      <p className="radar-subtitle">Nguồn: OpenWeatherMap Maps 1.0 (lượng mưa dạng ảnh màu). Không phải radar quan sát thực địa.</p>
      <p className="radar-disclaimer">Đây là lớp dữ liệu ước tính cập nhật theo nhà cung cấp. Không dùng để kết luận đường có ngập.</p>
    </> : <>
      <p className="radar-subtitle">Nguồn: Open-Meteo. Không cần khóa API. CityPass vẽ vùng mưa xung quanh các điểm dự báo trong TP.HCM.</p>
      <p className="radar-disclaimer">{modelAreaCount ? `Đang có dữ liệu cho ${modelAreaCount} khu vực, trong đó ${modeledRainCount} khu vực có tín hiệu mưa mô hình.` : "Đang tải dữ liệu khu vực hoặc nguồn thời tiết tạm thời không sẵn sàng."}</p>
      <p className="radar-disclaimer">Các vùng tô màu chỉ minh họa khu vực lân cận điểm ước tính; không phải ảnh radar và không xác nhận mưa trên từng tuyến đường.</p>
    </>}
    <label className="radar-opacity">Độ đậm lớp mưa <strong>{Math.round(opacity * 100)}%</strong>
      <input type="range" min={20} max={100} step={10} value={Math.round(opacity * 100)} onChange={event => onOpacity(Number(event.target.value) / 100)} aria-label="Điều chỉnh độ đậm lớp mưa" />
    </label>
  </section>;
}
