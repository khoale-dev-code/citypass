/** Read only the public camera-sheet tab, never the Wi-Fi tab in the referenced project. */
export const CAMERA_CATALOG_URL = "https://rin2401.github.io/map/";
export const CAMERA_SHEET_ID = "12q04f4hwtVQjfVSUayDsgXLGGbqrl9urm8gp556nPQA";
export const CAMERA_SHEET_GID = "382031510";

export type PublicCamera = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  stream_url: null;
  snapshot_url: string;
  source_url: string;
  source: "PUBLIC_SNAPSHOT";
  updated_at: null;
};

function cellValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  const cell = value as { v?: unknown; f?: unknown };
  return cell.v ?? cell.f ?? null;
}

/** Google Visualization wraps a JSON response in a JS callback. Never eval it. */
export function parseCameraSheet(body: string): PublicCamera[] {
  if (body.length > 2_000_000) throw new Error("Camera catalog exceeds size limit");
  if (!/^\s*(?:\/\*O_o\*\/\s*)?google\.visualization\.Query\.setResponse\s*\(/.test(body)) throw new Error("Invalid public camera catalog format");
  const first = body.indexOf("{");
  const last = body.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("Invalid camera data");
  const parsed: unknown = JSON.parse(body.slice(first, last + 1));
  if (!parsed || typeof parsed !== "object" || !("table" in parsed)) throw new Error("Missing public camera table");
  const table = (parsed as { table?: { rows?: Array<{ c?: unknown[] }> } }).table;
  if (!Array.isArray(table?.rows)) throw new Error("Missing public camera rows");
  const result: PublicCamera[] = [];
  const used = new Set<string>();
  for (const row of table.rows.slice(0, 5000)) {
    if (!Array.isArray(row.c) || row.c.length < 4) continue;
    const lat = Number(cellValue(row.c[0]));
    const lng = Number(cellValue(row.c[1]));
    const name = String(cellValue(row.c[2]) ?? "Camera giao thông").trim().slice(0, 110);
    const camId = String(cellValue(row.c[3]) ?? "").trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 9 || lat > 12 || lng < 105 || lng > 108) continue;
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(camId) || used.has(camId)) continue;
    used.add(camId);
    result.push({
      id: `public-${camId}`, title: name || "Camera giao thông", lat, lng,
      stream_url: null,
      snapshot_url: `https://giaothong.hochiminhcity.gov.vn/render/ImageHandler.ashx?id=${encodeURIComponent(camId)}`,
      source_url: CAMERA_CATALOG_URL,
      source: "PUBLIC_SNAPSHOT", updated_at: null
    });
  }
  return result;
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearbyPublicCameras(cameras: PublicCamera[], lat: number, lng: number, radiusKm: number) {
  return cameras.map(camera => ({ camera, distance: distanceKm(lat, lng, camera.lat, camera.lng) }))
    .filter(item => item.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 120)
    .map(item => item.camera);
}
