"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const organisationSchema = z.object({ organisationId: z.string().uuid(), workspace: z.string().min(1) });

export async function requestAccountExport(formData: FormData) {
  const input = organisationSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to request your export.");
  const { error } = await (client as unknown as SupabaseClient).rpc("request_account_export", { requested_organisation_id: input.organisationId });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/reports`);
  revalidatePath(`/app/${input.workspace}/household`);
}

export async function requestDataCorrection(formData: FormData) {
  const input = organisationSchema.extend({ fieldKey: z.enum(["display_name","guardian_email"]), proposedValue: z.string().trim().min(1).max(500), reason: z.string().trim().min(5).max(500) }).superRefine((value, context) => {
    if (value.fieldKey === "display_name" && (value.proposedValue.length < 2 || value.proposedValue.length > 120)) context.addIssue({ code: "custom", path: ["proposedValue"], message: "Display names must be 2–120 characters." });
    if (value.fieldKey === "guardian_email" && !z.email().safeParse(value.proposedValue).success) context.addIssue({ code: "custom", path: ["proposedValue"], message: "Enter a valid guardian email." });
  }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to request a correction.");
  const { error } = await (client as unknown as SupabaseClient).rpc("request_data_correction", { requested_organisation_id: input.organisationId, requested_field_key: input.fieldKey, requested_value: input.proposedValue, requested_reason: input.reason });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/household`);
}

export async function cancelDataCorrection(formData: FormData) {
  const input = organisationSchema.extend({ correctionId: z.string().uuid() }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to cancel a correction request.");
  const { error } = await (client as unknown as SupabaseClient).rpc("cancel_data_correction", { requested_correction_id: input.correctionId });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/household`);
}

export async function decideDataCorrection(formData: FormData) {
  const input = organisationSchema.extend({ correctionId: z.string().uuid(), decision: z.enum(["approve", "reject"]), decisionReason: z.string().trim().min(5).max(500) }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to review correction requests.");
  const { error } = await (client as unknown as SupabaseClient).rpc("decide_data_correction", { requested_correction_id: input.correctionId, requested_decision: input.decision, requested_reason: input.decisionReason });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/reports`);
}

export async function scheduleAccountDeletion(formData: FormData) {
  const input = organisationSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to schedule account deletion.");
  const { error } = await (client as unknown as SupabaseClient).rpc("schedule_account_deletion");
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/household`);
}

export async function cancelAccountDeletion(formData: FormData) {
  const input = organisationSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to cancel account deletion.");
  const { error } = await (client as unknown as SupabaseClient).rpc("cancel_account_deletion");
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/household`);
}

export async function scheduleOrganisationDeletion(formData: FormData) {
  const input = organisationSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to schedule organisation deletion.");
  const { error } = await (client as unknown as SupabaseClient).rpc("schedule_organisation_deletion", { requested_organisation_id: input.organisationId });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/settings`);
}

export async function cancelOrganisationDeletion(formData: FormData) {
  const input = organisationSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to cancel organisation deletion.");
  const { error } = await (client as unknown as SupabaseClient).rpc("cancel_organisation_deletion", { requested_organisation_id: input.organisationId });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/settings`);
}

export async function savePlatformPlan(formData: FormData) {
  const input = z.object({ planId: z.preprocess((value) => value === "" ? null : value, z.string().uuid().nullable()), code: z.string().trim().regex(/^[a-z0-9-]{2,40}$/), name: z.string().trim().min(2).max(120), monthlyPricePence: z.coerce.number().int().nonnegative() }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in as a platform operator.");
  const { error } = await (client as unknown as SupabaseClient).rpc("save_platform_plan", { requested_plan_id: input.planId, requested_code: input.code, requested_name: input.name, requested_monthly_price_pence: input.monthlyPricePence });
  if (error) throw new Error(error.message);
  revalidatePath("/app/platform/plans");
}

export async function savePlatformFeatureFlag(formData: FormData) {
  const input = z.object({ flagId: z.preprocess((value) => value === "" ? null : value, z.string().uuid().nullable()), key: z.string().trim().regex(/^[a-z0-9.-]{2,80}$/), description: z.string().trim().min(2).max(500), owner: z.string().trim().min(2).max(120), enabledByDefault: z.string().optional() }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in as a platform operator.");
  const { error } = await (client as unknown as SupabaseClient).rpc("save_platform_feature_flag", { requested_flag_id: input.flagId, requested_key: input.key, requested_description: input.description, requested_owner: input.owner, requested_enabled_by_default: input.enabledByDefault === "on" });
  if (error) throw new Error(error.message);
  revalidatePath("/app/platform/feature-flags");
}
