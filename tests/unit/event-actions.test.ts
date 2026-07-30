// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));
const tenancy = vi.hoisted(() => ({ requireCapability: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: supabase.createClient,
}));
// `requireCapability` is replaced; `grantsCapability` is not. rescheduleEventInstance
// consults the real one to decide whether to announce the change, and the fake access
// below carries no grants, so the notice is skipped and these assertions stay about
// the change record rather than the announcement.
vi.mock("@/features/tenancy/authorise", async () => {
  const actual = await vi.importActual<typeof import("@/features/tenancy/authorise")>(
    "@/features/tenancy/authorise",
  );
  return { ...actual, requireCapability: tenancy.requireCapability };
});
vi.mock("next/cache", () => ({ revalidatePath: cache.revalidatePath }));

import {
  cancelEventInstance,
  createFriendly,
  createTeamEvent,
  rescheduleEventInstance,
} from "@/features/events/production-actions";

const ORGANISATION = "11111111-1111-4111-8111-111111111111";
const OTHER_ORGANISATION = "22222222-2222-4222-8222-222222222222";
const TEAM = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP = "44444444-4444-4444-8444-444444444444";
const INSTANCE = "55555555-5555-4555-8555-555555555555";
const UNIT = "66666666-6666-4666-8666-666666666666";
const OPPOSITION = "77777777-7777-4777-8777-777777777777";

type Row = Record<string, unknown>;

interface Recorded {
  readonly table: string;
  readonly operation: "insert" | "update" | "select" | "delete";
  readonly rows: readonly Row[];
}

interface RecordedRpc {
  readonly name: string;
  readonly args: Row;
}

/**
 * A minimal stand-in for the Supabase query builder.
 *
 * Each terminal is thenable as well as offering `.single()`, so both
 * `await db.from(t).update(r).eq(...)` and `await db.from(t).insert(r).select().single()`
 * resolve without the test having to know which shape the action chose.
 */
function createDatabaseStub(
  options: {
    readonly failOn?: string;
    readonly rpcError?: { readonly code: string; readonly message: string } | null;
  } = {},
) {
  const calls: Recorded[] = [];
  const rpcCalls: RecordedRpc[] = [];

  function terminal(table: string, operation: Recorded["operation"], rows: readonly Row[]) {
    calls.push({ table, operation, rows });
    const result =
      options.failOn === table
        ? { data: null, error: { code: "42501", message: `denied on ${table}` } }
        : { data: { id: `${table}-id` }, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      single: async () => result,
      maybeSingle: async () => result,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
    };
    return chain;
  }

  const client = {
    from(table: string) {
      return {
        insert: (rows: Row | Row[]) =>
          terminal(table, "insert", Array.isArray(rows) ? rows : [rows]),
        update: (row: Row) => terminal(table, "update", [row]),
        delete: () => terminal(table, "delete", []),
        select: () => terminal(table, "select", []),
      };
    },
    async rpc(name: string, args: Row) {
      rpcCalls.push({ name, args });
      return {
        data: options.rpcError ? null : { id: "booking-id" },
        error: options.rpcError ?? null,
      };
    },
  };

  return {
    client,
    insertedTables: () =>
      calls.filter((call) => call.operation === "insert").map((call) => call.table),
    row: (table: string, index = 0) =>
      (calls.filter((call) => call.table === table).flatMap((call) => call.rows)[index] ??
        {}) as Row,
    rpcNames: () => rpcCalls.map((call) => call.name),
    rpc: (name: string) => rpcCalls.find((call) => call.name === name)?.args ?? {},
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
    membershipId: MEMBERSHIP,
    role: "coach",
    roles: ["coach"],
    capabilities: [],
    scopedGrants: [],
  });
}

/**
 * The same coach, now holding `announcements:manage` over the team as the standard
 * role model grants it (0020_role_model.sql:46). The real `grantsCapability` reads
 * this list, so the branch under test is the shipped one.
 */
function announcementsGrantedOverTeam(organisationId = ORGANISATION) {
  tenancy.requireCapability.mockResolvedValue({
    status: "allowed",
    organisationId,
    membershipId: MEMBERSHIP,
    role: "coach",
    roles: ["coach"],
    capabilities: [],
    scopedGrants: [
      {
        organisationId,
        scopeKind: "team",
        scopeId: TEAM,
        resourceType: null,
        role: "coach",
        capabilities: ["announcements:manage"],
      },
    ],
  });
}

const validEvent = {
  organisationId: ORGANISATION,
  workspace: "riverside",
  teamId: TEAM,
  kind: "training",
  title: "Under 11s training",
  locationName: "Riverside Pitch 2",
  startsAt: "2026-08-09T09:00",
  endsAt: "2026-08-09T10:30",
  responseDeadline: "2026-08-08T18:00",
};

beforeEach(() => {
  vi.clearAllMocks();
  allowAccess();
});

describe("createTeamEvent", () => {
  it("rejects an event whose end is not after its start", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);
    await expect(
      createTeamEvent(formDataOf({ ...validEvent, endsAt: "2026-08-09T09:00" })),
    ).rejects.toThrow(/end time must be after/i);
  });

  it("rejects a response deadline that is not before the event starts", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);
    await expect(
      createTeamEvent(formDataOf({ ...validEvent, responseDeadline: "2026-08-09T09:00" })),
    ).rejects.toThrow(/deadline must be before/i);
  });

  it("creates a series so two teams can start at the same time", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await createTeamEvent(formDataOf(validEvent));

    expect(database.insertedTables()).toEqual(["events", "event_series", "event_instances"]);
    expect(database.row("event_instances").series_id).toEqual(expect.any(String));
  });

  it("requires events:manage scoped to the team, never the organisation", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);

    await createTeamEvent(formDataOf(validEvent));

    expect(tenancy.requireCapability).toHaveBeenCalledWith("riverside", "events:manage", {
      kind: "team",
      teamId: TEAM,
    });
  });

  it("attributes the event to the membership resolved from the workspace", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await createTeamEvent(formDataOf(validEvent));

    expect(database.row("events").created_by_membership_id).toBe(MEMBERSHIP);
  });

  it("refuses a form claiming an organisation the workspace does not resolve to", async () => {
    allowAccess(OTHER_ORGANISATION);
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);

    await expect(createTeamEvent(formDataOf(validEvent))).rejects.toThrow(
      /does not belong to this workspace/i,
    );
  });

  it("propagates a refusal from the capability check", async () => {
    tenancy.requireCapability.mockRejectedValue(
      new Error("You do not have permission to do that."),
    );
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);

    await expect(createTeamEvent(formDataOf(validEvent))).rejects.toThrow(/permission/i);
  });
});

describe("cancelEventInstance", () => {
  const validCancel = {
    organisationId: ORGANISATION,
    workspace: "riverside",
    teamId: TEAM,
    eventInstanceId: INSTANCE,
    reason: "Waterlogged pitch",
  };

  it("rejects a cancellation with no reason, because the database rejects it too", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);
    await expect(cancelEventInstance(formDataOf({ ...validCancel, reason: "" }))).rejects.toThrow();
  });

  it("sets the status and the reason together", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await cancelEventInstance(formDataOf(validCancel));

    expect(database.row("event_instances")).toMatchObject({
      status: "cancelled",
      cancelled_reason: "Waterlogged pitch",
    });
  });

  it("records the cancellation as a change summary array", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await cancelEventInstance(formDataOf(validCancel));

    const summary = database.row("event_change_summaries").summary;
    expect(Array.isArray(summary)).toBe(true);
    expect(summary).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "status", to: "cancelled" })]),
    );
  });
});

describe("rescheduleEventInstance", () => {
  const validReschedule = {
    organisationId: ORGANISATION,
    workspace: "riverside",
    teamId: TEAM,
    eventInstanceId: INSTANCE,
    startsAt: "2026-08-09T10:00",
    endsAt: "2026-08-09T11:30",
    locationName: "Main pitch",
    previousStartsAt: "2026-08-09T09:00",
    previousLocationName: "Pitch 2",
  };

  it("records only the fields that actually changed", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await rescheduleEventInstance(formDataOf(validReschedule));

    const summary = database.row("event_change_summaries").summary as Row[];
    expect(summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "location", from: "Pitch 2", to: "Main pitch" }),
        expect.objectContaining({ field: "startsAt" }),
      ]),
    );
  });

  it("writes no change summary when nothing moved", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await rescheduleEventInstance(
      formDataOf({
        ...validReschedule,
        startsAt: "2026-08-09T09:00",
        previousStartsAt: "2026-08-09T09:00",
        locationName: "Pitch 2",
        previousLocationName: "Pitch 2",
      }),
    );

    expect(database.insertedTables()).not.toContain("event_change_summaries");
  });

  it("does not announce a change to a team the author cannot publish to", async () => {
    // The default access carries no grants at all. events:manage and
    // announcements:manage are separate permissions, and the event has already moved
    // by the time the notice is attempted, so a club holding them apart must get the
    // reschedule and the change record without an error.
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await rescheduleEventInstance(formDataOf(validReschedule));

    expect(database.rpcNames()).not.toContain("publish_announcement");
    expect(database.insertedTables()).toContain("event_change_summaries");
  });

  it("announces the change to the event's own team when the author may publish", async () => {
    announcementsGrantedOverTeam();
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await rescheduleEventInstance(formDataOf(validReschedule));

    const call = database.rpc("publish_announcement");
    // Team-scoped, never club-wide. A null here would fan the notice out to every
    // adult in the club through enqueue_published_announcement_deliveries.
    expect(call.requested_team_id).toBe(TEAM);
    expect(String(call.requested_body)).toContain("Pitch 2");
    expect(String(call.requested_body)).toContain("Main pitch");
  });

  it("sends no notice when nothing moved", async () => {
    announcementsGrantedOverTeam();
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await rescheduleEventInstance(
      formDataOf({
        ...validReschedule,
        startsAt: "2026-08-09T09:00",
        previousStartsAt: "2026-08-09T09:00",
        locationName: "Pitch 2",
        previousLocationName: "Pitch 2",
      }),
    );

    expect(database.rpcNames()).not.toContain("publish_announcement");
  });
});

describe("createFriendly", () => {
  const validFriendly = {
    organisationId: ORGANISATION,
    workspace: "riverside",
    teamId: TEAM,
    title: "Under 11s v Meadow Park",
    oppositionContactId: OPPOSITION,
    reservationUnitId: UNIT,
    locationName: "Riverside Sports Ground",
    startsAt: "2026-08-09T09:30",
    endsAt: "2026-08-09T10:30",
    responseDeadline: "2026-08-07T18:00",
    bufferBefore: "15",
    bufferAfter: "20",
  };

  it("creates the fixture before booking, because the booking derives its team from it", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await createFriendly(formDataOf(validFriendly));

    expect(database.insertedTables()).toEqual(["events", "event_series", "event_instances"]);
    expect(database.rpcNames()).toEqual(["book_pitch_for_event"]);
  });

  it("books the pitch through the RPC, never a direct insert", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await createFriendly(formDataOf(validFriendly));

    expect(database.insertedTables()).not.toContain("facility_bookings");
    expect(database.rpc("book_pitch_for_event")).toMatchObject({
      requested_organisation_id: ORGANISATION,
      requested_unit_id: UNIT,
      requested_buffer_before: 15,
      requested_buffer_after: 20,
    });
  });

  it("requires pitches:book at team scope as well as events:manage", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub().client);

    await createFriendly(formDataOf(validFriendly));

    expect(tenancy.requireCapability).toHaveBeenCalledWith("riverside", "pitches:book", {
      kind: "team",
      teamId: TEAM,
    });
  });

  it("explains a pitch clash in words a manager can act on", async () => {
    const database = createDatabaseStub({
      rpcError: { code: "23P01", message: "facility booking conflict" },
    });
    supabase.createClient.mockResolvedValue(database.client);

    await expect(createFriendly(formDataOf(validFriendly))).rejects.toThrow(
      /already booked[\s\S]*fixture was created/i,
    );
  });

  it("records the opposition so the fixture is not anonymous", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    await createFriendly(formDataOf(validFriendly));

    expect(database.row("events").opposition_contact_id).toBe(OPPOSITION);
  });

  it("books no pitch when none is chosen, leaving the fixture to be allocated later", async () => {
    const database = createDatabaseStub();
    supabase.createClient.mockResolvedValue(database.client);

    const withoutPitch = { ...validFriendly };
    delete (withoutPitch as Partial<typeof validFriendly>).reservationUnitId;
    await createFriendly(formDataOf(withoutPitch));

    expect(database.insertedTables()).toEqual(["events", "event_series", "event_instances"]);
    expect(database.rpcNames()).toEqual([]);
  });
});
