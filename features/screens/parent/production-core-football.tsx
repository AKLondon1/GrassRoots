import type { SupabaseClient } from "@supabase/supabase-js";

import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import { ChildSelector } from "@/features/screens/parent/child-selector";
import { loadLinkedChildren, selectLinkedChild } from "@/features/screens/parent/linked-children";
import { ActionsSection } from "@/features/screens/parent/sections/actions";
import { AnnouncementsSection } from "@/features/screens/parent/sections/announcements";
import { AvailabilitySection } from "@/features/screens/parent/sections/availability";
import { EventSection } from "@/features/screens/parent/sections/event";
import { HomeSection } from "@/features/screens/parent/sections/home";
import { PollsSection } from "@/features/screens/parent/sections/polls";
import {
  card,
  EventPanel,
  eventColumns,
  formatDateTime,
  type EventRow,
  type SectionContext,
} from "@/features/screens/parent/sections/shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The parent journey, against live data, for one child at a time.
 *
 * Every section here is a view of a single child, so the child is resolved once at the
 * top and handed down rather than re-derived per section. That is not tidiness: the
 * guardian filter in `loadLinkedChildren` is a security boundary, and a boundary that
 * must be reapplied correctly in eight places is a boundary that will eventually be
 * applied in seven.
 *
 * TEAM MEMBERSHIP IS A LIST. `team_memberships` carries no per-player uniqueness and a
 * child moved up an age group mid-season is ordinary, so every event read filters with
 * `.in("team_id", child.teamIds)`. Equality would silently drop half a child's fixtures.
 */

interface SquadRow { id: string; event_instance_id: string; team_id: string; status: string; published_at: string | null }
interface SquadMemberRow { squad_id: string; player_id: string; status: "selected" | "standby" | "withdrawn" }

export async function ProductionParentCoreFootballScreen({
  organisationId,
  section,
  workspace,
  childId,
}: {
  organisationId: string;
  section: string;
  workspace: string;
  /** The `?child=` in the URL. Unrecognised values fall back to the first linked child. */
  childId?: string;
}) {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("The organisation connection is unavailable.");
  const db = client as unknown as SupabaseClient;

  const linkedChildren = await loadLinkedChildren(db, organisationId);
  const child = selectLinkedChild(linkedChildren, childId);

  // A guardian with no linked child is not an error. It is the ordinary state between
  // accepting an invitation and a coach linking the family to a player.
  if (!child) {
    return (
      <EmptyState
        title="No linked children yet"
        description="When your club links a child to your guardian account, their football week appears here."
      />
    );
  }

  const context: SectionContext = { db, organisationId, workspace, child, now: new Date().toISOString() };

  return (
    <div className="space-y-5">
      <ChildSelector
        linkedChildren={linkedChildren}
        section={section}
        selectedPlayerId={child.playerId}
        workspace={workspace}
      />
      {/*
        Awaited inline rather than rendered as an element. A nested async server
        component returned as `<Section/>` leaves a test that renders `await Screen(...)`
        holding an unresolved element instead of markup.
      */}
      {await renderSection(section, context)}
    </div>
  );
}

async function renderSection(section: string, context: SectionContext) {
  if (section === "home") return await HomeSection(context);
  if (section === "actions") return await ActionsSection(context);
  if (section === "announcements") return await AnnouncementsSection(context);
  if (section === "availability") return await AvailabilitySection(context);
  if (section === "polls") return await PollsSection(context);
  if (section === "squad") return await SquadSection(context);
  if (section === "event") return await EventSection(context);
  return await ScheduleSection(section, context);
}

/**
 * Upcoming events for this child's teams. Still shared by `actions` and `schedule`
 * until each is rewritten to its own shape.
 */
async function ScheduleSection(section: string, { db, organisationId, child, now }: SectionContext) {
  const { data: eventData, error: eventError } = await db.from("event_instances").select(eventColumns).eq("organisation_id", organisationId).in("team_id", child.teamIds).neq("status", "cancelled").gte("ends_at", now).order("starts_at").limit(25);
  if (eventError) throw new Error("We could not load your linked football updates.");
  const events = (eventData ?? []) as EventRow[];
  if (!events.length) return <EmptyState title="No linked activity yet" description={`Upcoming events for ${child.firstName} will appear here.`} />;
  return <section className="space-y-4" aria-label={section === "actions" ? "Upcoming actions" : "Upcoming schedule"}>{events.map((event) => <EventPanel event={event} key={event.id} />)}</section>;
}

async function SquadSection({ db, organisationId, child }: SectionContext) {
  const { data, error } = await db.from("squads").select("id,event_instance_id,team_id,status,published_at").eq("organisation_id", organisationId).in("team_id", child.teamIds).eq("status", "published").order("published_at", { ascending: false }).limit(20);
  if (error) throw new Error("We could not load published squad status.");
  const squads = (data ?? []) as SquadRow[];
  // The published filter above is now defence in depth: migration 0027 narrowed the
  // guardian arm of the squad policies to published squads. Keeping it means a draft
  // team sheet never reaches a family even if that policy is later relaxed.
  const { data: memberData, error: memberError } = squads.length ? await db.from("squad_members").select("squad_id,player_id,status").eq("organisation_id", organisationId).eq("player_id", child.playerId).in("squad_id", squads.map((squad) => squad.id)) : { data: [], error: null };
  if (memberError) throw new Error("We could not load linked squad places.");
  const members = (memberData ?? []) as SquadMemberRow[];
  if (!members.length) return <EmptyState title="No published squad status" description={`When a manager publishes a squad, you will see ${child.firstName}'s status here.`} />;
  return <section className="space-y-4" aria-label="Linked squad status">{members.map((member) => { const squad = squads.find((item) => item.id === member.squad_id); return <article className={card} key={member.squad_id}><Status tone={member.status === "selected" ? "success" : member.status === "standby" ? "warning" : "neutral"}>{member.status}</Status><h2 className="mt-4 text-xl font-semibold">{child.name}</h2><p className="mt-2 text-sm text-muted">{member.status === "selected" ? "A place is confirmed in the published squad." : member.status === "standby" ? "The manager may offer a place if one becomes available." : "This player is not currently in the squad."}</p>{squad?.published_at ? <p className="mt-4 text-xs font-semibold text-muted">Published {formatDateTime(squad.published_at)}</p> : null}</article>; })}<p className="mt-4 text-sm leading-6 text-muted">Squad status uses neutral wording and does not show rankings or other children&rsquo;s selection history.</p></section>;
}
