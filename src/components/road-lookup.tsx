"use client";

import JourneyPlanner from "./journey-planner";
import type { RouteOption } from "@/lib/types";
import { useEffect, useRef, useState } from "react";
import { Camera, ChevronDown, CloudRain, LoaderCircle, MapPin, Search, TrafficCone, Waves, X } from "lucide-react";

type Choice = "traffic" | "rain" | "flood" | "camera";
type PanelMode = "journey" | "lookup";
type Road = { id: string; name: string; address: string; district: string; lat: number; lng: number; source: string; precision?: "house" | "estimated" | "place" | "street"; precision_label?: string };
type InspectionResult = {
  state: "ok" | "warning" | "unknown";
  label: string; detail: string; updated_at: string | null; source: string;
  items?: { title: string; image_url: string | null }[];
};
type InspectionResponse = {
  checks: Partial<Record<Choice, InspectionResult>>;
  checked_at: string;
  radius_note: string;
};

const options: { id: Choice; label: string; Icon: typeof TrafficCone }[] = [
  { id: "traffic", label: "Kẹt xe", Icon: TrafficCone },
  { id: "rain", label: "Mưa", Icon: CloudRain },
  { id: "flood", label: "Ngập", Icon: Waves },
  { id: "camera", label: "Camera", Icon: Camera }
];
const defaults: Record<Choice, boolean> = { traffic: true, rain: true, flood: true, camera: false };
function formatTime(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Không rõ thời gian";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value));
}

export default function RoadLookup({ onFocus, onJourney }: { onFocus: (lat: number, lng: number) => void; onJourney: (routes: RouteOption[], selectedId: string, from: [number, number], to: [number, number]) => void }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [roads, setRoads] = useState<Road[]>([]);
  const [road, setRoad] = useState<Road | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("journey");
  const [checks, setChecks] = useState<Record<Choice, boolean>>(defaults);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [inspectBusy, setInspectBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InspectionResponse | null>(null);
  const seq = useRef(0);
  const searchCache = useRef(new Map<string, Road[]>());
  const searchController = useRef<AbortController | null>(null);
  const inspectController = useRef<AbortController | null>(null);
  /* CityPass combined search v1.1.0-compat */
  useEffect(() => {
    const openJourney = () => {
      setPanelMode("journey");
      setExpanded(true);
      if (window.matchMedia("(min-width: 761px)").matches) {
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLInputElement>(".citypass-road-search-inner input")?.focus({ preventScroll: true });
        });
      }
    };
    window.addEventListener("citypass:open-road-search", openJourney);
    return () => window.removeEventListener("citypass:open-road-search", openJourney);
  }, []);

  // CityPass v1.0.3: restore the selected road when the lookup is remounted.
  const [lookupRestored, setLookupRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("citypass:road-lookup:v1");
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        query?: unknown; road?: Road | null; checks?: Partial<Record<Choice, boolean>>;
        result?: InspectionResponse | null;
      };
      if (saved.road && typeof saved.road.id === "string" &&
          Number.isFinite(saved.road.lat) && Number.isFinite(saved.road.lng)) {
        setRoad(saved.road);
        setQuery(typeof saved.query === "string" ? saved.query : saved.road.address);
      } else if (typeof saved.query === "string") {
        setQuery(saved.query);
      }
      const savedChecks = saved.checks;
      if (savedChecks && typeof savedChecks === "object") {
        setChecks(current => ({
          traffic: typeof savedChecks.traffic === "boolean" ? savedChecks.traffic : current.traffic,
          rain: typeof savedChecks.rain === "boolean" ? savedChecks.rain : current.rain,
          flood: typeof savedChecks.flood === "boolean" ? savedChecks.flood : current.flood,
          camera: typeof savedChecks.camera === "boolean" ? savedChecks.camera : current.camera
        }));
      }
      if (saved.result && typeof saved.result === "object" &&
          saved.result.checks && typeof saved.result.checks === "object") setResult(saved.result);
    } catch { /* Missing or expired browser storage must not block CityPass. */ }
    finally { setLookupRestored(true); }
  }, []);
  useEffect(() => {
    if (!lookupRestored) return;
    try { window.sessionStorage.setItem("citypass:road-lookup:v1", JSON.stringify({ query, road, checks, result })); }
    catch { /* Storage may be unavailable in private browsing. */ }
  }, [lookupRestored, query, road, checks, result]);


  useEffect(() => {
    if (!expanded || road || query.trim().length < 3) return;
    const term = query.trim();
    const cached = searchCache.current.get(term.toLowerCase());
    if (cached) { setRoads(cached); setSuggestBusy(false); return; }
    const controller = new AbortController();
    searchController.current?.abort(); searchController.current = controller;
    const id = ++seq.current;
    const timeout = window.setTimeout(async () => {
      setSuggestBusy(true); setError("");
      try {
        const res = await fetch(`/api/v1/roads/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const body = await res.json() as { results?: Road[]; error?: string };
        if (!res.ok) throw new Error(body.error ?? "Không tìm được đường.");
        if (seq.current !== id || controller.signal.aborted) return;
        setRoads(body.results ?? []);
        searchCache.current.set(term.toLowerCase(), body.results ?? []);
        if (searchCache.current.size > 50) searchCache.current.delete(searchCache.current.keys().next().value ?? "");
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Không thể tìm kiếm.");
      } finally { if (!controller.signal.aborted) setSuggestBusy(false); }
    }, 430);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [query, road, expanded]);

  useEffect(() => () => { searchController.current?.abort(); inspectController.current?.abort(); }, []);

  const choose = (candidate: Road) => {
    inspectController.current?.abort();
    setRoad(candidate); setPanelMode("journey"); setQuery(candidate.address); setRoads([]); setError(""); setResult(null);
    onFocus(candidate.lat, candidate.lng);
  };
  const changeQuery = (value: string) => {
    setQuery(value); setRoad(null); setPanelMode("journey"); setResult(null); setRoads([]); setError("");
  };
  async function inspect() {
    if (!road) return;
    const selected = options.filter(item => checks[item.id]).map(item => item.id);
    if (!selected.length) { setError("Hãy chọn ít nhất một mục cần kiểm tra."); return; }
    inspectController.current?.abort();
    const controller = new AbortController(); inspectController.current = controller;
    setInspectBusy(true); setResult(null); setError("");
    const params = new URLSearchParams({ lat: String(road.lat), lng: String(road.lng), checks: selected.join(",") });
    try {
      const response = await fetch(`/api/v1/roads/inspect?${params}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json() as InspectionResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Không phân tích được vị trí.");
      if (!controller.signal.aborted) setResult(body);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Không lấy được dữ liệu phân tích.");
    } finally { if (!controller.signal.aborted) setInspectBusy(false); }
  }

  return <section className="citypass-road-search" aria-label="Tra cứu tình trạng đường">
    <div className="citypass-road-search-inner">
      <Search size={20} aria-hidden="true" />
      <input
        aria-label="Tìm tên đường tại TP. Hồ Chí Minh"
        placeholder="Số nhà, tên đường, quận... VD: 123 Hai Bà Trưng"
        value={query}
        onFocus={() => setExpanded(true)}
        onChange={e => changeQuery(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") setExpanded(false); else if (e.key === "Enter" && !road && roads[0]) choose(roads[0]); }}
        autoComplete="off"
      />
      {suggestBusy && <LoaderCircle className="citypass-spin" size={17} aria-label="Đang tìm đường" />}
      <button type="button" className="citypass-road-search-close citypass-road-search-toggle" title={expanded ? "Đóng bảng tra cứu" : "Mở bảng tra cứu"} aria-label={expanded ? "Đóng bảng tra cứu" : "Mở bảng tra cứu"} onClick={() => setExpanded(!expanded)}>
        {expanded ? <X size={19} /> : <ChevronDown size={18} />}
      </button>
    </div>
    {<div className="citypass-road-popover" hidden={!expanded} style={{ display: expanded ? undefined : "none" }}>
      {!road && <>
        <div className="citypass-road-popover-title">Chọn đúng đoạn đường tại TP.HCM</div>
        {query.trim().length < 3 && <p className="citypass-road-hint">Nhập số nhà + tên đường, ví dụ “123 Hai Bà Trưng, Quận 1”, hoặc tên địa điểm.</p>}
        {query.trim().length >= 3 && !suggestBusy && roads.length === 0 && !error && <p className="citypass-road-hint">Chưa tìm thấy địa chỉ phù hợp. Thử thêm phường/quận; một số số nhà chưa có trong dữ liệu bản đồ.</p>}
        {roads.length > 0 && <div className="citypass-road-suggestions" role="listbox" aria-label="Các đường tìm thấy">
          {roads.map(item => <button type="button" role="option" aria-selected={false} key={item.id} onClick={() => choose(item)}>
            <MapPin size={16}/><span><strong>{item.name}</strong><small>{item.address} · {item.district}</small><small className={`citypass-geocode-precision ${item.precision ?? "street"}`}>{item.precision_label ?? "Vị trí tham khảo"}</small></span>
          </button>)}
        </div>}
      </>}
      {road && <>
        <div className="citypass-road-selected"><MapPin size={17}/><div><strong>{road.name}</strong><small>{road.address} · {road.lat.toFixed(5)}, {road.lng.toFixed(5)}</small><small className={`citypass-geocode-precision ${road.precision ?? "street"}`}>{road.precision_label ?? "Vị trí cần xác nhận"}</small></div><button onClick={() => changeQuery(road.name)} aria-label="Đổi đoạn đường">Đổi</button></div>
        <div className="citypass-road-mode" aria-label="Bạn muốn làm gì?">
          <button type="button" aria-pressed={panelMode === "journey"} className={panelMode === "journey" ? "active" : ""} onClick={() => setPanelMode("journey")}>Tìm đường</button>
          <button type="button" aria-pressed={panelMode === "lookup"} className={panelMode === "lookup" ? "active" : ""} onClick={() => setPanelMode("lookup")}>Tra cứu tại đây</button>
        </div>
        <div className="citypass-road-pane" hidden={panelMode !== "journey"} style={{ display: panelMode === "journey" ? undefined : "none" }}>
        <JourneyPlanner key={road.id} fromRoad={road} onFocus={onFocus} onPreview={onJourney} onShowMap={() => setExpanded(false)} />
        </div>
        <div className="citypass-road-pane" hidden={panelMode !== "lookup"} style={{ display: panelMode === "lookup" ? undefined : "none" }}>
        <p className="citypass-road-hint">Chọn thông tin cần kiểm tra tại điểm đại diện gần đoạn đường này:</p>
        <div className="citypass-road-filters">
          {options.map(({ id, label, Icon }) => <label key={id} className={checks[id] ? "selected" : ""}>
            <input type="checkbox" checked={checks[id]} onChange={e => { setChecks(p => ({ ...p, [id]: e.target.checked })); setResult(null); }} />
            <Icon size={16}/>{label}
          </label>)}
        </div>
        <button className="citypass-road-analyze" disabled={inspectBusy || !Object.values(checks).some(Boolean)} onClick={() => void inspect()}>
          {inspectBusy ? <><LoaderCircle size={17} className="citypass-spin"/> Đang kiểm tra...</> : <><Search size={17}/> Tra cứu đường này</>}
        </button>
        {result && <div className="citypass-road-results">
          <strong>Kết quả tham khảo tại điểm đã chọn</strong>
          {options.filter(option => checks[option.id] && result.checks[option.id]).map(({ id, label, Icon }) => {
            const item = result.checks[id]!;
            return <article key={id} className={`citypass-road-result ${item.state}`}>
              <div className="citypass-road-result-header"><Icon size={18}/><strong>{label}</strong><span>{item.state === "unknown" ? "Chưa rõ" : item.state === "warning" ? "Cần lưu ý" : "Có dữ liệu"}</span></div>
              <b>{item.label}</b><p>{item.detail}</p>
              <small>Nguồn: {item.source} · {formatTime(item.updated_at)}</small>
              {item.items?.map((camera, i) => <div className="citypass-road-camera" key={`${camera.title}-${i}`}><span>{camera.title}</span>{camera.image_url && <a href={camera.image_url} target="_blank" rel="noopener noreferrer">Xem ảnh ↗</a>}</div>)}
            </article>;
          })}
          <p className="citypass-road-disclaimer">{result.radius_note} Các nguồn khác nhau về thời gian và độ phủ. Không dùng kết quả này làm bảo đảm đường an toàn cho xe máy.</p>
        </div>}
        </div>
      </>}
      {error && <p className="citypass-road-error" role="alert">{error}</p>}
      {!road && <p className="citypass-road-disclaimer">Gõ tên đường hoặc điểm quen thuộc, sau đó chọn đúng kết quả ở TP.HCM. Nếu có nhiều đoạn trùng tên, hãy ưu tiên kết quả có quận hoặc giao lộ gần nhất.</p>}
    </div>}
  </section>;
}
