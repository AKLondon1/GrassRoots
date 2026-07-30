import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An announcement must go to the audience the author chose, and only to an
 * audience they hold authority over.
 *
 * `requested_team_id` was hardcoded to null, so every announcement was club-wide
 * whatever the form said. That was invisible while only the club governance
 * composer existed — a club administrator publishing club-wide is the intended
 * behaviour — and becomes a disclosure the moment a coach can publish, because a
 * team notice addressed to one team would have been fanned out to every adult in
 * the club by enqueue_published_announcement_deliveries.
 *
 * The scope also decides the authority. Migration 0029 splits the RPC's check in
 * two: club-wide needs organisation-scoped `announcements:manage`, a team needs it
 * over that team. This action mirrors that split, so the cases below are the whole
 * of the contract.
 */

const ORGANISATION = "00000000-0000-4000-8000-000000000101";
const OTHER_ORGANISATION = "00000000-0000-4000-8000-000000000102";
const OWN_TEAM = "00000000-0000-4000-8000-000000000802";
const OTHER_TEAM = "00000000-0000-4000-8000-000000000801";
const WORKSPACE = "riverside-juniors";

type Row = Record<string, unknown>;

const calls: Row[] = [];
const required: Array<{ capability: string; scope: unknown }> = [];

/**
 * The coach the seed describes: `announcements:manage` over the Under 11s and
 * nothing club-wide. grantsCapability is not mocked away — the real one runs
 * against this grant list, so the scope logic under test is the shipped logic.
 */
const teamScopedCoach = [
  {
    organisationId: ORGANISATION,
    scopeKind: "team" as const,
    scopeId: OWN_TEAM,
    capabilities: ["announcements:manage"],
  },
];

const organisationScopedAdmin = [
  {
    organisationId: ORGANISATION,
    scopeKind: "organisation" as const,
    scopeId: ORGANISATION,
    capabilities: ["announcements:manage"],
  },
];

let scopedGrants: Array<Record<string, unknown>> = teamScopedCoach;

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

vi.mock("@/features/tenancy/authorise", async () => {
  const actual = await vi.importActual<typeof import("@/features/tenancy/authorise")>(
    "@/features/tenancy/authorise",
  );
  return {
    ...actual,
    requireCapability: async (
      _workspace: string,
      capability: string,
      scope: unknown = { kind: "organisation" },
    ) => {
      required.push({ capability, scope });
      const access = { organisationId: ORGANISATION, scopedGrants };
      if (!actual.grantsCapability(access as never, capability as never, scope as never)) {
        throw new Error("You do not have permission to do that.");
      }
      return access as never;
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    rpc: async (name: string, args: Row) => {
      calls.push({ name, ...args });
      return { data: null, error: null };
    },
  }),
}));

const { publishAnnouncement } = await import("@/features/communications/actions");

function announcement(fields: Record<string, string> = {}) {
  const formData = new FormData();
  Object.entries({
    organisationId: ORGANISATION,
    workspace: WORKSPACE,
    title: "Meet at 09:40",
    body: "Sunday is on the main pitch.",
    ...fields,
  }).forEach(([key, value]) => formData.append(key, value));
  return formData;
}

beforeEach(() => {
  calls.length = 0;
  required.length = 0;
  scopedGrants = teamScopedCoach;
});

describe("publishAnnouncement scoping", () => {
  it("passes the chosen team through to the RPC", async () => {
    await publishAnnouncement(announcement({ teamId: OWN_TEAM }));

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: "publish_announcement",
      requested_organisation_id: ORGANISATION,
      requested_team_id: OWN_TEAM,
    });
  });

  it("requires the capability over that team, not the organisation", async () => {
    await publishAnnouncement(announcement({ teamId: OWN_TEAM }));

    expect(required).toEqual([
      { capability: "announcements:manage", scope: { kind: "team", teamId: OWN_TEAM } },
    ]);
  });

  it("treats a blank team select as club-wide", async () => {
    // The select's blank option submits "", not an absent field. A schema accepting
    // only undefined would reject the club-wide case outright, and one passing ""
    // through would send an empty string where the RPC expects a uuid or null.
    scopedGrants = organisationScopedAdmin;

    await publishAnnouncement(announcement({ teamId: "" }));

    expect(calls[0]).toMatchObject({ requested_team_id: null });
    expect(required).toEqual([
      { capability: "announcements:manage", scope: { kind: "organisation" } },
    ]);
  });

  it("still publishes club-wide when the form renders no team field at all", async () => {
    // The club governance composer (production-governance.tsx:95) has no team
    // select and must keep working unchanged.
    scopedGrants = organisationScopedAdmin;

    await publishAnnouncement(announcement());

    expect(calls[0]).toMatchObject({ requested_team_id: null });
  });

  it("refuses a team the author does not staff", async () => {
    await expect(publishAnnouncement(announcement({ teamId: OTHER_TEAM }))).rejects.toThrow(
      "You do not have permission to do that.",
    );
    expect(calls).toHaveLength(0);
  });

  it("refuses club-wide publishing from a team-scoped author", async () => {
    // The escalation the hardcoded null made unreachable and the composer makes
    // reachable: a coach who blanks the team select is asking to address the club.
    await expect(publishAnnouncement(announcement({ teamId: "" }))).rejects.toThrow(
      "You do not have permission to do that.",
    );
    expect(calls).toHaveLength(0);
  });

  it("refuses an organisation id that does not belong to the workspace", async () => {
    // organisationId arrives from a hidden input, so it is a request rather than a
    // fact. It is only ever compared against the workspace's resolved organisation.
    await expect(
      publishAnnouncement(announcement({ organisationId: OTHER_ORGANISATION, teamId: OWN_TEAM })),
    ).rejects.toThrow("That organisation does not belong to this workspace.");
    expect(calls).toHaveLength(0);
  });
});
