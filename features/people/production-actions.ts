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

/**
 * Clone a season's teams, and their rosters, into the next season.
 *
 * One RPC rather than a loop of inserts here, purely for atomicity. Authorisation
 * needs no RPC at all -- `teams` and `team_memberships` carry direct write policies
 * and only club administrators hold `teams:manage`, which
 * supabase/tests/season_rollover.sql section A proves -- but a rollover that creates
 * twelve teams, clones their rosters and announces each one must not half-succeed,
 * and a function body is a single transaction.
 *
 * THE NAMES COME FROM THE PREVIEW, NOT FROM HERE. Each advanceable team renders a
 * checkbox and an editable name, so the form carries `include_<sourceTeamId>` and
 * `name_<sourceTeamId>` pairs. Only ticked boxes appear in the submission at all,
 * which is what lets a club leave a side behind. An empty name falls back to the
 * successor age group's name inside the RPC rather than being rejected, so clearing
 * the box means "use the default" instead of being an error.
 */
export async function rollOverSeason(formData: FormData) {
  const input = z.object({
    ...context,
    sourceSeasonId: z.string().uuid(),
    targetSeasonId: z.string().uuid(),
  }).parse(Object.fromEntries(formData));
  const access = await requireCapability(input.workspace, "teams:manage");
  if (access.organisationId !== input.organisationId) {
    throw new Error("That organisation does not belong to this workspace.");
  }

  const teams = [...formData.entries()].flatMap(([key]) => {
    if (!key.startsWith("include_")) return [];
    const sourceTeamId = key.slice("include_".length);
    return [{ sourceTeamId, name: String(formData.get(`name_${sourceTeamId}`) ?? "").trim() }];
  });
  if (!teams.length) throw new Error("Choose at least one team to bring across.");

  const { error } = await (await database()).rpc("roll_over_season", {
    requested_organisation_id: input.organisationId,
    requested_source_season_id: input.sourceSeasonId,
    requested_target_season_id: input.targetSeasonId,
    requested_teams: teams,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/seasons`);
  revalidatePath(`/app/${input.workspace}/teams`);
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

// createPlayer lived here. It inserted straight into `players` under
// organisation-scoped people:manage, so team staff could not use it at all, and
// any player it created belonged to no team and was therefore invisible to
// availability, squads and every expected-player count. Replaced by
// addPlayerToTeam in features/people/team-people-actions.ts, which calls the
// add_player_to_team RPC and writes the player and the team membership together.

export async function createOppositionContact(formData: FormData) {
  const input = z.object({ ...context, clubName: z.string().trim().min(2).max(120), displayName: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().optional().or(z.literal("")), phone: z.string().trim().max(40).optional().or(z.literal("")) })
    .refine((value) => Boolean(value.email || value.phone), { message: "Enter an email address or phone number." })
    .parse(Object.fromEntries(formData));
  await requireCapability(input.workspace, "opposition:manage");
  const { error } = await (await database()).from("opposition_contacts").insert({ organisation_id: input.organisationId, club_name: input.clubName, display_name: input.displayName, email: input.email || null, phone: input.phone || null });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/opposition`);
}
