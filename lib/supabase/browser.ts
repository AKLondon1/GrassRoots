"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolveSupabasePublicConfig,
  type DataMode,
  type Database,
} from "@/lib/supabase/types";

let client: SupabaseClient<Database> | undefined;

export function createBrowserSupabaseClient(): SupabaseClient<Database> | null {
  const config = resolveSupabasePublicConfig({
    mode: process.env.NEXT_PUBLIC_DATA_MODE as DataMode | undefined,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!config) return null;
  client ??= createBrowserClient<Database>(config.url, config.anonKey);
  return client;
}
