import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveActingGuardian } from "@/features/people/acting-guardian";

/**
 * The children a signed-in guardian may see, and which of them is in view.
 *
 * Every parent screen starts here, because every parent screen is a view of one
 * child. Sharing the resolution rather than repeating the query per section means
 * the guardian filter below cannot be correct in seven sections and missing in the
 * eighth.
 *
 * WHY THE EXPLICIT GUARDIAN FILTER MATTERS. It is tempting to select
 * `player_guardians` by `organisation_id` alone and let row-level security do the
 * narrowing. That is wrong, and wrong in a way a one-family test club cannot show.
 * `player_guardians_select_own_or_scoped` (0002_people_households.sql:449) reads:
 *
 *   using (
 *     public.is_current_guardian(organisation_id, guardian_id)
 *     or public.has_capability(organisation_id, 'people:manage', 'organisation', ...)
 *   )
 *
 * The second arm is the problem. A club administrator or owner who is also a parent
 * satisfies it, so an organisation-only query hands them every child in the club the
 * moment they open the parent view of their own family. Filtering on the guardian id
 * resolved from `auth.uid()` closes that, and does so without weakening the policy
 * for anyone who legitimately needs the broader read elsewhere.
 */

export interface LinkedChild {
  readonly playerId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly name: string;
  /**
   * A child can appear in more than one team. `team_memberships` carries no
   * uniqueness constraint per player, and a club running a child up an age group
   * mid-season is the ordinary case rather than the exotic one. Sections that filter
   * events by team must therefore match on membership rather than equality.
   */
  readonly teamIds: readonly string[];
}

type NamedObject = { first_name?: string; last_name?: string };
type NamedRelation = NamedObject | NamedObject[] | null;

/**
 * PostgREST returns an embedded row as an object or a single-element array
 * depending on how it infers the relationship. The production screens already carry
 * this shape; keeping one helper avoids a second interpretation of the same data.
 */
function relation(value: NamedRelation): NamedObject {
  return (Array.isArray(value) ? value[0] : value) ?? {};
}

interface LinkRow {
  player_id: string;
  players: NamedRelation;
}

interface TeamRow {
  player_id: string;
  team_id: string;
}

/**
 * Resolves to an empty list rather than throwing when the guardian has no linked
 * children. A person with nothing to see is not an error worth a stack trace; the
 * screens render an empty state for that.
 */
export async function loadLinkedChildren(
  db: SupabaseClient,
  organisationId: string,
): Promise<readonly LinkedChild[]> {
  const { guardianId } = await resolveActingGuardian(db, organisationId);

  const { data: linkData, error: linkError } = await db
    .from("player_guardians")
    .select("player_id,players(first_name,last_name)")
    .eq("organisation_id", organisationId)
    .eq("guardian_id", guardianId);
  if (linkError) throw new Error("We could not load the children linked to you.");

  const links = (linkData ?? []) as LinkRow[];
  if (!links.length) return [];

  const playerIds = links.map((link) => link.player_id);
  const { data: teamData, error: teamError } = await db
    .from("team_memberships")
    .select("player_id,team_id")
    .eq("organisation_id", organisationId)
    .eq("member_kind", "player")
    .eq("status", "active")
    .in("player_id", playerIds);
  if (teamError) throw new Error("We could not load your children's teams.");

  const teams = (teamData ?? []) as TeamRow[];

  return links.map((link) => {
    const player = relation(link.players);
    const firstName = player.first_name ?? "Linked";
    const lastName = player.last_name ?? "player";
    return {
      playerId: link.player_id,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      teamIds: teams
        .filter((team) => team.player_id === link.player_id)
        .map((team) => team.team_id),
    };
  });
}

/**
 * Which child the page is about.
 *
 * An unrecognised `?child=` falls back to the first linked child rather than
 * refusing. The id arrives in a URL, so it is as likely to be stale or shared as
 * malicious: a parent following last season's bookmark should land somewhere useful,
 * not on an error. Nothing is disclosed by the fallback, because the candidate list
 * was already narrowed to this guardian's own children before the request was
 * consulted. A hostile id simply is not in the list and is discarded.
 */
export function selectLinkedChild(
  children: readonly LinkedChild[],
  requestedPlayerId: string | undefined,
): LinkedChild | null {
  if (!children.length) return null;
  if (!requestedPlayerId) return children[0];
  return children.find((child) => child.playerId === requestedPlayerId) ?? children[0];
}
