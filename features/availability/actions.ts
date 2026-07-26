"use server";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const productionAvailabilitySchema = z.object({
  organisationId: z.uuid(), eventInstanceId: z.uuid(), teamId: z.uuid(), playerId: z.uuid(),
  workspace: z.string().trim().min(1).max(120), status: z.enum(["available", "unavailable", "unsure"]),
  note: z.string().trim().max(240).optional(),
});

export async function saveProductionAvailability(formData: FormData): Promise<void> {
  const input = productionAvailabilitySchema.parse({
    organisationId: formData.get("organisationId"), eventInstanceId: formData.get("eventInstanceId"),
    teamId: formData.get("teamId"), playerId: formData.get("playerId"), workspace: formData.get("workspace"),
    status: formData.get("status"), note: formData.get("note"),
  });
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in is required to update availability.");
  const db = client as unknown as SupabaseClient;
  const { data: guardian, error: guardianError } = await db.from("guardians").select("id").eq("organisation_id", input.organisationId).eq("status", "active").maybeSingle();
  if (guardianError || !guardian) throw new Error("A linked guardian profile is required to update availability.");
  const { error } = await db.from("availability_responses").upsert({
    organisation_id: input.organisationId, event_instance_id: input.eventInstanceId, team_id: input.teamId,
    player_id: input.playerId, guardian_id: guardian.id, status: input.status, note: input.note || null,
    idempotency_key: `app:${randomUUID()}`, responded_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "organisation_id,event_instance_id,player_id" });
  if (error) throw new Error("Availability could not be saved for this linked player and event.");
  revalidatePath(`/app/${input.workspace}/availability`);
}
