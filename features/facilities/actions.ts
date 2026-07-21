"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { localPartsToUtc } from "@/features/events/time-zone";

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

const bookingSchema = z.object({
  organisationId: z.string().uuid(), workspace: z.string().min(1), reservationUnitId: z.string().uuid(),
  eventInstanceId: z.string().uuid(),
  bufferBefore: z.coerce.number().int().min(0).max(240), bufferAfter: z.coerce.number().int().min(0).max(240),
});

export async function allocateFacilityBooking(formData: FormData) {
  const input = bookingSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to allocate a facility.");
  const db = client as unknown as SupabaseClient;
  const { error } = await db.rpc("allocate_facility_booking", {
    requested_organisation_id: input.organisationId,
    requested_unit_id: input.reservationUnitId,
    requested_event_instance_id: input.eventInstanceId,
    requested_title: "Linked fixture",
    requested_starts_at: "1970-01-01T00:00:00.000Z",
    requested_ends_at: "1970-01-01T00:01:00.000Z",
    requested_buffer_before: input.bufferBefore,
    requested_buffer_after: input.bufferAfter,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/pitch-planner`);
}

function localInputToUtc(value: string) {
  const [date, time] = value.split("T");
  const [year, month, day] = date!.split("-").map(Number);
  const [hour, minute] = time!.split(":").map(Number);
  return localPartsToUtc({ year: year!, month: month!, day: day!, hour: hour!, minute: minute!, second: 0 }, "Europe/London").toISOString();
}

const closureSchema = z.object({
  organisationId: z.string().uuid(), workspace: z.string().min(1), reservationUnitId: z.string().uuid(),
  reason: z.string().trim().min(2).max(240),
  startsAt: z.string().datetime(), endsAt: z.string().datetime(),
});

export async function closeFacilityAndResolveBooking(formData: FormData) {
  const input = closureSchema.parse(Object.fromEntries(formData));
  const replacements = Object.fromEntries([...formData.entries()].flatMap(([key, value]) => {
    if (!key.startsWith("resolution:")) return [];
    const bookingId = z.string().uuid().parse(key.slice("resolution:".length));
    const resolution = z.union([z.literal("cancel"), z.string().uuid()]).parse(value);
    return [[bookingId, resolution]];
  }));
  if (!Object.keys(replacements).length) throw new Error("Choose a resolution for every affected booking.");
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to close a facility.");
  const db = client as unknown as SupabaseClient;
  const { error } = await db.rpc("close_and_relocate_facility_bookings", {
    requested_organisation_id: input.organisationId,
    requested_unit_id: input.reservationUnitId,
    requested_starts_at: input.startsAt,
    requested_ends_at: input.endsAt,
    requested_reason: input.reason,
    replacement_units: replacements,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/inspections`);
  revalidatePath(`/app/${input.workspace}/calendar`);
}

const equipmentSchema = z.object({
  organisationId: z.string().uuid(), workspace: z.string().min(1), equipmentItemId: z.string().uuid(),
  quantity: z.coerce.number().int().positive(), startsAt: localDateTime, endsAt: localDateTime,
});

export async function reserveEquipment(formData: FormData) {
  const input = equipmentSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to reserve equipment.");
  const db = client as unknown as SupabaseClient;
  const { error } = await db.rpc("reserve_equipment", {
    requested_organisation_id: input.organisationId, requested_item_id: input.equipmentItemId,
    requested_event_id: null, requested_quantity: input.quantity,
    requested_starts_at: localInputToUtc(input.startsAt), requested_ends_at: localInputToUtc(input.endsAt),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/equipment`);
}

const supportSchema = z.object({
  organisationId: z.string().uuid(), workspace: z.string().min(1), subject: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(2_000),
  resourceType: z.enum(["venue", "facility", "facility_booking", "event"]).optional().or(z.literal("")),
  resourceId: z.string().uuid().optional().or(z.literal("")),
}).refine((value) => Boolean(value.resourceType) === Boolean(value.resourceId), { message: "Choose both a resource type and record ID, or leave both blank." });

export async function submitSupportRequest(formData: FormData) {
  const input = supportSchema.parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to request support.");
  const db = client as unknown as SupabaseClient;
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw new Error("Your session has expired.");
  const { data: membership, error: membershipError } = await db.from("memberships").select("id").eq("organisation_id", input.organisationId).eq("user_id", auth.user.id).eq("status", "active").single();
  if (membershipError || !membership) throw new Error("An active organisation membership is required.");
  const { error } = await db.from("support_requests").insert({
    organisation_id: input.organisationId, requested_by_membership_id: String(membership.id),
    subject: input.subject, description: input.description, status: "open",
    authorised_resources: input.resourceType && input.resourceId ? [{ type: input.resourceType, id: input.resourceId }] : [],
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/support`);
}

const baseRecordSchema = z.object({ organisationId: z.string().uuid(), workspace: z.string().min(1) });

export async function createVenue(formData: FormData) {
  const input = baseRecordSchema.extend({ name: z.string().trim().min(2).max(120), address: z.string().trim().max(240) }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to create a venue.");
  const db = client as unknown as SupabaseClient;
  const { error } = await db.from("venues").insert({ organisation_id: input.organisationId, name: input.name, address: input.address, time_zone: "Europe/London" });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/venues`);
}

export async function createMaintenanceRequest(formData: FormData) {
  const input = baseRecordSchema.extend({ facilityId: z.string().uuid(), title: z.string().trim().min(2).max(160), description: z.string().trim().max(1000), priority: z.enum(["low", "normal", "high", "urgent"]) }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to create maintenance.");
  const db = client as unknown as SupabaseClient;
  const { error } = await db.from("maintenance_requests").insert({ organisation_id: input.organisationId, facility_id: input.facilityId, title: input.title, description: input.description, priority: input.priority, status: "open" });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/maintenance`);
}

export async function createVolunteerShift(formData: FormData) {
  const input = baseRecordSchema.extend({ title: z.string().trim().min(2).max(160), startsAt: localDateTime, endsAt: localDateTime, requiredPeople: z.coerce.number().int().positive().max(100) }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to create a volunteer shift.");
  const db = client as unknown as SupabaseClient;
  const { error } = await db.from("volunteer_shifts").insert({ organisation_id: input.organisationId, title: input.title, starts_at: localInputToUtc(input.startsAt), ends_at: localInputToUtc(input.endsAt), required_people: input.requiredPeople });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/volunteers`);
}

export async function createClubDocumentReference(formData: FormData) {
  const input = baseRecordSchema.extend({ title: z.string().trim().min(2).max(160), storagePath: z.string().trim().min(3).max(500), checksum: z.string().trim().min(8).max(200) }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to create a document reference.");
  const db = client as unknown as SupabaseClient;
  const { error } = await db.rpc("create_club_document", { requested_organisation_id: input.organisationId, requested_title: input.title, requested_storage_path: input.storagePath, requested_checksum: input.checksum });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/documents`);
}

export async function startSupportSession(formData: FormData) {
  const input = baseRecordSchema.extend({ supportRequestId: z.string().uuid(), reason: z.string().trim().min(10).max(500), durationMinutes: z.coerce.number().int().min(1).max(60) }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to start support access.");
  const db = client as unknown as SupabaseClient;
  const { error } = await db.rpc("start_support_session", { requested_organisation_id: input.organisationId, requested_support_request_id: input.supportRequestId, requested_reason: input.reason, requested_duration_minutes: input.durationMinutes });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/support`);
}

export async function revokeSupportSessionAction(formData: FormData) {
  const input = baseRecordSchema.extend({ sessionId: z.string().uuid(), reason: z.string().trim().min(5).max(500) }).parse(Object.fromEntries(formData));
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to revoke support access.");
  const db = client as unknown as SupabaseClient;
  const { error } = await db.rpc("revoke_support_session", { requested_session_id: input.sessionId, requested_reason: input.reason });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/support`);
}
