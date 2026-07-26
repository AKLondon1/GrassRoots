import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { environment } from "@/lib/env";
import {
  resolveSupabasePublicConfig,
  type Database,
} from "@/lib/supabase/types";

export async function createServerSupabaseClient(
  responseHeaders?: Headers,
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
      setAll(cookiesToSet, headers) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
          Object.entries(headers).forEach(([name, value]) =>
            responseHeaders?.set(name, value),
          );
        } catch {
          // Server Components cannot write cookies. proxy.ts performs refreshes.
        }
      },
    },
  });
}
