import { NextRequest, NextResponse } from "next/server";
import { normalizeRoadQuery } from "@/lib/road-insight";
import { parseTomTomAddressResults } from "@/lib/road-geocode";

export const dynamic = "force-dynamic";

let cache = new Map<string, { at: number; data: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

async function queryTomTom(query: string, key: string) {
  const url = new URL(`https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json`);
  url.search = new URLSearchParams({
    key, countrySet: "VN", geobias: "point:10.7769,106.7009",
    idxSet: "PAD,Addr,POI,Str,XStr", limit: "20", typeahead: "false", language: "vi-VN"
  }).toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`TomTom Search HTTP ${response.status}`);
  const data: unknown = await response.json();
  return { results: parseTomTomAddressResults(data, query), source: "TomTom Search" };
}

export async function GET(req: NextRequest) {
  const query = normalizeRoadQuery(req.nextUrl.searchParams.get("q") || "");
  if (!query) {
    return NextResponse.json({ error: "Nhập số nhà, tên đường hoặc địa điểm từ 3 đến 140 ký tự." }, { status: 400 });
  }
  const key = process.env.TOMTOM_API_KEY?.trim();
  if (!key) return NextResponse.json({ results: [], error: "Cần cấu hình TOMTOM_API_KEY để tìm đường tại TP.HCM." }, { status: 503 });
  const cacheKey = query.toLocaleLowerCase("vi");
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < 10 * 60_000) return NextResponse.json(hit.data);
  try {
    let task = inFlight.get(cacheKey);
    if (!task) {
      task = queryTomTom(query, key);
      inFlight.set(cacheKey, task);
    }
    const data = await task;
    cache.set(cacheKey, { at: Date.now(), data });
    if (cache.size > 160) cache = new Map([...cache].slice(-100));
    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ results: [], error: "TomTom Search tạm thời không phản hồi. Vui lòng thử lại." }, { status: 503 });
  } finally { inFlight.delete(cacheKey); }
}
