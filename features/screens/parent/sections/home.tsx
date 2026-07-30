import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { Status } from "@/components/ui/status";

import { EventPanel, card, eventColumns, linkStyle, type EventRow, type SectionContext } from "./shared";

/**
 * The parent landing screen: what needs answering, and what is next.
 *
 * Ported from `ParentHome` in `core-football.tsx`, which hard-codes "One reply
 * needed" and "Jamie's football week". The shape is kept exactly; only the numbers
 * and names become real.
 *
 * WHERE THE GLOW GOES. `GlowingEffect` is applied to the outstanding-action card
 * here and nowhere else in the parent journey. A parent opening the app should be
 * drawn to the one thing only they can do, and an effect used twice stops meaning
 * anything. It is deliberately absent when nothing is outstanding, because a glowing
 * "you are up to date" is a demand for attention that has not earned it.
 */

interface ResponseRow {
  event_instance_id: string;
  status: "available" | "unavailable" | "unsure";
}

/**
 * An event still waiting on this family. Scheduled, not yet started, carrying a
 * deadline that has not passed, and with no reply saved.
 *
 * The deadline is compared as an instant. `now` is Z-suffixed and PostgREST returns
 * `response_deadline` with a `+00:00` offset, so comparing the two as strings sorts
 * correct timestamps wrongly.
 */
function isOutstanding(event: EventRow, responses: readonly ResponseRow[], now: string): boolean {
  if (event.status !== "scheduled") return false;
  if (!event.response_deadline) return false;
  if (new Date(event.response_deadline).getTime() < new Date(now).getTime()) return false;
  return !responses.some((response) => response.event_instance_id === event.id);
}

export async function HomeSection({ db, organisationId, workspace, child, now }: SectionContext) {
  const { data: eventData, error: eventError } = await db
    .from("event_instances")
    .select(eventColumns)
    .eq("organisation_id", organisationId)
    .in("team_id", child.teamIds)
    .neq("status", "cancelled")
    .gte("ends_at", now)
    .order("starts_at")
    .limit(10);
  if (eventError) throw new Error("We could not load your football week.");
  const events = (eventData ?? []) as EventRow[];

  const { data: responseData, error: responseError } = events.length
    ? await db
        .from("availability_responses")
        .select("event_instance_id,status")
        .eq("organisation_id", organisationId)
        .eq("player_id", child.playerId)
        .in(
          "event_instance_id",
          events.map((event) => event.id),
        )
    : { data: [], error: null };
  if (responseError) throw new Error("We could not load your saved replies.");
  const responses = (responseData ?? []) as ResponseRow[];

  if (!events.length) {
    return (
      <EmptyState
        title="Nothing scheduled yet"
        description={`When ${child.firstName}'s team has training or a match, it appears here.`}
      />
    );
  }

  const outstanding = events.filter((event) => isOutstanding(event, responses, now));
  const [nextEvent, ...rest] = events;
  const comingUp = rest[0];
  const needsReply = outstanding.length > 0;

  const summary = needsReply
    ? `${outstanding.length === 1 ? "One event needs" : `${outstanding.length} events need`} a reply before the deadline. Answering lets the coach pick a squad with the right numbers.`
    : `Every reply is in. Check back when the coach adds training or a match for ${child.firstName}.`;

  return (
    <section data-testid="parent-home" className="space-y-5" aria-labelledby="parent-home-title">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="relative rounded-2xl">
          {/* Only when something is outstanding. See the note above. */}
          {needsReply ? (
            <GlowingEffect disabled={false} glow spread={32} proximity={56} borderWidth={1} movementDuration={0.2} />
          ) : null}
          <div className={`relative ${card}`}>
            <Status tone={needsReply ? "warning" : "success"}>
              {needsReply
                ? outstanding.length === 1
                  ? "One reply needed"
                  : `${outstanding.length} replies needed`
                : "Up to date"}
            </Status>
            <h2 className="mt-4 text-2xl font-semibold text-ink" id="parent-home-title">
              {child.firstName}&rsquo;s football week
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">{summary}</p>
            {needsReply ? (
              <Link
                className={`mt-5 ${linkStyle}`}
                href={`/app/${workspace}/availability?role=parent&child=${child.playerId}`}
              >
                Respond to availability
              </Link>
            ) : null}
          </div>
        </div>
        <EventPanel event={nextEvent} />
      </div>
      {comingUp ? (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-ink">Coming up next</h2>
          <EventPanel event={comingUp} />
        </div>
      ) : null}
    </section>
  );
}
