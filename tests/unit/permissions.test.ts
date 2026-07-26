import { describe, expect, it } from "vitest";

import {
  PermissionDeniedError,
  hasCapability,
  resolveCapabilities,
} from "@/features/tenancy/permissions";
import type {
  OrganisationMembership,
  RoleDefinition,
  ScopedRoleAssignment,
} from "@/features/tenancy/types";

const membership: OrganisationMembership = {
  id: "membership-riverside",
  organisationId: "organisation-riverside",
  userId: "adult-alex",
  status: "active",
};

const roles: readonly RoleDefinition[] = [
  {
    id: "role-club-admin",
    organisationId: "organisation-riverside",
    key: "club-admin",
    label: "Club administrator",
    capabilities: ["club:view", "teams:manage"],
  },
  {
    id: "role-coach",
    organisationId: "organisation-riverside",
    key: "coach",
    label: "Coach",
    capabilities: ["team:view", "events:manage"],
  },
];

describe("scoped tenancy permissions", () => {
  it("inherits an organisation assignment within that organisation", () => {
    const assignments: readonly ScopedRoleAssignment[] = [
      {
        id: "assignment-admin",
        membershipId: membership.id,
        organisationId: membership.organisationId,
        roleId: "role-club-admin",
        scope: {
          kind: "organisation",
          organisationId: membership.organisationId,
        },
      },
    ];

    expect(
      resolveCapabilities({
        assignments,
        membership,
        roles,
        scope: {
          kind: "team",
          organisationId: membership.organisationId,
          teamId: "team-u11",
        },
      }),
    ).toEqual(["club:view", "teams:manage"]);
  });

  it("denies a team assignment for a different team", () => {
    const assignments: readonly ScopedRoleAssignment[] = [
      {
        id: "assignment-coach",
        membershipId: membership.id,
        organisationId: membership.organisationId,
        roleId: "role-coach",
        scope: {
          kind: "team",
          organisationId: membership.organisationId,
          teamId: "team-u11",
        },
      },
    ];

    expect(
      hasCapability(
        { assignments, membership, roles },
        "events:manage",
        {
          kind: "team",
          organisationId: membership.organisationId,
          teamId: "team-u12",
        },
      ),
    ).toBe(false);
  });

  it("denies every assignment across organisation boundaries", () => {
    const assignments: readonly ScopedRoleAssignment[] = [
      {
        id: "assignment-tampered",
        membershipId: membership.id,
        organisationId: "organisation-northfield",
        roleId: "role-club-admin",
        scope: {
          kind: "organisation",
          organisationId: "organisation-northfield",
        },
      },
    ];

    expect(
      hasCapability(
        { assignments, membership, roles },
        "club:view",
        {
          kind: "organisation",
          organisationId: "organisation-northfield",
        },
      ),
    ).toBe(false);
  });

  it("limits a resource assignment to its exact type and id", () => {
    const assignments: readonly ScopedRoleAssignment[] = [
      {
        id: "assignment-pitch",
        membershipId: membership.id,
        organisationId: membership.organisationId,
        roleId: "role-coach",
        scope: {
          kind: "resource",
          organisationId: membership.organisationId,
          resourceId: "pitch-2",
          resourceType: "pitch",
        },
      },
    ];

    expect(
      hasCapability(
        { assignments, membership, roles },
        "events:manage",
        {
          kind: "resource",
          organisationId: membership.organisationId,
          resourceId: "pitch-2",
          resourceType: "pitch",
        },
      ),
    ).toBe(true);
    expect(
      hasCapability(
        { assignments, membership, roles },
        "events:manage",
        {
          kind: "resource",
          organisationId: membership.organisationId,
          resourceId: "pitch-2",
          resourceType: "document",
        },
      ),
    ).toBe(false);
  });

  it("denies inactive memberships", () => {
    expect(
      resolveCapabilities({
        assignments: [],
        membership: { ...membership, status: "suspended" },
        roles,
        scope: {
          kind: "organisation",
          organisationId: membership.organisationId,
        },
      }),
    ).toEqual([]);
  });

  it("throws a non-sensitive denial for a missing capability", () => {
    expect(() =>
      hasCapability(
        { assignments: [], membership, roles },
        "safeguarding:view",
        {
          kind: "organisation",
          organisationId: membership.organisationId,
        },
        { throwOnDenied: true },
      ),
    ).toThrow(PermissionDeniedError);
  });
});
