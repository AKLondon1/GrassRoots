import type { SupabaseClient } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import {
  addGuardianForPlayer,
  addPlayerToTeam,
  removePlayerFromTeam,
  updatePlayer,
} from "@/features/people/team-people-actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Adding players and parents to a team.
 *
 * One panel, two audiences. A club administrator reaches it from `club/people`
 * across every team; a coach reaches it from `coach/players` for the teams they
 * staff. The forms are identical because the underlying RPCs are, and because a
 * manager delegating to a coach should not have to explain a second screen.
 *
 * Both forms post to team-scoped RPCs. Nothing here inserts into `players`,
 * `guardians`, `households` or `player_guardians`, whose table policies are
 * organisation-wide and so would hand a coach every family in the club.
 */

const panel = "rounded-2xl border border-border-strong bg-background p-5 sm:p-7";
const control =
  "mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35";

interface TeamRow {
  readonly id: string;
  readonly name: string;
}

type PlayerName = { first_name: string; last_name: string; date_of_birth?: string };

interface PlayerRow {
  readonly player_id: string;
  readonly team_id: string;
  readonly players: PlayerName | PlayerName[] | null;
}

const inputClass =
  "mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35";

/** The embedded row, flattened. PostgREST returns an object or a single-element array. */
function playerDetails(row: PlayerRow): PlayerName {
  return (
    (Array.isArray(row.players) ? row.players[0] : row.players) ?? {
      first_name: "Linked",
      last_name: "player",
    }
  );
}

function PlayerContext({
  organisationId,
  workspace,
  teamId,
  playerId,
}: {
  organisationId: string;
  workspace: string;
  teamId: string;
  playerId: string;
}) {
  return (
    <>
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="workspace" value={workspace} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="playerId" value={playerId} />
    </>
  );
}

function playerName(row: PlayerRow) {
  const player = (Array.isArray(row.players) ? row.players[0] : row.players) ?? {
    first_name: "Linked",
    last_name: "player",
  };
  return `${player.first_name} ${player.last_name}`.trim();
}

function TextField({
  label,
  name,
  type = "text",
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="text-sm font-semibold">
      {label}
      {hint ? <span className="ml-1 font-normal text-muted">{hint}</span> : null}
      <input className={control} name={name} required type={type} />
    </label>
  );
}

function TeamField({ teams }: { teams: readonly TeamRow[] }) {
  // A coach with one team should not be asked which team. The hidden input keeps
  // the action's contract identical either way.
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

/**
 * Load the teams the caller can actually see, and their active players.
 *
 * RLS narrows `teams` to the caller's scope, so a coach sees only the teams they
 * staff without this needing a capability check of its own. The player query
 * filters `member_kind = 'player'` because `team_memberships` also holds coaches
 * and volunteers.
 */
export async function TeamPeoplePanel({
  organisationId,
  workspace,
}: {
  organisationId: string;
  workspace: string;
}) {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("The organisation connection is unavailable.");
  const db = client as unknown as SupabaseClient;

  const { data: teamData, error: teamError } = await db
    .from("teams")
    .select("id,name")
    .eq("organisation_id", organisationId)
    .eq("status", "active")
    .order("name")
    .limit(100);
  if (teamError) throw new Error("We could not load your teams.");
  const teams = (teamData ?? []) as TeamRow[];

  if (!teams.length) {
    return (
      <EmptyState
        title="No teams yet"
        description="A club administrator creates teams for a season. Once a team exists you can add its players and their parents here."
      />
    );
  }

  const { data: playerData, error: playerError } = await db
    .from("team_memberships")
    .select("player_id,team_id,players(first_name,last_name,date_of_birth)")
    .eq("organisation_id", organisationId)
    .eq("member_kind", "player")
    .eq("status", "active")
    .in(
      "team_id",
      teams.map((team) => team.id),
    )
    .limit(500);
  if (playerError) throw new Error("We could not load your players.");
  const players = (playerData ?? []) as PlayerRow[];

  const hidden = (
    <>
      <input name="organisationId" type="hidden" value={organisationId} />
      <input name="workspace" type="hidden" value={workspace} />
    </>
  );

  return (
    <div className="space-y-5">
      <section className={panel} aria-labelledby="add-player-title">
        <h2 className="text-xl font-semibold" id="add-player-title">
          Add a player
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          The player joins the team straight away, so they appear in availability and squad
          selection.
        </p>
        <form action={addPlayerToTeam} className="mt-5 grid gap-4 sm:grid-cols-2">
          {hidden}
          <TeamField teams={teams} />
          <TextField label="First name" name="firstName" />
          <TextField label="Last name" name="lastName" />
          <TextField label="Date of birth" name="dateOfBirth" type="date" />
          <Button className="sm:w-fit" type="submit">
            Add player
          </Button>
        </form>
      </section>

      <section className={panel} aria-labelledby="add-guardian-title">
        <h2 className="text-xl font-semibold" id="add-guardian-title">
          Add a parent or carer
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          They can reply to availability for this child. They start able to receive messages
          about the child and nothing else. A second parent joins the household the child
          already belongs to.
        </p>
        {players.length ? (
          <form action={addGuardianForPlayer} className="mt-5 grid gap-4 sm:grid-cols-2">
            {hidden}
            <TeamField teams={teams} />
            <label className="text-sm font-semibold">
              Child
              <select className={control} name="playerId" required>
                {players.map((player) => (
                  <option key={player.player_id} value={player.player_id}>
                    {playerName(player)}
                  </option>
                ))}
              </select>
            </label>
            <TextField label="Parent or carer name" name="displayName" />
            <TextField label="Email address" name="email" type="email" />
            <TextField
              label="Relationship"
              name="relationship"
              hint="(for example Mother, Father, Carer)"
            />
            <Button className="sm:w-fit" type="submit">
              Add parent or carer
            </Button>
          </form>
        ) : (
          <p className="mt-5 rounded-xl bg-surface px-4 py-3 text-sm text-muted">
            Add a player first. A parent is always linked to a specific child.
          </p>
        )}
      </section>

      <section className={panel} aria-labelledby="team-players-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold" id="team-players-title">
            Players on your teams
          </h2>
          <Status tone="success">{`${players.length} active`}</Status>
        </div>
        {players.length ? (
          <ul className="mt-4 divide-y divide-border">
            {/*
              Keyed on player AND team. The same child can be on two squads, so
              player_id alone is not unique across this list and React would treat
              two genuine rows as one.
            */}
            {players.map((player) => {
              const details = playerDetails(player);
              const teamName =
                teams.find((team) => team.id === player.team_id)?.name ?? "Unassigned";
              return (
                <li className="py-3" key={`${player.player_id}:${player.team_id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-semibold">{playerName(player)}</span>
                    <span className="text-sm text-muted">{teamName}</span>
                  </div>

                  {/*
                    A disclosure rather than a modal, so correcting a name needs no
                    client JavaScript and the row stays readable when closed.
                  */}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-accent">
                      Edit or remove
                    </summary>

                    <form action={updatePlayer} className="mt-3 grid gap-3 sm:grid-cols-3">
                      <PlayerContext
                        organisationId={organisationId}
                        workspace={workspace}
                        teamId={player.team_id}
                        playerId={player.player_id}
                      />
                      <label className="text-sm font-semibold">
                        First name
                        <input
                          required
                          name="firstName"
                          maxLength={80}
                          defaultValue={details.first_name}
                          className={inputClass}
                        />
                      </label>
                      <label className="text-sm font-semibold">
                        Last name
                        <input
                          required
                          name="lastName"
                          maxLength={80}
                          defaultValue={details.last_name}
                          className={inputClass}
                        />
                      </label>
                      <label className="text-sm font-semibold">
                        Date of birth
                        <input
                          required
                          type="date"
                          name="dateOfBirth"
                          defaultValue={details.date_of_birth ?? ""}
                          className={inputClass}
                        />
                      </label>
                      <Button type="submit" className="sm:w-fit">
                        Save changes
                      </Button>
                    </form>

                    <form action={removePlayerFromTeam} className="mt-3">
                      <PlayerContext
                        organisationId={organisationId}
                        workspace={workspace}
                        teamId={player.team_id}
                        playerId={player.player_id}
                      />
                      <Button type="submit" variant="secondary" className="sm:w-fit">
                        Remove from {teamName}
                      </Button>
                      <p className="mt-2 text-sm text-muted">
                        They stop appearing in availability and squad selection. Their
                        attendance and squad history is kept, and adding them back
                        restores it.
                      </p>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">No active players on your teams yet.</p>
        )}
      </section>
    </div>
  );
}
