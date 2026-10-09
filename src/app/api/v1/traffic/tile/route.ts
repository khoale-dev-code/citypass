import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
const transparent = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl4zDoAAAAASUVORK5CYII=", "base64");
function tileCenter(z: number, x: number, y: number) {
  const n = 2 ** z;
  const lng = ((x + .5) / n) * 360 - 180;
  const t = Math.PI * (1 - 2 * (y + .5) / n);
  const lat = Math.atan(Math.sinh(t)) * 180 / Math.PI;
  return { lat, lng };
}
export async function GET(req: NextRequest) {
  const key = process.env.TOMTOM_API_KEY?.trim();
  if (!key) return new NextResponse(null, { status: 503 });
  const p = req.nextUrl.searchParams;
  const z = Number(p.get("z")), x = Number(p.get("x")), y = Number(p.get("y"));
  if (![z,x,y].every(Number.isInteger) || z < 10 || z > 18 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return new NextResponse(null, { status: 400 });
  const pos = tileCenter(z, x, y);
  // Only proxy tiles over greater Ho Chi Minh City; prevents using the API as a worldwide tile proxy.
  if (pos.lat < 10.3 || pos.lat > 11.3 || pos.lng < 106.3 || pos.lng > 107.4) return new NextResponse(new Uint8Array(transparent), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=60" } });
  const url = `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${y}.png?key=${encodeURIComponent(key)}`;
  try {
    const upstream = await fetch(url, { headers: { Accept: "image/png" }, cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!upstream.ok || !upstream.headers.get("content-type")?.includes("image/png")) return new NextResponse(null, { status: 502 });
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > 450_000) return new NextResponse(null, { status: 502 });
    return new NextResponse(bytes, { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=30", "X-Content-Type-Options": "nosniff" } });
  } catch { return new NextResponse(null, { status: 502 }); }
}
