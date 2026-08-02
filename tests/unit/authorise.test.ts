import { describe, expect, it } from "vitest";

import { capabilityScopes, grantsCapability } from "@/features/tenancy/authorise";
import type { ProductionWorkspaceAccess } from "@/features/tenancy/service";

type Allowed = Extract<ProductionWorkspaceAccess, { status: "allowed" }>;

const ORGANISATION = "organisation-riverside";
const TEAM = "team-under-11s";
const OTHER_TEAM = "team-under-7s";

function access(
  grants: Allowed["scopedGrants"],
  capabilities: readonly `${string}:${string}`[] = [],
): Allowed {
  return {
    status: "allowed",
    organisationId: ORGANISATION,
    membershipId: "membership-1",
    role: "coach",
    roles: ["coach"],
    capabilities,
    scopedGrants: grants,
  };
}

function grant(
  scopeKind: "organisation" | "team",
  scopeId: string,
  capabilities: readonly `${string}:${string}`[],
  organisationId = ORGANISATION,
) {
  return {
    organisationId,
    scopeKind,
    scopeId,
    resourceType: null,
    role: { id: "role-1", key: "coach", label: "Coach" },
    capabilities,
  } as Allowed["scopedGrants"][number];
}

describe("grantsCapability", () => {
  it("accepts an organisation-scoped grant for an organisation-scoped need", () => {
    const subject = access([
      grant("organisation", ORGANISATION, ["teams:manage"]),
    ]);

    expect(
      grantsCapability(subject, "teams:manage", { kind: "organisation" }),
    ).toBe(true);
  });

  it("refuses a team-scoped grant for an organisation-scoped need", () => {
    // This is what stops a manager creating teams: they hold their capabilities
    // against one team, and creating a team is a club-wide act.
    const subject = access([grant("team", TEAM, ["teams:manage"])]);

    expect(
      grantsCapability(subject, "teams:manage", { kind: "organisation" }),
    ).toBe(false);
  });

  it("accepts an organisation-scoped grant for a team-scoped need", () => {
    const subject = access([
      grant("organisation", ORGANISATION, ["people:manage"]),
    ]);

    expect(
      grantsCapability(subject, "people:manage", { kind: "team", teamId: TEAM }),
    ).toBe(true);
  });

  it("accepts a team-scoped grant only for that team", () => {
    const subject = access([grant("team", TEAM, ["people:manage"])]);

    expect(
      grantsCapability(subject, "people:manage", { kind: "team", teamId: TEAM }),
    ).toBe(true);
    expect(
      grantsCapability(subject, "people:manage", {
        kind: "team",
        teamId: OTHER_TEAM,
      }),
    ).toBe(false);
  });

  it("refuses a capability the member does not hold", () => {
    const subject = access([grant("organisation", ORGANISATION, ["team:view"])]);

    expect(
      grantsCapability(subject, "people:manage", { kind: "organisation" }),
    ).toBe(false);
  });

  it("ignores grants belonging to another organisation", () => {
    const subject = access([
      grant(
        "organisation",
        "organisation-other",
        ["teams:manage"],
        "organisation-other",
      ),
    ]);

    expect(
      grantsCapability(subject, "teams:manage", { kind: "organisation" }),
    ).toBe(false);
  });

  it("does not authorise from the navigation capabilities array", () => {
    // capabilities is narrowed to the active role and drives menus. If a write were
    // authorised from it, a member's permissions would change when they switched
    // role in the header.
    const subject = access([], ["teams:manage"]);

    expect(
      grantsCapability(subject, "teams:manage", { kind: "organisation" }),
    ).toBe(false);
  });
});

/**
 * `grantsCapability` answers "may they?" for a write already decided on.
 * `capabilityScopes` answers "what may they be offered?", which is the question a
 * form has to ask before it renders. Getting the second wrong opens no hole — the
 * action and RLS both still refuse — but it offers a control the database will
 * reject, which is the defect migration 0026 fixed on the friendly form.
 */
describe("capabilityScopes", () => {
  it("reports the teams a team-scoped member holds the capability over", () => {
    const subject = access([
      grant("team", TEAM, ["announcements:manage"]),
      grant("team", OTHER_TEAM, ["events:manage"]),
    ]);

    expect(capabilityScopes(subject, "announcements:manage")).toEqual({
      organisation: false,
      teamIds: [TEAM],
    });
  });

  it("reports club-wide authority separately rather than expanding it into teams", () => {
    // An organisation-scoped grant covers every team, including ones created after
    // this call. Expanding it into a list would go stale the moment a team is added.
    const subject = access([grant("organisation", ORGANISATION, ["announcements:manage"])]);

    expect(capabilityScopes(subject, "announcements:manage")).toEqual({
      organisation: true,
      teamIds: [],
    });
  });

  it("reports nothing for a capability the member does not hold", () => {
    const subject = access([grant("team", TEAM, ["events:manage"])]);

    expect(capabilityScopes(subject, "announcements:manage")).toEqual({
      organisation: false,
      teamIds: [],
    });
  });

  it("ignores a grant belonging to another organisation", () => {
    const subject = access([
      grant("team", TEAM, ["announcements:manage"], "organisation-other"),
    ]);

    expect(capabilityScopes(subject, "announcements:manage")).toEqual({
      organisation: false,
      teamIds: [],
    });
  });

  it("lists a team once when two roles grant the same capability over it", () => {
    // A member can be both manager and coach of the same team, and the composer must
    // not render the team twice in its select.
    const subject = access([
      grant("team", TEAM, ["announcements:manage"]),
      grant("team", TEAM, ["announcements:manage"]),
    ]);

    expect(capabilityScopes(subject, "announcements:manage").teamIds).toEqual([TEAM]);
  });
});
