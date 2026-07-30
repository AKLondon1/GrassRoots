"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCapability } from "@/features/tenancy/authorise";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Picking and publishing a match squad.
 *
 * Three database facts shape all of this, each asserted in
 * `supabase/tests/weekly_loop_rls.sql` before the code was written:
 *
 * 1. `squad_members` has INSERT and DELETE policies and no UPDATE policy, so a
 *    Supabase upsert is refused by RLS. Saving a selection deletes the squad's
 *    rows and inserts the new set.
 * 2. `squads` is unique on `(organisation_id, event_instance_id)`, so there is
 *    exactly one squad per fixture and creating it is idempotent.
 * 3. `position_order` is checked `> 0`, so the ordering is one-based. A
 *    zero-based array index is rejected.
 */

const context = {
  organisationId: z.uuid(),
  workspace: z.string().trim().min(1).max(120),
  teamId: z.uuid(),
};

async function database() {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to pick a squad.");
  return client as unknown as SupabaseClient;
}

async function authorise(input: { organisationId: string; workspace: string; teamId: string }) {
  const access = await requireCapability(input.workspace, "squads:manage", {
    kind: "team",
    teamId: input.teamId,
  });
  if (access.organisationId !== input.organisationId) {
    throw new Error("That organisation does not belong to this workspace.");
  }
  return access;
}

function refreshSquad(workspace: string) {
  revalidatePath(`/app/${workspace}/squad`);
  revalidatePath(`/app/${workspace}/today`);
}

const createSchema = z.object({ ...context, eventInstanceId: z.uuid() });

/**
 * Open a draft squad for a fixture.
 *
 * Idempotent by way of the unique constraint: a second attempt returns 23505 and
 * is treated as success, because the caller's intent, a squad existing for this
 * fixture, is already true. A coach who taps twice should not see an error.
 */
export async function createSquadForInstance(formData: FormData): Promise<void> {
  const input = createSchema.parse(Object.fromEntries(formData));
  await authorise(input);
  const db = await database();

  const { error } = await db.from("squads").insert({
    organisation_id: input.organisationId,
    event_instance_id: input.eventInstanceId,
    team_id: input.teamId,
    status: "draft",
  });
  if (error && error.code !== "23505") {
    throw new Error("The squad could not be started for this fixture.");
  }

  refreshSquad(input.workspace);
}

const membersSchema = z.object({ ...context, squadId: z.uuid() });

export async function setSquadMembers(formData: FormData): Promise<void> {
  const input = membersSchema.parse(Object.fromEntries(formData));
  await authorise(input);

  const selected = formData.getAll("selected").map(String);
  const standby = formData.getAll("standby").map(String);
  const players = [...selected, ...standby];

  // `squad_members` is unique on (organisation_id, squad_id, player_id), so one
  // child cannot be both selected and standby. Caught here rather than letting
  // the insert fail halfway, which would leave the squad empty: the delete has
  // already run by that point.
  const duplicated = players.some((player, index) => players.indexOf(player) !== index);
  if (duplicated) throw new Error("A player cannot be both selected and on standby.");

  const db = await database();

  const { data: squad, error: squadError } = await db
    .from("squads")
    .select("id,event_instance_id,status")
    .eq("organisation_id", input.organisationId)
    .eq("id", input.squadId)
    .single();
  if (squadError || !squad) throw new Error("This squad could not be found.");
  const instanceId = (squad as { event_instance_id: string }).event_instance_id;

  if (players.length) {
    const { data: unavailable, error } = await db
      .from("availability_responses")
      .select("player_id")
      .eq("organisation_id", input.organisationId)
      .eq("event_instance_id", instanceId)
      .eq("status", "unavailable")
      .in("player_id", players);
    if (error) throw new Error("We could not check availability replies.");
    if ((unavailable ?? []).length) {
      throw new Error("A selected player replied unavailable for this event.");
    }
  }

  // Delete then insert, because squad_members has no UPDATE policy and an upsert
  // is refused by RLS.
  const { error: deleteError } = await db
    .from("squad_members")
    .delete()
    .eq("organisation_id", input.organisationId)
    .eq("squad_id", input.squadId);
  if (deleteError) throw new Error("The previous selection could not be cleared.");

  // position_order is one-based: the column is checked `> 0`.
  const rows = [
    ...selected.map((playerId, index) => ({
      playerId,
      status: "selected" as const,
      order: index + 1,
    })),
    ...standby.map((playerId, index) => ({
      playerId,
      status: "standby" as const,
      order: index + 1,
    })),
  ].map(({ playerId, status, order }) => ({
    organisation_id: input.organisationId,
    squad_id: input.squadId,
    team_id: input.teamId,
    player_id: playerId,
    status,
    position_order: order,
  }));

  if (rows.length) {
    const { error: insertError } = await db.from("squad_members").insert(rows);
    if (insertError) {
      // squad_members_validate_player_team raises 23503 when a child is not on
      // this team.
      if (insertError.code === "23503") {
        throw new Error("One of those players is not in this team.");
      }
      throw new Error("The selection could not be saved.");
    }
  }

  refreshSquad(input.workspace);
}

const publishSchema = z.object({ ...context, squadId: z.uuid() });

/**
 * Publish the squad to families.
 *
 * `squads` carries a check constraint requiring `published_at` and
 * `published_by_membership_id` together whenever the status is published, so all
 * three columns are written in one update. The membership comes from
 * `requireCapability`, which resolved it from the workspace, so it cannot be
 * forged through the form.
 */
export async function publishSquad(formData: FormData): Promise<void> {
  const input = publishSchema.parse(Object.fromEntries(formData));
  const access = await authorise(input);
  const db = await database();

  const { data: members, error: memberError } = await db
    .from("squad_members")
    .select("player_id,status")
    .eq("organisation_id", input.organisationId)
    .eq("squad_id", input.squadId);
  if (memberError) throw new Error("We could not read the current selection.");

  const anySelected = ((members ?? []) as Array<{ status: string }>).some(
    (member) => member.status === "selected",
  );
  if (!anySelected) throw new Error("Select at least one player before publishing.");

  const { error } = await db
    .from("squads")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      published_by_membership_id: access.membershipId,
    })
    .eq("organisation_id", input.organisationId)
    .eq("id", input.squadId);
  if (error) throw new Error("The squad could not be published.");

  refreshSquad(input.workspace);
}
