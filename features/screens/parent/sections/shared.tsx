import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarDays, Clock3, MapPin } from "lucide-react";

import { Status } from "@/components/ui/status";
import type { LinkedChild } from "@/features/screens/parent/linked-children";

/**
 * The pieces every parent section shares.
 *
 * The eight sections are eight views of one child, so they agree on more than they
 * differ on: the same card shell, the same date formatting, the same event summary.
 * Keeping those here means a change to how an event reads happens once rather than
 * eight times, and it keeps each section file small enough to hold in your head.
 */

/**
 * Matches `card` in `core-football.tsx`, which is the design specification for this
 * journey. The production screen is a port of that design against live data, so the
 * shell must not drift from it.
 */
export const card = "rounded-2xl border border-border-strong bg-background p-5 sm:p-6";

export const linkStyle =
  "inline-flex min-h-11 items-center font-semibold text-primary-strong underline decoration-2 underline-offset-4";

/**
 * What every section is given. Passing one object rather than six arguments keeps the
 * dispatch in the orchestrator readable and means adding a shared fact later does not
 * touch eight signatures.
 *
 * `now` is resolved once per request rather than per section. Two sections computing
 * "upcoming" a few milliseconds apart is not a real bug, but it is the kind of
 * inconsistency that makes a test flake at a deadline boundary.
 */
export interface SectionContext {
  readonly db: SupabaseClient;
  readonly organisationId: string;
  readonly workspace: string;
  readonly child: LinkedChild;
  readonly now: string;
}

type NamedObject = { title?: string; kind?: string; name?: string; first_name?: string; last_name?: string };
export type NamedRelation = NamedObject | NamedObject[] | null;

export interface EventRow {
  id: string;
  team_id: string;
  starts_at: string;
  ends_at: string;
  response_deadline: string | null;
  location_name: string | null;
  status: string;
  events: NamedRelation;
  teams: NamedRelation;
}

/**
 * The column list every section uses to read an event instance. Shared because a
 * section that selects one column fewer fails at render rather than at the query,
 * which is a long way from the cause.
 */
export const eventColumns =
  "id,team_id,starts_at,ends_at,response_deadline,location_name,status,events(title,kind),teams(name)";

/**
 * PostgREST returns an embedded row as an object or a single-element array depending
 * on how it infers the relationship, so every read of one goes through here.
 */
export function relation(value: NamedRelation): NamedObject {
  return (Array.isArray(value) ? value[0] : value) ?? {};
}

export function eventTitle(event: EventRow): string {
  return relation(event.events).title ?? "Team event";
}

export function eventKind(event: EventRow): string {
  return relation(event.events).kind ?? "event";
}

export function teamName(event: EventRow): string {
  return relation(event.teams).name ?? "Linked team";
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-GB");
}

/**
 * One event, as a card.
 *
 * `glowing-effect` is deliberately not applied here. The handoff reserves it for the
 * single outstanding action on `home`, and a shared component that could glow would
 * make that rule impossible to enforce by reading one file.
 */
export function EventPanel({ event }: { event: EventRow }) {
  return (
    <article className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Status tone={eventKind(event) === "match" ? "info" : "success"}>{eventKind(event)}</Status>
        <span className="text-sm font-semibold text-muted">{formatDate(event.starts_at)}</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-ink">{eventTitle(event)}</h3>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted">
        <Clock3 className="size-4" aria-hidden="true" />
        {formatTime(event.starts_at)}–{formatTime(event.ends_at)}
      </p>
      <p className="mt-2 flex items-center gap-2 text-sm text-muted">
        <CalendarDays className="size-4" aria-hidden="true" />
        {teamName(event)}
      </p>
      {event.location_name ? (
        <p className="mt-2 flex items-start gap-2 text-sm text-muted">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {event.location_name}
        </p>
      ) : null}
      {event.response_deadline ? (
        <p className="mt-4 text-xs font-semibold text-muted">
          Availability closes {formatDateTime(event.response_deadline)}
        </p>
      ) : null}
    </article>
  );
}
