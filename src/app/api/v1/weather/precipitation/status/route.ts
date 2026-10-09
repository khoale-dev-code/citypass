import { NextResponse } from "next/server";
import { precipitationStatus } from "@/lib/precipitation-provider";

export const dynamic = "force-dynamic";
export async function GET() {
  const status = await precipitationStatus();
  return NextResponse.json({ ...status, fallback: status.available ? null : "Open-Meteo" }, {
    headers: { "Cache-Control": "no-store" }
  });
}
