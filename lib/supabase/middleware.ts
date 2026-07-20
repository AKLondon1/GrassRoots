import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { resolveSupabasePublicConfig } from "@/lib/supabase/types";

export async function refreshSupabaseSession(
  request: NextRequest,
): Promise<NextResponse> {
  const config = resolveSupabasePublicConfig({
    mode: process.env.NEXT_PUBLIC_DATA_MODE as "demo" | "supabase" | undefined,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  let response = NextResponse.next({ request });
  if (!config) return response;

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value),
        );
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}
