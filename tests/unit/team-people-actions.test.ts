// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));
const tenancy = vi.hoisted(() => ({ requireCapability: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: supabase.createClient,
}));
vi.mock("@/features/tenancy/authorise", () => ({
  requireCapability: tenancy.requireCapability,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addGuardianForPlayer, addPlayerToTeam } from "@/features/people/team-people-actions";

const ORGANISATION = "11111111-1111-4111-8111-111111111111";
const OTHER_ORGANISATION = "22222222-2222-4222-8222-222222222222";
const TEAM = "33333333-3333-4333-8333-333333333333";
const PLAYER = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;

function createDatabaseStub(rpcError: { code: string; message: string } | null = null) {
  const rpcCalls: Array<{ name: string; args: Row }> = [];
  const tableCalls: string[] = [];
  const chain: Record<string, unknown> = {
    select: () => chain,
    single: async () => ({ data: null, error: null }),
    eq: () => chain,
    then: (resolve: (value: { data: null; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: null, error: null })),
  };
  return {
    client: {
      from(table: string) {
        tableCalls.push(table);
        return { insert: () => chain, update: () => chain, select: () => chain };
      },
      async rpc(name: string, args: Row) {
        rpcCalls.push({ name, args });
        return { data: null, error: rpcError };
      },
    },
    rpcNames: () => rpcCalls.map((call) => call.name),
    rpc: (name: string) => rpcCalls.find((call) => call.name === name)?.args ?? {},
    tables: () => tableCalls,
  };
}

function formDataOf(values: Record<string, string>) {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => formData.append(key, value));
  return formData;
}

function allowAccess(organisationId = ORGANISATION) {
  tenancy.requireCapability.mockResolvedValue({
    status: "allowed",
    organisationId,
    membershipId: "44444444-4444-4444-8444-444444444444",
    role: "coach",
    roles: ["coach"],
    capabilities: [],
    scopedGrants: [],
  });
}

const validPlayer = {
  organisationId: ORGANISATION,
  workspace: "riverside",
  teamId: TEAM,
  firstName: "Jamie",
  lastName: "Morgan",
  dateOfBirth: "2015-04-02",
};

const validGuardian = {
  organisationId: ORGANISATION,
  workspace: "riverside",
  teamId: TEAM,
  playerId: PLAYER,
  displayName: "Alex Morgan",
  email: "Alex.Morgan@Example.ORG",
  relationship: "Mother",
};

beforeEach(() => {
  vi.clearAllMocks();
  allowAccess();
});

describe("addPlayerToTeam", () => {
  it("creates the player and the team membership through one RPC", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await addPlayerToTeam(formDataOf(validPlayer));

    expect(database.rpcNames()).toEqual(["add_player_to_team"]);
    expect(database.rpc("add_player_to_team")).toEqual({
      target_team_id: TEAM,
      player_first_name: "Jamie",
      player_last_name: "Morgan",
      player_date_of_birth: "2015-04-02",
    });
  });

  it("never writes to the players table directly", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await addPlayerToTeam(formDataOf(validPlayer));

    expect(database.tables()).toEqual([]);
  });

  it("requires people:manage at team scope", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);

    await addPlayerToTeam(formDataOf(validPlayer));

    expect(tenancy.requireCapability).toHaveBeenCalledWith("riverside", "people:manage", {
      kind: "team",
      teamId: TEAM,
    });
  });

  it("rejects a date of birth in the future", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);

    await expect(
      addPlayerToTeam(formDataOf({ ...validPlayer, dateOfBirth: "2999-01-01" })),
    ).rejects.toThrow(/cannot be in the future/i);
  });

  it("refuses a form claiming an organisation the workspace does not resolve to", async () => {
    allowAccess(OTHER_ORGANISATION);
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);

    await expect(addPlayerToTeam(formDataOf(validPlayer))).rejects.toThrow(
      /does not belong to this workspace/i,
    );
  });

  it("explains a team the caller does not staff", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({ code: "42501", message: "You cannot add players to this team" })
        .client,
    );

    await expect(addPlayerToTeam(formDataOf(validPlayer))).rejects.toThrow(
      /only add people to a team you staff/i,
    );
  });
});

describe("addGuardianForPlayer", () => {
  it("links the guardian through the RPC, not through the tables", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await addGuardianForPlayer(formDataOf(validGuardian));

    expect(database.rpcNames()).toEqual(["add_guardian_for_player"]);
    expect(database.tables()).toEqual([]);
  });

  it("passes the player, name, email and relationship the RPC expects", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await addGuardianForPlayer(formDataOf(validGuardian));

    expect(database.rpc("add_guardian_for_player")).toEqual({
      target_player_id: PLAYER,
      guardian_display_name: "Alex Morgan",
      guardian_email: "Alex.Morgan@Example.ORG",
      guardian_relationship: "Mother",
    });
  });

  it("rejects a relationship shorter than the database allows", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);

    await expect(
      addGuardianForPlayer(formDataOf({ ...validGuardian, relationship: "M" })),
    ).rejects.toThrow();
  });

  it("rejects an address that is not an email", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);

    await expect(
      addGuardianForPlayer(formDataOf({ ...validGuardian, email: "not-an-email" })),
    ).rejects.toThrow();
  });

  it("requires people:manage at team scope", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);

    await addGuardianForPlayer(formDataOf(validGuardian));

    expect(tenancy.requireCapability).toHaveBeenCalledWith("riverside", "people:manage", {
      kind: "team",
      teamId: TEAM,
    });
  });

  it("refuses a form claiming an organisation the workspace does not resolve to", async () => {
    allowAccess(OTHER_ORGANISATION);
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);

    await expect(addGuardianForPlayer(formDataOf(validGuardian))).rejects.toThrow(
      /does not belong to this workspace/i,
    );
  });
});

/**
 * The RPC route is the whole safety property of Task 8. A direct insert would be
 * checked against organisation-scoped people:manage and hand a coach every family
 * in the club, so it is worth failing loudly if one ever reappears.
 */
describe("team people static safety", () => {
  const actions = readFileSync(
    join(process.cwd(), "features/people/team-people-actions.ts"),
    "utf8",
  );
  const legacy = readFileSync(
    join(process.cwd(), "features/people/production-actions.ts"),
    "utf8",
  );

  it.each(["players", "guardians", "households", "player_guardians", "team_memberships"])(
    "never writes %s directly",
    (table) => {
      expect(actions).not.toMatch(new RegExp(`from\\("${table}"\\)`));
    },
  );

  it("authorises at team scope only", () => {
    expect(actions).toMatch(/kind: "team",\s*\n?\s*teamId/);
    expect(actions).not.toMatch(/requireCapability\([^)]*kind: "organisation"/);
  });

  it("no longer exposes the direct-insert createPlayer", () => {
    expect(legacy).not.toMatch(/export async function createPlayer/);
    expect(legacy).not.toMatch(/from\("players"\)/);
  });
});
