import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import {
  completeAuthCallback,
  createAuthResponseHeaders,
} from "@/lib/supabase/auth-callback";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

// The callback consumes a single-use PKCE code; it must never be prerendered
// or served from any cache, or a stale execution replays the consumed code.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Session cookies written during the code exchange land on this carrier
  // response and are copied onto the redirect returned below.
  const cookieCarrier = new NextResponse();
  let clientPromise: Promise<SupabaseClient<Database> | null> | undefined;
  const getClient = () =>
    (clientPromise ??= createServerSupabaseClient(cookieCarrier));

  const result = await completeAuthCallback(
    request.url,
    async (code) => {
      const supabase = await getClient();
      if (!supabase) return { error: { message: "Supabase is not configured." } };
      return supabase.auth.exchangeCodeForSession(code);
    },
    async () => {
      const supabase = await getClient();
      if (!supabase) return false;
      const { data } = await supabase.auth.getUser();
      return Boolean(data.user);
    },
  );

  const redirect = NextResponse.redirect(
    new URL(result.destination, request.url),
    { headers: createAuthResponseHeaders() },
  );
  cookieCarrier.cookies
    .getAll()
    .forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
