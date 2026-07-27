import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { environment } from "@/lib/env";
import {
  resolveSupabasePublicConfig,
  type Database,
} from "@/lib/supabase/types";

export async function createServerSupabaseClient(
  response?: NextResponse,
): Promise<SupabaseClient<Database> | null> {
  const config = resolveSupabasePublicConfig({
    mode: environment.dataMode,
    url: environment.public.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: environment.public.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!config) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        if (response) {
          // Route Handlers must attach session cookies to the response they
          // return; mutations via cookies() are not guaranteed to survive a
          // manually constructed redirect.
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          return;
        }
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. proxy.ts performs refreshes.
        }
      },
    },
  });
}
