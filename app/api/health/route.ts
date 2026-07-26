import { NextResponse } from "next/server";

import { probePlatformHealth } from "@/lib/observability/health-probe";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await probePlatformHealth();
  return NextResponse.json(snapshot, {
    status: snapshot.status === "unavailable" ? 503 : 200,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
