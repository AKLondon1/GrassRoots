// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: supabase.createClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveProductionAvailability } from "@/features/availability/actions";

const ORGANISATION = "11111111-1111-4111-8111-111111111111";
const TEAM = "33333333-3333-4333-8333-333333333333";
const INSTANCE = "55555555-5555-4555-8555-555555555555";
const OUR_CHILD = "66666666-6666-4666-8666-666666666666";
const SOMEONE_ELSES_CHILD = "77777777-7777-4777-8777-777777777777";
const OUR_GUARDIAN = "88888888-8888-4888-8888-888888888888";

type Row = Record<string, unknown>;

/**
 * Answers each table's `maybeSingle()` from the table name, and records what was
 * upserted. `linkedPlayer` is the only child the stubbed `player_guardians` row
 * matches, which is what lets a test prove the action checks the link rather than
 * trusting the form.
 */
function createDatabaseStub(
  options: {
    readonly user?: { id: string } | null;
    readonly membership?: Row | null;
    readonly guardian?: Row | null;
    readonly linkedPlayer?: string | null;
  } = {},
) {
  const {
    user = { id: "user-1" },
    membership = { id: "membership-1" },
    guardian = { id: OUR_GUARDIAN },
    linkedPlayer = OUR_CHILD,
  } = options;

  const upserts: Row[] = [];

  function builder(table: string) {
    const filters: Row = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return chain;
      },
      maybeSingle: async () => {
        if (table === "memberships") return { data: membership, error: null };
        if (table === "guardians") return { data: guardian, error: null };
        if (table === "player_guardians") {
          const matches = linkedPlayer !== null && filters.player_id === linkedPlayer;
          return { data: matches ? { id: "link-1" } : null, error: null };
        }
        return { data: null, error: null };
      },
      upsert: async (row: Row) => {
        upserts.push(row);
        return { data: null, error: null };
      },
    };
    return chain;
  }

  return {
    client: {
      auth: { getUser: async () => ({ data: { user }, error: null }) },
      from: (table: string) => builder(table),
    },
    upserts: () => upserts,
  };
}

function formDataOf(values: Record<string, string>) {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => formData.append(key, value));
  return formData;
}

const reply = {
  organisationId: ORGANISATION,
  workspace: "riverside",
  eventInstanceId: INSTANCE,
  teamId: TEAM,
  playerId: OUR_CHILD,
  status: "available",
};

beforeEach(() => vi.clearAllMocks());

describe("availability attribution", () => {
  it("refuses a reply for a player the signed-in guardian is not linked to", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);

    await expect(
      saveProductionAvailability(formDataOf({ ...reply, playerId: SOMEONE_ELSES_CHILD })),
    ).rejects.toThrow(/not linked/i);
  });

  it("attributes the reply to the guardian resolved from the signed-in user", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await saveProductionAvailability(formDataOf(reply));

    expect(database.upserts()).toHaveLength(1);
    expect(database.upserts()[0]).toMatchObject({
      guardian_id: OUR_GUARDIAN,
      player_id: OUR_CHILD,
      status: "available",
    });
  });

  it("refuses when the signed-in user has no guardian record", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub({ guardian: null }).client);

    await expect(saveProductionAvailability(formDataOf(reply))).rejects.toThrow(
      /no guardian record/i,
    );
  });

  it("refuses when the signed-in user is not a member of this club", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub({ membership: null }).client);

    await expect(saveProductionAvailability(formDataOf(reply))).rejects.toThrow(
      /do not have access/i,
    );
  });

  it("refuses when nobody is signed in", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub({ user: null }).client);

    await expect(saveProductionAvailability(formDataOf(reply))).rejects.toThrow(/sign in/i);
  });

  it("derives an idempotency key from the event and the child", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await saveProductionAvailability(formDataOf(reply));

    const key = database.upserts()[0]!.idempotency_key as string;
    expect(key).toBe(`avail:${INSTANCE}:${OUR_CHILD}`);
    // The column is checked at 8 to 120 characters.
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(120);
  });

  it("produces the same key for a repeated submission", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await saveProductionAvailability(formDataOf(reply));
    await saveProductionAvailability(formDataOf({ ...reply, status: "unsure" }));

    const [first, second] = database.upserts();
    expect(first!.idempotency_key).toBe(second!.idempotency_key);
  });
});

describe("availability attribution static safety", () => {
  const action = readFileSync(join(process.cwd(), "features/availability/actions.ts"), "utf8");
  const resolver = readFileSync(
    join(process.cwd(), "features/people/acting-guardian.ts"),
    "utf8",
  );

  it("no longer mints a random idempotency key", () => {
    // Matched on the import rather than the identifier, because the identifier
    // also appears in the comment explaining why it was removed.
    expect(action).not.toMatch(/from "node:crypto"/);
    expect(action).toMatch(
      /idempotency_key: `avail:\$\{input\.eventInstanceId\}:\$\{input\.playerId\}`/,
    );
  });

  it("resolves the guardian through the shared resolver, not inline", () => {
    expect(action).toMatch(/resolveActingGuardian\(db, input\.organisationId\)/);
    expect(action).toMatch(/assertLinkedToPlayer\(/);
    expect(action).not.toMatch(/from\("guardians"\)/);
  });

  it("never takes a guardian id from the submitted form", () => {
    expect(action).not.toMatch(/formData\.get\("guardianId"\)/);
    expect(action).not.toMatch(/guardianId: z\./);
  });

  it("anchors the resolver to the signed-in user", () => {
    expect(resolver).toMatch(/auth\.getUser\(\)/);
    expect(resolver).toMatch(/\.eq\("user_id", auth\.user\.id\)/);
    expect(resolver).toMatch(/\.eq\("membership_id", membershipId\)/);
  });
});
