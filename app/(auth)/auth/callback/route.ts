import { NextResponse, type NextRequest } from "next/server";

import {
  completeAuthCallback,
  createAuthResponseHeaders,
} from "@/lib/supabase/auth-callback";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const responseHeaders = createAuthResponseHeaders();
  const result = await completeAuthCallback(request.url, async (code) => {
    const supabase = await createServerSupabaseClient(responseHeaders);
    if (!supabase) return { error: { message: "Supabase is not configured." } };
    return supabase.auth.exchangeCodeForSession(code);
  });

  return NextResponse.redirect(new URL(result.destination, request.url), {
    headers: responseHeaders,
  });
}
