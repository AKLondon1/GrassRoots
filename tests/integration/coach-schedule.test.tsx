import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: supabase.createClient,
}));
vi.mock("@/features/events/production-actions", () => ({
  createTeamEvent: vi.fn(),
  createFriendly: vi.fn(),
  cancelEventInstance: vi.fn(),
  rescheduleEventInstance: vi.fn(),
}));

import { ProductionCoachScheduleScreen } from "@/features/screens/coach/production-schedule";

const ORGANISATION = "11111111-1111-4111-8111-111111111111";
const TEAM = "33333333-3333-4333-8333-333333333333";
const INSTANCE = "55555555-5555-4555-8555-555555555555";

interface Filter {
  readonly column: string;
  readonly value: unknown;
}

/**
 * Answers each table from a lookup and records the filters applied, so a test can
 * assert `member_kind = 'player'` was actually sent.
 *
 * Every terminal is thenable and also offers `.limit()`, because the screen ends
 * some chains on `limit` and awaits others directly.
 */
function createDatabaseStub(rows: Record<string, unknown[]>) {
  const filters: Record<string, Filter[]> = {};

  function builder(table: string) {
    filters[table] ??= [];
    const result = { data: rows[table] ?? [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters[table]!.push({ column, value });
        return chain;
      },
      in: () => chain,
      gte: () => chain,
      neq: () => chain,
      order: () => chain,
      limit: async () => result,
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
    };
    return chain;
  }

  return {
    client: { from: (table: string) => builder(table) },
    filters: (table: string) => filters[table] ?? [],
  };
}

/** One upcoming fixture, `squadSize` players on its team, `replies` of them answered. */
function schedule({
  squadSize = 0,
  replies = 0,
  teams = [{ id: TEAM, name: "Under 11s" }] as unknown[],
  deadline = "2999-01-01T18:00:00Z",
  units = [] as unknown[],
  opposition = [] as unknown[],
}) {
  return createDatabaseStub({
    teams,
    event_instances: [
      {
        id: INSTANCE,
        team_id: TEAM,
        starts_at: "2999-08-09T09:00:00Z",
        ends_at: "2999-08-09T10:30:00Z",
        response_deadline: deadline,
        location_name: "Main pitch",
        status: "scheduled",
        events: { title: "Under 11s v Meadow Park", kind: "match" },
        teams: { name: "Under 11s" },
      },
    ],
    availability_responses: Array.from({ length: replies }, (_unused, index) => ({
      event_instance_id: INSTANCE,
      player_id: `player-${index}`,
    })),
    team_memberships: Array.from({ length: squadSize }, (_unused, index) => ({
      team_id: TEAM,
      player_id: `player-${index}`,
    })),
    reservation_units: units,
    opposition_contacts: opposition,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("coach schedule", () => {
  it("shows how many replies are still outstanding", async () => {
    supabase.createClient.mockResolvedValue(schedule({ squadSize: 5, replies: 2 }).client);

    render(
      await ProductionCoachScheduleScreen({
        organisationId: ORGANISATION,
        section: "today",
        workspace: "riverside",
      }),
    );

    expect(screen.getByText(/3 of 5 replies outstanding/i)).toBeInTheDocument();
  });

  it("says so when every family has replied", async () => {
    supabase.createClient.mockResolvedValue(schedule({ squadSize: 2, replies: 2 }).client);

    render(
      await ProductionCoachScheduleScreen({
        organisationId: ORGANISATION,
        section: "today",
        workspace: "riverside",
      }),
    );

    expect(screen.getByText(/all replies in/i)).toBeInTheDocument();
  });

  it("flags a deadline that has already passed", async () => {
    supabase.createClient.mockResolvedValue(
      schedule({ squadSize: 5, replies: 1, deadline: "2020-01-01T18:00:00Z" }).client,
    );

    render(
      await ProductionCoachScheduleScreen({
        organisationId: ORGANISATION,
        section: "today",
        workspace: "riverside",
      }),
    );

    expect(screen.getByText(/deadline passed/i)).toBeInTheDocument();
  });

  it("counts only players, not coaches and volunteers", async () => {
    const database = schedule({ squadSize: 1 });
    supabase.createClient.mockResolvedValue(database.client);

    await ProductionCoachScheduleScreen({
      organisationId: ORGANISATION,
      section: "today",
      workspace: "riverside",
    });

    expect(database.filters("team_memberships")).toEqual(
      expect.arrayContaining([
        { column: "member_kind", value: "player" },
        { column: "status", value: "active" },
      ]),
    );
  });

  it("offers every team the coach can manage in the create form", async () => {
    supabase.createClient.mockResolvedValue(
      schedule({
        teams: [
          { id: TEAM, name: "Under 11s" },
          { id: "team-b", name: "Under 13s" },
        ],
      }).client,
    );

    render(
      await ProductionCoachScheduleScreen({
        organisationId: ORGANISATION,
        section: "event-editor",
        workspace: "riverside",
      }),
    );

    expect(screen.getAllByRole("option", { name: "Under 11s" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("option", { name: "Under 13s" }).length).toBeGreaterThan(0);
  });

  it("requires a reason before an event can be cancelled", async () => {
    supabase.createClient.mockResolvedValue(schedule({}).client);

    render(
      await ProductionCoachScheduleScreen({
        organisationId: ORGANISATION,
        section: "event-editor",
        workspace: "riverside",
      }),
    );

    expect(screen.getByLabelText(/reason for cancelling/i)).toBeRequired();
  });

  it("carries the previous time and location so a change can be described", async () => {
    supabase.createClient.mockResolvedValue(schedule({}).client);

    const { container } = render(
      await ProductionCoachScheduleScreen({
        organisationId: ORGANISATION,
        section: "event-editor",
        workspace: "riverside",
      }),
    );

    expect(container.querySelector('input[name="previousStartsAt"]')).toHaveValue(
      "2999-08-09T10:00",
    );
    expect(container.querySelector('input[name="previousLocationName"]')).toHaveValue(
      "Main pitch",
    );
  });

  it("hides the friendly form until the club has an opposition contact", async () => {
    supabase.createClient.mockResolvedValue(schedule({}).client);

    render(
      await ProductionCoachScheduleScreen({
        organisationId: ORGANISATION,
        section: "event-editor",
        workspace: "riverside",
      }),
    );

    expect(
      screen.getByText(/add the opposing club to the club address book first/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /arrange the friendly/i }),
    ).not.toBeInTheDocument();
  });

  it("offers pitches once the club has opposition and units", async () => {
    supabase.createClient.mockResolvedValue(
      schedule({
        opposition: [{ id: "opp-1", club_name: "Meadow Park", display_name: "Drew Patel" }],
        units: [{ id: "unit-1", name: "Main pitch", facilities: { name: "Riverside" } }],
      }).client,
    );

    render(
      await ProductionCoachScheduleScreen({
        organisationId: ORGANISATION,
        section: "event-editor",
        workspace: "riverside",
      }),
    );

    expect(screen.getByRole("button", { name: /arrange the friendly/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Riverside · Main pitch" })).toBeInTheDocument();
    // Booking a pitch stays optional, because an away fixture has none to book.
    expect(screen.getByRole("option", { name: /do not book a pitch/i })).toBeInTheDocument();
  });

  it("says nothing is scheduled rather than rendering an empty card", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({ teams: [], event_instances: [] }).client,
    );

    render(
      await ProductionCoachScheduleScreen({
        organisationId: ORGANISATION,
        section: "today",
        workspace: "riverside",
      }),
    );

    expect(screen.getByText(/nothing scheduled/i)).toBeInTheDocument();
  });

  it("groups the calendar by day", async () => {
    supabase.createClient.mockResolvedValue(schedule({ squadSize: 3, replies: 1 }).client);

    render(
      await ProductionCoachScheduleScreen({
        organisationId: ORGANISATION,
        section: "calendar",
        workspace: "riverside",
      }),
    );

    expect(screen.getByRole("heading", { name: /9 Aug/i })).toBeInTheDocument();
  });
});
