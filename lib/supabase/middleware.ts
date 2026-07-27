import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { resolveSupabasePublicConfig } from "@/lib/supabase/types";

async function digestSessionId(sessionId: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionId));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function refreshSupabaseSession(
  request: NextRequest,
  requestHeaders?: Headers,
): Promise<NextResponse> {
  const config = resolveSupabasePublicConfig({
    mode: process.env.NEXT_PUBLIC_DATA_MODE as "demo" | "supabase" | undefined,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  let response = NextResponse.next({ request: { headers: requestHeaders ?? request.headers } });
  if (!config) return response;

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders ?? request.headers } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data: claimsData } = await supabase.auth.getClaims();
  const sessionId = claimsData?.claims && typeof claimsData.claims.session_id === "string" ? claimsData.claims.session_id : null;
  if (sessionId) {
    const sessionDigest = await digestSessionId(sessionId);
    const { data: revocation, error } = await supabase
      .from("session_revocations")
      .select("id")
      .eq("session_digest", sessionDigest)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) {
      return new NextResponse("Session security could not be verified.", { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    if (revocation) {
      await supabase.auth.signOut({ scope: "local" });
      const redirect = NextResponse.redirect(new URL("/sign-in?error=session-revoked", request.url));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    }
  }
  return response;
}
