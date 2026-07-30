"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { grantsCapability, requireCapability } from "@/features/tenancy/authorise";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Every event write path.
 *
 * Two rules hold throughout, and both come from assertions in
 * `supabase/tests/weekly_loop_rls.sql` rather than from assumption:
 *
 * 1. Every event gets its own `event_series` row, even a one-off. `event_instances`
 *    is `unique nulls not distinct (organisation_id, series_id, starts_at)`, so two
 *    standalone instances starting at the same moment collide. Under 11s and Under
 *    13s both training at Saturday 09:00 is otherwise a unique violation.
 * 2. Authorisation reads `scopedGrants` through `requireCapability`, never the
 *    navigation `capabilities` array, and always at team scope. A coach who staffs
 *    one team must not be able to move another team's fixture.
 */

const context = {
  organisationId: z.uuid(),
  workspace: z.string().trim().min(1).max(120),
  teamId: z.uuid(),
};

/** What an `<input type="datetime-local">` submits. */
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, {
  message: "Enter a date and time.",
});

const timing = {
  startsAt: localDateTime,
  endsAt: localDateTime,
  responseDeadline: localDateTime,
};

interface ChangeEntry {
  readonly field: string;
  readonly from: string | null;
  readonly to: string | null;
}

function endsAfterItStarts<T extends { startsAt: string; endsAt: string }>(value: T) {
  return new Date(value.endsAt) > new Date(value.startsAt);
}

// The database permits a deadline equal to kick-off (`response_deadline <=
// starts_at`). This is deliberately stricter: a deadline at kick-off is useless
// to a manager.
function deadlineIsBeforeKickOff<T extends { startsAt: string; responseDeadline: string }>(
  value: T,
) {
  return new Date(value.responseDeadline) < new Date(value.startsAt);
}

async function database() {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to manage team events.");
  return client as unknown as SupabaseClient;
}

/**
 * Resolve the caller, refuse unless they hold `capability` for this team, and
 * return the organisation and membership the *workspace* resolves to.
 *
 * The organisation id on the form is therefore never trusted. It arrives from a
 * hidden input and is only ever compared, so a tampered form fails loudly here
 * instead of relying on RLS to notice later.
 */
async function authorise(
  input: { organisationId: string; workspace: string; teamId: string },
  capability: "events:manage" | "pitches:book",
) {
  const access = await requireCapability(input.workspace, capability, {
    kind: "team",
    teamId: input.teamId,
  });
  if (access.organisationId !== input.organisationId) {
    throw new Error("That organisation does not belong to this workspace.");
  }
  return access;
}

function refreshSchedule(workspace: string) {
  revalidatePath(`/app/${workspace}/today`);
  revalidatePath(`/app/${workspace}/calendar`);
  revalidatePath(`/app/${workspace}/event-editor`);
}

/**
 * Record what changed, for the parent-facing "What changed" panel.
 *
 * `event_change_summaries.summary` is constrained to `jsonb_typeof(summary) =
 * 'array'`, so this always writes an array. An empty one is not written at all: a
 * notice saying nothing changed is worse than no notice.
 */
async function recordChange(
  db: SupabaseClient,
  input: { organisationId: string; teamId: string; eventInstanceId: string },
  membershipId: string,
  entries: readonly ChangeEntry[],
) {
  if (!entries.length) return;
  const { error } = await db.from("event_change_summaries").insert({
    organisation_id: input.organisationId,
    event_instance_id: input.eventInstanceId,
    team_id: input.teamId,
    changed_by_membership_id: membershipId,
    edit_scope: "this",
    summary: entries,
  });
  if (error) throw new Error("The change could not be recorded for families.");
}

const CHANGE_LABELS: Record<string, string> = {
  location: "Location",
  startsAt: "Start time",
};

function readableChange(entry: ChangeEntry): string {
  const label = CHANGE_LABELS[entry.field] ?? entry.field;
  const format = (value: string | null) => {
    if (!value) return "not set";
    if (entry.field !== "startsAt") return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? value
      : parsed.toLocaleString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        });
  };
  return `${label}: ${format(entry.from)} → ${format(entry.to)}`;
}

/**
 * Tell the team their event moved.
 *
 * Through the same RPC the composer uses, team-scoped to the event's team, rather
 * than an insert into `announcements`. publish_announcement sets
 * `authored_by_membership_id` from auth.uid() (0006_comms_finance.sql:179) and is
 * where the capability check lives, so a direct insert would have to duplicate the
 * first and would bypass the second. The recipient fan-out is then the database's
 * job: enqueue_published_announcement_deliveries (0008_release_hardening.sql:516)
 * branches on team_id and resolves the audience through team_audience_members.
 *
 * SKIPPED, NOT ATTEMPTED, when the author cannot publish to this team.
 * `events:manage` and `announcements:manage` travel together in the standard role
 * model (0020_role_model.sql:46), but they are separate permissions and a club may
 * hold them apart. The event has already moved by the time this runs — the two
 * writes are not one transaction — so calling anyway and being refused would report
 * a failure for a reschedule that succeeded.
 *
 * `event_change_summaries` remains the record of what changed and is written either
 * way. This is the notification, not the record, which is why a club that has
 * separated the permissions still gets the parent-facing "What changed" panel.
 */
async function announceChange(
  db: SupabaseClient,
  access: Awaited<ReturnType<typeof requireCapability>>,
  input: { organisationId: string; teamId: string; eventInstanceId: string },
  entries: readonly ChangeEntry[],
): Promise<void> {
  if (!entries.length) return;
  if (!grantsCapability(access, "announcements:manage", { kind: "team", teamId: input.teamId })) {
    return;
  }

  const { data: instance } = await db
    .from("event_instances")
    .select("event_id")
    .eq("organisation_id", input.organisationId)
    .eq("id", input.eventInstanceId)
    .maybeSingle();
  const { data: event } = instance?.event_id
    ? await db
        .from("events")
        .select("title")
        .eq("organisation_id", input.organisationId)
        .eq("id", String(instance.event_id))
        .maybeSingle()
    : { data: null };
  const title = event?.title ? String(event.title) : "a team event";

  const { error } = await db.rpc("publish_announcement", {
    requested_organisation_id: input.organisationId,
    requested_title: `Change to ${title}`.slice(0, 160),
    requested_body: [`${title} has changed.`, ...entries.map(readableChange)].join("\n"),
    requested_team_id: input.teamId,
  });
  // Deliberately not swallowed. The event moved and the change was recorded, so the
  // message says both, rather than implying the reschedule failed.
  if (error) {
    throw new Error(
      "The event was moved and recorded, but the team could not be notified. Tell them another way.",
    );
  }
}

interface EventTriple {
  readonly organisationId: string;
  readonly teamId: string;
  readonly kind: "training" | "match" | "meeting" | "social";
  readonly title: string;
  readonly locationName: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly responseDeadline: string;
  readonly oppositionContactId?: string;
}

/**
 * Create the event, its series and its first instance.
 *
 * Returns the instance id, so `createFriendly` can attach a pitch booking to it.
 */
async function insertEventTriple(
  db: SupabaseClient,
  input: EventTriple,
  membershipId: string,
): Promise<string> {
  const startsAt = new Date(input.startsAt).toISOString();
  const endsAt = new Date(input.endsAt).toISOString();

  const { data: event, error: eventError } = await db
    .from("events")
    .insert({
      organisation_id: input.organisationId,
      team_id: input.teamId,
      kind: input.kind,
      title: input.title,
      default_location_name: input.locationName,
      opposition_contact_id: input.oppositionContactId ?? null,
      created_by_membership_id: membershipId,
    })
    .select("id")
    .single();
  if (eventError || !event) throw new Error("The event could not be created.");
  const eventId = (event as { id: string }).id;

  const { data: series, error: seriesError } = await db
    .from("event_series")
    .insert({
      organisation_id: input.organisationId,
      event_id: eventId,
      team_id: input.teamId,
      time_zone: "Europe/London",
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .select("id")
    .single();
  if (seriesError || !series) throw new Error("The event schedule could not be created.");

  const { data: instance, error: instanceError } = await db
    .from("event_instances")
    .insert({
      organisation_id: input.organisationId,
      event_id: eventId,
      series_id: (series as { id: string }).id,
      team_id: input.teamId,
      starts_at: startsAt,
      ends_at: endsAt,
      response_deadline: new Date(input.responseDeadline).toISOString(),
      location_name: input.locationName,
      status: "scheduled",
    })
    .select("id")
    .single();
  if (instanceError || !instance) throw new Error("The event date could not be saved.");

  return (instance as { id: string }).id;
}

const eventSchema = z
  .object({
    ...context,
    ...timing,
    kind: z.enum(["training", "match", "meeting", "social"]),
    title: z.string().trim().min(2).max(120),
    locationName: z.string().trim().min(2).max(160),
  })
  .refine(endsAfterItStarts, {
    message: "The event end time must be after its start time.",
    path: ["endsAt"],
  })
  .refine(deadlineIsBeforeKickOff, {
    message: "The response deadline must be before the event starts.",
    path: ["responseDeadline"],
  });

export async function createTeamEvent(formData: FormData): Promise<void> {
  const input = eventSchema.parse(Object.fromEntries(formData));
  const access = await authorise(input, "events:manage");
  const db = await database();

  await insertEventTriple(db, input, access.membershipId);
  refreshSchedule(input.workspace);
}

const friendlySchema = z
  .object({
    ...context,
    ...timing,
    title: z.string().trim().min(2).max(120),
    locationName: z.string().trim().min(2).max(160),
    oppositionContactId: z.uuid(),
    // Absent when the club has no pitch to offer, or the fixture is away.
    reservationUnitId: z.uuid().optional(),
    bufferBefore: z.coerce.number().int().min(0).max(240).default(0),
    bufferAfter: z.coerce.number().int().min(0).max(240).default(0),
  })
  .refine(endsAfterItStarts, {
    message: "The event end time must be after its start time.",
    path: ["endsAt"],
  })
  .refine(deadlineIsBeforeKickOff, {
    message: "The response deadline must be before the event starts.",
    path: ["responseDeadline"],
  });

/**
 * Turn a booking failure into something a manager can act on.
 *
 * The codes come from `book_pitch_for_event` in migration 0023 and are asserted
 * in `weekly_loop_rls.sql`. Every message states that the fixture survived,
 * because the fixture is created before the booking is attempted.
 */
function pitchBookingMessage(error: { code?: string; message?: string }): string {
  const created = "The fixture was created, so choose another pitch or time to hold a slot for it.";
  if (error.code === "23P01") {
    return `That pitch is already booked, blocked or closed at that time. ${created}`;
  }
  if (error.code === "23505") return `A pitch is already held for this fixture. ${created}`;
  if (error.code === "42501") {
    return `You do not have permission to book a pitch for this team. ${created}`;
  }
  if (error.code === "42704") return `That pitch is no longer available to book. ${created}`;
  return `The pitch could not be booked. ${created}`;
}

/**
 * Arrange a friendly and hold the pitch for it in one action.
 *
 * Ordering is forced by the database, not by preference: `book_pitch_for_event`
 * derives the team from the event instance, so the instance must exist first.
 *
 * The booking goes through that RPC rather than an insert because
 * `facility_bookings` grants `authenticated` SELECT only, and because only the
 * function knows the reservation-unit hierarchy. A direct insert could hold
 * "Main pitch, half A" against a booking of the whole "Main pitch"; the GiST
 * exclusion constraint is keyed on the unit alone and cannot see it.
 *
 * If the booking fails the fixture is deliberately left in place rather than
 * unwound. There is no transaction spanning these calls, a compensating delete
 * can fail in turn, and "the fixture exists but has no pitch" is both recoverable
 * and closer to how a manager thinks. The error says exactly that.
 */
export async function createFriendly(formData: FormData): Promise<void> {
  const input = friendlySchema.parse(Object.fromEntries(formData));
  const access = await authorise(input, "events:manage");
  if (input.reservationUnitId) await authorise(input, "pitches:book");
  const db = await database();

  const eventInstanceId = await insertEventTriple(
    db,
    { ...input, kind: "match" },
    access.membershipId,
  );

  if (input.reservationUnitId) {
    const { error } = await db.rpc("book_pitch_for_event", {
      requested_organisation_id: input.organisationId,
      requested_unit_id: input.reservationUnitId,
      requested_event_instance_id: eventInstanceId,
      requested_buffer_before: input.bufferBefore,
      requested_buffer_after: input.bufferAfter,
    });
    if (error) throw new Error(pitchBookingMessage(error));
    revalidatePath(`/app/${input.workspace}/pitch-planner`);
  }

  refreshSchedule(input.workspace);
}

const cancelSchema = z.object({
  ...context,
  eventInstanceId: z.uuid(),
  // `event_instances` rejects a cancelled row whose reason is null, so the form
  // collects one rather than discovering it at the database.
  reason: z.string().trim().min(2).max(240),
});

export async function cancelEventInstance(formData: FormData): Promise<void> {
  const input = cancelSchema.parse(Object.fromEntries(formData));
  const access = await authorise(input, "events:manage");
  const db = await database();

  const { error } = await db
    .from("event_instances")
    .update({ status: "cancelled", cancelled_reason: input.reason })
    .eq("organisation_id", input.organisationId)
    .eq("id", input.eventInstanceId);
  if (error) throw new Error("The event could not be cancelled.");

  await recordChange(db, input, access.membershipId, [
    { field: "status", from: "scheduled", to: "cancelled" },
    { field: "reason", from: null, to: input.reason },
  ]);

  refreshSchedule(input.workspace);
}

const rescheduleSchema = z
  .object({
    ...context,
    eventInstanceId: z.uuid(),
    startsAt: localDateTime,
    endsAt: localDateTime,
    locationName: z.string().trim().min(2).max(160),
    previousStartsAt: localDateTime,
    previousLocationName: z.string().trim().min(2).max(160),
  })
  .refine(endsAfterItStarts, {
    message: "The event end time must be after its start time.",
    path: ["endsAt"],
  });

export async function rescheduleEventInstance(formData: FormData): Promise<void> {
  const input = rescheduleSchema.parse(Object.fromEntries(formData));
  const access = await authorise(input, "events:manage");
  const db = await database();

  const { error } = await db
    .from("event_instances")
    .update({
      starts_at: new Date(input.startsAt).toISOString(),
      ends_at: new Date(input.endsAt).toISOString(),
      location_name: input.locationName,
    })
    .eq("organisation_id", input.organisationId)
    .eq("id", input.eventInstanceId);
  if (error) throw new Error("The event could not be moved.");

  const entries: ChangeEntry[] = [];
  if (input.previousLocationName !== input.locationName) {
    entries.push({
      field: "location",
      from: input.previousLocationName,
      to: input.locationName,
    });
  }
  if (input.previousStartsAt !== input.startsAt) {
    entries.push({ field: "startsAt", from: input.previousStartsAt, to: input.startsAt });
  }
  await recordChange(db, input, access.membershipId, entries);
  await announceChange(db, access, input, entries);

  refreshSchedule(input.workspace);
  revalidatePath(`/app/${input.workspace}/announcements`);
}
