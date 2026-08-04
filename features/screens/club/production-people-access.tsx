import type { SupabaseClient } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import { assignRole, revokeRole } from "@/features/people/role-actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Roles that only mean anything against a single team.
 *
 * 0020's `enforce_team_scoped_staff_roles` trigger REFUSES these at organisation
 * scope, because manager and coach carry people:manage and an org-wide grant would
 * satisfy the org-wide policies on players and guardians -- handing one team's manager
 * every family record in the club. Mirroring the list here is not duplicated
 * authorisation: the database still refuses regardless. It is so the form never offers
 * a combination that would come back as an error, which is the defect class 0026 fixed.
 */
const TEAM_ONLY_ROLE_KEYS = new Set(["manager", "coach"]);

interface MembershipRow {
  id: string;
  status: string;
  profiles: { display_name: string | null } | null;
}
interface RoleRow { id: string; key: string; name: string }
interface TeamRow { id: string; name: string }
interface AssignmentRow {
  id: string;
  membership_id: string;
  role_id: string;
  scope_kind: string;
  scope_id: string | null;
}

const selectClass =
  "mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3";

/**
 * People and access: who is in this club, and what each of them may do.
 *
 * Reads four things and joins them in TypeScript rather than in one nested select,
 * because scoped_role_assignments points at a team through a polymorphic `scope_id`
 * that PostgREST cannot follow -- it is a team id when `scope_kind` is 'team' and the
 * organisation's own id otherwise, with no foreign key to embed.
 *
 * The screen renders per PERSON, not per assignment. A list of assignments is what the
 * table looks like; "who can do what" is the question an administrator actually arrives
 * with, and one person holding club-admin across the club and manager of a single team
 * is the case that makes the distinction visible.
 */
export async function ProductionPeopleAccessScreen({
  organisationId,
  workspace,
}: {
  organisationId: string;
  workspace: string;
}) {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("The organisation connection is unavailable.");
  const db = client as unknown as SupabaseClient;

  const [
    { data: membershipData, error: membershipError },
    { data: roleData, error: roleError },
    { data: teamData, error: teamError },
    { data: assignmentData, error: assignmentError },
  ] = await Promise.all([
    db
      .from("memberships")
      .select("id,status,profiles(display_name)")
      .eq("organisation_id", organisationId)
      .eq("status", "active")
      .limit(500),
    db.from("roles").select("id,key,name").eq("organisation_id", organisationId).order("name").limit(100),
    db.from("teams").select("id,name").eq("organisation_id", organisationId).order("name").limit(250),
    db
      .from("scoped_role_assignments")
      .select("id,membership_id,role_id,scope_kind,scope_id")
      .eq("organisation_id", organisationId)
      .limit(1000),
  ]);
  if (membershipError || roleError || teamError || assignmentError) {
    throw new Error("We could not load the club's people and access.");
  }

  const memberships = (membershipData ?? []) as unknown as MembershipRow[];
  const roles = (roleData ?? []) as RoleRow[];
  const teams = (teamData ?? []) as TeamRow[];
  const assignments = (assignmentData ?? []) as AssignmentRow[];

  const roleById = new Map(roles.map((role) => [role.id, role]));
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  const assignmentsByMembership = new Map<string, AssignmentRow[]>();
  for (const assignment of assignments) {
    const existing = assignmentsByMembership.get(assignment.membership_id);
    if (existing) existing.push(assignment);
    else assignmentsByMembership.set(assignment.membership_id, [assignment]);
  }

  // Named people first, then anyone whose display name did not resolve, so a profile
  // this administrator cannot read sinks to the bottom instead of heading the list.
  const people = memberships
    .map((membership) => ({
      id: membership.id,
      name: membership.profiles?.display_name ?? null,
      assignments: assignmentsByMembership.get(membership.id) ?? [],
    }))
    .sort((left, right) => (left.name ?? "￿").localeCompare(right.name ?? "￿"));

  if (!people.length) {
    return (
      <EmptyState
        title="No active members yet"
        description="Invite an adult from the Invitations screen, and they will appear here once they accept."
      />
    );
  }

  const panel = "rounded-2xl border border-border-strong bg-background p-5 sm:p-7";

  return (
    <div className="space-y-5">
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Who can do what</h2>
          <Status tone="success">
            {people.length} active {people.length === 1 ? "member" : "members"}
          </Status>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">
          A role given across the club applies everywhere. A role given to a team applies
          only there, which is why manager and coach can only be given that way.
        </p>

        <ul className="mt-5 divide-y divide-border">
          {people.map((person) => (
            <li key={person.id} className="py-5 first:pt-0">
              <p className="font-semibold">{person.name ?? "Member"}</p>

              {person.assignments.length ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {person.assignments.map((assignment) => {
                    const role = roleById.get(assignment.role_id);
                    const where =
                      assignment.scope_kind === "team"
                        ? (teamNameById.get(assignment.scope_id ?? "") ?? "a team")
                        : "the whole club";
                    return (
                      <li
                        key={assignment.id}
                        className="flex items-center gap-2 rounded-full bg-surface py-1 pl-3 pr-1 text-sm"
                      >
                        <span>
                          <span className="font-semibold">{role?.name ?? "Role"}</span>
                          <span className="text-muted"> · {where}</span>
                        </span>
                        <form action={revokeRole}>
                          <HiddenContext organisationId={organisationId} workspace={workspace} />
                          <input type="hidden" name="assignmentId" value={assignment.id} />
                          <Button
                            type="submit"
                            variant="secondary"
                            className="min-h-8 rounded-full px-3 py-1 text-xs"
                          >
                            Remove
                            <span className="sr-only">
                              {" "}
                              the {role?.name ?? "role"} role covering {where} from{" "}
                              {person.name ?? "this member"}
                            </span>
                          </Button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  No roles yet, so this member can see nothing beyond their own account.
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={panel}>
        <h2 className="text-xl font-semibold">Give someone a role</h2>
        {roles.length ? (
          <>
            <form action={assignRole} className="mt-5 grid gap-4 sm:grid-cols-3">
              <HiddenContext organisationId={organisationId} workspace={workspace} />

              <label className="text-sm font-semibold">
                Member
                <select name="membershipId" className={selectClass}>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name ?? "Member"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold">
                Role
                <select name="roleKey" className={selectClass}>
                  {roles.map((role) => (
                    <option key={role.id} value={role.key}>
                      {role.name}
                      {TEAM_ONLY_ROLE_KEYS.has(role.key) ? " (one team only)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              {/*
                One control for scope, so "a team, but no team named" cannot be
                expressed. The whole-club option comes first because that is the common
                case for an administrator; manager and coach are labelled team-only
                above, and the database refuses them club-wide regardless.
              */}
              <label className="text-sm font-semibold">
                Applies to
                <select name="scope" className={selectClass}>
                  <option value="organisation">The whole club</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>

              <Button type="submit" className="sm:w-fit">
                Give role
              </Button>
            </form>
            {teams.length ? null : (
              <p className="mt-4 text-sm text-muted">
                There are no teams yet, so only club-wide roles can be given. Create a team
                first to appoint a manager or coach.
              </p>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-muted">This club has no roles defined yet.</p>
        )}
      </section>
    </div>
  );
}

function HiddenContext({
  organisationId,
  workspace,
}: {
  organisationId: string;
  workspace: string;
}) {
  return (
    <>
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="workspace" value={workspace} />
    </>
  );
}
