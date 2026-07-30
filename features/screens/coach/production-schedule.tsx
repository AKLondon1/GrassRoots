import type { SupabaseClient } from "@supabase/supabase-js";
import { Clock3, MapPin } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import {
  outstandingResponses,
  type OutstandingSummary,
} from "@/features/availability/request-service";
import {
  cancelEventInstance,
  createFriendly,
  createTeamEvent,
  rescheduleEventInstance,
} from "@/features/events/production-actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The coach's schedule: what is next, what is coming, and how to change it.
 *
 * Replaces the raw JSON dump this route used to render. Three sections share one
 * query block, because `today` and `calendar` differ only in how much they show,
 * and `event-editor` needs the same instances to offer cancel and reschedule
 * forms against.
 *
 * The visual language is deliberately the parent screen's: the same card, the
 * same Status pill, the same clock and pin icons. A manager and a parent looking
 * at one fixture should recognise it as the same thing.
 */

const card = "rounded-2xl border border-border-strong bg-background p-5 sm:p-6";
const panel = "rounded-2xl border border-border-strong bg-background p-5 sm:p-7";
const control =
  "mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35";

type Named = { title?: string; kind?: string; name?: string };
type Relation = Named | Named[] | null;

interface InstanceRow {
  readonly id: string;
  readonly team_id: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly response_deadline: string | null;
  readonly location_name: string | null;
  readonly status: string;
  readonly events: Relation;
  readonly teams: Relation;
}

interface TeamRow {
  readonly id: string;
  readonly name: string;
}

interface UnitRow {
  readonly id: string;
  readonly name: string;
  readonly facilities: Relation;
}

interface OppositionRow {
  readonly id: string;
  readonly club_name: string;
  readonly display_name: string;
}

function one(value: Relation): Named {
  return (Array.isArray(value) ? value[0] : value) ?? {};
}

const LONDON = "Europe/London";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: LONDON,
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LONDON,
  });
}

/**
 * ISO instant to the `YYYY-MM-DDTHH:mm` an `<input type="datetime-local">` wants,
 * in club time rather than the server's.
 *
 * `sv-SE` is used because it formats as `YYYY-MM-DD HH:mm:ss`, which is the
 * ISO-like shape needed. `en-GB` would give `09/08/2026`.
 */
function toLocalInput(value: string) {
  return new Date(value)
    .toLocaleString("sv-SE", { timeZone: LONDON })
    .slice(0, 16)
    .replace(" ", "T");
}

function EventCard({
  instance,
  summary,
  workspace,
}: {
  instance: InstanceRow;
  summary?: OutstandingSummary;
  workspace: string;
}) {
  const kind = one(instance.events).kind ?? "event";
  return (
    <article className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Status tone={kind === "match" ? "info" : "success"}>{kind}</Status>
        <span className="text-sm font-semibold text-muted">{formatDate(instance.starts_at)}</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-ink">
        {one(instance.events).title ?? "Team event"}
      </h3>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted">
        <Clock3 aria-hidden="true" className="size-4" />
        {formatTime(instance.starts_at)}–{formatTime(instance.ends_at)}
      </p>
      <p className="mt-2 flex items-start gap-2 text-sm text-muted">
        <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {one(instance.teams).name ?? "Team"}
        {instance.location_name ? ` · ${instance.location_name}` : ""}
      </p>
      {summary ? (
        <p className="mt-4 text-sm font-semibold">
          {summary.outstanding === 0 ? (
            <span className="text-success-strong">All replies in</span>
          ) : (
            <span className={summary.deadlinePassed ? "text-danger-strong" : "text-ink"}>
              {summary.outstanding} of {summary.expected} replies outstanding
              {summary.deadlinePassed ? " · deadline passed" : ""}
            </span>
          )}
        </p>
      ) : null}
      <Link
        className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary-strong underline decoration-2 underline-offset-4"
        href={`/app/${workspace}/squad?role=coach&instance=${instance.id}`}
      >
        Pick the squad
      </Link>
    </article>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  hint,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="text-sm font-semibold">
      {label}
      {hint ? <span className="ml-1 font-normal text-muted">{hint}</span> : null}
      <input
        className={control}
        defaultValue={defaultValue}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}

function TeamSelect({ teams }: { teams: readonly TeamRow[] }) {
  if (teams.length === 1) return <input name="teamId" type="hidden" value={teams[0]!.id} />;
  return (
    <label className="text-sm font-semibold">
      Team
      <select className={control} name="teamId" required>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  );
}

interface Props {
  readonly organisationId: string;
  readonly section: string;
  readonly workspace: string;
}

export async function ProductionCoachScheduleScreen({
  organisationId,
  section,
  workspace,
}: Props) {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("The organisation connection is unavailable.");
  const db = client as unknown as SupabaseClient;
  const now = new Date();

  const [{ data: teamData, error: teamError }, { data: instanceData, error: instanceError }] =
    await Promise.all([
      db
        .from("teams")
        .select("id,name")
        .eq("organisation_id", organisationId)
        .eq("status", "active")
        .order("name")
        .limit(100),
      db
        .from("event_instances")
        .select(
          "id,team_id,starts_at,ends_at,response_deadline,location_name,status,events(title,kind),teams(name)",
        )
        .eq("organisation_id", organisationId)
        .gte("ends_at", now.toISOString())
        .neq("status", "cancelled")
        .order("starts_at")
        .limit(50),
    ]);
  if (teamError || instanceError) throw new Error("We could not load your team schedule.");

  const teams = (teamData ?? []) as TeamRow[];
  const instances = (instanceData ?? []) as InstanceRow[];
  const instanceIds = instances.map((instance) => instance.id);
  const teamIds = [...new Set(instances.map((instance) => instance.team_id))];

  // Expected players comes from team_memberships, filtered to member_kind =
  // 'player' and status = 'active'. The filter is mandatory: the table also holds
  // coaches and volunteers, and counting them inflates "expected" with people who
  // will never reply, so "all replies in" would never be reached.
  const [{ data: replyData, error: replyError }, { data: squadData, error: squadError }] =
    await Promise.all([
      instanceIds.length
        ? db
            .from("availability_responses")
            .select("event_instance_id,player_id")
            .eq("organisation_id", organisationId)
            .in("event_instance_id", instanceIds)
            .limit(2000)
        : Promise.resolve({ data: [], error: null }),
      teamIds.length
        ? db
            .from("team_memberships")
            .select("team_id,player_id")
            .eq("organisation_id", organisationId)
            .eq("member_kind", "player")
            .eq("status", "active")
            .in("team_id", teamIds)
            .limit(2000)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (replyError || squadError) throw new Error("We could not load availability replies.");

  const playersByTeam = new Map<string, number>();
  ((squadData ?? []) as Array<{ team_id: string }>).forEach((row) => {
    playersByTeam.set(row.team_id, (playersByTeam.get(row.team_id) ?? 0) + 1);
  });
  const expectedByInstance = new Map(
    instances.map((instance) => [instance.id, playersByTeam.get(instance.team_id) ?? 0]),
  );

  const summaries = new Map(
    outstandingResponses(
      instances,
      (replyData ?? []) as Array<{ event_instance_id: string; player_id: string }>,
      expectedByInstance,
      now,
    ).map((summary) => [summary.eventInstanceId, summary]),
  );

  if (section === "today") {
    const next = instances[0];
    if (!next) {
      return (
        <EmptyState
          title="Nothing scheduled"
          description="Once you add training or a fixture it appears here, with how many families still owe you a reply."
        />
      );
    }
    return (
      <section aria-labelledby="coach-today-title" className="space-y-5">
        <h2 className="text-xl font-semibold" id="coach-today-title">
          Next up
        </h2>
        <EventCard instance={next} summary={summaries.get(next.id)} workspace={workspace} />
      </section>
    );
  }

  if (section === "calendar") {
    if (!instances.length) {
      return (
        <EmptyState
          title="No upcoming events"
          description="Training, matches and meetings you schedule will be listed here by day."
        />
      );
    }
    const byDay = new Map<string, InstanceRow[]>();
    instances.forEach((instance) => {
      const day = formatDate(instance.starts_at);
      byDay.set(day, [...(byDay.get(day) ?? []), instance]);
    });
    return (
      <section aria-label="Upcoming schedule" className="space-y-6">
        {[...byDay.entries()].map(([day, dayInstances]) => (
          <div key={day}>
            <h2 className="mb-3 text-lg font-semibold">{day}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {dayInstances.map((instance) => (
                <EventCard
                  instance={instance}
                  key={instance.id}
                  summary={summaries.get(instance.id)}
                  workspace={workspace}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    );
  }

  // Awaited inline rather than returned as <EventEditor/>. Next.js resolves a
  // nested async component itself, but a test rendering `await Screen(...)` only
  // awaits the outer call and would be handed an unresolved element.
  return await EventEditor({ db, instances, organisationId, teams, workspace });
}

async function EventEditor({
  db,
  instances,
  organisationId,
  teams,
  workspace,
}: {
  db: SupabaseClient;
  instances: readonly InstanceRow[];
  organisationId: string;
  teams: readonly TeamRow[];
  workspace: string;
}) {
  // Both lists became readable to team staff in migration 0026. Before it these
  // returned nothing for a coach and the friendly form was unusable.
  const [{ data: unitData }, { data: oppositionData }] = await Promise.all([
    db
      .from("reservation_units")
      .select("id,name,facilities(name)")
      .eq("organisation_id", organisationId)
      .eq("active", true)
      .order("name")
      .limit(100),
    db
      .from("opposition_contacts")
      .select("id,club_name,display_name")
      .eq("organisation_id", organisationId)
      .order("club_name")
      .limit(100),
  ]);
  const units = (unitData ?? []) as UnitRow[];
  const opposition = (oppositionData ?? []) as OppositionRow[];

  if (!teams.length) {
    return (
      <EmptyState
        title="No teams yet"
        description="A club administrator creates teams for a season. Once a team exists you can schedule its training and fixtures."
      />
    );
  }

  const hidden = (
    <>
      <input name="organisationId" type="hidden" value={organisationId} />
      <input name="workspace" type="hidden" value={workspace} />
    </>
  );

  return (
    <div className="space-y-5">
      <section aria-labelledby="add-event-title" className={panel}>
        <h2 className="text-xl font-semibold" id="add-event-title">
          Schedule training or a meeting
        </h2>
        <form action={createTeamEvent} className="mt-5 grid gap-4 sm:grid-cols-2">
          {hidden}
          <TeamSelect teams={teams} />
          <label className="text-sm font-semibold">
            Kind
            <select className={control} name="kind" required>
              <option value="training">Training</option>
              <option value="match">Match</option>
              <option value="meeting">Meeting</option>
              <option value="social">Social</option>
            </select>
          </label>
          <Field label="Title" name="title" />
          <Field label="Location" name="locationName" />
          <Field label="Starts" name="startsAt" type="datetime-local" />
          <Field label="Ends" name="endsAt" type="datetime-local" />
          <Field
            hint="(must be before kick-off)"
            label="Replies needed by"
            name="responseDeadline"
            type="datetime-local"
          />
          <Button className="sm:w-fit" type="submit">
            Add to the calendar
          </Button>
        </form>
      </section>

      <section aria-labelledby="add-friendly-title" className={panel}>
        <h2 className="text-xl font-semibold" id="add-friendly-title">
          Arrange a friendly
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Creates the fixture and holds the pitch in one go. If the pitch is already taken the
          fixture is still created, so you can pick another slot.
        </p>
        {opposition.length ? (
          <form action={createFriendly} className="mt-5 grid gap-4 sm:grid-cols-2">
            {hidden}
            <TeamSelect teams={teams} />
            <label className="text-sm font-semibold">
              Opposition
              <select className={control} name="oppositionContactId" required>
                {opposition.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.club_name} · {contact.display_name}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Title" name="title" />
            <Field label="Location" name="locationName" />
            <label className="text-sm font-semibold">
              Pitch <span className="font-normal text-muted">(optional)</span>
              <select className={control} name="reservationUnitId">
                <option value="">Do not book a pitch</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {one(unit.facilities).name
                      ? `${one(unit.facilities).name} · ${unit.name}`
                      : unit.name}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Starts" name="startsAt" type="datetime-local" />
            <Field label="Ends" name="endsAt" type="datetime-local" />
            <Field
              hint="(must be before kick-off)"
              label="Replies needed by"
              name="responseDeadline"
              type="datetime-local"
            />
            <Field
              defaultValue="15"
              hint="(minutes)"
              label="Setup before"
              name="bufferBefore"
              required={false}
              type="number"
            />
            <Field
              defaultValue="15"
              hint="(minutes)"
              label="Turnaround after"
              name="bufferAfter"
              required={false}
              type="number"
            />
            <Button className="sm:w-fit" type="submit">
              Arrange the friendly
            </Button>
          </form>
        ) : (
          <p className="mt-5 rounded-xl bg-surface px-4 py-3 text-sm text-muted">
            Add the opposing club to the club address book first, so the fixture records who it
            is against.
          </p>
        )}
      </section>

      <section aria-labelledby="amend-title" className={panel}>
        <h2 className="text-xl font-semibold" id="amend-title">
          Change something already scheduled
        </h2>
        {instances.length ? (
          <ul className="mt-5 space-y-6">
            {instances.map((instance) => (
              <li
                className="border-t border-border pt-5 first:border-t-0 first:pt-0"
                key={instance.id}
              >
                <p className="font-semibold">
                  {one(instance.events).title ?? "Team event"}
                  <span className="ml-2 font-normal text-muted">
                    {formatDate(instance.starts_at)} · {formatTime(instance.starts_at)}
                  </span>
                </p>
                <form action={rescheduleEventInstance} className="mt-4 grid gap-4 sm:grid-cols-3">
                  {hidden}
                  <input name="teamId" type="hidden" value={instance.team_id} />
                  <input name="eventInstanceId" type="hidden" value={instance.id} />
                  <input
                    name="previousStartsAt"
                    type="hidden"
                    value={toLocalInput(instance.starts_at)}
                  />
                  <input
                    name="previousLocationName"
                    type="hidden"
                    value={instance.location_name ?? "Not set"}
                  />
                  <Field
                    defaultValue={toLocalInput(instance.starts_at)}
                    label="New start"
                    name="startsAt"
                    type="datetime-local"
                  />
                  <Field
                    defaultValue={toLocalInput(instance.ends_at)}
                    label="New end"
                    name="endsAt"
                    type="datetime-local"
                  />
                  <Field
                    defaultValue={instance.location_name ?? ""}
                    label="Location"
                    name="locationName"
                  />
                  <Button className="sm:w-fit" type="submit" variant="secondary">
                    Move it
                  </Button>
                </form>
                <form action={cancelEventInstance} className="mt-4 grid gap-4 sm:grid-cols-3">
                  {hidden}
                  <input name="teamId" type="hidden" value={instance.team_id} />
                  <input name="eventInstanceId" type="hidden" value={instance.id} />
                  {/* Required, because event_instances rejects a cancelled row
                      whose cancelled_reason is null, and because families are
                      told why. */}
                  <Field hint="(families see this)" label="Reason for cancelling" name="reason" />
                  <Button className="sm:w-fit" type="submit" variant="secondary">
                    Cancel this one
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-xl bg-surface px-4 py-3 text-sm text-muted">
            Nothing upcoming to change yet.
          </p>
        )}
      </section>
    </div>
  );
}
