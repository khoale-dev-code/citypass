"use client";
import dynamic from "next/dynamic";
import RoadLookup from "./road-lookup";
import ActiveNavigation from "./active-navigation";
import { isValidNavigationRequest, type NavigationRequest } from "@/lib/navigation-progress";
import OfficialWeatherPanel from "./official-weather-panel";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { clampRadarIndex, type RadarFrame } from "@/lib/radar";
// CityPass precipitation v0.7 (model fallback + optional weather tiles)
import RadarTimeline from "./radar-timeline";
import WeatherAreasPanel from "./weather-areas-panel";
import TrafficPanel from "./traffic-panel";
import type { TrafficAreaResponse, TrafficPoint } from "@/lib/traffic";
import type { WeatherArea, AreaWeatherResponse } from "@/lib/weather-areas";
import { AlertTriangle, ArrowLeftRight, Check, ChevronDown, CloudRain, CloudSun, Compass, Crosshair, Info, LocateFixed, MapPin, Navigation, Plus, Route, Search, ShieldAlert, SlidersHorizontal, Video, Waves, X, CarFront } from "lucide-react";
import { HCMC } from "@/lib/config";
import type { Camera, Incident, RouteOption } from "@/lib/types";
import { buildGoogleMapsDirectionsUrl, type GoogleTravelMode } from "@/lib/google-maps";
import { browserDb } from "@/lib/supabase/client";
import CameraPlayer from "./camera-player";
import CameraSnapshot from "./camera-snapshot";

const MapView = dynamic(() => import("./map-view"), { ssr: false, loading: () => <div className="loading-root">Đang tải nền bản đồ…</div> });
type Point = [number, number];
type PickMode = "from" | "to" | "report" | null;
type Dialog = "report" | "login" | "incident" | "camera" | null;
const places: Array<{ name: string; point: Point }> = [
  { name: "Quận 1 · Trung tâm", point: [10.7769, 106.7009] },
  { name: "Bình Thạnh", point: [10.8033, 106.7144] },
  { name: "Thủ Đức", point: [10.8492, 106.7711] },
  { name: "Quận 7", point: [10.7353, 106.7216] },
  { name: "Tân Bình", point: [10.8075, 106.652] }
];
function formatTime(date: string | number) {
  return new Date(date).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
}
function statusLabel(item: Incident) {
  if (item.is_demo) return "Minh hoạ";
  return item.status === "VERIFIED" ? "Đã cộng đồng xác minh" : item.status === "ACTIVE" ? "Từ cảm biến" : "Chờ xác minh";
}
function distanceLabel(n: number) { return n < 1000 ? `${Math.round(n)} m` : `${(n / 1000).toFixed(1)} km`; }

export default function Dashboard() {
  const [layers, setLayers] = useState({ radar: false, weather: true, traffic: false, flood: false, cameras: false });
  const [mobilePanel, setMobilePanel] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [center, setCenter] = useState<Point>([HCMC.lat, HCMC.lng]);
  const [focus, setFocus] = useState<Point | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [cameraError, setCameraError] = useState("");
  const [cameraLoading, setCameraLoading] = useState(false);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [radarIndex, setRadarIndex] = useState(0);
  const [radarOpacity, setRadarOpacity] = useState(0.7);
  const [radarPlaying, setRadarPlaying] = useState(false);
  const [radarError, setRadarError] = useState("");
  const radar = radarFrames[clampRadarIndex(radarIndex, radarFrames.length)] ?? null;
  const [gps, setGps] = useState<{ point: Point; accuracy: number } | null>(null);
  const [navigationRequest, setNavigationRequest] = useState<NavigationRequest | null>(null);
  const [navigationFollowing, setNavigationFollowing] = useState(true);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const routingSequence = useRef(0);
  const [weatherAreas, setWeatherAreas] = useState<WeatherArea[]>([]);
  const [weatherAreasLoading, setWeatherAreasLoading] = useState(true);
  const [weatherAreasError, setWeatherAreasError] = useState("");
  const [weatherAreasUpdatedAt, setWeatherAreasUpdatedAt] = useState<string | null>(null);
  const [selectedWeatherId, setSelectedWeatherId] = useState<string | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficAreaResponse | null>(null);
  const [trafficError, setTrafficError] = useState("");
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [selectedTrafficId, setSelectedTrafficId] = useState<string | null>(null);
  const [trafficReload, setTrafficReload] = useState(0);
  const [routeMeta, setRouteMeta] = useState<{ traffic_aware: boolean; warning: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [googleTravelMode, setGoogleTravelMode] = useState<GoogleTravelMode>("two-wheeler");
  const [followCityPassRoute, setFollowCityPassRoute] = useState(true);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [from, setFrom] = useState<Point | null>(null);
  const [to, setTo] = useState<Point | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [showRoute, setShowRoute] = useState(false);
  const [citypassLayerToast, setCitypassLayerToast] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [reportPoint, setReportPoint] = useState<Point | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [supabaseClient] = useState(browserDb);
  const db = useRef(supabaseClient);
  useEffect(() => {
    const begin = (event: Event) => {
      const payload = (event as CustomEvent<unknown>).detail;
      if (!isValidNavigationRequest(payload)) return;
      setNavigationFollowing(true);
      setNavigationRequest(payload);
      setGps(null); // Discard any old manual GPS fix before starting a new live watch.
      setShowRoute(false);
      setMobilePanel(false);
    };
    const follow = (event: Event) => setNavigationFollowing((event as CustomEvent<boolean>).detail === true);
    window.addEventListener("citypass:start-navigation", begin);
    window.addEventListener("citypass:nav-follow", follow);
    return () => {
      window.removeEventListener("citypass:start-navigation", begin);
      window.removeEventListener("citypass:nav-follow", follow);
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const onResize = () => setIsCompact(query.matches);
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    onResize(); onVisibility();
    query.addEventListener("change", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      query.removeEventListener("change", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  useEffect(() => {
    if (!isCompact || (!mobilePanel && !showRoute)) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = old; };
  }, [isCompact, mobilePanel, showRoute]);

  const refresh = useCallback(async (location: Point, signal?: AbortSignal) => {
    const q = new URLSearchParams({ lat: String(location[0]), lng: String(location[1]), radius_km: "18" });
    try {
      const result = await fetch(`/api/v1/incidents/nearby?${q}`, { signal, cache: "no-store" });
      if (!result.ok) throw new Error("Không thể tải cảnh báo ngập");
      const payload = await result.json();
      setIncidents(payload.incidents ?? []);
      setMode(payload.mode === "live" ? "live" : "demo");
      setDataError("");
    } catch (e) { if (!signal?.aborted) setDataError(e instanceof Error ? e.message : "Lỗi kết nối"); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    if (!layers.flood || !pageVisible) return;
    const abort = new AbortController();
    void refresh(center, abort.signal);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(center, abort.signal);
    }, 60_000);
    return () => { abort.abort(); clearInterval(interval); };
  }, [center, layers.flood, pageVisible, refresh, refreshKey]);
  useEffect(() => {
    if (!layers.radar || !pageVisible) return;
    const controller = new AbortController();
    async function getRadar() {
      try {
        const result = await fetch("/api/v1/weather/radar", { signal: controller.signal });
        if (!result.ok) throw new Error("Radar unavailable");
        const data = await result.json() as { frames?: RadarFrame[]; error?: string };
        if (controller.signal.aborted) return;
        const frames = Array.isArray(data.frames) ? data.frames.slice(-12) : [];
        setRadarFrames(frames);
        setRadarIndex(Math.max(0, frames.length - 1));
        setRadarError(data.error ?? "");
        if (!frames.length) setRadarPlaying(false);
      } catch {
        if (!controller.signal.aborted) {
          setRadarFrames([]); setRadarPlaying(false);
          setRadarError("Radar không sẵn sàng. Hãy thử lại sau.");
        }
      }
    }
    void getRadar();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void getRadar();
    }, 300_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [layers.radar, pageVisible, refreshKey]);
  useEffect(() => {
    if ((!layers.weather && !layers.radar) || !pageVisible) return;
    const controller = new AbortController();
    async function updateAreas() {
      setWeatherAreasLoading(true);
      try {
        const response = await fetch("/api/v1/weather/areas", { signal: controller.signal });
        const body: AreaWeatherResponse & { error?: string } = await response.json();
        if (!response.ok || !Array.isArray(body.areas)) throw new Error(body.error ?? "Dữ liệu khu vực chưa sẵn sàng");
        if (controller.signal.aborted) return;
        setWeatherAreas(body.areas);
        setWeatherAreasUpdatedAt(body.updated_at);
        setWeatherAreasError("");
      } catch (error) {
        if (controller.signal.aborted) return;
        setWeatherAreas([]);
        setWeatherAreasUpdatedAt(null);
        setWeatherAreasError(error instanceof Error ? error.message : "Không tải được thời tiết các khu vực");
      } finally { if (!controller.signal.aborted) setWeatherAreasLoading(false); }
    }
    void updateAreas();
    const interval = setInterval(() => { if (document.visibilityState === "visible") void updateAreas(); }, 300_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [layers.weather, layers.radar, pageVisible, refreshKey]);
  useEffect(() => {
    if (!layers.traffic || !pageVisible) return;
    const controller = new AbortController();
    async function loadTraffic() {
      setTrafficLoading(true);
      try {
        const response = await fetch("/api/v1/traffic/areas", { signal: controller.signal, cache: "no-store" });
        const data = await response.json() as TrafficAreaResponse;
        if (!response.ok || !Array.isArray(data.points)) throw Error(data.error ?? "Không lấy được dữ liệu giao thông");
        if (controller.signal.aborted) return;
        setTrafficData(data); setTrafficError("");
      } catch (error) {
        if (!controller.signal.aborted) setTrafficError(error instanceof Error ? error.message : "Lỗi giao thông");
      } finally { if (!controller.signal.aborted) setTrafficLoading(false); }
    }
    void loadTraffic();
    const interval = setInterval(() => { if (document.visibilityState === "visible") void loadTraffic(); }, 90_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [layers.traffic, pageVisible, trafficReload]);
  useEffect(() => {
    if (!radarPlaying || radarFrames.length < 2 || !layers.radar || !pageVisible) return;
    const interval = setInterval(() => setRadarIndex(index => (index + 1) % radarFrames.length), 1300);
    return () => clearInterval(interval);
  }, [radarPlaying, radarFrames.length, layers.radar, pageVisible]);
  useEffect(() => {
    if (!layers.cameras || !pageVisible) return;
    const controller = new AbortController();
    async function fetchCameras() {
      setCameraLoading(true);
      try {
        const response = await fetch(`/api/v1/cameras?lat=${center[0]}&lng=${center[1]}&radius_km=15`, { signal: controller.signal });
        if (!response.ok) throw new Error("Máy chủ camera không phản hồi.");
        const data = await response.json();
        if (controller.signal.aborted) return;
        setCameras(Array.isArray(data.cameras) ? data.cameras : []);
        setCameraError(data.warning ?? "");
      } catch (error) {
        if (!controller.signal.aborted) setCameraError(error instanceof Error ? error.message : "Không tải được camera");
      } finally {
        if (!controller.signal.aborted) setCameraLoading(false);
      }
    }
    void fetchCameras();
    return () => controller.abort();
  }, [center, layers.cameras, pageVisible, refreshKey]);
  useEffect(() => {
    if (!db.current) return;
    const supabase = db.current;
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);
  // Realtime chỉ theo ô lưới, chỉ khi người dùng bật lớp cảnh báo ngập.
  const gridLat = Math.floor(center[0] / .02);
  const gridLng = Math.floor(center[1] / .02);
  useEffect(() => {
    const supabase = db.current;
    if (!supabase || mode !== "live" || !layers.flood || !pageVisible) return;
    const latCell = gridLat, lngCell = gridLng;
    const channels: ReturnType<typeof supabase.channel>[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cell = `${latCell + dy}:${lngCell + dx}`;
      const ch = supabase.channel(`incident-${cell}`).on("postgres_changes", {
        event: "*", schema: "public", table: "incident_events", filter: `region_key=eq.${cell}`
      }, () => setRefreshKey(k => k + 1)).subscribe();
      channels.push(ch);
    }
    return () => { channels.forEach(ch => { void supabase.removeChannel(ch); }); };
  }, [gridLat, gridLng, mode, layers.flood, pageVisible]);
  const onMove = useCallback((lat: number, lng: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCenter(previous => Math.abs(previous[0] - lat) < .003 && Math.abs(previous[1] - lng) < .003 ? previous : [lat, lng]), isCompact ? 850 : 550);
  }, [isCompact]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // UI feedback only; do not trigger duplicate API requests when toggling layers.
  useEffect(() => {
    if (!citypassLayerToast) return;
    const timeout = window.setTimeout(() => setCitypassLayerToast(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [citypassLayerToast]);
  function citypassChangeLayer(key: keyof typeof layers, label: string) {
    const nowEnabled = !layers[key];
    setLayers(current => ({ ...current, [key]: nowEnabled }));
    setCitypassLayerToast(`${nowEnabled ? "Đã bật" : "Đã tắt"} ${label}`);
  }
  function clearRouteResults() {
    routingSequence.current += 1;
    setRoutes([]); setSelectedRoute(null); setRouteError(""); setRouteMeta(null); setRouting(false);
  }
  const onPick = useCallback((point: Point) => {
    if (pickMode === "from") setFrom(point);
    if (pickMode === "to") setTo(point);
    if (pickMode === "report") { setReportPoint(point); setDialog("report"); }
    if (pickMode === "from" || pickMode === "to") {
      routingSequence.current += 1;
      setRoutes([]); setSelectedRoute(null); setRouteError(""); setRouteMeta(null); setRouting(false);
    }
    setPickMode(null);
  }, [pickMode]);
  function locate(target: "from" | "view" | "report") {
    setGpsError("");
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setGpsError("GPS chỉ hoạt động qua HTTPS hoặc localhost. Hãy mở website bằng kết nối bảo mật."); return;
    }
    if (!navigator.geolocation) { setGpsError("Trình duyệt không hỗ trợ GPS. Hãy chọn điểm trên bản đồ."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(p => {
      const next: Point = [p.coords.latitude, p.coords.longitude];
      setGps({ point: next, accuracy: p.coords.accuracy });
      if (target === "from") { setFrom(next); clearRouteResults(); }
      if (target === "report") { setReportPoint(next); setDialog("report"); }
      setFocus(next); setCenter(next); setLocating(false);
    }, error => {
      setLocating(false);
      const messages: Record<number, string> = {
        1: "Quyền GPS đang bị từ chối. Hãy cấp quyền vị trí trong trình duyệt rồi thử lại.",
        2: "Không xác định được GPS. Hãy bật dịch vụ vị trí hoặc chọn điểm trên bản đồ.",
        3: "GPS phản hồi quá chậm. Hãy thử lại hoặc chọn điểm trên bản đồ."
      };
      setGpsError(messages[error.code] ?? "Không đọc được GPS. Hãy chọn điểm trực tiếp trên bản đồ.");
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 });
  }
  async function findRoutes() {
    if (!from || !to) return;
    const requestId = ++routingSequence.current;
    setRouting(true); setRouteError(""); setRoutes([]); setSelectedRoute(null);
    const params = new URLSearchParams({ from_lat: String(from[0]), from_lng: String(from[1]), to_lat: String(to[0]), to_lng: String(to[1]) });
    try {
      const response = await fetch(`/api/v1/routes?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Không lấy được các tuyến đường");
      if (routingSequence.current !== requestId) return;
      setRoutes(payload.routes ?? []); setSelectedRoute(payload.routes?.[0]?.id ?? null);
      setRouteMeta({ traffic_aware: payload.traffic_aware === true, warning: String(payload.warning ?? "Không có dữ liệu kẹt xe trực tiếp") });
      if (!payload.routes?.length) setRouteError("Không có tuyến đường phù hợp ở khu vực này.");
    } catch (e) {
      if (routingSequence.current === requestId) setRouteError(e instanceof Error ? e.message : "Lỗi định tuyến");
    } finally { if (routingSequence.current === requestId) setRouting(false); }
  }
  const activeRoute = routes.find(item => item.id === selectedRoute) ?? null;
  const googleMapsUrl = from && to && activeRoute
    ? buildGoogleMapsDirectionsUrl({ from, to, geometry: activeRoute.geometry, mode: googleTravelMode, includeWaypoints: followCityPassRoute })
    : null;
  const visible = layers.flood ? incidents : [];
  const rainAreaCount = weatherAreas.filter(area => area.precipitationMm >= 0.1).length;
  const chosenWeather = weatherAreas.find(area => area.id === selectedWeatherId)
    ?? [...weatherAreas].sort((a, b) => ((a.lat - center[0]) ** 2 + (a.lng - center[1]) ** 2) - ((b.lat - center[0]) ** 2 + (b.lng - center[1]) ** 2))[0];
  const weatherStatus = layers.weather && chosenWeather ? `${chosenWeather.name}: ${chosenWeather.conditionLabel}` : layers.weather ? "Đang lấy thời tiết khu vực" : "Bật thời tiết để theo dõi";
  return <div className="shell">
    <header className="topbar">
      <Link className="brand" href="/"><span className="brand-mark"><Waves size={23} strokeWidth={2.5} /></span><span><span className="brand-name">CityPass<span style={{ color: "#1b9b8b" }}>.</span></span><span className="brand-sub">Biết mưa. Hiểu ngập. Chọn đường.</span></span></Link>
      <div className="topbar-center"><span className="top-pill"><MapPin size={14} /> TP. Hồ Chí Minh <ChevronDown size={13} /></span><span className="top-pill"><span className="live-dot" style={{ background: radar ? "#159568" : "#9aaca5" }} /> Lớp mưa · {!layers.radar ? "đang tắt" : radar ? "OpenWeatherMap" : "Open-Meteo"}</span></div>
      <div className="top-actions"><button className="btn" onClick={() => { setMobilePanel(false); setShowRoute(false); setPickMode(null); window.dispatchEvent(new Event("citypass:open-road-search")); }}><Route size={17} /><span>Tìm đường</span></button><button className="btn btn-primary" onClick={() => { setReportPoint(null); setDialog("report"); }}><Plus size={18} /><span>Báo điểm ngập</span></button><button className="btn btn-ghost" onClick={() => setDialog("login")} aria-label="Tài khoản"><Compass size={19} /></button></div>
    </header>
    <OfficialWeatherPanel lat={center[0]} lng={center[1]} />
    <RoadLookup onFocus={(lat, lng) => { setFocus([lat, lng]); setCenter([lat, lng]); }} onJourney={(options, id, a, b) => { setRoutes(options); setSelectedRoute(id); setFrom(a); setTo(b); setShowRoute(false); }} />
    <main className="app-main">
      {mobilePanel && <button type="button" className="mobile-panel-scrim" aria-label="Đóng bảng thông tin" onClick={() => setMobilePanel(false)} />}
      <aside className={`sidebar${mobilePanel ? " mobile-open" : ""}`} aria-label="Bộ lọc và thông tin bản đồ">
        <div className="mobile-sheet-head"><span className="mobile-sheet-handle" aria-hidden="true" /><strong>Lớp dữ liệu và khu vực</strong><button type="button" className="mobile-sheet-close" aria-label="Đóng bảng thông tin" onClick={() => setMobilePanel(false)}><X size={20} /></button></div>
        <div className="sidebar-scroll">
        <div className="eyebrow">BẢN ĐỒ THEO DÕI</div><h1 className="heading">Đường bạn đi,<br />có đang ngập?</h1><p className="subtle">Quan sát mưa trên radar và những điểm ngập được ghi nhận quanh khu vực đang xem.</p>
        <button className="search-display" onClick={() => { setFocus([HCMC.lat, HCMC.lng]); setCenter([HCMC.lat, HCMC.lng]); }}><Search size={17} color="#668a7e" /><span>TP. Hồ Chí Minh · Toàn khu vực</span><MapPin size={15} style={{ marginLeft: "auto" }} /></button>
        <div className="section-row"><span className="section-title">Lớp hiển thị</span><span className="section-extra"><SlidersHorizontal size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Tuỳ chọn</span></div>
        <div className="layer-list">
          {([ ["traffic", CarFront, "Giao thông / kẹt xe", "traffic"], ["weather", CloudSun, "Thời tiết khu vực", "weather"], ["radar", CloudRain, "Vùng mưa ước tính", "rain"], ["flood", Waves, mode === "demo" ? "Điểm ngập (mô phỏng)" : "Điểm ngập", "flood"], ["cameras", Video, "Camera", "camera"] ] as const).map(([key, Icon, label, css]) => <button type="button" className="layer-toggle" key={key} role="switch" aria-checked={layers[key]} aria-label={`${layers[key] ? "Tắt" : "Bật"} ${label}`} onClick={() => citypassChangeLayer(key, label)}><span className="layer-left"><span className={`layer-icon ${css}`}><Icon size={18} /></span><span>{label}</span></span><span className="switch" data-active={layers[key]} aria-hidden="true" /></button>)}
        </div>
        {layers.traffic && (!isCompact || mobilePanel) && <TrafficPanel data={trafficData} loading={trafficLoading} error={trafficError} selectedId={selectedTrafficId} onReload={() => setTrafficReload(k => k + 1)} onSelect={(point: TrafficPoint) => { setSelectedTrafficId(point.id); setFocus([point.lat, point.lng]); setCenter([point.lat, point.lng]); }} />}
        {layers.weather && (!isCompact || mobilePanel) && <WeatherAreasPanel areas={weatherAreas} selectedId={selectedWeatherId} updatedAt={weatherAreasUpdatedAt} loading={weatherAreasLoading} error={weatherAreasError} onReload={() => setRefreshKey(k => k + 1)} onSelect={area => { setSelectedWeatherId(area.id); setFocus([area.lat, area.lng]); setCenter([area.lat, area.lng]); }} />}
        {layers.radar && (!isCompact || mobilePanel) && <RadarTimeline modelAreaCount={weatherAreas.length} modeledRainCount={weatherAreas.filter(area => area.precipitationMm >= 0.1).length} frames={radarFrames} index={radarIndex} opacity={radarOpacity} playing={radarPlaying} error={radarError} onIndex={setRadarIndex} onOpacity={setRadarOpacity} onPlaying={setRadarPlaying} onReload={() => setRefreshKey(k => k + 1)} />}
        {layers.cameras && (!isCompact || mobilePanel) && <section className="camera-sidebar" aria-label="Danh sách camera giao thông">
          <div className="section-row"><span className="section-title">Camera khu vực</span><span className="section-extra">{cameraLoading ? "Đang tải…" : `${cameras.length} điểm`}</span></div>
          {cameraError && <p className="notice-error" role="status">{cameraError}</p>}
          {!cameraLoading && !cameras.length && <p className="empty">Chưa nhận được danh sách camera tại khu vực này. Bạn có thể thử làm mới hoặc di chuyển bản đồ.</p>}
          <div className="camera-nearby-list">{cameras.slice(0, 5).map(camera => <button type="button" className="camera-nearby-item" key={camera.id} onClick={() => { setSelectedCamera(camera); setFocus([camera.lat, camera.lng]); setDialog("camera"); }}><Video size={15} /><span>{camera.title}</span><span className="camera-kind">{camera.snapshot_url ? "Ảnh" : "Video"}</span></button>)}</div>
          <p className="camera-catalog-note">Nguồn bên ngoài có thể trễ hoặc ngừng trả ảnh. Không sử dụng ảnh để kết luận độ sâu ngập.</p>
        </section>}
        <div className="warning-box"><AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} /><span>{mode === "demo" ? <><strong>CHẾ ĐỘ MINH HỌA:</strong> Các điểm ngập là dữ liệu giả lập, không phản ánh tình trạng thật. Lớp mưa là dữ liệu ước tính từ mô hình; không xác nhận đường không ngập.</> : <><strong>Lưu ý:</strong> Không có báo cáo không có nghĩa là đường an toàn. Kiểm tra thực tế trước khi đi.</>}</span></div>
        <div className="section-row"><span className="section-title">Cảnh báo quanh bản đồ</span><span className="section-extra">{!layers.flood ? "Lớp đang tắt" : loading ? "Đang tải..." : `${visible.length} điểm`}</span></div>
        {dataError && <p className="notice-error" role="alert">{dataError} <button onClick={() => setRefreshKey(k => k + 1)}><strong>Thử lại</strong></button></p>}
        {!layers.flood && <div className="empty">Lớp điểm ngập đang tắt. Bạn có thể bật để xem điểm minh họa hoặc dữ liệu thật khi kết nối nguồn.</div>}
        {layers.flood && !loading && visible.length === 0 && <div className="empty">Không có sự cố trong khu vực này. Điều đó không khẳng định đường không ngập.</div>}
        {visible.slice(0, 14).map(item => <button className="incident-item" key={item.id} onClick={() => { setSelectedIncident(item); setFocus([item.geometry.coordinates[1], item.geometry.coordinates[0]]); setDialog("incident"); }}><span className={`severity-pin severity-${item.severity}`}>{item.severity}</span><div className="incident-main"><div className="incident-name">{item.title}</div><div className="incident-meta"><span>{item.water_depth_cm == null ? `Mức ${item.severity}` : `${item.water_depth_cm} cm`}</span><span>·</span><span className={`status-pill ${item.status === "VERIFIED" ? "verified" : ""}`}>{statusLabel(item)}</span></div></div></button>)}
        <div style={{ marginTop: 20, fontSize: 10, color: "#729087", lineHeight: 1.7 }}>Nguồn lớp mưa: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>Open-Meteo</a> / OpenWeatherMap. Thời tiết khu vực theo ô lưới mô hình, không phải trạm đo. Thời tiết mô hình: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>Open-Meteo</a>. Nền bản đồ: © OpenStreetMap. Dữ liệu có thể trễ hoặc không bao phủ toàn bộ khu vực.</div>
      </div></aside>
      <section className="map-space" aria-label="Bản đồ mưa và sự cố ngập">
        {navigationRequest && <ActiveNavigation request={navigationRequest} gps={gps} onGps={setGps} onStop={() => setNavigationRequest(null)} />}
        <MapView weatherAreas={(layers.weather || layers.radar) ? weatherAreas : []} showWeatherMarkers={layers.weather} selectedWeatherId={selectedWeatherId} onSelectWeather={area => { setSelectedWeatherId(area.id); }} trafficEnabled={layers.traffic && trafficData?.configured === true} trafficPoints={layers.traffic ? trafficData?.points ?? [] : []} onSelectTraffic={point => { setSelectedTrafficId(point.id); }} incidents={visible} cameras={layers.cameras ? cameras : []} rain={layers.radar} radar={radar} radarOpacity={radarOpacity} gps={gps} navigationFollowing={!!navigationRequest && navigationFollowing} focus={focus} pickMode={pickMode} onPick={onPick} onMove={onMove} onSelectIncident={item => { setSelectedIncident(item); setDialog("incident"); }} onSelectCamera={item => { setSelectedCamera(item); setDialog("camera"); }} routes={routes} selectedRoute={selectedRoute} from={from} to={to} />
        {layers.radar && <div className="citypass-rain-map-note" role="status" aria-live="polite">
          <span className="citypass-rain-map-swatch" aria-hidden="true" />
          <span><strong>Vùng mưa ước tính đã bật</strong>
            <small>{weatherAreas.length > 0
              ? rainAreaCount > 0
                ? `Có tín hiệu mưa tại ${rainAreaCount}/${weatherAreas.length} khu vực mô hình. ${radar ? "Hiển thị cùng lớp mưa OpenWeatherMap." : "Đang dùng Open-Meteo."}`
                : `Chưa thấy mưa ở ${weatherAreas.length} điểm mô hình. ${radar ? "Lớp ảnh OpenWeatherMap có thể trong suốt khi không có mưa." : "Bản đồ không tô mưa khi mô hình báo 0 mm."}`
              : weatherAreasLoading
                ? "Đang tải mẫu lượng mưa khu vực..."
                : radar
                  ? "Đang hiển thị lớp ảnh OpenWeatherMap; chưa có mẫu Open-Meteo."
                  : weatherAreasError
                    ? "Chưa tải được dữ liệu mưa. Hãy thử làm mới."
                    : "Chưa có mẫu mưa để hiển thị."}</small>
          </span>
        </div>}
        <div className="map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>{layers.traffic && trafficData?.configured && <span> · Traffic <a href="https://www.tomtom.com/" target="_blank" rel="noopener noreferrer">TomTom</a></span>}{layers.radar && <span> · Mưa ước tính: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> / <a href="https://openweathermap.org/" target="_blank" rel="noopener noreferrer">OpenWeatherMap</a></span>}</div>
        <div className="map-overlay-top"><div className="map-info-chip"><CloudSun color="#db9a32" size={24} /><span><strong>{weatherStatus}</strong><br /><span style={{ color: "#71887f" }}>{layers.weather && chosenWeather ? `${Math.round(chosenWeather.temperatureC)}°C · mưa ${chosenWeather.precipitationMm.toFixed(1)} mm / 15 phút · ${chosenWeather.time.replace("T", " ")}` : "Bật lớp thời tiết để xem dữ liệu mô hình"}{mode === "demo" && <span className="map-flood-unavailable">Ngập: chưa có dữ liệu thực</span>}</span></span></div><div className="map-tools"><button className="tool-btn" title="Vị trí của tôi" aria-label="Về vị trí của tôi" disabled={locating} onClick={() => locate("view")}><LocateFixed size={19} /></button><button className="tool-btn" title="Làm mới" aria-label="Làm mới cảnh báo" onClick={() => setRefreshKey(k => k + 1)}><Crosshair size={19} /></button></div></div>
        {gps && <div className="gps-indicator" role="status"><span className="gps-dot" /> GPS ±{Math.round(gps.accuracy)} m · Vị trí gần đúng</div>}
        {gpsError && <div className="map-error" role="alert">{gpsError}<button onClick={() => setGpsError("")} aria-label="Đóng lỗi GPS"><X size={16} /></button></div>}
        {pickMode && <div style={{ position: "absolute", zIndex: 700, top: 87, left: 20, right: 20, maxWidth: 410, background: "#113d34", color: "white", padding: 12, borderRadius: 12, boxShadow: "0 4px 20px #113d3444", display: "flex", alignItems: "center", justifyContent: "space-between" }}><span>Chạm vào bản đồ để chọn {pickMode === "from" ? "điểm đi" : pickMode === "to" ? "điểm đến" : "điểm báo cáo"}.</span><button aria-label="Huỷ chọn" onClick={() => setPickMode(null)}><X size={18} /></button></div>}
        <div className="map-bottom"><details className="legend-details"><summary>Chú thích bản đồ</summary><div className="legend">{layers.traffic && <><div style={{ fontSize: 11, fontWeight: 800 }}>Giao thông · tốc độ tương đối</div><div className="legend-items"><span><i className="legend-dot" style={{ background: "#1aa76c" }} />Thông thoáng</span><span><i className="legend-dot" style={{ background: "#dcb338" }} />Chậm</span><span><i className="legend-dot" style={{ background: "#e76931" }} />Ùn tắc</span><span><i className="legend-dot" style={{ background: "#b72c35" }} />Nặng</span></div></>}<div style={{ fontSize: 11, fontWeight: 800 }}>{layers.weather ? "Thời tiết theo khu vực · ước tính mô hình" : "Chú thích mức ngập theo độ sâu"}</div>{layers.weather && <div className="legend-items"><span><i className="legend-dot" style={{ background: "#2471ae" }} />Có mưa</span><span><i className="legend-dot" style={{ background: "#c88a17" }} />Nắng / quang</span><span><i className="legend-dot" style={{ background: "#748797" }} />Nhiều mây</span></div>}<div style={{ fontSize: 11, fontWeight: 800, marginTop: layers.weather ? 9 : 0 }}>Chú thích mức ngập theo độ sâu</div><div className="legend-items"><span><i className="legend-dot" style={{ background: "#be9210" }} />1 · 10–&lt;20cm</span><span><i className="legend-dot" style={{ background: "#d36b24" }} />2 · 20–35cm</span><span><i className="legend-dot" style={{ background: "#cc3538" }} />3 · &gt;35cm</span></div></div></details></div>
        {showRoute && <div className={`route-card${pickMode ? " is-picking" : ""}`} role="dialog" aria-label="Tìm và so sánh tuyến đường"><div className="route-head"><span className="route-title">Tìm đường · xét giao thông nếu có</span><button aria-label="Đóng bảng tìm đường" onClick={() => setShowRoute(false)}><X size={18} /></button></div><p className="subtle" style={{ margin: "5px 0 12px" }}>Chọn hai vị trí trên bản đồ, hệ thống so sánh các tuyến có thể đi.</p>
          <div style={{ display: "grid", gap: 7 }}><button className={`point-input ${pickMode === "from" ? "selected" : ""}`} onClick={() => { setPickMode("from"); setShowRoute(true); }}><span style={{ color: "#0a8876" }}>●</span>{from ? `Điểm đi: ${from[0].toFixed(4)}, ${from[1].toFixed(4)}` : "Chạm để chọn điểm đi trên bản đồ"}</button><button className={`point-input ${pickMode === "to" ? "selected" : ""}`} onClick={() => setPickMode("to")}><span style={{ color: "#2a5c9a" }}>●</span>{to ? `Điểm đến: ${to[0].toFixed(4)}, ${to[1].toFixed(4)}` : "Chạm để chọn điểm đến trên bản đồ"}</button></div>
          <div style={{ display: "flex", gap: 8, marginTop: 9 }}><button className="btn" style={{ flex: 1, fontSize: 11 }} onClick={() => locate("from")}><Navigation size={13} /> Vị trí tôi</button><button className="btn" style={{ flex: 1, fontSize: 11 }} onClick={() => { setFrom(to); setTo(from); clearRouteResults(); }}><ArrowLeftRight size={13} /> Đổi chiều</button></div>
          <label className="field" style={{ marginTop: 9 }}>Chọn nhanh điểm đến<select defaultValue="" onChange={e => { if (!e.target.value) return; const p = places[Number(e.target.value)]; if (p) { setTo(p.point); setFocus(p.point); clearRouteResults(); } }}><option value="">Chọn khu vực...</option>{places.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}</select></label>
          <button className="btn btn-primary" style={{ width: "100%", marginTop: 12 }} disabled={!from || !to || routing} onClick={() => void findRoutes()}><Route size={15} />{routing ? "Đang tìm tuyến…" : "Tìm và so sánh tuyến"}</button>
          {routeError && <p className="notice-error" role="alert">{routeError}</p>}
          {routeMeta && <p className={routeMeta.traffic_aware ? "notice-success" : "traffic-route-warning"} role="status">{routeMeta.traffic_aware ? "ETA giao thông xe máy (TomTom beta) · " : "Dự phòng · "}{routeMeta.warning}</p>}
          {routes.length > 0 && <div className="route-list">{routes.map((r, idx) => <button key={r.id} onClick={() => setSelectedRoute(r.id)} className={`route-option ${selectedRoute === r.id ? "current" : ""}`}><span><strong style={{ fontSize: 12 }}>Tuyến {idx + 1} · {distanceLabel(r.distance_m)}</strong><br /><span style={{ fontSize: 10, color: "#648178" }}>{Math.round(r.duration_s / 60)} phút ({routeMeta?.traffic_aware ? "xe máy TomTom beta" : "ô tô OSRM dự phòng"}){routeMeta?.traffic_aware && r.traffic_delay_s != null ? ` · Chậm do ùn tắc +${Math.round(r.traffic_delay_s / 60)} phút` : ""} · {mode === "demo" ? "Không có đánh giá ngập thực tế" : `${r.risk_count} điểm cảnh báo gần tuyến`}</span></span>{selectedRoute === r.id && <Check size={16} color="#067b6b" />}</button>)}</div>}
          {activeRoute && googleMapsUrl && <section className="citypass-maps-handoff" aria-label="Mở tuyến đã chọn trên Google Maps">
            <div className="citypass-maps-heading"><Navigation size={17} aria-hidden="true" /><strong>Chỉ đường bằng Google Maps · {`Tuyến ${routes.findIndex(item => item.id === selectedRoute) + 1}`}</strong></div>
            <label className="citypass-maps-field">Phương tiện trên Google Maps
              <select value={googleTravelMode} onChange={event => setGoogleTravelMode(event.target.value as GoogleTravelMode)}>
                <option value="driving">Ô tô</option>
                <option value="two-wheeler">Xe máy (ưu tiên, tùy khu vực)</option>
              </select>
            </label>
            <label className="citypass-maps-toggle">
              <input type="checkbox" checked={followCityPassRoute} onChange={event => setFollowCityPassRoute(event.target.checked)} />
              Gửi tối đa 3 điểm trung gian theo tuyến CityPass
            </label>
            <a className="btn btn-primary citypass-maps-button" href={googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label="Mở Google Maps để chỉ đường theo tuyến đang chọn (mở tab mới)">
              <Navigation size={17} aria-hidden="true" /> Mở Google Maps để dẫn đường ↗
            </a>
            <p className="citypass-maps-disclaimer"><Info size={15} aria-hidden="true" /> Google Maps <strong>tự tính lại tuyến</strong> và có thể đổi đường hoặc thời gian so với CityPass. Các điểm trung gian chỉ giúp tham khảo lộ trình, không bảo đảm giống hệt hoặc tránh ngập. Kiểm tra biển báo và tình trạng thực tế trước khi đi.</p>
          </section>}
          <p className="subtle" style={{ marginTop: 10, fontSize: 10 }}><ShieldAlert size={13} style={{ display: "inline", verticalAlign: "middle" }} /> {mode === "demo" ? "Dữ liệu ngập minh họa, không dùng để quyết định đi lại." : "Tuyến gợi ý không được bảo đảm khô ráo. Thiếu báo cáo không nghĩa là an toàn."} Tuyến TomTom có xét traffic khi cấu hình API key, nếu không sẽ dự phòng OSRM. Dữ liệu định tuyến ô tô không thay thế chỉ dẫn phù hợp xe máy.</p>
        </div>}
      </section>
    </main>
    <nav className="mobile-bottom-nav" aria-label="Thao tác chính">
      <button type="button" aria-label="Xem bản đồ" aria-current={!mobilePanel && !showRoute ? "page" : undefined} onClick={() => { setMobilePanel(false); setShowRoute(false); setPickMode(null); }}><MapPin size={20} /><span>Bản đồ</span></button>
      <button type="button" aria-label="Mở lớp dữ liệu" aria-expanded={mobilePanel} onClick={() => { setShowRoute(false); setPickMode(null); setMobilePanel(value => !value); }}><SlidersHorizontal size={20} /><span>Lớp dữ liệu</span></button>
      <button type="button" aria-label="Mở tìm đường" onClick={() => { setMobilePanel(false); setShowRoute(false); setPickMode(null); window.dispatchEvent(new Event("citypass:open-road-search")); }}><Route size={20} /><span>Tìm đường</span></button>
      <button type="button" aria-label="Báo sự cố giao thông hoặc ngập" onClick={() => { setReportPoint(null); setMobilePanel(false); setDialog("report"); }}><Plus size={20} /><span>Báo sự cố</span></button>
    </nav>
    {dialog === "report" && <ReportDialog onClose={() => setDialog(null)} db={db.current} userId={userId} initialPoint={reportPoint} onPick={() => { setDialog(null); setPickMode("report"); }} onSuccess={() => { setDialog(null); setRefreshKey(k => k + 1); }} />}
    {dialog === "login" && <LoginDialog onClose={() => setDialog(null)} db={db.current} userId={userId} />}
    {dialog === "camera" && selectedCamera && <CameraDialog camera={selectedCamera} onClose={() => setDialog(null)} />}
    {dialog === "incident" && selectedIncident && <IncidentDialog item={selectedIncident} onClose={() => setDialog(null)} db={db.current} userId={userId} onRefresh={() => setRefreshKey(k => k + 1)} />}
    {citypassLayerToast && <div className="citypass-toast-host" role="status" aria-live="polite"><span>{citypassLayerToast}</span><button type="button" onClick={() => setCitypassLayerToast(null)} aria-label="Đóng thông báo"><X size={16} /></button></div>}
  </div>;
}

type Db = ReturnType<typeof browserDb>;
function ModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => { if (e.key === "Escape") onClose(); }}><div className="modal-row"><h2 className="route-title">{title}</h2><button className="btn" style={{ minWidth: 39, padding: 0 }} onClick={onClose} aria-label="Đóng"><X size={19} /></button></div>{children}</div></div>;
}
function LoginDialog({ db, userId, onClose }: { db: Db; userId: string | null; onClose: () => void }) {
  const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function login() { if (!db) return; setBusy(true); setMessage(""); const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } }); setMessage(error ? error.message : "Đã gửi liên kết đăng nhập. Kiểm tra email của bạn."); setBusy(false); }
  return <ModalFrame title="Tài khoản CityPass" onClose={onClose}>
    {!db && <p className="warning-box">Chưa cấu hình Supabase. Chế độ hiện tại chỉ để xem giao diện, không thể đăng nhập hay gửi báo cáo thật.</p>}
    {db && userId && <><p className="notice-success">Đã đăng nhập. Bạn có thể báo sự cố và xác minh cộng đồng.</p><button className="btn" onClick={() => { void db.auth.signOut(); onClose(); }}>Đăng xuất</button></>}
    {db && !userId && <><p className="subtle" style={{ marginTop: 12 }}>Nhập email để nhận liên kết đăng nhập không cần mật khẩu.</p><label className="field">Email<input type="email" value={email} placeholder="ban@example.com" onChange={e => setEmail(e.target.value)} /></label><button className="btn btn-primary" style={{ width: "100%", marginTop: 14 }} disabled={!email.includes("@") || busy} onClick={() => void login()}>{busy ? "Đang gửi…" : "Gửi liên kết đăng nhập"}</button>{message && <p className="notice-success" role="status">{message}</p>}</>}
  </ModalFrame>;
}
function ReportDialog({ db, userId, initialPoint, onPick, onClose, onSuccess }: { db: Db; userId: string | null; initialPoint: Point | null; onPick: () => void; onClose: () => void; onSuccess: () => void }) {
  const [type, setType] = useState<"FLOOD" | "TRAFFIC_JAM">("FLOOD");
  const [severity, setSeverity] = useState(1);
  const [note, setNote] = useState(""); const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit() {
    if (!db || !initialPoint || !userId) return;
    setBusy(true); setError("");
    try {
      const { data } = await db.auth.getSession(); const token = data.session?.access_token;
      if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
      let photo_url: string | null = null;
      if (photo) {
        if (photo.size > 5 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(photo.type)) throw new Error("Ảnh cần là JPG/PNG/WebP, tối đa 5MB.");
        const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await db.storage.from("report-photos").upload(path, photo, { contentType: photo.type });
        if (uploadError) throw new Error(`Không tải được ảnh: ${uploadError.message}`);
        photo_url = db.storage.from("report-photos").getPublicUrl(path).data.publicUrl;
      }
      const response = await fetch("/api/v1/reports", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ type, severity, lat: initialPoint[0], lng: initialPoint[1], note, photo_url }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Không gửi được báo cáo.");
      onSuccess();
    } catch (e) { setError(e instanceof Error ? e.message : "Có lỗi xảy ra."); }
    finally { setBusy(false); }
  }
  return <ModalFrame title="Báo cáo điểm ngập / kẹt xe" onClose={onClose}>
    <p className="subtle" style={{ marginTop: 10 }}>Báo cáo sẽ ở trạng thái chờ xác minh. Chỉ báo cáo thông tin bạn trực tiếp quan sát được.</p>
    {!db && <p className="warning-box">Cần cấu hình Supabase để gửi báo cáo thật.</p>}
    {db && !userId && <p className="warning-box">Hãy bấm biểu tượng tài khoản ở thanh trên để đăng nhập trước khi báo cáo.</p>}
    <label className="field">Loại cảnh báo<select value={type} onChange={e => setType(e.target.value as "FLOOD" | "TRAFFIC_JAM")}><option value="FLOOD">Ngập nước</option><option value="TRAFFIC_JAM">Ùn tắc giao thông</option></select></label>
    <label className="field">Mức độ<select value={severity} onChange={e => setSeverity(Number(e.target.value))}><option value={1}>Mức 1 · Nhẹ</option><option value={2}>Mức 2 · Trung bình</option><option value={3}>Mức 3 · Nghiêm trọng</option></select></label>
    <label className="field">Mô tả (10–500 ký tự)<textarea maxLength={500} rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Mô tả địa điểm, tình trạng giao thông hoặc mực nước quan sát được..." /></label>
    <label className="field">Ảnh hiện trường (không bắt buộc)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setPhoto(e.target.files?.[0] ?? null)} /></label>
    <button className="btn" style={{ width: "100%", marginTop: 12 }} onClick={onPick}><MapPin size={15} />{initialPoint ? `${initialPoint[0].toFixed(5)}, ${initialPoint[1].toFixed(5)} · Đổi vị trí` : "Chọn vị trí trên bản đồ"}</button>
    {error && <p className="notice-error" role="alert">{error}</p>}
    <button className="btn btn-primary" style={{ width: "100%", marginTop: 14 }} disabled={!db || !userId || !initialPoint || note.trim().length < 10 || busy} onClick={() => void submit()}>{busy ? "Đang gửi…" : "Gửi báo cáo chờ xác minh"}</button>
  </ModalFrame>;
}
function IncidentDialog({ item, db, userId, onClose, onRefresh }: { item: Incident; db: Db; userId: string | null; onClose: () => void; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function vote(vote_type: "confirm" | "false_alarm") {
    if (!db || !userId || item.is_demo) return;
    setBusy(true); setMessage("");
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const { data } = await db.auth.getSession();
        const response = await fetch(`/api/v1/reports/${item.id}/verify`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
          body: JSON.stringify({ vote_type, lat: position.coords.latitude, lng: position.coords.longitude, accuracy_m: position.coords.accuracy })
        });
        const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Không bỏ phiếu được.");
        setMessage("Đã ghi nhận phiếu; dữ liệu sẽ được cập nhật sau khi kiểm tra."); onRefresh();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể bỏ phiếu"); }
      finally { setBusy(false); }
    }, () => { setBusy(false); setMessage("Cần cho phép truy cập vị trí và ở gần điểm báo cáo để xác minh."); }, { enableHighAccuracy: true, timeout: 12000 });
  }
  return <ModalFrame title={item.title} onClose={onClose}>
    <p className="subtle" style={{ marginTop: 10 }}>{item.is_demo ? "DỮ LIỆU HƯ CẤU — KHÔNG PHẢI TÌNH TRẠNG HIỆN TẠI" : item.description}</p>
    <div className="warning-box" style={{ background: "#f3f8f5", borderColor: "#dce8e1", color: "#31574b" }}><Info size={17} /><span>Mức {item.severity} {item.water_depth_cm != null ? `· ${item.water_depth_cm} cm` : ""} · {statusLabel(item)}<br />{item.is_demo ? "Dữ liệu thử nghiệm" : `Ghi nhận lúc ${formatTime(item.created_at)}`}</span></div>
    {item.photo_url && !item.is_demo && <a href={item.photo_url} target="_blank" rel="noopener noreferrer" className="btn" style={{ marginTop: 12 }}>Xem ảnh hiện trường</a>}
    <p className="subtle" style={{ marginTop: 13 }}>Cộng đồng xác nhận: {item.crowd_verifications.confirms} · Báo sai: {item.crowd_verifications.rejects}</p>
    {item.source === "COMMUNITY" && !item.is_demo && <div style={{ display: "flex", gap: 9, marginTop: 12 }}><button className="btn" disabled={!userId || busy} onClick={() => void vote("confirm")}>Đúng sự thật</button><button className="btn" disabled={!userId || busy} onClick={() => void vote("false_alarm")}>Báo sai</button></div>}
    {!userId && !item.is_demo && <p className="subtle">Đăng nhập để xác minh báo cáo. Thiết bị cần cung cấp vị trí với độ chính xác phù hợp.</p>}
    {message && <p className="notice-success" role="status">{message}</p>}
  </ModalFrame>;
}

function CameraDialog({ camera, onClose }: { camera: Camera; onClose: () => void }) {
  return <ModalFrame title={camera.title} onClose={onClose}>
    <p className="subtle" style={{ margin: "12px 0" }}>Camera chỉ cung cấp hình ảnh quan sát. Không thể xác nhận độ sâu ngập, mức độ an toàn hoặc thời gian thực từ ảnh.</p>
    {camera.snapshot_url ? <CameraSnapshot camera={camera} /> : camera.stream_url ? <CameraPlayer url={camera.stream_url} /> : <p className="warning-box">Camera chưa có nguồn hiển thị hợp lệ.</p>}
  </ModalFrame>;
}
