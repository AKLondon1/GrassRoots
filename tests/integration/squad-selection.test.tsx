import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: supabase.createClient,
}));
vi.mock("@/features/squads/production-actions", () => ({
  createSquadForInstance: vi.fn(),
  setSquadMembers: vi.fn(),
  publishSquad: vi.fn(),
}));

import { ProductionSquadSelectionScreen } from "@/features/screens/coach/production-squad-selection";

const ORGANISATION = "11111111-1111-4111-8111-111111111111";
const TEAM = "33333333-3333-4333-8333-333333333333";
const INSTANCE = "66666666-6666-4666-8666-666666666666";
const SQUAD = "55555555-5555-4555-8555-555555555555";

interface Filter {
  readonly column: string;
  readonly value: unknown;
}

function createDatabaseStub(rows: Record<string, unknown>) {
  const filters: Record<string, Filter[]> = {};

  function builder(table: string) {
    filters[table] ??= [];
    const value = rows[table];
    const result = { data: value === undefined ? [] : value, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, filterValue: unknown) => {
        filters[table]!.push({ column, value: filterValue });
        return chain;
      },
      in: () => chain,
      order: () => chain,
      limit: async () => result,
      maybeSingle: async () => ({
        data: Array.isArray(value) ? (value[0] ?? null) : (value ?? null),
        error: null,
      }),
      then: (resolve: (given: typeof result) => unknown) => Promise.resolve(resolve(result)),
    };
    return chain;
  }

  return {
    client: { from: (table: string) => builder(table) },
    filters: (table: string) => filters[table] ?? [],
  };
}

const instance = {
  id: INSTANCE,
  team_id: TEAM,
  starts_at: "2999-08-09T09:00:00Z",
  events: { title: "Under 11s v Meadow Park" },
};

function roster(names: readonly string[]) {
  return names.map((name, index) => ({
    player_id: `player-${index}`,
    players: { first_name: name, last_name: "Test" },
  }));
}

beforeEach(() => vi.clearAllMocks());

describe("squad selection", () => {
  it("asks for a fixture when none is given", async () => {
    supabase.createClient.mockResolvedValue(createDatabaseStub({}).client);

    render(
      await ProductionSquadSelectionScreen({
        organisationId: ORGANISATION,
        workspace: "riverside",
      }),
    );

    expect(screen.getByText(/choose a fixture first/i)).toBeInTheDocument();
  });

  it("offers to start picking when no squad exists yet", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({
        event_instances: instance,
        team_memberships: roster(["Jamie"]),
        availability_responses: [],
        squads: null,
      }).client,
    );

    render(
      await ProductionSquadSelectionScreen({
        organisationId: ORGANISATION,
        workspace: "riverside",
        instanceId: INSTANCE,
      }),
    );

    expect(screen.getByRole("button", { name: /start picking/i })).toBeInTheDocument();
  });

  it("sorts the roster into columns by what each family replied", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({
        event_instances: instance,
        team_memberships: roster(["Jamie", "Rowan", "Ari", "Noor"]),
        availability_responses: [
          { player_id: "player-0", status: "available" },
          { player_id: "player-1", status: "unsure" },
          { player_id: "player-2", status: "unavailable" },
        ],
        squads: { id: SQUAD, status: "draft" },
        squad_members: [],
      }).client,
    );

    render(
      await ProductionSquadSelectionScreen({
        organisationId: ORGANISATION,
        workspace: "riverside",
        instanceId: INSTANCE,
      }),
    );

    expect(screen.getByText(/Available · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Unsure · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Unavailable · 1/)).toBeInTheDocument();
    // Noor never replied.
    expect(screen.getByText(/No reply · 1/)).toBeInTheDocument();
  });

  it("does not offer a checkbox for a child who cannot play", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({
        event_instances: instance,
        team_memberships: roster(["Ari"]),
        availability_responses: [{ player_id: "player-0", status: "unavailable" }],
        squads: { id: SQUAD, status: "draft" },
        squad_members: [],
      }).client,
    );

    render(
      await ProductionSquadSelectionScreen({
        organisationId: ORGANISATION,
        workspace: "riverside",
        instanceId: INSTANCE,
      }),
    );

    expect(screen.getByText(/Ari Test · cannot play/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("withholds publishing until at least one child is selected", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({
        event_instances: instance,
        team_memberships: roster(["Jamie"]),
        availability_responses: [{ player_id: "player-0", status: "available" }],
        squads: { id: SQUAD, status: "draft" },
        squad_members: [],
      }).client,
    );

    render(
      await ProductionSquadSelectionScreen({
        organisationId: ORGANISATION,
        workspace: "riverside",
        instanceId: INSTANCE,
      }),
    );

    expect(
      screen.queryByRole("button", { name: /publish squad to families/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/choose at least one player/i)).toBeInTheDocument();
  });

  it("offers publishing once a child is selected, and says what families see", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({
        event_instances: instance,
        team_memberships: roster(["Jamie"]),
        availability_responses: [{ player_id: "player-0", status: "available" }],
        squads: { id: SQUAD, status: "draft" },
        squad_members: [{ player_id: "player-0", status: "selected" }],
      }).client,
    );

    render(
      await ProductionSquadSelectionScreen({
        organisationId: ORGANISATION,
        workspace: "riverside",
        instanceId: INSTANCE,
      }),
    );

    expect(screen.getByRole("button", { name: /publish squad to families/i })).toBeInTheDocument();
    // The safeguarding wording from the demo is preserved.
    expect(screen.getByText(/does not show rankings/i)).toBeInTheDocument();
  });

  it("shows a draft squad as not yet sent", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({
        event_instances: instance,
        team_memberships: roster(["Jamie"]),
        availability_responses: [],
        squads: { id: SQUAD, status: "draft" },
        squad_members: [],
      }).client,
    );

    render(
      await ProductionSquadSelectionScreen({
        organisationId: ORGANISATION,
        workspace: "riverside",
        instanceId: INSTANCE,
      }),
    );

    expect(screen.getByText(/draft, not sent/i)).toBeInTheDocument();
  });

  it("reads only active players, not coaches or volunteers", async () => {
    const database = createDatabaseStub({
      event_instances: instance,
      team_memberships: roster(["Jamie"]),
      availability_responses: [],
      squads: null,
    });
    supabase.createClient.mockResolvedValue(database.client);

    await ProductionSquadSelectionScreen({
      organisationId: ORGANISATION,
      workspace: "riverside",
      instanceId: INSTANCE,
    });

    expect(database.filters("team_memberships")).toEqual(
      expect.arrayContaining([
        { column: "member_kind", value: "player" },
        { column: "status", value: "active" },
        { column: "team_id", value: TEAM },
      ]),
    );
  });

  it("says the team has no players rather than rendering empty columns", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({
        event_instances: instance,
        team_memberships: [],
        availability_responses: [],
        squads: null,
      }).client,
    );

    render(
      await ProductionSquadSelectionScreen({
        organisationId: ORGANISATION,
        workspace: "riverside",
        instanceId: INSTANCE,
      }),
    );

    expect(screen.getByText(/no players in this team yet/i)).toBeInTheDocument();
  });
});
