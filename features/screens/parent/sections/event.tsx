import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";

import { EventPanel, eventColumns, formatDateTime, type EventRow, type SectionContext } from "./shared";

/**
 * The next event, and what changed about it.
 *
 * Ported from `ParentEvent` in `core-football.tsx`: the event card on the left, a
 * "What changed" aside on the right. The demo hard-codes a pitch move and a meet
 * time; both now come from `event_change_summaries`.
 *
 * The aside is the reason this section exists separately from `schedule`. A parent
 * who has already read the fixture needs to know what moved since, and burying that
 * in a list of identical cards is how people turn up at the wrong pitch.
 *
 * Only the most recent summary is shown. Each reschedule writes its own row, so the
 * full set is a changelog, and a family needs the current state of affairs rather
 * than an audit trail.
 */

interface ChangeSummaryRow {
  summary: unknown;
  created_at: string;
}

/**
 * One field that moved. Written by `rescheduleEventInstance` and by the facility
 * closure RPC as `jsonb_build_object('field', …, 'from', …, 'to', …)`, with an
 * optional `reason` on a cancellation.
 */
interface Change {
  field: string;
  from: string | null;
  to: string | null;
  reason?: string | null;
}

const fieldLabels: Record<string, string> = {
  status: "Status",
  location: "Location",
  locationName: "Location",
  startsAt: "Start time",
  endsAt: "End time",
  responseDeadline: "Reply deadline",
};

/**
 * `summary` is JSONB, so it arrives as whatever was stored. The column constraint
 * guarantees an array, but not the shape of its entries, and a parent screen is the
 * wrong place to discover that a future writer used a different key. Anything that
 * does not look like a change is skipped rather than rendered as `[object Object]`.
 */
function readChanges(summary: unknown): Change[] {
  if (!Array.isArray(summary)) return [];
  return summary.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const change = entry as Partial<Change>;
    if (typeof change.field !== "string") return [];
    return [
      {
        field: change.field,
        from: typeof change.from === "string" ? change.from : null,
        to: typeof change.to === "string" ? change.to : null,
        reason: typeof change.reason === "string" ? change.reason : null,
      },
    ];
  });
}

function label(field: string): string {
  if (fieldLabels[field]) return fieldLabels[field];
  // Fall back to humanising the key rather than showing it raw, so a field added
  // later reads as "Kick off" instead of "kickOff".
  const spaced = field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Timestamps are stored as strings alongside plain values like "Main pitch". */
function display(value: string | null): string {
  if (!value) return "not set";
  return /^\d{4}-\d{2}-\d{2}T/.test(value) ? formatDateTime(value) : value;
}

export async function EventSection({ db, organisationId, child, now }: SectionContext) {
  const { data: eventData, error: eventError } = await db
    .from("event_instances")
    .select(eventColumns)
    .eq("organisation_id", organisationId)
    .in("team_id", child.teamIds)
    .neq("status", "cancelled")
    .gte("ends_at", now)
    .order("starts_at")
    .limit(1);
  if (eventError) throw new Error("We could not load the next event.");
  const [event] = (eventData ?? []) as EventRow[];

  if (!event) {
    return (
      <EmptyState
        title="No upcoming event"
        description={`Training, matches and meetings for ${child.firstName}'s teams will appear here.`}
      />
    );
  }

  const { data: summaryData, error: summaryError } = await db
    .from("event_change_summaries")
    .select("summary,created_at")
    .eq("organisation_id", organisationId)
    .eq("event_instance_id", event.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (summaryError) throw new Error("We could not load what changed about this event.");
  const [latest] = (summaryData ?? []) as ChangeSummaryRow[];
  const changes = latest ? readChanges(latest.summary) : [];

  return (
    <section
      data-testid="parent-event"
      className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]"
      aria-labelledby="event-detail-title"
    >
      <div>
        <h2 id="event-detail-title" className="sr-only">
          Event information
        </h2>
        <EventPanel event={event} />
      </div>
      {changes.length ? (
        <aside className="rounded-2xl bg-surface-strong p-5 sm:p-6" aria-label="What changed">
          <Status tone="info">Updated {formatDateTime(latest.created_at)}</Status>
          <h2 className="mt-4 text-lg font-semibold text-ink">What changed</h2>
          <dl className="mt-4 space-y-4 text-sm">
            {changes.map((change) => (
              <div key={change.field}>
                <dt className="font-semibold text-ink">{label(change.field)}</dt>
                <dd className="mt-1 text-muted">
                  {change.from ? <s>{display(change.from)}</s> : null}
                  {change.from ? " → " : null}
                  {display(change.to)}
                </dd>
                {change.reason ? <dd className="mt-1 text-muted">{change.reason}</dd> : null}
              </div>
            ))}
          </dl>
        </aside>
      ) : null}
    </section>
  );
}
