"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, CornerDownLeft, CornerDownRight, ExternalLink, LocateFixed, MapPin, Navigation, RotateCcw, ShieldAlert, Volume2, VolumeX, X } from "lucide-react";
import { buildGoogleMapsDirectionsUrl } from "@/lib/google-maps";
import { instructionForProgress, instructionText, navigationProgress, type NavPoint, type NavigationRequest } from "@/lib/navigation-progress";

type Gps = { point: NavPoint; accuracy: number };
type Props = { request: NavigationRequest; gps: Gps | null; onGps: (gps: Gps) => void; onStop: () => void };
function distance(meters: number) { return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(Math.max(0, meters))} m`; }
function DirectionIcon({ maneuver }: { maneuver: string }) {
  if (maneuver.includes("UTURN")) return <RotateCcw size={31} strokeWidth={2.8} aria-hidden="true" />;
  if (maneuver.includes("LEFT")) return <CornerDownLeft size={31} strokeWidth={2.8} aria-hidden="true" />;
  if (maneuver.includes("RIGHT")) return <CornerDownRight size={31} strokeWidth={2.8} aria-hidden="true" />;
  return <ArrowUp size={31} strokeWidth={2.8} aria-hidden="true" />;
}

export default function ActiveNavigation({ request, gps, onGps, onStop }: Props) {
  const [error, setError] = useState("");
  const [hasFix, setHasFix] = useState(false);
  const [lastFix, setLastFix] = useState<number | null>(null);
  const [following, setFollowing] = useState(true);
  const [voice, setVoice] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const spoken = useRef("");
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    setHasFix(false);
    setLastFix(null);
    setError("");
    spoken.current = "";
    if (!navigator.geolocation) { setError("Trình duyệt không hỗ trợ GPS."); return; }
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setError("GPS cần HTTPS hoặc localhost."); return;
    }
    const watchId = navigator.geolocation.watchPosition(
      position => {
        setHasFix(true);
        setError("");
        setLastFix(position.timestamp);
        onGps({ point: [position.coords.latitude, position.coords.longitude], accuracy: position.coords.accuracy });
        // Heading is meaningful only when moving; no fake direction while stationary.
        const heading = position.coords.heading;
        const validHeading = typeof heading === "number" && Number.isFinite(heading)
          && position.coords.accuracy <= 65 && (position.coords.speed === null || position.coords.speed >= 0.7);
        window.dispatchEvent(new CustomEvent("citypass:nav-heading", { detail: validHeading ? heading : null }));
      },
      e => setError(e.code === 1 ? "Bạn chưa cấp quyền vị trí. Hãy bật GPS trong trình duyệt." : "GPS chưa sẵn sàng. Hãy kiểm tra vị trí và kết nối."),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 12000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [request, onGps]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

  const progress = useMemo(() => hasFix && gps ? navigationProgress(request.geometry, gps.point) : null, [gps, hasFix, request]);
  const weakGps = !!gps && gps.accuracy > 75;
  const staleGps = lastFix !== null && now !== null && now - lastFix > 20000;
  const reliable = !!progress && !weakGps && !staleGps;
  const offRoute = reliable && progress.offRouteMeters > Math.max(90, (gps?.accuracy ?? 0) * 2);
  const arrived = reliable && progress.distanceToDestination < 40;
  const step = progress && reliable && !offRoute ? instructionForProgress(request.instructions ?? [], progress.totalMeters > 0 ? progress.traveledMeters / progress.totalMeters * 100 : 0, request.distanceMeters) : null;
  const hasGuidance = Array.isArray(request.instructions) && request.instructions.length > 0;
  const stepText = arrived ? "Bạn đã tới gần điểm đến" : step ? instructionText(step.instruction) : offRoute ? "Bạn đang lệch khỏi tuyến" : "Đi theo tuyến màu tím";
  const label = arrived ? "Đã tới gần đích" : step ? distance(step.distanceMeters) : offRoute ? "Kiểm tra vị trí" : hasGuidance ? "Đang theo tuyến" : "Theo dõi GPS";
  const nextDistance = progress?.remainingMeters ?? request.distanceMeters;
  const estimatedSeconds = request.distanceMeters > 0 ? request.durationSeconds * nextDistance / request.distanceMeters : 0;
  const remainingMinutes = Math.max(0, Math.ceil(estimatedSeconds / 60));
  const etaLabel = now !== null ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }).format(new Date(now + estimatedSeconds * 1000)) : "--:--";
  const link = buildGoogleMapsDirectionsUrl({ from: request.from, to: request.to, geometry: request.geometry, mode: request.vehicle === "car" ? "driving" : "two-wheeler", includeWaypoints: true });

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("citypass:nav-follow", { detail: following }));
    return () => { window.dispatchEvent(new CustomEvent("citypass:nav-follow", { detail: false })); };
  }, [following]);

  useEffect(() => {
    if (!voice || !step || !reliable || offRoute || arrived || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    // Speak only when approaching a real provider maneuver (not a geometry-derived guess).
    const zone = step.distanceMeters <= 75 ? "near" : step.distanceMeters <= 280 ? "ahead" : "";
    if (!zone) return;
    const identifier = `${request.routeId}:${step.instruction.offsetMeters}:${zone}`;
    if (spoken.current === identifier) return;
    spoken.current = identifier;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`${zone === "ahead" ? `Còn ${distance(step.distanceMeters)}. ` : ""}${instructionText(step.instruction)}`);
    utterance.lang = "vi-VN";
    utterance.rate = 0.96;
    const voices = window.speechSynthesis.getVoices();
    const vietnameseVoice = voices.find(item => item.lang.toLowerCase() === "vi-vn")
      ?? voices.find(item => item.lang.toLowerCase().startsWith("vi"));
    if (vietnameseVoice) utterance.voice = vietnameseVoice;
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  }, [voice, step, reliable, offRoute, arrived, request.routeId]);

  useEffect(() => () => { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);

  const message = error || (staleGps ? "GPS không cập nhật quá 20 giây. Hãy kiểm tra tín hiệu." : weakGps ? "GPS sai số lớn. Đừng dựa vào màn hình để quyết định rẽ." : arrived ? "Đã gần tới nơi. Chọn vị trí dừng xe an toàn." : offRoute ? "Đang lệch tuyến. Hãy dừng nơi an toàn trước khi xem hoặc tính lại đường." : !hasGuidance ? "Nhà cung cấp chưa trả dữ liệu rẽ từng ngã. Chỉ theo dõi đường vẽ, không có chỉ dẫn rẽ." : "Chỉ dẫn dựa trên dữ liệu tuyến đã chọn. Luôn ưu tiên biển báo và đường thực tế.");

  return <>
    <section className="citypass-nav-turn" aria-label="Hướng dẫn rẽ tiếp theo">
      <span className="citypass-nav-turn-icon"><DirectionIcon maneuver={step?.instruction.maneuver ?? "STRAIGHT"} /></span>
      <span className="citypass-nav-turn-copy"><small>{label}</small><strong aria-live="polite">{stepText}</strong>{step?.instruction.street && <span>Đường {step.instruction.street}</span>}</span>
      <span className="citypass-nav-vehicle">{request.vehicle === "car" ? "Ô tô" : "Xe máy"}</span>
    </section>
    <section className={`citypass-active-navigation citypass-nav-v130${compact ? " citypass-nav-compact" : ""}`} aria-label="Điều khiển chuyến đi CityPass">
      <div className="citypass-nav-header"><strong><Navigation size={17} /> Hành trình đang chạy</strong><div className="citypass-nav-header-buttons"><button type="button" onClick={() => setCompact(s => !s)} aria-expanded={!compact} aria-label={compact ? "Mở rộng bảng dẫn đường" : "Thu gọn bảng dẫn đường"}>{compact ? "+" : "−"}</button><button type="button" onClick={onStop} aria-label="Kết thúc chuyến đi"><X size={18} /></button></div></div>
      <div className="citypass-nav-metrics citypass-nav-metrics-v130"><div><span>Còn lại</span><b>{distance(nextDistance)}</b></div><div><span>Ước tính</span><b>{remainingMinutes} phút</b></div><div><span>Đến lúc</span><b>{etaLabel}</b></div></div>
      <div className="citypass-nav-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress?.completedPercent ?? 0} aria-label="Tiến độ hành trình"><span style={{ width: `${progress?.completedPercent ?? 0}%` }} /></div>
      {!compact && <>
        <p className={`citypass-nav-advice${offRoute || error || staleGps || weakGps ? " warning" : ""}`} role="status">{message}</p>
        {lastFix && <small className="citypass-nav-gps"><MapPin size={13} /> GPS ±{Math.round(gps?.accuracy ?? 0)} m · {new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(lastFix))}</small>}
        <div className="citypass-nav-actions citypass-nav-actions-v130">
          <button type="button" onClick={() => setFollowing(v => !v)}><LocateFixed size={16} /> {following ? "Đang bám GPS" : "Bám GPS"}</button>
          <button type="button" onClick={() => {
            if (!voice && !("speechSynthesis" in window)) { setError("Trình duyệt chưa hỗ trợ đọc hướng dẫn."); return; }
            setVoice(v => !v); spoken.current = ""; if ("speechSynthesis" in window) window.speechSynthesis.cancel();
          }}>{voice ? <Volume2 size={17} /> : <VolumeX size={17} />} {voice ? "Đang bật giọng nói" : "Bật giọng nói"}</button>
          <button type="button" aria-label="Nghe thử hướng dẫn bằng tiếng Việt" onClick={() => {
            if (!("speechSynthesis" in window)) { setError("Thiết bị chưa hỗ trợ đọc giọng nói."); return; }
            try {
              const synth = window.speechSynthesis;
              const phrase = step && reliable ? instructionText(step.instruction) : "CityPass đã sẵn sàng. Hãy theo dõi hướng dẫn khi di chuyển.";
              const utterance = new SpeechSynthesisUtterance(phrase);
              utterance.lang = "vi-VN"; utterance.rate = 0.95;
              const voices = synth.getVoices();
              const viVoice = voices.find(item => item.lang.toLowerCase() === "vi-vn") ?? voices.find(item => item.lang.toLowerCase().startsWith("vi"));
              if (viVoice) utterance.voice = viVoice;
              synth.cancel(); synth.resume(); synth.speak(utterance);
            } catch { setError("Không phát được giọng nói. Hãy kiểm tra âm lượng media và trình duyệt."); }
          }}><Volume2 size={16} /> Nghe thử</button>
          {link && <a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Mở Google Maps</a>}
        </div>
        <p className="citypass-nav-disclaimer"><ShieldAlert size={12} /> Chỉ dẫn ngã rẽ chỉ có khi TomTom/OSRM trả dữ liệu. ETA là ước tính, chưa tự cập nhật giao thông. Chưa tự tính lại khi lệch tuyến. Google Maps có thể đổi lộ trình. Không thao tác khi đang lái.</p>
      </>}
    </section>
  </>;
}
