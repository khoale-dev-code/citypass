"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Camera, Incident, RouteOption } from "@/lib/types";
import type { WeatherArea } from "@/lib/weather-areas";
import type { TrafficPoint } from "@/lib/traffic";
import { HCMC } from "@/lib/config";
import { selectVisible } from "@/lib/viewport";

type Point = [number, number];
type Props = {
  weatherAreas: WeatherArea[];
  showWeatherMarkers?: boolean;
  trafficEnabled: boolean;
  trafficPoints: TrafficPoint[];
  onSelectTraffic: (point: TrafficPoint) => void;
  selectedWeatherId: string | null;
  onSelectWeather: (area: WeatherArea) => void;
  incidents: Incident[];
  cameras: Camera[];
  rain: boolean;
  radar: { tile_url: string; time: number } | null;
  radarOpacity: number;
  gps: { point: Point; accuracy: number } | null;
  navigationFollowing?: boolean;
  focus: Point | null;
  pickMode: "from" | "to" | "report" | null;
  onPick: (point: Point) => void;
  onMove: (lat: number, lng: number) => void;
  onSelectIncident: (item: Incident) => void;
  onSelectCamera: (item: Camera) => void;
  routes: RouteOption[];
  selectedRoute: string | null;
  from: Point | null;
  to: Point | null;
};
function Events({ onPick, onMove, pickMode }: Pick<Props, "onPick" | "onMove" | "pickMode">) {
  const map = useMapEvents({
    click(e) { if (pickMode) onPick([e.latlng.lat, e.latlng.lng]); },
    moveend() { const p = map.getCenter(); onMove(p.lat, p.lng); }
  });
  return null;
}
function Focus({ point }: { point: Point | null }) {
  const map = useMap();
  useEffect(() => { if (point) map.flyTo(point, Math.max(map.getZoom(), 13), { duration: 0.5 }); }, [point, map]);
  return null;
}
function FollowNavigationGps({ gps, active }: { gps: Props["gps"]; active: boolean }) {
  const map = useMap();
  const previous = useRef(false);
  useEffect(() => {
    if (!active) { previous.current = false; return; }
    if (!gps) return;
    if (!previous.current) {
      map.setView(gps.point, Math.max(map.getZoom(), 15), { animate: false });
      previous.current = true;
    } else { map.panTo(gps.point, { animate: false }); }
  }, [active, gps, map]);
  return null;
}
function FitSelectedRoute({ routes, selectedRoute }: Pick<Props, "routes" | "selectedRoute">) {
  const map = useMap();
  const current = routes.find(route => route.id === selectedRoute);
  useEffect(() => {
    if (!current || current.geometry.length < 2) return;
    const bounds = L.latLngBounds(current.geometry);
    if (!bounds.isValid()) return;
    map.fitBounds(bounds, { paddingTopLeft: [32, 45], paddingBottomRight: [32, 175], maxZoom: 15, animate: true });
  }, [current, map]);
  return null;
}
// MapTiler is optional: use a browser-visible, domain-restricted PUBLIC key only.
// The free OSM and OSM-France endpoints are best-effort, not production SLAs.
const mapTilerKey = process.env.NEXT_PUBLIC_CITYPASS_MAPTILER_KEY?.trim();
type BaseMapSource = { id: string; label: string; url: string; attribution: string; tileSize?: number; zoomOffset?: number };
const BASEMAP_SOURCES: BaseMapSource[] = [
  ...(mapTilerKey && /^[\w-]{6,160}$/.test(mapTilerKey) ? [{
    id: "maptiler-streets",
    label: "MapTiler Streets",
    tileSize: 512,
    zoomOffset: -1,
    url: `https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${encodeURIComponent(mapTilerKey)}`,
    attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }] : []),
  {
    id: "osm-standard",
    label: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  },
  {
    id: "osm-hot",
    label: "OpenStreetMap HOT",
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, tiles courtesy of <a href="https://www.openstreetmap.fr/">OpenStreetMap France</a>'
  }
];
function MapSizeSync() {
  const map = useMap();
  useEffect(() => {
    let scheduled = 0;
    const update = () => {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(() => map.invalidateSize({ pan: false, animate: false }));
    };
    const element = map.getContainer();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    update();
    return () => { observer?.disconnect(); cancelAnimationFrame(scheduled); };
  }, [map]);
  return null;
}

// CityPass v0.6.6: recover failed individual raster tiles and defer traffic tiles until base tiles render.
function BaseMapTiles({ onReadyChange }: { onReadyChange: (ready: boolean) => void }) {
  const [index, setIndex] = useState(0);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "slow" | "partial" | "error">("loading");
  const [message, setMessage] = useState("");
  const counters = useRef({ requested: 0, loaded: 0, failed: 0 });
  const timers = useRef<{ slow: number | null; deadline: number | null }>({ slow: null, deadline: null });
  const retried = useRef(new WeakSet<HTMLImageElement>());
  const waiting = useRef(new WeakSet<HTMLImageElement>());
  const pending = useRef(0);
  const current = BASEMAP_SOURCES[index];

  const clearTimers = useCallback(() => {
    if (timers.current.slow !== null) window.clearTimeout(timers.current.slow);
    if (timers.current.deadline !== null) window.clearTimeout(timers.current.deadline);
    timers.current = { slow: null, deadline: null };
  }, []);

  const changeSource = useCallback((nextIndex: number) => {
    clearTimers();
    onReadyChange(false);
    counters.current = { requested: 0, loaded: 0, failed: 0 };
    pending.current = 0;
    retried.current = new WeakSet<HTMLImageElement>();
    waiting.current = new WeakSet<HTMLImageElement>();
    setMessage("");
    setStatus("loading");
    setIndex(nextIndex);
    setRetry(previous => previous + 1);
  }, [clearTimers, onReadyChange]);

  const assessBatch = useCallback(() => {
    const { loaded, failed, requested } = counters.current;
    if (pending.current > 0) {
      setStatus("partial");
      setMessage("Một số ô bản đồ đang được tải lại từ nguồn dự phòng...");
      timers.current.deadline = window.setTimeout(() => {
        const updated = counters.current;
        if (pending.current > 0 || updated.failed >= 2) {
          if (index < BASEMAP_SOURCES.length - 1) changeSource(index + 1);
          else { onReadyChange(false); setStatus("error"); setMessage("Cả hai nguồn bản đồ đều có ô lỗi. Hãy thử lại hoặc cấu hình MapTiler."); }
        } else if (updated.loaded > 0) {
          setStatus("ready"); setMessage(""); onReadyChange(true);
        }
      }, 4500);
      return;
    }
    if (requested === 0) {
      setStatus("ready");
      onReadyChange(true);
      return;
    }
    const manyFailures = failed >= 2 && (failed >= Math.max(1, loaded) * 0.35 || failed >= 4);
    if (loaded === 0 || manyFailures) {
      if (index < BASEMAP_SOURCES.length - 1) changeSource(index + 1);
      else { onReadyChange(false); setStatus("error"); setMessage("Nhiều ô ảnh nền không tải được. Có thể nguồn bản đồ đã chặn hoặc giới hạn truy cập."); }
      return;
    }
    if (failed > 0) {
      setStatus("partial");
      setMessage(`${failed} ô ảnh nền bị lỗi từ ${current.label}; thử đổi nguồn nếu chưa đầy đủ.`);
      onReadyChange(false);
    } else {
      setStatus("ready");
      setMessage("");
      onReadyChange(true);
    }
  }, [changeSource, current.label, index, onReadyChange]);

  const startWatch = useCallback(() => {
    clearTimers();
    timers.current.slow = window.setTimeout(() => {
      if (counters.current.loaded === 0) setStatus("slow");
    }, 3300);
    timers.current.deadline = window.setTimeout(assessBatch, 9500);
  }, [assessBatch, clearTimers]);

  useEffect(() => {
    startWatch();
    return clearTimers;
  }, [startWatch, retry, clearTimers]);

  const onBatchStart = useCallback(() => {
    counters.current = { requested: 0, loaded: 0, failed: 0 };
    pending.current = 0;
    startWatch();
  }, [startWatch]);
  const onTileStart = useCallback(() => { counters.current.requested += 1; }, []);
  const onTileLoaded = useCallback((event: L.LeafletEvent & { tile?: HTMLElement }) => {
    const tile = event.tile;
    if (tile instanceof HTMLImageElement && waiting.current.has(tile)) {
      waiting.current.delete(tile);
      pending.current = Math.max(0, pending.current - 1);
    }
    counters.current.loaded += 1;
    if (pending.current === 0 && counters.current.failed === 0 && counters.current.loaded >= Math.max(1, counters.current.requested)) {
      setStatus("ready"); setMessage(""); onReadyChange(true);
    }
  }, [onReadyChange]);
  const onTileError = useCallback((event: L.LeafletEvent & { tile?: HTMLElement; coords?: { z: number; x: number; y: number } }) => {
    const tile = event.tile;
    // Retry exactly one failed 256px tile with a second permitted tile provider. No bulk prefetch.
    if (tile instanceof HTMLImageElement && event.coords && !retried.current.has(tile) && current.tileSize !== 512) {
      const alternate = current.id === "osm-standard" ? "https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
        : current.id === "osm-hot" ? "https://tile.openstreetmap.org/{z}/{x}/{y}.png" : null;
      if (alternate) {
        retried.current.add(tile);
        waiting.current.add(tile);
        pending.current += 1;
        const { z, x, y } = event.coords;
        tile.src = alternate.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
        setStatus("partial");
        setMessage("Đang khôi phục ô ảnh nền bị lỗi từ nguồn dự phòng...");
        return;
      }
    }
    if (tile instanceof HTMLImageElement && waiting.current.has(tile)) {
      waiting.current.delete(tile);
      pending.current = Math.max(0, pending.current - 1);
    }
    counters.current.failed += 1;
    if (counters.current.failed >= 2) {
      setStatus("partial");
      setMessage("Một số ô ảnh nền vẫn lỗi sau khi thử nguồn dự phòng.");
    }
  }, [current.id, current.tileSize]);
  const onBatchComplete = useCallback(() => {
    clearTimers();
    assessBatch();
  }, [clearTimers, assessBatch]);

  return <>
    <TileLayer
      key={`${current.id}-${retry}`}
      url={current.url}
      attribution={current.attribution}
      maxZoom={19}
      tileSize={current.tileSize ?? 256}
      zoomOffset={current.zoomOffset ?? 0}
      updateWhenIdle
      updateWhenZooming={false}
      updateInterval={300}
      keepBuffer={2}
      detectRetina={false}
      eventHandlers={{ loading: onBatchStart, tileloadstart: onTileStart, tileload: onTileLoaded, tileerror: onTileError, load: onBatchComplete }}
    />
    {(status === "slow" || status === "partial" || status === "error") && <div
      role={status === "error" ? "alert" : "status"}
      className="citypass-map-tile-status"
      style={{ position: "absolute", zIndex: 700, left: "50%", top: 90, transform: "translateX(-50%)", width: "min(355px, calc(100% - 24px))", border: "1px solid #bad6cf", borderRadius: 12, padding: "10px 12px", background: "rgba(255,255,255,.97)", color: "#22483e", boxShadow: "0 8px 25px #152e2533", pointerEvents: "auto" }}
    >
      <strong style={{ fontSize: 12 }}>{status === "error" ? "Bản đồ chưa tải đầy đủ" : status === "slow" ? "Đang kết nối bản đồ..." : "Đang khôi phục ảnh nền..."}</strong>
      <p style={{ fontSize: 11, margin: "5px 0 9px", lineHeight: 1.4 }}>{message || `Đang tải từ ${current.label}.`}</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={() => changeSource(index)} style={{ background: "#08776c", color: "white", borderRadius: 8, minHeight: 36, padding: "7px 10px", fontWeight: 700, fontSize: 11 }}>Thử lại</button>
        {BASEMAP_SOURCES.length > 1 && <button type="button" onClick={() => changeSource((index + 1) % BASEMAP_SOURCES.length)} style={{ background: "#ebf4f1", borderRadius: 8, minHeight: 36, padding: "7px 10px", fontWeight: 700, fontSize: 11 }}>Đổi nền</button>}
        <span style={{ alignSelf: "center", fontSize: 10, opacity: 0.8 }}>{current.label}</span>
      </div>
      {status === "error" && !mapTilerKey && <p style={{ fontSize: 11, marginTop: 8 }}>Để có nguồn chuyên dụng, thêm NEXT_PUBLIC_CITYPASS_MAPTILER_KEY vào .env.local.</p>}
    </div>}
  </>;
}
function riskMarker(item: Incident) {
  const state = item.status === "PENDING" ? "pending" : "";
  return L.divIcon({
    className: "",
    html: `<div class="flood-marker sev${item.severity} ${state}" aria-label="Mức ${item.severity}">${item.type === "TRAFFIC_JAM" ? "!" : item.severity}</div>`,
    iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -18]
  });
}
function weatherMarker(area: WeatherArea, active: boolean) {
  const label = area.condition === "rain" ? `Mưa ${area.precipitationMm.toFixed(1)}` : area.condition === "cloud" ? "Nhiều mây" : area.isDay ? "Nắng" : "Quang mây";
  const kind = area.condition === "rain" ? "rain" : area.condition === "cloud" ? "cloud" : "clear";
  return L.divIcon({
    className: "weather-pin-host",
    html: `<div class="weather-map-pin ${kind}${active ? " active" : ""}"><span class="weather-map-dot"></span>${label}</div>`,
    iconSize: [104, 34], iconAnchor: [52, 17], popupAnchor: [0, -16]
  });
}
/** Only render features inside the visible viewport; mobile stays responsive with dense camera data. */
function ViewportMarkers(props: Props) {
  const map = useMap();
  const [viewport, setViewport] = useState(() => map.getBounds());
  useMapEvents({
    moveend() { setViewport(map.getBounds()); },
    zoomend() { setViewport(map.getBounds()); }
  });
  const padded = useMemo(() => viewport.pad(0.18), [viewport]);
  const bounds = useMemo(() => ({ south: padded.getSouth(), north: padded.getNorth(), west: padded.getWest(), east: padded.getEast() }), [padded]);
  const visibleIncidents = useMemo(() => selectVisible(props.incidents,
    item => [item.geometry.coordinates[1], item.geometry.coordinates[0]], bounds, 160)
    .map(item => ({ item, icon: riskMarker(item) })), [props.incidents, bounds]);
  const visibleCameras = useMemo(() => selectVisible(props.cameras,
    camera => [camera.lat, camera.lng], bounds, 85), [props.cameras, bounds]);
  const visibleTraffic = useMemo(() => selectVisible(props.trafficPoints,
    point => [point.lat, point.lng], bounds, 20), [props.trafficPoints, bounds]);
  const visibleWeather = useMemo(() => selectVisible(props.weatherAreas,
    area => [area.lat, area.lng], bounds, 22)
    .filter((_, index) => map.getZoom() >= 11 || index % 2 === 0), [props.weatherAreas, bounds, map]);
  return <>
    {visibleIncidents.map(({ item, icon }) => <Marker key={item.id} position={[item.geometry.coordinates[1], item.geometry.coordinates[0]]} icon={icon}>
      <Popup>
        <div style={{ minWidth: 170 }}>
          <strong>{item.title}</strong><br />
          <span>{item.is_demo ? "DỮ LIỆU MINH HỌA — KHÔNG CÓ THẬT" : `${item.source === "COMMUNITY" ? "Báo cáo người dùng" : "Cảm biến"} · Mức ${item.severity}`}</span><br />
          <button style={{ marginTop: 8, color: "#0a7668", fontWeight: 700 }} onClick={() => props.onSelectIncident(item)}>Xem chi tiết</button>
        </div>
      </Popup>
    </Marker>)}
    {visibleTraffic.map(point => <CircleMarker key={point.id} center={[point.lat, point.lng]} radius={7}
      pathOptions={{ color: "#fff", weight: 2, fillOpacity: 0.94, fillColor: point.level === "clear" ? "#1aa76c" : point.level === "slow" ? "#dcb338" : point.level === "jam" ? "#e76931" : "#b72c35" }}
      eventHandlers={{ click: () => props.onSelectTraffic(point) }}>
      <Popup><div className="traffic-map-popup"><strong>{point.name}</strong><p>{point.label} · gần đoạn đường này</p><p>Hiện tại: {point.currentSpeed} km/h · Bình thường: {point.freeFlowSpeed} km/h</p><small>TomTom Traffic Flow · mẫu điểm; không đại diện toàn quận.</small></div></Popup>
    </CircleMarker>)}
    {props.showWeatherMarkers !== false && visibleWeather.map(area => <Marker key={area.id} position={[area.lat, area.lng]} icon={weatherMarker(area, props.selectedWeatherId === area.id)} zIndexOffset={550} eventHandlers={{ click: () => props.onSelectWeather(area) }}>
      <Popup><div className="weather-map-popup"><strong>{area.name}</strong><p>{area.conditionLabel} (ước tính theo mô hình)</p><p>Nhiệt độ: {area.temperatureC.toFixed(1)}°C · Mây {area.cloudCover}%</p><p>Mưa 15 phút: {area.precipitationMm.toFixed(1)} mm</p>{area.rainChanceNextHours != null && <p>Khả năng mưa dự báo trong 3 giờ: tối đa {area.rainChanceNextHours}%</p>}<small>Giờ mô hình: {area.time.replace("T", " ")} · Nguồn Open-Meteo. Không phải cảm biến tại chỗ.</small></div></Popup>
    </Marker>)}
    {visibleCameras.map(camera => <CircleMarker key={camera.id} center={[camera.lat, camera.lng]} radius={10} pathOptions={{ color: "#7254b7", fillColor: "#7254b7", fillOpacity: .8 }}>
      <Popup><strong>{camera.title}</strong><p>{camera.snapshot_url ? "Ảnh camera cập nhật định kỳ (không phải video trực tiếp)." : camera.stream_url ? "Luồng video HLS." : "Chưa có hình ảnh."}</p>{(camera.snapshot_url || camera.stream_url) && <button onClick={() => props.onSelectCamera(camera)} style={{ color: "#0a7668", fontWeight: 700 }}>Xem camera</button>}</Popup>
    </CircleMarker>)}
  </>;
}

export default function MapView(props: Props) {
  const [basemapReady, setBasemapReady] = useState(false);
  return <MapContainer center={[HCMC.lat, HCMC.lng]} zoom={12} minZoom={6} maxZoom={18} zoomControl={false} attributionControl className="map-canvas" preferCanvas>
    <BaseMapTiles onReadyChange={setBasemapReady} />
    <MapSizeSync />
    {props.rain && props.radar && <TileLayer key={props.radar.time} url={props.radar.tile_url} minZoom={0} maxNativeZoom={10} maxZoom={18} opacity={props.radarOpacity} zIndex={300} updateWhenIdle keepBuffer={1} updateWhenZooming={false} attribution='<a href="https://openweathermap.org/">OpenWeatherMap</a>' />}
    {/* CityPass modeled-precipitation fallback: area-level estimates, not real weather radar. */}
    {props.rain && props.weatherAreas.filter(area => area.precipitationMm >= 0.1).map(area => <Circle
      key={'modeled-rain-' + area.id}
      center={[area.lat, area.lng]}
      radius={Math.min(7000, 2400 + Math.sqrt(area.precipitationMm) * 1200)}
      pathOptions={{ stroke: true, color: '#184d92', weight: 1.2, opacity: 0.5 * props.radarOpacity, dashArray: '6 5', fill: true, fillColor: area.precipitationMm >= 4 ? '#204bb0' : area.precipitationMm >= 1 ? '#2379cb' : '#5ab1ed', fillOpacity: Math.min(0.54, 0.36 + Math.sqrt(area.precipitationMm) * 0.07) * props.radarOpacity }}
      interactive={false}
    />)}
    {props.trafficEnabled && basemapReady && <TileLayer
      url="/api/v1/traffic/tile?z={z}&x={x}&y={y}"
      minZoom={10} maxZoom={18} maxNativeZoom={18} opacity={0.88} zIndex={385} updateWhenIdle keepBuffer={1} updateWhenZooming={false}
      attribution='Traffic &copy; <a href="https://www.tomtom.com/">TomTom</a>'
    />}
    <Events onPick={props.onPick} onMove={props.onMove} pickMode={props.pickMode} />
    <Focus point={props.focus} />
    <FollowNavigationGps gps={props.gps} active={Boolean(props.navigationFollowing)} />
    <FitSelectedRoute routes={props.routes} selectedRoute={props.selectedRoute} />
    <ZoomControl position="bottomright" />
    {props.gps && <>
      <Circle center={props.gps.point} radius={Math.max(5, props.gps.accuracy)} pathOptions={{ color: "#1468b8", fillColor: "#5399df", fillOpacity: .12, weight: 1 }} interactive={false} />
      <CircleMarker center={props.gps.point} radius={7} pathOptions={{ color: "#fff", weight: 3, fillColor: "#1265ad", fillOpacity: 1 }}><Popup>Vị trí GPS gần đúng · sai số ±{Math.round(props.gps.accuracy)} m</Popup></CircleMarker>
    </>}
    <ViewportMarkers {...props} />
    {props.routes.filter(route => route.id !== props.selectedRoute).map(route =>
      <Polyline key={`citypass-alternate-${route.id}`} positions={route.geometry}
        pathOptions={{ color: "#667a91", weight: 3, opacity: 0.36, dashArray: "8 10", lineCap: "round" }} />)}
    {props.routes.filter(route => route.id === props.selectedRoute).map(route =>
      <Polyline key={`citypass-selected-halo-${route.id}`} positions={route.geometry}
        pathOptions={{ color: "#ffffff", weight: 12, opacity: 1, lineCap: "round", lineJoin: "round" }} />)}
    {props.routes.filter(route => route.id === props.selectedRoute).map(route =>
      <Polyline key={`citypass-selected-core-${route.id}`} positions={route.geometry}
        pathOptions={{ color: "#b21dc9", weight: 7, opacity: 1, lineCap: "round", lineJoin: "round" }} />)}
    {props.from && <CircleMarker center={props.from} radius={9} pathOptions={{ color: "#fff", fillColor: "#087d6e", fillOpacity: 1, weight: 3 }}><Popup>Điểm xuất phát</Popup></CircleMarker>}
    {props.to && <CircleMarker center={props.to} radius={9} pathOptions={{ color: "#fff", fillColor: "#213f7b", fillOpacity: 1, weight: 3 }}><Popup>Điểm đến</Popup></CircleMarker>}
  </MapContainer>;
}
