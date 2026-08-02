// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The rollover form is a list of checkboxes and free-text names, and the action has
 * to turn that back into the array the RPC expects.
 *
 * This is the fiddly half of Task 12b. An unticked checkbox is absent from the
 * submission entirely rather than present-and-false, so "which teams did the club
 * actually choose" is a question about which keys exist, not about their values.
 * Getting it wrong in the generous direction would create teams the club had
 * deliberately left behind, and each created team publishes an announcement to its
 * parents, so the mistake is not quietly reversible.
 */

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));
const tenancy = vi.hoisted(() => ({ requireCapability: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: supabase.createClient,
}));
vi.mock("@/features/tenancy/authorise", () => ({
  requireCapability: tenancy.requireCapability,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { rollOverSeason } from "@/features/people/production-actions";

const ORGANISATION = "11111111-1111-4111-8111-111111111111";
const OTHER_ORGANISATION = "22222222-2222-4222-8222-222222222222";
const SOURCE_SEASON = "33333333-3333-4333-8333-333333333333";
const TARGET_SEASON = "44444444-4444-4444-8444-444444444444";
const UNDER_7S = "55555555-5555-4555-8555-555555555555";
const UNDER_11S = "66666666-6666-4666-8666-666666666666";

type Row = Record<string, unknown>;

function createDatabaseStub(rpcError: { message: string } | null = null) {
  const rpcCalls: Array<{ name: string; args: Row }> = [];
  return {
    client: {
      async rpc(name: string, args: Row) {
        rpcCalls.push({ name, args });
        return { data: null, error: rpcError };
      },
    },
    rpcCalls,
    rollover: () => rpcCalls.find((call) => call.name === "roll_over_season")?.args ?? {},
  };
}

function formDataOf(values: Record<string, string>) {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => formData.append(key, value));
  return formData;
}

const validContext = {
  organisationId: ORGANISATION,
  workspace: "riverside",
  sourceSeasonId: SOURCE_SEASON,
  targetSeasonId: TARGET_SEASON,
};

beforeEach(() => {
  vi.clearAllMocks();
  tenancy.requireCapability.mockResolvedValue({
    status: "allowed",
    organisationId: ORGANISATION,
    membershipId: "membership-1",
    role: "club",
    roles: ["club"],
    capabilities: [],
    scopedGrants: [],
  });
});

describe("rollOverSeason", () => {
  it("sends only the teams whose checkbox was ticked", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    // The Under 11s row rendered a name input but its checkbox was cleared, so the
    // browser submits `name_...` without `include_...`. A reconstruction keyed off
    // the name inputs would bring that team across against the club's wishes.
    await rollOverSeason(
      formDataOf({
        ...validContext,
        [`include_${UNDER_7S}`]: "on",
        [`name_${UNDER_7S}`]: "Under 8",
        [`name_${UNDER_11S}`]: "Under 12",
      }),
    );

    expect(database.rollover().requested_teams).toEqual([
      { sourceTeamId: UNDER_7S, name: "Under 8" },
    ]);
  });

  it("passes the edited name rather than the proposed one", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await rollOverSeason(
      formDataOf({
        ...validContext,
        [`include_${UNDER_7S}`]: "on",
        [`name_${UNDER_7S}`]: "Colts",
      }),
    );

    expect(database.rollover().requested_teams).toEqual([
      { sourceTeamId: UNDER_7S, name: "Colts" },
    ]);
  });

  it("sends an empty name rather than inventing one, so the RPC applies its default", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await rollOverSeason(
      formDataOf({ ...validContext, [`include_${UNDER_7S}`]: "on", [`name_${UNDER_7S}`]: "   " }),
    );

    expect(database.rollover().requested_teams).toEqual([{ sourceTeamId: UNDER_7S, name: "" }]);
  });

  it("refuses when every team was unticked", async () => {
    // Submitting nothing is a mistake, not an instruction to roll everything over.
    // An empty requested_teams would mean "no teams" to the RPC and null would mean
    // "all of them", and the two are one typo apart.
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await expect(rollOverSeason(formDataOf(validContext))).rejects.toThrow(
      "Choose at least one team to bring across.",
    );
    expect(database.rpcCalls).toHaveLength(0);
  });

  it("requires teams:manage, which only club administrators hold", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await rollOverSeason(
      formDataOf({ ...validContext, [`include_${UNDER_7S}`]: "on", [`name_${UNDER_7S}`]: "Under 8" }),
    );

    expect(tenancy.requireCapability).toHaveBeenCalledWith("riverside", "teams:manage");
  });

  it("refuses an organisation id that does not belong to the workspace", async () => {
    // organisationId arrives from a hidden input, so it is a request rather than a
    // fact, and is only ever compared against the workspace's resolved organisation.
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await expect(
      rollOverSeason(
        formDataOf({
          ...validContext,
          organisationId: OTHER_ORGANISATION,
          [`include_${UNDER_7S}`]: "on",
          [`name_${UNDER_7S}`]: "Under 8",
        }),
      ),
    ).rejects.toThrow("That organisation does not belong to this workspace.");
    expect(database.rpcCalls).toHaveLength(0);
  });

  it("surfaces an RPC refusal rather than reporting success", async () => {
    const database = createDatabaseStub({ message: "not authorised" });
    supabase.createClient.mockResolvedValue(database.client);

    await expect(
      rollOverSeason(
        formDataOf({ ...validContext, [`include_${UNDER_7S}`]: "on", [`name_${UNDER_7S}`]: "Under 8" }),
      ),
    ).rejects.toThrow("not authorised");
  });
});
