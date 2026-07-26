import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { environment } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export function createSupabaseAdminClient(): SupabaseClient<Database> | null {
  const url = environment.public.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = environment.server.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey || environment.dataMode !== "supabase") return null;
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
