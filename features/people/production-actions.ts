"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCapability } from "@/features/tenancy/authorise";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const context = { organisationId: z.string().uuid(), workspace: z.string().min(1).max(120) };

async function database() {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to manage club setup.");
  return client as unknown as SupabaseClient;
}

export async function createSeason(formData: FormData) {
  const input = z.object({ ...context, name: z.string().trim().min(2).max(80), startsOn: z.iso.date(), endsOn: z.iso.date() })
    .refine((value) => value.endsOn >= value.startsOn, { message: "The season end date must be on or after its start date." })
    .parse(Object.fromEntries(formData));
  await requireCapability(input.workspace, "seasons:manage");
  const { error } = await (await database()).from("seasons").insert({ organisation_id: input.organisationId, name: input.name, starts_on: input.startsOn, ends_on: input.endsOn });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/seasons`);
}

export async function createAgeGroup(formData: FormData) {
  const input = z.object({ ...context, name: z.string().trim().min(2).max(60), minimumAge: z.coerce.number().int().min(3).max(18), maximumAge: z.coerce.number().int().min(3).max(18) })
    .refine((value) => value.maximumAge >= value.minimumAge, { message: "Maximum age must be at least the minimum age." })
    .parse(Object.fromEntries(formData));
  await requireCapability(input.workspace, "teams:manage");
  const { error } = await (await database()).from("age_groups").insert({ organisation_id: input.organisationId, name: input.name, minimum_age: input.minimumAge, maximum_age: input.maximumAge });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/teams`);
}

export async function createTeam(formData: FormData) {
  const input = z.object({ ...context, name: z.string().trim().min(2).max(100), seasonId: z.string().uuid(), ageGroupId: z.string().uuid() }).parse(Object.fromEntries(formData));
  await requireCapability(input.workspace, "teams:manage");
  const { error } = await (await database()).from("teams").insert({ organisation_id: input.organisationId, name: input.name, season_id: input.seasonId, age_group_id: input.ageGroupId });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/teams`);
}

export async function createPlayer(formData: FormData) {
  const input = z.object({ ...context, firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), dateOfBirth: z.iso.date() }).parse(Object.fromEntries(formData));
  await requireCapability(input.workspace, "people:manage");
  if (input.dateOfBirth > new Date().toISOString().slice(0, 10)) throw new Error("Date of birth cannot be in the future.");
  const { error } = await (await database()).from("players").insert({ organisation_id: input.organisationId, first_name: input.firstName, last_name: input.lastName, date_of_birth: input.dateOfBirth });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/people`);
}

export async function createOppositionContact(formData: FormData) {
  const input = z.object({ ...context, clubName: z.string().trim().min(2).max(120), displayName: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().optional().or(z.literal("")), phone: z.string().trim().max(40).optional().or(z.literal("")) })
    .refine((value) => Boolean(value.email || value.phone), { message: "Enter an email address or phone number." })
    .parse(Object.fromEntries(formData));
  await requireCapability(input.workspace, "opposition:manage");
  const { error } = await (await database()).from("opposition_contacts").insert({ organisation_id: input.organisationId, club_name: input.clubName, display_name: input.displayName, email: input.email || null, phone: input.phone || null });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/opposition`);
}
