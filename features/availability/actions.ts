"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertLinkedToPlayer, resolveActingGuardian } from "@/features/people/acting-guardian";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const productionAvailabilitySchema = z.object({
  organisationId: z.uuid(), eventInstanceId: z.uuid(), teamId: z.uuid(), playerId: z.uuid(),
  workspace: z.string().trim().min(1).max(120), status: z.enum(["available", "unavailable", "unsure"]),
  // `formData.get` returns null for a field the form did not render, and
  // `.optional()` accepts only undefined. Without `.nullable()` a form with no
  // note box fails with a raw Zod type error rather than saving the reply.
  note: z.string().trim().max(240).optional().nullable(),
});

/**
 * Save a parent's reply for one child and one event.
 *
 * Two things were wrong here and both are fixed.
 *
 * The guardian was resolved with a filter on `organisation_id` and `status` only,
 * then `.maybeSingle()`. In any club with more than one active guardian that
 * returns an arbitrary family, so a reply could be recorded against someone
 * else's child. It now resolves through the signed-in user's membership and
 * verifies the link to this specific player.
 *
 * The idempotency key was `app:${randomUUID()}`, freshly minted on every submit.
 * `availability_responses` is unique on `(organisation_id, idempotency_key)` as
 * well as on `(organisation_id, event_instance_id, player_id)`, so the key was
 * doing nothing and a double submission relied entirely on the composite. The key
 * is now derived from the event and the child, which makes a resubmission
 * genuinely idempotent. It must include the player: a key built from the event
 * alone collides between two children in the same family, silently losing the
 * second reply. That is asserted in weekly_loop_rls.sql.
 */
export async function saveProductionAvailability(formData: FormData): Promise<void> {
  const input = productionAvailabilitySchema.parse({
    organisationId: formData.get("organisationId"), eventInstanceId: formData.get("eventInstanceId"),
    teamId: formData.get("teamId"), playerId: formData.get("playerId"), workspace: formData.get("workspace"),
    status: formData.get("status"), note: formData.get("note"),
  });
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in is required to update availability.");
  const db = client as unknown as SupabaseClient;

  const { guardianId } = await resolveActingGuardian(db, input.organisationId);
  await assertLinkedToPlayer(db, input.organisationId, guardianId, input.playerId);

  const now = new Date().toISOString();
  const { error } = await db.from("availability_responses").upsert({
    organisation_id: input.organisationId, event_instance_id: input.eventInstanceId, team_id: input.teamId,
    player_id: input.playerId, guardian_id: guardianId, status: input.status, note: input.note || null,
    // 79 characters, inside the 8 to 120 the column allows.
    idempotency_key: `avail:${input.eventInstanceId}:${input.playerId}`,
    responded_at: now, updated_at: now,
  }, { onConflict: "organisation_id,event_instance_id,player_id" });
  if (error) throw new Error("Availability could not be saved for this linked player and event.");

  revalidatePath(`/app/${input.workspace}/availability`);
}
