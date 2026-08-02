"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCapability } from "@/features/tenancy/authorise";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Adding people to a team.
 *
 * Both writes go through the `SECURITY DEFINER` RPCs from migration 0022 rather
 * than touching `players`, `guardians`, `households` or `player_guardians`
 * directly. The table policies on all four check `people:manage` at
 * **organisation** scope, which is right for a club administrator and far too
 * wide for team staff: a coach inserting directly would reach every family in the
 * club. The RPCs take the team, or derive it from the player, and check
 * `can_access_team` against that.
 *
 * The RPCs also do work the application must not duplicate.
 * `add_guardian_for_player` reuses the household the child already belongs to, so
 * a second parent and any siblings land together instead of fragmenting into
 * duplicate households, and it reuses an existing guardian by email. Migration
 * 0025 adds the `guardian_permissions` row, which starts at communication only.
 */

const context = {
  organisationId: z.uuid(),
  workspace: z.string().trim().min(1).max(120),
  teamId: z.uuid(),
};

async function database() {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to manage your team's people.");
  return client as unknown as SupabaseClient;
}

/**
 * Refuse unless the caller holds `people:manage` for this team, and confirm the
 * submitted organisation is the one the workspace resolves to.
 *
 * The RPC checks team access again underneath. This is defence in depth and, more
 * usefully, it turns a refusal into a message about permission rather than a
 * database error surfacing from inside a function.
 */
async function authorise(input: { organisationId: string; workspace: string; teamId: string }) {
  const access = await requireCapability(input.workspace, "people:manage", {
    kind: "team",
    teamId: input.teamId,
  });
  if (access.organisationId !== input.organisationId) {
    throw new Error("That organisation does not belong to this workspace.");
  }
  return access;
}

function refreshPeople(workspace: string) {
  revalidatePath(`/app/${workspace}/people`);
  revalidatePath(`/app/${workspace}/players`);
}

/**
 * Turn an RPC failure into something a coach can act on.
 *
 * The codes are raised by the functions in migrations 0022 and 0025.
 */
function peopleMessage(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code === "42501") return "You can only add people to a team you staff.";
  if (error.code === "P0002" || error.code === "no_data_found") {
    return "That team or player could not be found in this club.";
  }
  if (error.code === "23514" || error.code === "check_violation") {
    return "Check the details: a date of birth cannot be in the future.";
  }
  return fallback;
}

const playerSchema = z.object({
  ...context,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  dateOfBirth: z.iso.date(),
});

/**
 * Create a player and put them on a team in one atomic call.
 *
 * A player created without a team membership is invisible to every part of the
 * weekly loop: availability, squads and expected-player counts all read
 * `team_memberships` filtered to `member_kind = 'player'`. The RPC writes both
 * rows together, so that state cannot arise.
 */
export async function addPlayerToTeam(formData: FormData): Promise<void> {
  const input = playerSchema.parse(Object.fromEntries(formData));
  await authorise(input);

  if (input.dateOfBirth > new Date().toISOString().slice(0, 10)) {
    throw new Error("Date of birth cannot be in the future.");
  }

  const db = await database();
  const { error } = await db.rpc("add_player_to_team", {
    target_team_id: input.teamId,
    player_first_name: input.firstName,
    player_last_name: input.lastName,
    player_date_of_birth: input.dateOfBirth,
  });
  if (error) throw new Error(peopleMessage(error, "The player could not be added."));

  refreshPeople(input.workspace);
}

const guardianSchema = z.object({
  ...context,
  playerId: z.uuid(),
  displayName: z.string().trim().min(2).max(120),
  // The RPC folds this to lower case, because `guardians` checks
  // `email = lower(email)`. Parsed as an email here so the staff member finds out
  // at the form rather than after a failed round trip.
  email: z.email().trim(),
  // `player_guardians.relationship` is checked at 2 to 60 characters.
  relationship: z.string().trim().min(2).max(60),
});

/**
 * Link a parent or carer to a player.
 *
 * `teamId` is submitted for the capability check only. The RPC derives the team
 * from the player's own active membership, so a mismatched team fails there too.
 */
export async function addGuardianForPlayer(formData: FormData): Promise<void> {
  const input = guardianSchema.parse(Object.fromEntries(formData));
  await authorise(input);

  const db = await database();
  const { error } = await db.rpc("add_guardian_for_player", {
    target_player_id: input.playerId,
    guardian_display_name: input.displayName,
    guardian_email: input.email,
    guardian_relationship: input.relationship,
  });
  if (error) throw new Error(peopleMessage(error, "The guardian could not be linked."));

  refreshPeople(input.workspace);
}
