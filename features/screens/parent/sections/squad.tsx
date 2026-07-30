import { CheckCircle2 } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";

import { card, formatDateTime, type SectionContext } from "./shared";

/**
 * Whether this child has a place in a published squad.
 *
 * Ported from `ParentSquad` in `core-football.tsx`. The tick, the status badge and
 * the closing note are kept verbatim, because that note is a safeguarding decision
 * rather than copy: squad status uses neutral wording and shows no rankings and no
 * other child's selection history. A parent should learn whether their own child is
 * playing, and nothing about anybody else's.
 *
 * THE PUBLISHED FILTER IS DEFENCE IN DEPTH, AND STAYS. Migration 0027 narrowed the
 * guardian arm of `squads_view_team` and `squad_members_view_linked_or_manage` to
 * published squads, so the database now refuses a draft on its own. Keeping the
 * filter means a family still never sees a half-picked team sheet if that policy is
 * ever relaxed, and it costs one `.eq()`.
 *
 * Members are read for this child only, rather than for the squad. The whole team
 * sheet is not a parent's business, and asking for less is the simplest way to be
 * sure none of it arrives.
 */

interface SquadRow {
  id: string;
  event_instance_id: string;
  team_id: string;
  status: string;
  published_at: string | null;
}

interface SquadMemberRow {
  squad_id: string;
  player_id: string;
  status: "selected" | "standby" | "withdrawn";
}

const placeWording: Record<SquadMemberRow["status"], string> = {
  selected: "A place is confirmed in the published squad.",
  standby: "The manager may offer a place if one becomes available.",
  withdrawn: "This player is not currently in the squad.",
};

export async function SquadSection({ db, organisationId, child }: SectionContext) {
  const { data: squadData, error: squadError } = await db
    .from("squads")
    .select("id,event_instance_id,team_id,status,published_at")
    .eq("organisation_id", organisationId)
    .in("team_id", child.teamIds)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(20);
  if (squadError) throw new Error("We could not load published squad status.");
  const squads = (squadData ?? []) as SquadRow[];

  const { data: memberData, error: memberError } = squads.length
    ? await db
        .from("squad_members")
        .select("squad_id,player_id,status")
        .eq("organisation_id", organisationId)
        .eq("player_id", child.playerId)
        .in(
          "squad_id",
          squads.map((squad) => squad.id),
        )
    : { data: [], error: null };
  if (memberError) throw new Error("We could not load linked squad places.");
  const members = (memberData ?? []) as SquadMemberRow[];

  if (!members.length) {
    return (
      <EmptyState
        title="No published squad status"
        description={`When a manager publishes a squad, you will see ${child.firstName}'s status here.`}
      />
    );
  }

  return (
    <section data-testid="parent-squad" className="max-w-2xl space-y-4" aria-labelledby="squad-status-title">
      <h2 className="sr-only" id="squad-status-title">
        Squad status for {child.name}
      </h2>
      {members.map((member) => {
        const squad = squads.find((item) => item.id === member.squad_id);
        return (
          <article className={card} key={member.squad_id}>
            <div className="flex items-center gap-3">
              {member.status === "selected" ? (
                <CheckCircle2 className="size-6 text-success-strong" aria-hidden="true" />
              ) : null}
              <Status
                tone={
                  member.status === "selected" ? "success" : member.status === "standby" ? "warning" : "neutral"
                }
              >
                {member.status}
              </Status>
            </div>
            <h3 className="mt-4 text-xl font-semibold text-ink">{child.name}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{placeWording[member.status]}</p>
            {squad?.published_at ? (
              <p className="mt-4 text-xs font-semibold text-muted">
                Published {formatDateTime(squad.published_at)}
              </p>
            ) : null}
          </article>
        );
      })}
      {/* Verbatim from the design. A safeguarding decision, not copy. */}
      <p className="mt-4 text-sm leading-6 text-muted">
        Squad status uses neutral wording and does not show rankings or other children&rsquo;s
        selection history.
      </p>
    </section>
  );
}
