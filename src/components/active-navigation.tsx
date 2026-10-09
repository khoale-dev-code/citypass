"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, MapPin, Navigation, ShieldAlert, X } from "lucide-react";
import { buildGoogleMapsDirectionsUrl } from "@/lib/google-maps";
import { navigationProgress, type NavPoint, type NavigationRequest } from "@/lib/navigation-progress";

type Gps = { point: NavPoint; accuracy: number };
type Props = { request: NavigationRequest; gps: Gps | null; onGps: (gps: Gps) => void; onStop: () => void };
function measure(meters: number) { return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`; }

export default function ActiveNavigation({ request, gps, onGps, onStop }: Props) {
  const [error, setError] = useState("");
  const [hasFix, setHasFix] = useState(false);
  const [lastFix, setLastFix] = useState<number | null>(null);
  const [following, setFollowing] = useState(true);
  useEffect(() => {
    setHasFix(false);
    setLastFix(null);
    setError("");
    if (!navigator.geolocation) { setError("Trình duyệt không hỗ trợ GPS."); return; }
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setError("GPS chỉ hoạt động qua HTTPS hoặc localhost.");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      position => {
        setHasFix(true);
        setError("");
        setLastFix(position.timestamp);
        onGps({ point: [position.coords.latitude, position.coords.longitude], accuracy: position.coords.accuracy });
      },
      e => setError(e.code === 1 ? "Bạn chưa cấp quyền vị trí. Hãy bật GPS trong trình duyệt để theo dõi." : "GPS chưa sẵn sàng hoặc tín hiệu yếu. Hãy kiểm tra kết nối và thử lại."),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 12000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [request, onGps]);

  const progress = useMemo(() => hasFix && gps ? navigationProgress(request.geometry, gps.point) : null, [gps, hasFix, request]);
  const badAccuracy = !!gps && gps.accuracy > 80;
  const offRoute = !!progress && !badAccuracy && progress.offRouteMeters > Math.max(90, (gps?.accuracy ?? 0) * 2);
  const arrived = !!progress && !badAccuracy && progress.distanceToDestination <= 35;
  const link = buildGoogleMapsDirectionsUrl({ from: request.from, to: request.to, geometry: request.geometry, mode: request.vehicle === "car" ? "driving" : "two-wheeler", includeWaypoints: true });

  // Inform the Leaflet wrapper whether the user wants auto-follow.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("citypass:nav-follow", { detail: following }));
    return () => { window.dispatchEvent(new CustomEvent("citypass:nav-follow", { detail: false })); };
  }, [following]);

  return <section className="citypass-active-navigation" aria-label="Theo dõi hành trình CityPass">
    <div className="citypass-nav-header"><strong><Navigation size={17} /> Đang đi · {request.vehicle === "motorcycle" ? "Xe máy" : "Ô tô"}</strong><button type="button" onClick={onStop} aria-label="Kết thúc theo dõi"><X size={18}/></button></div>
    <div className="citypass-nav-metrics"><div><span>Còn khoảng</span><b>{progress ? measure(progress.remainingMeters) : measure(request.distanceMeters)}</b></div><div><span>Tiến độ</span><b>{progress ? `${progress.completedPercent}%` : "Đang lấy GPS"}</b></div></div>
    <div className="citypass-nav-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress?.completedPercent ?? 0}><span style={{ width: `${progress?.completedPercent ?? 0}%` }} /></div>
    <p className="citypass-nav-advice" role="status">{error || (arrived ? "Bạn đã đến gần điểm đích. Hãy quan sát và chọn chỗ dừng an toàn." : offRoute ? "Bạn đang cách tuyến dự kiến khá xa. Kiểm tra đường thực tế và tính lại nếu cần." : badAccuracy ? "Độ chính xác GPS thấp; vị trí có thể lệch. Đừng dựa vào màn hình khi đang lái." : hasFix ? "Đi theo đường màu tím trên bản đồ. Đây là theo dõi GPS, chưa có hướng dẫn từng ngã rẽ." : "Đang xin quyền vị trí và chờ tín hiệu GPS...")}</p>
    {lastFix && <small><MapPin size={12}/> GPS ±{Math.round(gps?.accuracy ?? 0)} m · cập nhật {new Date(lastFix).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small>}
    <div className="citypass-nav-actions"><button type="button" onClick={() => setFollowing(v => !v)}>{following ? "Tạm ngừng bám GPS" : "Bám theo vị trí"}</button>{link && <a href={link} target="_blank" rel="noopener noreferrer">Bắt đầu trên Google Maps <ExternalLink size={13}/></a>}</div>
    <p className="citypass-nav-disclaimer"><ShieldAlert size={12}/> CityPass chưa cung cấp chỉ dẫn rẽ hoặc tự định tuyến lại. Google Maps có thể chọn đường khác. Không thao tác điện thoại khi đang điều khiển xe; kiểm tra cảnh báo ngập và biển báo thực tế.</p>
  </section>;
}
