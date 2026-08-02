import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";

import {
  card,
  eventColumns,
  eventTitle,
  formatDateTime,
  isAwaitingReply,
  linkStyle,
  type AvailabilityResponseRow,
  type EventRow,
  type SectionContext,
} from "./shared";

/**
 * Everything still waiting on this family, and nothing else.
 *
 * Ported from `ParentActions` in `core-football.tsx`, which shows one availability
 * card and one poll card side by side. The grid and card shape are kept; the two
 * hard-coded cards become however many are genuinely outstanding.
 *
 * The availability half uses the same `isAwaitingReply` predicate `home` counts
 * with. That sharing is the point: a screen saying "2 replies needed" that then
 * lists three cards is worse than either number alone, and two local copies of the
 * rule would eventually disagree.
 *
 * An open poll is listed whether or not the family has already answered it. A poll
 * asks for a preference rather than a commitment, and changing your mind before the
 * deadline is legitimate, so it stays available until it closes.
 */

interface OpenPollRow {
  id: string;
  title: string;
  closes_at: string;
}

export async function ActionsSection({ db, organisationId, workspace, child, now }: SectionContext) {
  const [{ data: eventData, error: eventError }, { data: pollData, error: pollError }] = await Promise.all([
    db
      .from("event_instances")
      .select(eventColumns)
      .eq("organisation_id", organisationId)
      .in("team_id", child.teamIds)
      .eq("status", "scheduled")
      .gte("ends_at", now)
      .order("starts_at")
      .limit(25),
    db
      .from("polls")
      .select("id,title,closes_at")
      .eq("organisation_id", organisationId)
      .in("team_id", child.teamIds)
      .eq("status", "open")
      .gte("closes_at", now)
      .order("closes_at")
      .limit(10),
  ]);
  if (eventError || pollError) throw new Error("We could not load what needs your reply.");
  const events = (eventData ?? []) as EventRow[];
  const polls = (pollData ?? []) as OpenPollRow[];

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
  const responses = (responseData ?? []) as AvailabilityResponseRow[];

  const awaiting = events.filter((event) => isAwaitingReply(event, responses, now));

  if (!awaiting.length && !polls.length) {
    return (
      <EmptyState
        title="Nothing needs a reply"
        description={`When a coach asks about ${child.firstName}'s availability or opens a time poll, it appears here.`}
      />
    );
  }

  return (
    <section
      data-testid="parent-actions"
      aria-labelledby="parent-actions-title"
      className="grid gap-5 lg:grid-cols-2"
    >
      <h2 className="sr-only" id="parent-actions-title">
        Waiting for your reply
      </h2>
      {awaiting.map((event) => (
        <div className={card} key={event.id}>
          <Status tone="warning">
            {event.response_deadline ? `Reply by ${formatDateTime(event.response_deadline)}` : "Reply needed"}
          </Status>
          <h3 className="mt-4 text-xl font-semibold text-ink">
            Can {child.firstName} make {eventTitle(event)}?
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            Answering before the deadline lets the coach pick a squad with the right numbers.
          </p>
          <Link
            className={`mt-5 ${linkStyle}`}
            href={`/app/${workspace}/availability?role=parent&child=${child.playerId}`}
          >
            Respond to availability
          </Link>
        </div>
      ))}
      {polls.map((poll) => (
        <div className={card} key={poll.id}>
          <Status tone="info">Closes {formatDateTime(poll.closes_at)}</Status>
          <h3 className="mt-4 text-xl font-semibold text-ink">{poll.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            Choose the times {child.firstName} can attend. You can change your answer until the
            poll closes.
          </p>
          <Link
            className={`mt-5 ${linkStyle}`}
            href={`/app/${workspace}/polls?role=parent&child=${child.playerId}`}
          >
            Answer the time poll
          </Link>
        </div>
      ))}
    </section>
  );
}
