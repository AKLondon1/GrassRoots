"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const baseSchema = z.object({ organisationId: z.string().uuid(), workspace: z.string().min(1) });

async function currentMembership(db: SupabaseClient, organisationId: string) {
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw new Error("Your session has expired.");
  const { data, error } = await db.from("memberships").select("id").eq("organisation_id", organisationId).eq("user_id", auth.user.id).eq("status", "active").single();
  if (error || !data) throw new Error("An active organisation membership is required.");
  return String(data.id);
}

export async function sendConversationMessage(formData: FormData) {
  const input = baseSchema.extend({ conversationId: z.string().uuid(), body: z.string().trim().min(1).max(2_000) }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to send a message.");
  const db = client as unknown as SupabaseClient;
  const membershipId = await currentMembership(db, input.organisationId);
  const { error } = await db.from("conversation_messages").insert({ organisation_id: input.organisationId, conversation_id: input.conversationId, author_membership_id: membershipId, body: input.body, moderation_state: "visible" });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/messages`);
}

export async function saveCommunicationPreferences(formData: FormData) {
  const input = baseSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to save notification preferences.");
  const db = client as unknown as SupabaseClient;
  const membershipId = await currentMembership(db, input.organisationId);
  const { error } = await db.from("communication_preferences").upsert({
    organisation_id: input.organisationId,
    membership_id: membershipId,
    email_enabled: formData.get("emailEnabled") === "on",
    push_enabled: formData.get("pushEnabled") === "on",
    availability_reminders: formData.get("availabilityReminders") === "on",
    payment_receipts: formData.get("paymentReceipts") === "on",
  }, { onConflict: "organisation_id,membership_id" });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/notifications`);
}

export async function createAdultConversation(formData: FormData) {
  const input = baseSchema.extend({ title: z.string().trim().min(2).max(160), participantMembershipId: z.string().uuid() }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to create a conversation.");
  const db = client as unknown as SupabaseClient;
  const { error } = await db.rpc("create_adult_conversation", { requested_organisation_id: input.organisationId, requested_title: input.title, requested_participant_membership_id: input.participantMembershipId });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/communications`);
}

export async function publishAnnouncement(formData: FormData) {
  const input = baseSchema.extend({ title: z.string().trim().min(2).max(160), body: z.string().trim().min(1).max(10_000) }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to publish an announcement.");
  const db = client as unknown as SupabaseClient;
  const { error } = await db.rpc("publish_announcement", { requested_organisation_id: input.organisationId, requested_title: input.title, requested_body: input.body, requested_team_id: null });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/communications`);
}

export async function resolveConversationReport(formData: FormData) {
  const input = baseSchema.extend({ reportId: z.string().uuid(), status: z.enum(["resolved", "dismissed"]), resolutionNote: z.string().trim().min(2).max(1_000), moderationState: z.enum(["visible", "hidden", "removed"]) }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to moderate messages.");
  const { error } = await (client as unknown as SupabaseClient).rpc("resolve_conversation_report", { requested_organisation_id: input.organisationId, requested_report_id: input.reportId, requested_status: input.status, requested_resolution_note: input.resolutionNote, requested_moderation_state: input.moderationState });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/communications`);
}

export async function reportConversationMessage(formData: FormData) {
  const input = baseSchema.extend({ messageId: z.string().uuid(), category: z.enum(["conduct", "privacy", "safeguarding", "other"]) }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to report a message.");
  const db = client as unknown as SupabaseClient;
  const membershipId = await currentMembership(db, input.organisationId);
  const { error } = await db.from("conversation_reports").insert({ organisation_id: input.organisationId, message_id: input.messageId, reported_by_membership_id: membershipId, category: input.category });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/messages`);
}
