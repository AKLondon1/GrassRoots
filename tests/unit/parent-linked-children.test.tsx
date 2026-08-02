import type { SupabaseClient } from "@supabase/supabase-js";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChildSelector } from "@/features/screens/parent/child-selector";
import { loadLinkedChildren, selectLinkedChild, type LinkedChild } from "@/features/screens/parent/linked-children";

const ORGANISATION = "00000000-0000-4000-8000-000000000101";
const OUR_GUARDIAN = "00000000-0000-4000-8000-000000000401";
const JAMIE = "00000000-0000-4000-8000-000000000601";
const MAYA = "00000000-0000-4000-8000-000000000602";
const ANOTHER_FAMILY_CHILD = "00000000-0000-4000-8000-000000000603";
const UNDER_11S = "00000000-0000-4000-8000-000000000802";
const UNDER_7S = "00000000-0000-4000-8000-000000000801";

type Row = Record<string, unknown>;

/**
 * Records the filters each query applied, so a test can assert that the guardian
 * filter was actually sent rather than merely that the right rows came back. A stub
 * returning the correct answer proves nothing about a query that leans on RLS: the
 * stub has no RLS, so an unfiltered query passes just as happily.
 */
function createDatabaseStub(links: readonly Row[], teams: readonly Row[]) {
  const filtersByTable: Record<string, Row> = {};

  function builder(table: string) {
    const filters: Row = (filtersByTable[table] ??= {});
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return chain;
      },
      in: (column: string, value: unknown) => {
        filters[`${column}__in`] = value;
        return chain;
      },
      maybeSingle: async () => {
        if (table === "memberships") return { data: { id: "membership-1" }, error: null };
        if (table === "guardians") return { data: { id: OUR_GUARDIAN }, error: null };
        return { data: null, error: null };
      },
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        resolve({ data: table === "player_guardians" ? links : teams, error: null }),
    };
    return chain;
  }

  return {
    client: {
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
      from: (table: string) => builder(table),
    } as unknown as SupabaseClient,
    filtersFor: (table: string) => filtersByTable[table] ?? {},
  };
}

const jamieLink = { player_id: JAMIE, players: { first_name: "Jamie", last_name: "Morgan" } };
const mayaLink = { player_id: MAYA, players: { first_name: "Maya", last_name: "Morgan" } };

const jamie: LinkedChild = {
  playerId: JAMIE, firstName: "Jamie", lastName: "Morgan", name: "Jamie Morgan", teamIds: [UNDER_11S],
};
const maya: LinkedChild = {
  playerId: MAYA, firstName: "Maya", lastName: "Morgan", name: "Maya Morgan", teamIds: [UNDER_7S],
};

describe("loadLinkedChildren", () => {
  it("filters on the resolved guardian, not the organisation alone", async () => {
    const stub = createDatabaseStub([jamieLink], [{ player_id: JAMIE, team_id: UNDER_11S }]);

    await loadLinkedChildren(stub.client, ORGANISATION);

    // The whole point of the helper. Without guardian_id a club administrator who is
    // also a parent satisfies the people:manage arm of
    // player_guardians_select_own_or_scoped and loads every child in the club.
    expect(stub.filtersFor("player_guardians")).toMatchObject({
      organisation_id: ORGANISATION,
      guardian_id: OUR_GUARDIAN,
    });
  });

  it("returns each linked child with the teams they actively play for", async () => {
    const stub = createDatabaseStub(
      [jamieLink, mayaLink],
      [
        { player_id: JAMIE, team_id: UNDER_11S },
        { player_id: MAYA, team_id: UNDER_7S },
      ],
    );

    expect(await loadLinkedChildren(stub.client, ORGANISATION)).toEqual([jamie, maya]);
  });

  it("keeps every team when a child plays for more than one", async () => {
    const stub = createDatabaseStub(
      [jamieLink],
      [
        { player_id: JAMIE, team_id: UNDER_11S },
        { player_id: JAMIE, team_id: UNDER_7S },
      ],
    );

    const [child] = await loadLinkedChildren(stub.client, ORGANISATION);

    expect(child.teamIds).toEqual([UNDER_11S, UNDER_7S]);
  });

  it("does not query teams when no child is linked", async () => {
    const stub = createDatabaseStub([], []);

    expect(await loadLinkedChildren(stub.client, ORGANISATION)).toEqual([]);
    expect(stub.filtersFor("team_memberships")).toEqual({});
  });
});

describe("selectLinkedChild", () => {
  const children = [jamie, maya] as const;

  it("defaults to the first child when the URL names none", () => {
    expect(selectLinkedChild(children, undefined)?.playerId).toBe(JAMIE);
  });

  it("honours an explicit child", () => {
    expect(selectLinkedChild(children, MAYA)?.playerId).toBe(MAYA);
  });

  it("falls back to the first child when the URL names one that is not linked", () => {
    // The candidate list was already narrowed to this guardian, so an id belonging to
    // another family is simply absent and is discarded. Nothing is disclosed.
    expect(selectLinkedChild(children, ANOTHER_FAMILY_CHILD)?.playerId).toBe(JAMIE);
  });

  it("resolves to nothing when no child is linked", () => {
    expect(selectLinkedChild([], JAMIE)).toBeNull();
  });
});

describe("ChildSelector", () => {
  it("renders nothing for a single child", () => {
    const { container } = render(
      <ChildSelector
        linkedChildren={[jamie]}
        section="home"
        selectedPlayerId={JAMIE}
        workspace="riverside-juniors"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("marks the child in view and links the others by player id", () => {
    render(
      <ChildSelector
        linkedChildren={[jamie, maya]}
        section="availability"
        selectedPlayerId={MAYA}
        workspace="riverside-juniors"
      />,
    );

    expect(screen.getByRole("link", { name: "Maya" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Jamie" })).toHaveAttribute(
      "href",
      `/app/riverside-juniors/availability?role=parent&child=${JAMIE}`,
    );
  });
});
