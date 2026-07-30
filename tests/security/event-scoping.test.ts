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

import {
  cancelEventInstance,
  createFriendly,
  createTeamEvent,
  rescheduleEventInstance,
} from "@/features/events/production-actions";

const OUR_ORGANISATION = "11111111-1111-4111-8111-111111111111";
const OTHER_ORGANISATION = "22222222-2222-4222-8222-222222222222";
const OUR_TEAM = "33333333-3333-4333-8333-333333333333";

const source = readFileSync(
  join(process.cwd(), "features/events/production-actions.ts"),
  "utf8",
);
const bookingMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/0023_team_scoped_pitch_booking.sql"),
  "utf8",
);

function inertClient() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    single: async () => ({ data: { id: "row" }, error: null }),
    maybeSingle: async () => ({ data: { id: "row" }, error: null }),
    eq: () => chain,
    then: (resolve: (value: { data: null; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: null, error: null })),
  };
  return {
    from: () => ({ insert: () => chain, update: () => chain, select: () => chain }),
    rpc: async () => ({ data: { id: "booking" }, error: null }),
  };
}

function formDataOf(values: Record<string, string>) {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => formData.append(key, value));
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.createClient.mockResolvedValue(inertClient());
  // The workspace "riverside" resolves to OUR_ORGANISATION, whatever the form says.
  tenancy.requireCapability.mockResolvedValue({
    status: "allowed",
    organisationId: OUR_ORGANISATION,
    membershipId: "44444444-4444-4444-8444-444444444444",
    role: "coach",
    roles: ["coach"],
    capabilities: [],
    scopedGrants: [],
  });
});

describe("cross-organisation event scoping", () => {
  it("refuses to create an event for a team in another organisation", async () => {
    await expect(
      createTeamEvent(
        formDataOf({
          organisationId: OTHER_ORGANISATION,
          workspace: "riverside",
          teamId: OUR_TEAM,
          kind: "training",
          title: "Injected session",
          locationName: "Elsewhere",
          startsAt: "2026-08-09T10:00",
          endsAt: "2026-08-09T11:00",
          responseDeadline: "2026-08-08T18:00",
        }),
      ),
    ).rejects.toThrow(/does not belong to this workspace/i);
  });

  it("refuses to cancel an instance under another organisation id", async () => {
    await expect(
      cancelEventInstance(
        formDataOf({
          organisationId: OTHER_ORGANISATION,
          workspace: "riverside",
          teamId: OUR_TEAM,
          eventInstanceId: "55555555-5555-4555-8555-555555555555",
          reason: "Injected cancellation",
        }),
      ),
    ).rejects.toThrow(/does not belong to this workspace/i);
  });

  it("refuses to reschedule an instance under another organisation id", async () => {
    await expect(
      rescheduleEventInstance(
        formDataOf({
          organisationId: OTHER_ORGANISATION,
          workspace: "riverside",
          teamId: OUR_TEAM,
          eventInstanceId: "55555555-5555-4555-8555-555555555555",
          startsAt: "2026-08-09T10:00",
          endsAt: "2026-08-09T11:00",
          locationName: "Elsewhere",
          previousStartsAt: "2026-08-09T09:00",
          previousLocationName: "Pitch 2",
        }),
      ),
    ).rejects.toThrow(/does not belong to this workspace/i);
  });

  it("refuses to arrange a friendly under another organisation id", async () => {
    await expect(
      createFriendly(
        formDataOf({
          organisationId: OTHER_ORGANISATION,
          workspace: "riverside",
          teamId: OUR_TEAM,
          title: "Injected friendly",
          oppositionContactId: "77777777-7777-4777-8777-777777777777",
          locationName: "Elsewhere",
          startsAt: "2026-08-09T10:00",
          endsAt: "2026-08-09T11:00",
          responseDeadline: "2026-08-08T18:00",
        }),
      ),
    ).rejects.toThrow(/does not belong to this workspace/i);
  });
});

/**
 * Static checks, because the mocked tests above only cover the four actions that
 * exist today. These fail when a fifth is added without a capability check, which
 * is the regression that actually happens.
 */
describe("event action static safety", () => {
  it("exports exactly the four actions the tests above cover", () => {
    const exported = [...source.matchAll(/export async function (\w+)/g)].map(
      (match) => match[1],
    );
    expect(exported.sort()).toEqual([
      "cancelEventInstance",
      "createFriendly",
      "createTeamEvent",
      "rescheduleEventInstance",
    ]);
  });

  it("authorises every write at team scope, never organisation scope", () => {
    expect(source).toMatch(/kind: "team",\s*\n?\s*teamId/);
    expect(source).not.toMatch(/requireCapability\([^)]*kind: "organisation"/);
  });

  it("never authorises from the navigation capabilities array", () => {
    expect(source).not.toMatch(/access\.capabilities/);
    expect(source).not.toMatch(/capabilities\.includes/);
  });

  it("trusts the workspace over the submitted organisation id", () => {
    expect(source).toMatch(
      /access\.organisationId !== input\.organisationId[\s\S]{0,160}does not belong to this workspace/,
    );
  });

  it("books pitches through the RPC rather than writing facility_bookings", () => {
    expect(source).toMatch(/rpc\("book_pitch_for_event"/);
    expect(source).not.toMatch(/from\("facility_bookings"\)/);
  });

  it("keeps the booking RPC scoped to the team read from the event instance", () => {
    expect(bookingMigration).toMatch(
      /can_access_team\(\s*requested_organisation_id, linked_instance\.team_id, 'pitches:book'\s*\)/,
    );
    expect(bookingMigration).toMatch(/security definer/i);
    expect(bookingMigration).toMatch(
      /revoke all on function public\.book_pitch_for_event\([^)]*\) from public/i,
    );
  });

  it("leaves facility_bookings without a direct write path", () => {
    expect(bookingMigration).toMatch(/drop policy if exists bookings_book_team_staff/);
    expect(bookingMigration).toMatch(/drop policy if exists bookings_amend_team_staff/);
    expect(bookingMigration).not.toMatch(/grant\s+[^;]*insert[^;]*facility_bookings/i);
  });
});
