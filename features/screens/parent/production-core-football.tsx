import type { SupabaseClient } from "@supabase/supabase-js";

import { EmptyState } from "@/components/ui/empty-state";
import { ChildSelector } from "@/features/screens/parent/child-selector";
import { loadLinkedChildren, selectLinkedChild } from "@/features/screens/parent/linked-children";
import { ActionsSection } from "@/features/screens/parent/sections/actions";
import { AnnouncementsSection } from "@/features/screens/parent/sections/announcements";
import { AvailabilitySection } from "@/features/screens/parent/sections/availability";
import { EventSection } from "@/features/screens/parent/sections/event";
import { HomeSection } from "@/features/screens/parent/sections/home";
import { PollsSection } from "@/features/screens/parent/sections/polls";
import { SquadSection } from "@/features/screens/parent/sections/squad";
import {
  EventPanel,
  eventColumns,
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
  return await ScheduleSection(context);
}

/**
 * Every upcoming commitment for this child's teams.
 *
 * The last section still living in the orchestrator. It is a plain list today; the
 * design also asks for a private calendar feed link, which needs a token-issuing
 * path rather than a query, because `private_calendar_tokens` stores only a digest
 * and the plaintext is never persisted. That is a small feature, not a port, so it
 * is deliberately not bolted on here.
 */
async function ScheduleSection({ db, organisationId, child, now }: SectionContext) {
  const { data: eventData, error: eventError } = await db.from("event_instances").select(eventColumns).eq("organisation_id", organisationId).in("team_id", child.teamIds).neq("status", "cancelled").gte("ends_at", now).order("starts_at").limit(25);
  if (eventError) throw new Error("We could not load your linked football updates.");
  const events = (eventData ?? []) as EventRow[];
  if (!events.length) return <EmptyState title="No linked activity yet" description={`Upcoming events for ${child.firstName} will appear here.`} />;
  return <section data-testid="parent-schedule" className="space-y-4" aria-label="Upcoming schedule">{events.map((event) => <EventPanel event={event} key={event.id} />)}</section>;
}
