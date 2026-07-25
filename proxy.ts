import type { NextRequest } from "next/server";

import { buildContentSecurityPolicy } from "@/lib/security/headers";
import { refreshSupabaseSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const response = await refreshSupabaseSession(request, requestHeaders);
  response.headers.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development"),
  );
  response.headers.set("Cache-Control", request.nextUrl.pathname.startsWith("/app/") ? "private, no-store" : response.headers.get("Cache-Control") ?? "no-cache");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
