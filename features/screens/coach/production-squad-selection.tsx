import type { SupabaseClient } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import {
  createSquadForInstance,
  publishSquad,
  setSquadMembers,
} from "@/features/squads/production-actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Choosing who plays.
 *
 * Four columns, sourced from who has replied: Available, Unsure, Unavailable and
 * No reply. Available and Unsure children carry checkboxes; Unavailable ones are
 * shown read-only, because the action refuses them anyway and a checkbox that
 * cannot be used explains less than no checkbox.
 *
 * The roster comes from `team_memberships` filtered to `member_kind = 'player'`
 * and `status = 'active'`, so coaches and volunteers never appear in a squad
 * picker, and neither does a player who has left the team.
 */

const panel = "rounded-2xl border border-border-strong bg-background p-5 sm:p-7";

type PlayerName = { first_name: string; last_name: string };

interface RosterRow {
  readonly player_id: string;
  readonly players: PlayerName | PlayerName[] | null;
}

interface ReplyRow {
  readonly player_id: string;
  readonly status: "available" | "unavailable" | "unsure";
}

interface MemberRow {
  readonly player_id: string;
  readonly status: "selected" | "standby" | "withdrawn";
}

interface InstanceRow {
  readonly id: string;
  readonly team_id: string;
  readonly starts_at: string;
  readonly events: { title?: string } | { title?: string }[] | null;
}

function playerName(row: RosterRow) {
  const player = (Array.isArray(row.players) ? row.players[0] : row.players) ?? {
    first_name: "Linked",
    last_name: "player",
  };
  return `${player.first_name} ${player.last_name}`.trim();
}

function eventTitle(instance: InstanceRow) {
  const event = (Array.isArray(instance.events) ? instance.events[0] : instance.events) ?? {};
  return event.title ?? "Team event";
}

type Column = "available" | "unsure" | "unavailable" | "none";

const COLUMN_LABEL: Record<Column, string> = {
  available: "Available",
  unsure: "Unsure",
  unavailable: "Unavailable",
  none: "No reply",
};

const COLUMN_TONE: Record<Column, "success" | "warning" | "danger" | "neutral"> = {
  available: "success",
  unsure: "warning",
  unavailable: "danger",
  none: "neutral",
};

export async function ProductionSquadSelectionScreen({
  organisationId,
  workspace,
  instanceId,
}: {
  organisationId: string;
  workspace: string;
  instanceId?: string;
}) {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("The organisation connection is unavailable.");
  const db = client as unknown as SupabaseClient;

  if (!instanceId) {
    return (
      <EmptyState
        title="Choose a fixture first"
        description="Open a fixture from Today or the calendar and pick the squad from there."
      />
    );
  }

  const { data: instanceData, error: instanceError } = await db
    .from("event_instances")
    .select("id,team_id,starts_at,events(title)")
    .eq("organisation_id", organisationId)
    .eq("id", instanceId)
    .maybeSingle();
  if (instanceError) throw new Error("We could not load this fixture.");
  if (!instanceData) {
    return (
      <EmptyState
        title="Fixture not found"
        description="It may have been cancelled, or it belongs to a team you do not staff."
      />
    );
  }
  const instance = instanceData as InstanceRow;

  const [
    { data: rosterData, error: rosterError },
    { data: replyData, error: replyError },
    { data: squadData, error: squadError },
  ] = await Promise.all([
    db
      .from("team_memberships")
      .select("player_id,players(first_name,last_name)")
      .eq("organisation_id", organisationId)
      .eq("team_id", instance.team_id)
      .eq("member_kind", "player")
      .eq("status", "active")
      .limit(200),
    db
      .from("availability_responses")
      .select("player_id,status")
      .eq("organisation_id", organisationId)
      .eq("event_instance_id", instance.id)
      .limit(200),
    db
      .from("squads")
      .select("id,status")
      .eq("organisation_id", organisationId)
      .eq("event_instance_id", instance.id)
      .maybeSingle(),
  ]);
  if (rosterError || replyError || squadError) {
    throw new Error("We could not load the squad picker.");
  }

  const roster = (rosterData ?? []) as RosterRow[];
  const replies = new Map(
    ((replyData ?? []) as ReplyRow[]).map((reply) => [reply.player_id, reply.status]),
  );
  const squad = squadData as { id: string; status: string } | null;

  const { data: memberData, error: memberError } = squad
    ? await db
        .from("squad_members")
        .select("player_id,status")
        .eq("organisation_id", organisationId)
        .eq("squad_id", squad.id)
        .limit(200)
    : { data: [], error: null };
  if (memberError) throw new Error("We could not load the current selection.");
  const chosen = new Map(
    ((memberData ?? []) as MemberRow[]).map((member) => [member.player_id, member.status]),
  );

  const columns: Record<Column, RosterRow[]> = {
    available: [],
    unsure: [],
    unavailable: [],
    none: [],
  };
  roster.forEach((player) => {
    columns[replies.get(player.player_id) ?? "none"].push(player);
  });

  const hidden = (
    <>
      <input name="organisationId" type="hidden" value={organisationId} />
      <input name="workspace" type="hidden" value={workspace} />
      <input name="teamId" type="hidden" value={instance.team_id} />
    </>
  );

  if (!roster.length) {
    return (
      <EmptyState
        title="No players in this team yet"
        description="Add players to the team before picking a squad."
      />
    );
  }

  // No squad yet: one button opens it. Splitting this from the picker keeps the
  // create idempotent and the selection form simple.
  if (!squad) {
    return (
      <section aria-labelledby="start-squad-title" className={panel}>
        <h2 className="text-xl font-semibold" id="start-squad-title">
          Pick the squad for {eventTitle(instance)}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Nothing reaches families until you choose to publish it.
        </p>
        <form action={createSquadForInstance} className="mt-5">
          {hidden}
          <input name="eventInstanceId" type="hidden" value={instance.id} />
          <Button type="submit">Start picking</Button>
        </form>
      </section>
    );
  }

  const anySelected = [...chosen.values()].includes("selected");

  return (
    <div className="space-y-5">
      <section aria-labelledby="squad-title" className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold" id="squad-title">
            {eventTitle(instance)}
          </h2>
          <Status tone={squad.status === "published" ? "success" : "neutral"}>
            {squad.status === "published" ? "Published to families" : "Draft, not sent"}
          </Status>
        </div>

        <form action={setSquadMembers} className="mt-5">
          {hidden}
          <input name="squadId" type="hidden" value={squad.id} />

          <div className="grid gap-5 lg:grid-cols-2">
            {(["available", "unsure", "unavailable", "none"] as Column[]).map((column) => (
              <fieldset className="rounded-xl border border-border p-4" key={column}>
                <legend className="px-1">
                  <Status tone={COLUMN_TONE[column]}>
                    {COLUMN_LABEL[column]} · {columns[column].length}
                  </Status>
                </legend>
                {columns[column].length ? (
                  <ul className="mt-3 space-y-3">
                    {columns[column].map((player) => (
                      <li key={player.player_id}>
                        {column === "unavailable" ? (
                          <span className="text-sm text-muted">
                            {playerName(player)} · cannot play
                          </span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-4">
                            <span className="min-w-40 text-sm font-semibold">
                              {playerName(player)}
                            </span>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                defaultChecked={chosen.get(player.player_id) === "selected"}
                                name="selected"
                                type="checkbox"
                                value={player.player_id}
                              />
                              Playing
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                defaultChecked={chosen.get(player.player_id) === "standby"}
                                name="standby"
                                type="checkbox"
                                value={player.player_id}
                              />
                              Standby
                            </label>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted">Nobody yet.</p>
                )}
              </fieldset>
            ))}
          </div>

          <Button className="mt-5" type="submit" variant="secondary">
            Save selection
          </Button>
        </form>
      </section>

      <section aria-labelledby="publish-title" className={panel}>
        <h2 className="text-xl font-semibold" id="publish-title">
          Tell the families
        </h2>
        {anySelected ? (
          <>
            <p className="mt-2 text-sm leading-6 text-muted">
              Publishing shows each family only their own child&apos;s place. It does not show
              rankings or other children&apos;s selection history.
            </p>
            <form action={publishSquad} className="mt-5">
              {hidden}
              <input name="squadId" type="hidden" value={squad.id} />
              <Button type="submit">Publish squad to families</Button>
            </form>
          </>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted">
            Choose at least one player and save the selection before publishing.
          </p>
        )}
      </section>
    </div>
  );
}
