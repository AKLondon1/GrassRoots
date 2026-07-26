import { createHash } from "node:crypto";

import { hasCapability } from "@/features/tenancy/permissions";
import type { AuthorisationContext, Capability } from "@/features/tenancy/types";
import { planRecurringEdit } from "@/features/events/recurrence";
import type { EventPatch, RecurrenceEditScope } from "@/features/events/types";

export interface CalendarFeedRepository {
  findCalendarToken(tokenHash: string): Promise<{ id: string; organisationId: string; tokenHash: string; revokedAt: string | null } | null>;
  listCalendarEvents(tokenId: string, organisationId: string): Promise<ReadonlyArray<{
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    locationName: string | null;
  } & Record<string, unknown>>>;
}

export function calendarTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icsDate(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(".000", "");
}

export async function createCalendarFeed(repository: CalendarFeedRepository, opaqueToken: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{20,256}$/.test(opaqueToken)) {
    throw new Error("This calendar link is not available.");
  }
  const token = await repository.findCalendarToken(calendarTokenHash(opaqueToken));
  if (!token || token.revokedAt) throw new Error("This calendar link is not available.");
  const events = await repository.listCalendarEvents(token.id, token.organisationId);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GrassRoots//Private calendar//EN",
    "CALSCALE:GREGORIAN",
    ...events.flatMap((event) => [
      "BEGIN:VEVENT",
      `UID:${escapeIcs(event.id)}@grassroots.local`,
      `DTSTART:${icsDate(event.startsAt)}`,
      `DTEND:${icsDate(event.endsAt)}`,
      `SUMMARY:${escapeIcs(event.title)}`,
      ...(event.locationName ? [`LOCATION:${escapeIcs(event.locationName)}`] : []),
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
    "",
  ];
  return lines.join("\r\n");
}

export function requireEventCapability(
  context: AuthorisationContext,
  capability: Capability,
  target: { organisationId: string; teamId: string; eventId?: string },
): void {
  const teamAllowed = hasCapability(context, capability, {
    kind: "team",
    organisationId: target.organisationId,
    teamId: target.teamId,
  });
  if (!teamAllowed) {
    hasCapability(context, capability, {
      kind: "team",
      organisationId: target.organisationId,
      teamId: target.teamId,
    }, { throwOnDenied: true });
  }
}

interface RecurringEventRepository {
  findSeries(organisationId: string, seriesId: string): Promise<{
    id: string;
    organisationId: string;
    teamId: string;
  } | null>;
  applyRecurrenceEdit(plan: ReturnType<typeof planRecurringEdit>): Promise<unknown>;
}

export async function editRecurringEvent(
  repository: RecurringEventRepository,
  actor: AuthorisationContext,
  input: {
    organisationId: string;
    teamId: string;
    seriesId: string;
    occurrenceStartsAt: string;
    scope: RecurrenceEditScope;
    patch: EventPatch;
  },
) {
  const series = await repository.findSeries(input.organisationId, input.seriesId);
  if (!series || series.organisationId !== input.organisationId || series.teamId !== input.teamId) {
    throw new Error("This event series is not available in the selected team.");
  }
  requireEventCapability(actor, "events:manage", {
    organisationId: series.organisationId,
    teamId: series.teamId,
  });
  const plan = planRecurringEdit({
    seriesId: series.id,
    occurrenceStartsAt: input.occurrenceStartsAt,
    scope: input.scope,
    patch: input.patch,
  });
  return repository.applyRecurrenceEdit(plan) as Promise<ReturnType<typeof planRecurringEdit>>;
}
