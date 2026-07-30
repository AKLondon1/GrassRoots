// @vitest-environment node
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

import {
  createSquadForInstance,
  publishSquad,
  setSquadMembers,
} from "@/features/squads/production-actions";

const ORGANISATION = "11111111-1111-4111-8111-111111111111";
const TEAM = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP = "44444444-4444-4444-8444-444444444444";
const SQUAD = "55555555-5555-4555-8555-555555555555";
const INSTANCE = "66666666-6666-4666-8666-666666666666";
const PLAYER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAYER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PLAYER_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type Row = Record<string, unknown>;

interface Call {
  readonly table: string;
  readonly operation: "insert" | "update" | "delete" | "select";
  readonly rows: readonly Row[];
}

function createDatabaseStub(
  options: {
    /** Players who replied unavailable for this fixture. */
    readonly unavailable?: readonly string[];
    /** Rows already in squad_members. */
    readonly members?: readonly Row[];
    readonly insertError?: { code: string; message: string } | null;
  } = {},
) {
  const { unavailable = [], members = [], insertError = null } = options;
  const calls: Call[] = [];

  function builder(table: string) {
    let operation: Call["operation"] = "select";

    const result = () => {
      if (table === "squads" && operation === "select") {
        return { data: { id: SQUAD, event_instance_id: INSTANCE, status: "draft" }, error: null };
      }
      if (table === "availability_responses") {
        return { data: unavailable.map((player_id) => ({ player_id })), error: null };
      }
      if (table === "squad_members" && operation === "select") {
        return { data: members, error: null };
      }
      if (table === "squad_members" && operation === "insert") {
        return { data: null, error: insertError };
      }
      return { data: null, error: null };
    };

    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (value: Row | Row[]) => {
        operation = "insert";
        calls.push({ table, operation, rows: Array.isArray(value) ? value : [value] });
        return chain;
      },
      update: (value: Row) => {
        operation = "update";
        calls.push({ table, operation, rows: [value] });
        return chain;
      },
      delete: () => {
        operation = "delete";
        calls.push({ table, operation, rows: [] });
        return chain;
      },
      eq: () => chain,
      in: () => chain,
      single: async () => result(),
      maybeSingle: async () => result(),
      limit: async () => result(),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
        Promise.resolve(resolve(result())),
    };
    return chain;
  }

  return {
    client: { from: (table: string) => builder(table) },
    operations: (table: string) =>
      calls.filter((call) => call.table === table).map((call) => call.operation),
    rows: (table: string) =>
      calls.filter((call) => call.table === table).flatMap((call) => call.rows),
  };
}

function formDataOf(values: Record<string, string | string[]>) {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((entry) => formData.append(key, entry));
    else formData.append(key, value);
  });
  return formData;
}

const base = { organisationId: ORGANISATION, workspace: "riverside", teamId: TEAM };

beforeEach(() => {
  vi.clearAllMocks();
  tenancy.requireCapability.mockResolvedValue({
    status: "allowed",
    organisationId: ORGANISATION,
    membershipId: MEMBERSHIP,
    role: "coach",
    roles: ["coach"],
    capabilities: [],
    scopedGrants: [],
  });
});

describe("createSquadForInstance", () => {
  it("requires squads:manage at team scope", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);

    await createSquadForInstance(formDataOf({ ...base, eventInstanceId: INSTANCE }));

    expect(tenancy.requireCapability).toHaveBeenCalledWith("riverside", "squads:manage", {
      kind: "team",
      teamId: TEAM,
    });
  });

  it("opens the squad as a draft, never published", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await createSquadForInstance(formDataOf({ ...base, eventInstanceId: INSTANCE }));

    expect(database.rows("squads")[0]).toMatchObject({ status: "draft" });
  });
});

describe("setSquadMembers", () => {
  const selection = {
    ...base,
    squadId: SQUAD,
    selected: [PLAYER_A, PLAYER_B],
    standby: [PLAYER_C],
  };

  it("replaces squad members rather than upserting them", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await setSquadMembers(formDataOf(selection));

    expect(database.operations("squad_members")).toEqual(["delete", "insert"]);
  });

  it("numbers positions from one, because the column is checked greater than zero", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await setSquadMembers(formDataOf(selection));

    const inserted = database.rows("squad_members");
    expect(inserted).toHaveLength(3);
    expect(inserted[0]).toMatchObject({
      player_id: PLAYER_A,
      status: "selected",
      position_order: 1,
    });
    expect(inserted[1]).toMatchObject({
      player_id: PLAYER_B,
      status: "selected",
      position_order: 2,
    });
    expect(inserted[2]).toMatchObject({
      player_id: PLAYER_C,
      status: "standby",
      position_order: 1,
    });
  });

  it("refuses to select a player who replied unavailable for this event", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub({ unavailable: [PLAYER_A] }).client);

    await expect(setSquadMembers(formDataOf(selection))).rejects.toThrow(/replied unavailable/i);
  });

  it("refuses the same child as both playing and standby", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);

    await expect(
      setSquadMembers(
        formDataOf({ ...base, squadId: SQUAD, selected: [PLAYER_A], standby: [PLAYER_A] }),
      ),
    ).rejects.toThrow(/both selected and on standby/i);
  });

  it("does not clear the squad when the selection is invalid", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await expect(
      setSquadMembers(
        formDataOf({ ...base, squadId: SQUAD, selected: [PLAYER_A], standby: [PLAYER_A] }),
      ),
    ).rejects.toThrow();

    expect(database.operations("squad_members")).not.toContain("delete");
  });

  it("clears the squad when everyone is deselected", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await setSquadMembers(formDataOf({ ...base, squadId: SQUAD }));

    expect(database.operations("squad_members")).toEqual(["delete"]);
  });

  it("explains a child who is not in this team", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({
        insertError: { code: "23503", message: "Player must belong to the team." },
      }).client,
    );

    await expect(setSquadMembers(formDataOf(selection))).rejects.toThrow(/not in this team/i);
  });
});

describe("publishSquad", () => {
  it("refuses to publish a squad with no selected players", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({ members: [{ player_id: PLAYER_A, status: "standby" }] }).client,
    );

    await expect(publishSquad(formDataOf({ ...base, squadId: SQUAD }))).rejects.toThrow(
      /at least one player/i,
    );
  });

  it("sets status, published_at and published_by_membership_id together", async () => {
    const database = createDatabaseStub({
      members: [{ player_id: PLAYER_A, status: "selected" }],
    });
    supabase.createClient.mockResolvedValue(database.client);

    await publishSquad(formDataOf({ ...base, squadId: SQUAD }));

    expect(database.rows("squads")[0]).toEqual({
      status: "published",
      published_at: expect.any(String),
      published_by_membership_id: MEMBERSHIP,
    });
  });

  it("takes the publishing membership from the workspace, not the form", async () => {
    const database = createDatabaseStub({
      members: [{ player_id: PLAYER_A, status: "selected" }],
    });
    supabase.createClient.mockResolvedValue(database.client);

    await publishSquad(
      formDataOf({ ...base, squadId: SQUAD, publishedByMembershipId: "forged" }),
    );

    expect(database.rows("squads")[0]!.published_by_membership_id).toBe(MEMBERSHIP);
  });
});
