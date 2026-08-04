import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: supabase.createClient,
}));
vi.mock("@/features/people/team-people-actions", () => ({
  addPlayerToTeam: vi.fn(),
  addGuardianForPlayer: vi.fn(),
  updatePlayer: vi.fn(),
  removePlayerFromTeam: vi.fn(),
}));

import { TeamPeoplePanel } from "@/features/screens/coach/production-team-people";

const ORGANISATION = "11111111-1111-4111-8111-111111111111";
const TEAM_A = "33333333-3333-4333-8333-333333333333";
const TEAM_B = "88888888-8888-4888-8888-888888888888";

interface Filter {
  readonly column: string;
  readonly value: unknown;
}

/**
 * Records the filters each query applied, so a test can assert that
 * `member_kind = 'player'` was actually sent rather than trusting the component.
 */
function createDatabaseStub(rows: Record<string, unknown[]>) {
  const filters: Record<string, Filter[]> = {};

  function builder(table: string) {
    filters[table] ??= [];
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters[table]!.push({ column, value });
        return chain;
      },
      in: () => chain,
      order: () => chain,
      limit: async () => ({ data: rows[table] ?? [], error: null }),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: rows[table] ?? [], error: null })),
    };
    return chain;
  }

  return {
    client: { from: (table: string) => builder(table) },
    filters: (table: string) => filters[table] ?? [],
  };
}

beforeEach(() => vi.clearAllMocks());

describe("TeamPeoplePanel", () => {
  it("offers both forms when the coach has a team with players", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({
        teams: [{ id: TEAM_A, name: "Under 11s" }],
        team_memberships: [
          {
            player_id: "55555555-5555-4555-8555-555555555555",
            team_id: TEAM_A,
            players: { first_name: "Jamie", last_name: "Morgan" },
          },
        ],
      }).client,
    );

    render(await TeamPeoplePanel({ organisationId: ORGANISATION, workspace: "riverside" }));

    expect(screen.getByRole("heading", { name: /add a player/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /add a parent or carer/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Jamie Morgan" })).toBeInTheDocument();
  });

  it("does not ask a single-team coach which team", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({
        teams: [{ id: TEAM_A, name: "Under 11s" }],
        team_memberships: [],
      }).client,
    );

    render(await TeamPeoplePanel({ organisationId: ORGANISATION, workspace: "riverside" }));

    expect(screen.queryByRole("combobox", { name: /team/i })).not.toBeInTheDocument();
  });

  it("asks which team when the caller staffs more than one", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({
        teams: [
          { id: TEAM_A, name: "Under 11s" },
          { id: TEAM_B, name: "Under 13s" },
        ],
        team_memberships: [],
      }).client,
    );

    render(await TeamPeoplePanel({ organisationId: ORGANISATION, workspace: "riverside" }));

    expect(screen.getAllByRole("combobox", { name: /team/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("option", { name: "Under 13s" })).toBeInTheDocument();
  });

  it("explains that a parent needs a child before offering the guardian form", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({
        teams: [{ id: TEAM_A, name: "Under 11s" }],
        team_memberships: [],
      }).client,
    );

    render(await TeamPeoplePanel({ organisationId: ORGANISATION, workspace: "riverside" }));

    expect(screen.getByText(/add a player first/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add parent or carer/i }),
    ).not.toBeInTheDocument();
  });

  it("says so plainly when the club has no teams yet", async () => {
    supabase.createClient.mockResolvedValue(
      createDatabaseStub({ teams: [], team_memberships: [] }).client,
    );

    render(await TeamPeoplePanel({ organisationId: ORGANISATION, workspace: "riverside" }));

    expect(screen.getByText(/no teams yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add player/i })).not.toBeInTheDocument();
  });

  it("counts only players, because team_memberships also holds coaches and volunteers", async () => {
    const database = createDatabaseStub({
      teams: [{ id: TEAM_A, name: "Under 11s" }],
      team_memberships: [],
    });
    supabase.createClient.mockResolvedValue(database.client);

    await TeamPeoplePanel({ organisationId: ORGANISATION, workspace: "riverside" });

    expect(database.filters("team_memberships")).toEqual(
      expect.arrayContaining([
        { column: "member_kind", value: "player" },
        { column: "status", value: "active" },
      ]),
    );
  });
});
