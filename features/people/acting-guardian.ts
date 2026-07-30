import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who is replying, and which children they may reply for.
 *
 * The chain is signed-in user, then their active membership in this organisation,
 * then the guardian record attached to that membership, then the explicit link to
 * the child. Every step is anchored to `auth.uid()`, so nothing here can be
 * redirected by a form field.
 *
 * This exists because the obvious shortcut is wrong in a way that is invisible in
 * a one-family test club. Selecting a guardian by `organisation_id` and `status`
 * alone returns an arbitrary row, and the reply is then attributed to whichever
 * family the database happened to return first.
 *
 * Shared rather than inlined because availability, polls and the parent screens
 * all need the same answer, and a second copy is a second chance to get it wrong.
 */

export interface ActingGuardian {
  readonly membershipId: string;
  readonly guardianId: string;
}

/**
 * `guardians.membership_id` is nullable and unique per organisation. A guardian
 * record can therefore exist before the parent has an account, which is what makes
 * "added by the coach, invitation not yet accepted" representable. It also means a
 * signed-in user with no accepted invitation resolves to nothing here, which is a
 * refusal rather than an error.
 */
export async function resolveActingGuardian(
  db: SupabaseClient,
  organisationId: string,
): Promise<ActingGuardian> {
  const { data: auth } = await db.auth.getUser();
  if (!auth?.user) throw new Error("Sign in to reply.");

  const { data: membership, error: membershipError } = await db
    .from("memberships")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) throw new Error("We could not check your club membership.");
  if (!membership) throw new Error("You do not have access to this club.");
  const membershipId = (membership as { id: string }).id;

  const { data: guardian, error: guardianError } = await db
    .from("guardians")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("membership_id", membershipId)
    .eq("status", "active")
    .maybeSingle();
  if (guardianError) throw new Error("We could not check your guardian record.");
  if (!guardian) throw new Error("No guardian record is linked to your account.");

  return { membershipId, guardianId: (guardian as { id: string }).id };
}

/**
 * Refuse unless this guardian is linked to this child.
 *
 * The database refuses too: `validate_event_child_team_scope` (migration 0009) is
 * a BEFORE INSERT trigger raising foreign_key_violation with "Guardian must be
 * linked to the player", and PostgreSQL runs BEFORE row triggers ahead of the RLS
 * WITH CHECK. Checking here first turns that into a sentence a parent can read.
 */
export async function assertLinkedToPlayer(
  db: SupabaseClient,
  organisationId: string,
  guardianId: string,
  playerId: string,
): Promise<void> {
  const { data: link, error } = await db
    .from("player_guardians")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("guardian_id", guardianId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) throw new Error("We could not check your link to this player.");
  if (!link) throw new Error("You are not linked to this player.");
}
