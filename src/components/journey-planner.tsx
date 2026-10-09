"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CloudRain, ExternalLink, LoaderCircle, MapPin, Navigation, Route, ShieldAlert, TrafficCone } from "lucide-react";
import { buildGoogleMapsDirectionsUrl } from "@/lib/google-maps";
import type { JourneyRoute } from "@/lib/journey-analysis";
import type { NavigationRequest, VehicleMode } from "@/lib/navigation-progress";
import type { RouteOption } from "@/lib/types";

type Point = [number, number];
type Road = { id: string; name: string; address: string; district: string; lat: number; lng: number; source: string; precision?: "house" | "estimated" | "place" | "street"; precision_label?: string };
type JourneyResponse = {
  routes: JourneyRoute[];
  selected_route_id: string | null;
  traffic_aware: boolean;
  weather_available: boolean;
  flood_data_available: boolean;
  routing_provider: string;
  warning: string | null;
  checked_at: string;
  ranking_note: string;
  disclaimer: string;
  error?: string;
};

type Props = {
  fromRoad: Road;
  onPreview: (routes: RouteOption[], selectedId: string, from: Point, to: Point) => void;
  onFocus: (lat: number, lng: number) => void;
  onShowMap: () => void;
};
const km = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)} km` : `${Math.round(n)} m`;

function describeRain(route: JourneyRoute) {
  if (!route.weather_checked) return "Chưa đủ dữ liệu mưa dọc tuyến.";
  if (route.rain_hits === 0) return `Không thấy mưa ở ${route.weather_checked} điểm mẫu dọc tuyến.`;
  if (route.rain_hits <= 2) return `Mưa rải rác ở ${route.rain_hits}/${route.weather_checked} điểm mẫu.`;
  return `Mưa xuất hiện ở ${route.rain_hits}/${route.weather_checked} điểm mẫu, nên chuẩn bị áo mưa.`;
}
function describeFlood(route: JourneyRoute, floodAvailable: boolean) {
  if (!floodAvailable) return "Chưa kết nối dữ liệu ngập thực tế để xác nhận tuyến.";
  if (!route.risk_count) return "Chưa ghi nhận cảnh báo ngập gần tuyến trong dữ liệu hiện có.";
  return `Có ${route.risk_count} điểm cảnh báo gần tuyến, nên đi chậm và quan sát kỹ.`;
}
function describeTraffic(route: JourneyRoute, trafficAware: boolean) {
  if (!trafficAware) return "Thời gian đi là ước tính dự phòng, chưa có traffic trực tiếp.";
  const delayMinutes = Math.max(0, Math.round((route.traffic_delay_s ?? 0) / 60));
  return delayMinutes > 0 ? `Đang chậm hơn bình thường khoảng ${delayMinutes} phút.` : "Chưa thấy phát sinh chậm thêm do kẹt xe.";
}
function describeRoute(route: JourneyRoute, trafficAware: boolean, floodAvailable: boolean) {
  const rain = route.rain_hits === 0
    ? "ít tín hiệu mưa"
    : route.rain_hits <= 2
      ? "có mưa rải rác"
      : "mưa xuất hiện ở khá nhiều đoạn";
  const flood = !floodAvailable
    ? "dữ liệu ngập chưa đủ để xác nhận"
    : route.risk_count
      ? `có ${route.risk_count} cảnh báo ngập gần tuyến`
      : "chưa ghi nhận cảnh báo ngập gần tuyến";
  const delayMinutes = Math.max(0, Math.round((route.traffic_delay_s ?? 0) / 60));
  const traffic = !trafficAware
    ? "thời gian đi là ước tính dự phòng"
    : delayMinutes > 0
      ? `đang chậm hơn bình thường khoảng ${delayMinutes} phút`
      : "chưa thấy chậm thêm do kẹt xe";
  return `Tuyến này ${rain}, ${flood} và ${traffic}.`;
}

export default function JourneyPlanner({ fromRoad, onPreview, onFocus, onShowMap }: Props) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Road[]>([]);
  const [destination, setDestination] = useState<Road | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [routeBusy, setRouteBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<JourneyResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [followCorridor, setFollowCorridor] = useState(true);
  const [vehicleMode, setVehicleMode] = useState<VehicleMode>("motorcycle");
  const searchSeq = useRef(0);
  const journeyAbort = useRef<AbortController | null>(null);
  const destinationRef = useRef<HTMLInputElement | null>(null);
  // CityPass v1.0.3: retain destination and computed route options for this road.
  const journeyStorageKey = `citypass:journey:v1:${fromRoad.id}`;
  const [journeyRestored, setJourneyRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(journeyStorageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        query?: string; destination?: Road | null; results?: JourneyResponse | null;
        selectedId?: string | null; followCorridor?: boolean; vehicleMode?: VehicleMode;
      };
      if (saved.destination && typeof saved.destination.id === "string" &&
          Number.isFinite(saved.destination.lat) && Number.isFinite(saved.destination.lng)) {
        setDestination(saved.destination);
        setQuery(typeof saved.query === "string" ? saved.query : saved.destination.address);
        if (saved.results && Array.isArray(saved.results.routes) &&
            saved.results.routes.length > 0 && saved.results.routes.length <= 6 &&
            saved.results.routes.every(r => typeof r.id === "string" && Array.isArray(r.geometry))) {
          setResults(saved.results);
          const fallback = saved.results.routes[0].id;
          setSelectedId(saved.results.routes.some(r => r.id === saved.selectedId) ? saved.selectedId ?? fallback : fallback);
        }
      } else if (typeof saved.query === "string") setQuery(saved.query);
      if (typeof saved.followCorridor === "boolean") setFollowCorridor(saved.followCorridor);
      if (saved.vehicleMode === "motorcycle" || saved.vehicleMode === "car") setVehicleMode(saved.vehicleMode);
    } catch { /* Stale browser data must not break route search. */ }
    finally { setJourneyRestored(true); }
  }, [journeyStorageKey]);
  useEffect(() => {
    if (!journeyRestored) return;
    try {
      const snapshot = { query, destination, results, selectedId, followCorridor, vehicleMode };
      const serialized = JSON.stringify(snapshot);
      // Preserve destination even when the route geometry exceeds storage limits.
      if (serialized.length <= 1700000) window.sessionStorage.setItem(journeyStorageKey, serialized);
      else window.sessionStorage.setItem(journeyStorageKey,
        JSON.stringify({ query, destination, results: null, selectedId: null, followCorridor, vehicleMode }));
    } catch { /* Storage may be disabled. Current in-memory state still works. */ }
  }, [journeyRestored, journeyStorageKey, query, destination, results, selectedId, followCorridor, vehicleMode]);


  useEffect(() => {
    if (destination || query.trim().length < 3) return;
    const controller = new AbortController();
    const id = ++searchSeq.current;
    const timer = window.setTimeout(async () => {
      setSearchBusy(true);
      try {
        const response = await fetch(`/api/v1/roads/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        const body = await response.json() as { results?: Road[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Không tìm được địa điểm.");
        if (!controller.signal.aborted && id === searchSeq.current) setOptions(body.results ?? []);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Không tìm được điểm đến.");
      } finally { if (!controller.signal.aborted) setSearchBusy(false); }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, destination]);

  useEffect(() => () => journeyAbort.current?.abort(), []);

  function selectDestination(item: Road) {
    journeyAbort.current?.abort();
    setDestination(item); setQuery(item.address); setOptions([]); setResults(null); setSelectedId(null); setError("");
    onFocus(item.lat, item.lng);
  }
  function editDestination() {
    journeyAbort.current?.abort();
    setDestination(null); setQuery(""); setResults(null); setSelectedId(null); setError("");
    destinationRef.current?.focus();
  }
  function preview(route: JourneyRoute, data: JourneyResponse) {
    setSelectedId(route.id);
    onPreview(data.routes, route.id, [fromRoad.lat, fromRoad.lng], [destination!.lat, destination!.lng]);
  }
  async function plan() {
    if (!destination) { setError("Hãy chọn một điểm đến trong danh sách gợi ý."); return; }
    journeyAbort.current?.abort();
    const controller = new AbortController(); journeyAbort.current = controller;
    setRouteBusy(true); setResults(null); setError("");
    const params = new URLSearchParams({
      from_lat: String(fromRoad.lat), from_lng: String(fromRoad.lng),
      to_lat: String(destination.lat), to_lng: String(destination.lng), vehicle: vehicleMode
    });
    try {
      const response = await fetch(`/api/v1/roads/journey?${params}`, { signal: controller.signal, cache: "no-store" });
      const payload = await response.json() as JourneyResponse;
      if (!response.ok) throw new Error(payload.error ?? "Chưa tính được các tuyến.");
      if (controller.signal.aborted || !payload.routes?.length) {
        if (!controller.signal.aborted) throw new Error("Chưa có tuyến phù hợp để so sánh.");
        return;
      }
      setResults(payload);
      const selected = payload.routes.find(r => r.id === payload.selected_route_id) ?? payload.routes[0];
      preview(selected, payload);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Không so sánh được tuyến.");
    } finally { if (!controller.signal.aborted) setRouteBusy(false); }
  }

  const current = results?.routes.find(r => r.id === selectedId) ?? null;
  const url = destination && current ? buildGoogleMapsDirectionsUrl({
    from: [fromRoad.lat, fromRoad.lng], to: [destination.lat, destination.lng],
    geometry: current.geometry, mode: vehicleMode === "car" ? "driving" : "two-wheeler", includeWaypoints: followCorridor
  }) : null;

  return <section className="citypass-journey" aria-label="Lên kế hoạch chuyến đi tránh ngập mưa kẹt xe">
    <div className="citypass-journey-title"><Navigation size={18}/><div><strong>Bạn muốn đi đâu?</strong><small>So sánh tuyến ưu tiên xe máy từ điểm vừa tra cứu</small></div></div>
    <div className="citypass-journey-origin"><MapPin size={15}/><span>Từ: <strong>{fromRoad.name}</strong> <small>({fromRoad.district})</small></span></div>
    <label className="citypass-journey-label" htmlFor="citypass-journey-destination">Đến địa chỉ, số nhà hoặc địa điểm</label>
    <div className="citypass-journey-input">
      <ArrowRight size={17}/>
      <input ref={destinationRef} id="citypass-journey-destination" value={query}
        placeholder="VD: 45 Nơ Trang Long, Bình Thạnh"
        autoComplete="off"
        onChange={e => { setQuery(e.target.value); setDestination(null); setOptions([]); setResults(null); setError(""); }}
        onKeyDown={e => { if (e.key === "Escape") setOptions([]); else if (e.key === "Enter" && !destination && options[0]) selectDestination(options[0]); }} />
      {searchBusy && <LoaderCircle size={15} className="citypass-spin" />}
      {destination && <button type="button" onClick={editDestination} aria-label="Đổi điểm đến">Đổi</button>}
    </div>
    {!destination && options.length > 0 && <div className="citypass-journey-suggestions" aria-label="Gợi ý điểm đến">
      {options.map(item => <button key={item.id} type="button" onClick={() => selectDestination(item)}>
        <MapPin size={15}/><span><strong>{item.name}</strong><small>{item.address} · {item.district}</small><small className={`citypass-geocode-precision ${item.precision ?? "street"}`}>{item.precision_label ?? "Vị trí tham khảo"}</small></span>
      </button>)}
    </div>}
    {destination && <div className="citypass-journey-destination">Đến: <strong>{destination.name}</strong> · {destination.district}<small className={`citypass-geocode-precision ${destination.precision ?? "street"}`}>{destination.precision_label ?? "Vị trí cần xác nhận"}</small></div>}
    <div className="citypass-journey-vehicle"><label htmlFor="citypass-vehicle">Chọn phương tiện</label><select id="citypass-vehicle" value={vehicleMode} onChange={e => { const value = e.target.value as VehicleMode; setVehicleMode(value); setResults(null); setSelectedId(null); setError("Đã đổi phương tiện. Hãy tính tuyến lại để cập nhật lộ trình phù hợp."); }}><option value="motorcycle">Xe máy</option><option value="car">Ô tô</option></select></div>
    <button type="button" className="citypass-journey-plan" disabled={!destination || routeBusy} onClick={() => void plan()}>
      {routeBusy ? <><LoaderCircle size={17} className="citypass-spin"/> Đang so sánh các tuyến...</> : <><Route size={17}/> Tìm tuyến hạn chế mưa, ngập, kẹt xe</>}
    </button>
    {error && <p role="alert" className="citypass-road-error">{error}</p>}
    {results && <div className="citypass-journey-results">
      <strong className="citypass-journey-results-title">Các tuyến đề xuất · {results.routes.length} lựa chọn</strong>
      <p className="citypass-journey-note">{results.ranking_note}</p>
      <div className="citypass-journey-options">
        {results.routes.map((route, i) => <button type="button" key={route.id} className={`citypass-journey-option${route.id === selectedId ? " selected" : ""}`} onClick={() => preview(route, results)}>
          <span className="citypass-journey-option-head"><strong>{i === 0 ? "Ưu tiên đề xuất" : `Lựa chọn ${i + 1}`}</strong>{route.id === selectedId && <Check size={17}/>}</span>
          <span className="citypass-journey-metrics"><b>{km(route.distance_m)}</b><b>{Math.max(1, Math.round(route.duration_s / 60))} phút</b>{results.traffic_aware && route.traffic_delay_s != null && <small>Chậm +{Math.round(route.traffic_delay_s / 60)} phút</small>}</span>
          <span className="citypass-journey-badges">
            <span className={`citypass-journey-badge ${i === 0 ? "best" : "alt"}`}>{i === 0 ? "Phù hợp hơn cho xe máy" : "Phương án thay thế"}</span>
            {route.risk_count ? <span className="citypass-journey-badge warn">Có điểm cần lưu ý</span> : <span className="citypass-journey-badge ok">Ít cảnh báo hơn</span>}
          </span>
          <span className="citypass-journey-plain">{describeRoute(route, results.traffic_aware, results.flood_data_available)}</span>
          <span className="citypass-journey-summary"><CloudRain size={14}/><b>Mưa:</b> {describeRain(route)}</span>
          <span className="citypass-journey-summary"><ShieldAlert size={14}/><b>Ngập:</b> {describeFlood(route, results.flood_data_available)}</span>
          <span className="citypass-journey-summary"><TrafficCone size={14}/><b>Kẹt xe:</b> {describeTraffic(route, results.traffic_aware)}</span>
        </button>)}
      </div>
      {current && <div className="citypass-journey-handoff"><p className="citypass-journey-route-key">Tuyến đang chọn: hồng tím viền trắng. Tuyến thay thế: nét xám đứt.</p>
        <button type="button" className="citypass-journey-preview" onClick={() => { if (current && results) preview(current, results); onShowMap(); }}><Route size={16}/> Xem tuyến đã chọn trên bản đồ CityPass</button>
        <button type="button" className="citypass-journey-start" onClick={() => {
          if (!current || !destination || !results) return;
          const payload: NavigationRequest = { routeId: current.id, geometry: current.geometry, from: [fromRoad.lat, fromRoad.lng], to: [destination.lat, destination.lng], vehicle: vehicleMode, durationSeconds: current.duration_s, distanceMeters: current.distance_m, trafficAware: results.traffic_aware, floodDataAvailable: results.flood_data_available };
          preview(current, results);
          window.dispatchEvent(new CustomEvent("citypass:start-navigation", { detail: payload }));
          onShowMap();
        }}><Navigation size={17}/> Bắt đầu theo dõi trên CityPass</button>
        <label className="citypass-journey-waypoints"><input type="checkbox" checked={followCorridor} onChange={e => setFollowCorridor(e.target.checked)}/> Gửi tối đa 3 điểm trung gian theo tuyến CityPass</label>
        {url && <a href={url} target="_blank" rel="noopener noreferrer" className="citypass-journey-google"><Navigation size={18}/> Bắt đầu đi bằng Google Maps · {vehicleMode === "car" ? "Ô tô" : "Xe máy"} <ExternalLink size={15}/></a>}
        <p>Google Maps <strong>tự tính lại đường</strong>, có thể khác tuyến CityPass. Không bảo đảm tránh ngập/mưa hoặc đúng luật xe máy trên từng đoạn.</p>
      </div>}
      {!results.weather_available && <p className="citypass-journey-caution">Thiếu dữ liệu mưa dọc tuyến: xếp hạng hiện không phân biệt mưa.</p>}
      {!results.flood_data_available && <p className="citypass-journey-caution">Chưa có dữ liệu ngập đáng tin cậy: không thể xác nhận đường không ngập.</p>}
      {results.warning && <p className="citypass-journey-note">Nguồn: {results.warning}</p>}
      <p className="citypass-road-disclaimer">{results.disclaimer}</p>
    </div>}
  </section>;
}
