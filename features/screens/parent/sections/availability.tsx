import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import { saveProductionAvailability } from "@/features/availability/actions";

import {
  card,
  eventColumns,
  eventTitle,
  formatDate,
  formatTime,
  type EventRow,
  type SectionContext,
} from "./shared";

/**
 * Can this child attend? One form per upcoming event.
 *
 * Ported from `ParentAvailability` in `core-football.tsx`, which previews a single
 * hard-coded question and never saves. The radio group, the optional note and the
 * card shape are kept; the `DemoFeedback` block is gone because replies now save.
 *
 * The action itself was fixed in Task 9 and needs nothing here:
 * `saveProductionAvailability` resolves the acting guardian from `auth.uid()` and
 * refuses a player they are not linked to, so the `playerId` in the form below is a
 * convenience rather than something the server trusts.
 *
 * Responses are read for this child specifically. The pre-scaffold version selected
 * every active player in the organisation and leaned on RLS to narrow it, which is
 * the same shape as the trap `loadLinkedChildren` exists to close.
 */

interface AvailabilityRow {
  event_instance_id: string;
  player_id: string;
  status: "available" | "unavailable" | "unsure";
  note: string | null;
  updated_at: string;
}

export async function AvailabilitySection({
  db,
  organisationId,
  workspace,
  child,
  now,
}: SectionContext) {
  const { data: eventData, error: eventError } = await db
    .from("event_instances")
    .select(eventColumns)
    .eq("organisation_id", organisationId)
    .in("team_id", child.teamIds)
    .eq("status", "scheduled")
    .gte("ends_at", now)
    .order("starts_at")
    .limit(25);
  if (eventError) throw new Error("We could not load linked availability.");
  const events = (eventData ?? []) as EventRow[];

  const { data: responseData, error: responseError } = events.length
    ? await db
        .from("availability_responses")
        .select("event_instance_id,player_id,status,note,updated_at")
        .eq("organisation_id", organisationId)
        .eq("player_id", child.playerId)
        .in(
          "event_instance_id",
          events.map((event) => event.id),
        )
    : { data: [], error: null };
  if (responseError) throw new Error("We could not load current availability responses.");
  const responses = (responseData ?? []) as AvailabilityRow[];

  if (!events.length) {
    return (
      <EmptyState
        title="No availability requests"
        description={`Upcoming events for ${child.name} will appear here.`}
      />
    );
  }

  return (
    <section data-testid="parent-availability" className="space-y-4" aria-label="Availability requests">
      {events.map((event) => {
        const response = responses.find((item) => item.event_instance_id === event.id);
        return (
          <article className={card} key={event.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Status
                tone={response?.status === "available" ? "success" : response?.status ? "info" : "warning"}
              >
                {response?.status ?? "Response needed"}
              </Status>
              <span className="text-sm font-semibold text-muted">
                {formatDate(event.starts_at)} · {formatTime(event.starts_at)}
              </span>
            </div>
            <h2 className="mt-4 text-xl font-semibold">{eventTitle(event)}</h2>
            <p className="mt-2 text-sm text-muted">Response for {child.name}</p>
            <form action={saveProductionAvailability} className="mt-5">
              <input type="hidden" name="organisationId" value={organisationId} />
              <input type="hidden" name="eventInstanceId" value={event.id} />
              <input type="hidden" name="teamId" value={event.team_id} />
              <input type="hidden" name="playerId" value={child.playerId} />
              <input type="hidden" name="workspace" value={workspace} />
              <fieldset className="grid gap-3 sm:grid-cols-3">
                <legend className="sr-only">Availability for {child.name}</legend>
                {["available", "unavailable", "unsure"].map((status) => (
                  <label
                    className="flex min-h-11 items-center gap-2 rounded-xl border border-border-strong px-3 text-sm font-semibold capitalize has-[:checked]:border-primary has-[:checked]:bg-primary-light"
                    key={status}
                  >
                    <input
                      defaultChecked={response?.status === status}
                      name="status"
                      required
                      type="radio"
                      value={status}
                    />
                    {status}
                  </label>
                ))}
              </fieldset>
              <label className="mt-4 block text-sm font-semibold">
                Note for the manager <span className="font-normal text-muted">(optional)</span>
                {/*
                  The placeholder is the design's wording and is a safeguarding nudge, not
                  decoration: a free-text box attached to a child's record invites detail
                  that does not belong in one, and saying so at the point of writing works
                  better than a policy nobody reads.
                */}
                <textarea
                  className="mt-2 min-h-20 w-full rounded-xl border border-border-strong bg-background p-3"
                  defaultValue={response?.note ?? ""}
                  maxLength={240}
                  name="note"
                  placeholder="Add only practical attendance information"
                />
              </label>
              <Button className="mt-4" type="submit">
                Save availability
              </Button>
            </form>
          </article>
        );
      })}
    </section>
  );
}
