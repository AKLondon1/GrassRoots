import { EmptyState } from "@/components/ui/empty-state";

import { EventPanel, eventColumns, type EventRow, type SectionContext } from "./shared";

/**
 * Every upcoming commitment for this child's teams.
 *
 * Ported from `ParentSchedule` in `core-football.tsx`, with one deliberate omission.
 *
 * WHY THERE IS NO CALENDAR FEED LINK YET. The design puts a "Private calendar feed"
 * link in this header, and the Phase 1 handoff described it as reading a "real token
 * from `private_calendar_tokens`". That is not possible.
 * `private_calendar_tokens` stores `token_digest` and nothing else
 * (0003_events_polls_squads.sql:339, constrained to `^[0-9a-f]{64}$`), the plaintext
 * is never persisted, and the seeded digest is sixty-four `b` characters that hash
 * nothing. There is no token to read, only a token to issue.
 *
 * Issuing one is the magic-link pattern: generate a secret, store its
 * `digestOneTimeToken` hash, and return the plaintext exactly once, which needs an
 * API route and a client component to display something the server can never show
 * again. That is a feature rather than a port, so it is left out entirely instead of
 * being half-built. A link that produced a broken feed would be worse than no link,
 * because a parent would trust it and stop checking the app.
 */
export async function ScheduleSection({ db, organisationId, child, now }: SectionContext) {
  const { data, error } = await db
    .from("event_instances")
    .select(eventColumns)
    .eq("organisation_id", organisationId)
    .in("team_id", child.teamIds)
    .neq("status", "cancelled")
    .gte("ends_at", now)
    .order("starts_at")
    .limit(25);
  if (error) throw new Error("We could not load your schedule.");
  const events = (data ?? []) as EventRow[];

  if (!events.length) {
    return (
      <EmptyState
        title="Nothing scheduled yet"
        description={`Upcoming training, matches and meetings for ${child.firstName} will appear here.`}
      />
    );
  }

  return (
    <section data-testid="parent-schedule" aria-labelledby="family-agenda-title">
      <div>
        <h2 id="family-agenda-title" className="text-xl font-semibold text-ink">
          Family agenda
        </h2>
        <p className="mt-2 text-sm text-muted">
          {child.firstName}&rsquo;s next {events.length === 1 ? "commitment" : `${events.length} commitments`}.
        </p>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {events.map((event) => (
          <EventPanel event={event} key={event.id} />
        ))}
      </div>
    </section>
  );
}
