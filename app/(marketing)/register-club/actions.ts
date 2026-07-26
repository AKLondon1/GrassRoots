"use server";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { environment } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { DataMode } from "@/lib/supabase/types";

const schema = z.object({
  name: z.string().trim().min(2, "Enter the club name.").max(120),
  slug: z.string().trim().toLowerCase().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens."),
});

export type ClubRegistrationState = { status: "idle" | "error" | "created"; message?: string; workspace?: string; fieldErrors?: { name?: string; slug?: string } };
export type OrganisationRpc = (name: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { message: string } | null }>;

export async function createClubForMode(mode: DataMode, formData: FormData, rpc: OrganisationRpc): Promise<ClubRegistrationState> {
  if (mode !== "supabase") return { status: "error", message: "Club registration is unavailable in fictional demo mode." };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const flattened = z.flattenError(parsed.error).fieldErrors;
    return { status: "error", message: "Check the highlighted details.", fieldErrors: { name: flattened.name?.[0], slug: flattened.slug?.[0] } };
  }
  const { data, error } = await rpc("create_organisation", { organisation_name: parsed.data.name, organisation_slug: parsed.data.slug });
  if (error || !data) return { status: "error", message: "The club could not be created. The address may already be in use." };
  return { status: "created", message: "Club created.", workspace: parsed.data.slug };
}

export async function createClubAction(_state: ClubRegistrationState, formData: FormData): Promise<ClubRegistrationState> {
  const client = await createServerSupabaseClient();
  if (!client) return { status: "error", message: "Persistent club registration is not configured." };
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return { status: "error", message: "Sign in with an authorised adult account before registering a club." };
  return createClubForMode(environment.dataMode, formData, async (name, args) => {
    const { data, error } = await (client as unknown as SupabaseClient).rpc(name, args);
    return { data: data as string | null, error };
  });
}
