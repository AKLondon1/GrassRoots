"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertOwnsPollRespondent, resolveActingGuardian } from "@/features/people/acting-guardian";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const pollResponseSchema = z.object({
  organisationId: z.uuid(), pollId: z.uuid(), optionId: z.uuid(), respondentId: z.uuid(),
  workspace: z.string().trim().min(1).max(120), response: z.enum(["available", "unavailable", "maybe"]),
});

/**
 * `respondentId` arrives from a hidden form field, so it is a request, not a fact.
 * Until this check existed the action upserted against whatever id the form carried,
 * which is the same attribution class as the availability bug fixed in Task 9: the
 * reply saved, against somebody else's child.
 *
 * Row-level security refuses a respondent belonging to another family, so this was
 * never an open door. It was a door held shut by one lock with nothing behind it,
 * and the failure mode was a raw policy violation rather than a sentence a parent
 * could understand.
 */
export async function saveProductionPollResponse(formData: FormData): Promise<void> {
  const input = pollResponseSchema.parse({
    organisationId: formData.get("organisationId"), pollId: formData.get("pollId"), optionId: formData.get("optionId"),
    respondentId: formData.get("respondentId"), workspace: formData.get("workspace"), response: formData.get("response"),
  });
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in is required to answer a time poll.");
  const db = client as unknown as SupabaseClient;
  const actor = await resolveActingGuardian(db, input.organisationId);
  await assertOwnsPollRespondent(db, input.organisationId, actor, input.pollId, input.respondentId);
  const { error } = await db.from("poll_responses").upsert({
    organisation_id: input.organisationId, poll_id: input.pollId, option_id: input.optionId,
    respondent_id: input.respondentId, response: input.response, responded_at: new Date().toISOString(),
  }, { onConflict: "organisation_id,option_id,respondent_id" });
  if (error) throw new Error("This poll response could not be saved for the linked player.");
  revalidatePath(`/app/${input.workspace}/polls`);
}
