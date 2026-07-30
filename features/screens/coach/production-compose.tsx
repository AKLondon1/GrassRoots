import type { SupabaseClient } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { DeniedState } from "@/components/ui/denied-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import { publishAnnouncement } from "@/features/communications/actions";
import { capabilityScopes, resolveAccess } from "@/features/tenancy/authorise";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const panel = "rounded-2xl border border-border-strong bg-background p-5 sm:p-7";

interface ComposeProps {
  organisationId: string;
  workspace: string;
}

interface TeamRow {
  id: string;
  name: string;
}

interface AnnouncementRow {
  id: string;
  title: string;
  status: string;
  team_id: string | null;
  published_at: string | null;
}

/**
 * Where a coach or manager writes to their team.
 *
 * THE OPTIONS ARE BUILT FROM GRANTS, NOT FROM THE TEAMS TABLE. A coach can read
 * every team in the club — `teams` is readable club-wide so that names render on
 * cards — so listing the table would offer teams the database will refuse to
 * publish to. That is the defect migration 0026 fixed on the friendly form arriving
 * from the other direction: there the dropdowns were empty, here they would be too
 * full. `capabilityScopes` reads the same `scopedGrants` the server action
 * authorises from, so the form and the check cannot disagree.
 *
 * The club-wide option is likewise conditional. Migration 0029 keeps club-wide
 * publishing with the organisation-scoped roles, so a coach offered a blank option
 * would be offered an escalation, get a refusal, and have no way to tell a
 * permission boundary from a bug.
 */
export async function ProductionComposeScreen({ organisationId, workspace }: ComposeProps) {
  const access = await resolveAccess(workspace);
  if (!access || access.organisationId !== organisationId) {
    return (
      <DeniedState
        title="Announcements are not available for your account"
        description="You need an active membership in this club to write to a team."
      />
    );
  }

  const { organisation: canPublishClubWide, teamIds } = capabilityScopes(
    access,
    "announcements:manage",
  );

  if (!canPublishClubWide && teamIds.length === 0) {
    return (
      <DeniedState
        title="You cannot publish announcements"
        description="Announcements are written by team staff and club administrators. Ask your club administrator if you should be able to write to a team."
      />
    );
  }

  const client = await createServerSupabaseClient();
  if (!client) throw new Error("The organisation connection is unavailable.");
  const db = client as unknown as SupabaseClient;

  // An organisation-scoped grant covers every team, so it lists them all. A
  // team-scoped one lists only what it names.
  const teamQuery = db
    .from("teams")
    .select("id,name")
    .eq("organisation_id", organisationId)
    .order("name")
    .limit(100);
  const { data: teamData, error: teamError } = canPublishClubWide
    ? await teamQuery
    : await teamQuery.in("id", [...teamIds]);
  if (teamError) throw new Error("We could not load the teams you can write to.");
  const teams = (teamData ?? []) as TeamRow[];

  const { data: recentData, error: recentError } = await db
    .from("announcements")
    .select("id,title,status,team_id,published_at")
    .eq("organisation_id", organisationId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(10);
  if (recentError) throw new Error("We could not load recent announcements.");
  const recent = (recentData ?? []) as AnnouncementRow[];
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={panel}>
        <h2 className="text-xl font-semibold">Write to your team</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Everyone in the team’s adult audience receives this. Parents see it on their
          announcements screen straight away.
        </p>
        <form action={publishAnnouncement} className="mt-5 space-y-4">
          <input type="hidden" name="organisationId" value={organisationId} />
          <input type="hidden" name="workspace" value={workspace} />
          <label className="block text-sm font-semibold">
            Audience
            <select
              name="teamId"
              required={!canPublishClubWide}
              defaultValue={!canPublishClubWide && teams.length === 1 ? teams[0].id : ""}
              className="mt-2 min-h-11 w-full rounded-xl border border-border-strong bg-background px-3"
            >
              {/*
                A blank value means club-wide, which is what the action normalises to
                null. Somebody without club-wide rights still needs a placeholder, so
                the option is rendered either way and only its meaning changes:
                selectable and club-wide above, a disabled prompt below.
              */}
              <option value="" disabled={!canPublishClubWide}>
                {canPublishClubWide ? "Everyone in the club" : "Choose a team"}
              </option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Announcement title
            <input
              name="title"
              required
              minLength={2}
              maxLength={160}
              className="mt-2 min-h-11 w-full rounded-xl border border-border-strong bg-background px-3"
            />
          </label>
          <label className="block text-sm font-semibold">
            Message
            <textarea
              name="body"
              required
              maxLength={10_000}
              className="mt-2 min-h-28 w-full rounded-xl border border-border-strong bg-background p-3"
            />
          </label>
          <Button type="submit">Publish now</Button>
        </form>
      </section>
      <section className={panel}>
        <h2 className="text-xl font-semibold">Recently published</h2>
        {recent.length ? (
          <ul className="mt-5 divide-y divide-border">
            {recent.map((item) => (
              <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={item.id}>
                <span className="text-sm">
                  <span className="font-semibold">{item.title}</span>
                  <span className="block text-muted">
                    {item.team_id ? (teamNames.get(item.team_id) ?? "A team") : "Everyone in the club"}
                    {item.published_at
                      ? ` · ${new Date(item.published_at).toLocaleDateString("en-GB")}`
                      : ""}
                  </span>
                </span>
                <Status tone={item.status === "published" ? "success" : "neutral"}>
                  {item.status}
                </Status>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5">
            <EmptyState
              title="Nothing published yet"
              description="Announcements you write to your team will be listed here."
            />
          </div>
        )}
      </section>
    </div>
  );
}
