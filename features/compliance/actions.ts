"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const consentSchema = z.object({ organisationId: z.string().uuid(), workspace: z.string().min(1), definitionVersionId: z.string().uuid(), playerId: z.string().uuid(), decision: z.enum(["granted", "declined"]) });

export async function respondToConsent(formData: FormData) {
  const input = consentSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to respond to consent.");
  const { error } = await (client as unknown as SupabaseClient).rpc("respond_to_consent", { requested_organisation_id: input.organisationId, requested_definition_version_id: input.definitionVersionId, requested_player_id: input.playerId, requested_decision: input.decision });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/consents`);
}

const withdrawalSchema = z.object({ organisationId: z.string().uuid(), workspace: z.string().min(1), responseId: z.string().uuid(), reason: z.string().trim().min(2).max(500) });

export async function withdrawConsent(formData: FormData) {
  const input = withdrawalSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to withdraw consent.");
  const { error } = await (client as unknown as SupabaseClient).rpc("withdraw_consent", { requested_organisation_id: input.organisationId, requested_response_id: input.responseId, requested_reason: input.reason });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/consents`);
}

const concernSchema = z.object({ organisationId: z.string().uuid(), workspace: z.string().min(1), category: z.string().trim().min(2).max(120), summary: z.string().trim().min(2).max(240), detail: z.string().trim().min(4).max(10_000), riskLevel: z.enum(["low","medium","high","immediate"]) });

export async function raiseSafeguardingConcern(formData: FormData) {
  const input = concernSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to raise a concern.");
  const { error } = await (client as unknown as SupabaseClient).rpc("raise_safeguarding_concern", { requested_organisation_id: input.organisationId, requested_category: input.category, requested_summary: input.summary, requested_detail: input.detail, requested_risk_level: input.riskLevel });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/safeguarding`);
}

const safeguardingActionSchema = z.object({ organisationId: z.string().uuid(), workspace: z.string().min(1), concernId: z.string().uuid(), actionType: z.enum(["note","assign","refer","status-change","close"]), detail: z.string().trim().min(2).max(10_000), nextStatus: z.enum(["open","assessing","referred","closed"]).optional().or(z.literal("")) });

export async function recordSafeguardingAction(formData: FormData) {
  const input = safeguardingActionSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in with the welfare role to update a concern.");
  const { error } = await (client as unknown as SupabaseClient).rpc("record_safeguarding_action", { requested_organisation_id: input.organisationId, requested_concern_id: input.concernId, requested_action_type: input.actionType, requested_detail: input.detail, requested_next_status: input.nextStatus || null });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/safeguarding`);
}
