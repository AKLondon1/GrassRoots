import { describe, expect, it } from "vitest";

import {
  resolveProductionWorkspaceAccess,
  selectActiveMembership,
  type TenancyAccessReader,
} from "@/features/tenancy/service";

function fakeReader({
  roleKeys,
}: {
  roleKeys: readonly string[];
}): TenancyAccessReader {
  const roles = roleKeys.map((key, index) => ({
    id: `role-${index}`,
    key,
    label: key,
  }));

  return {
    async findOrganisation(slug) {
      return { id: "organisation-riverside", slug };
    },
    async findActiveMembership(userId, organisationId) {
      return {
        id: "membership-riverside",
        organisationId,
        userId,
        status: "active" as const,
      };
    },
    async listAssignments(_membershipId, organisationId) {
      return roles.map((role) => ({
        organisationId,
        roleId: role.id,
        scopeKind: "organisation" as const,
        scopeId: organisationId,
        resourceType: null,
      }));
    },
    async listRoles(_organisationId, roleIds) {
      return roles.filter((role) => roleIds.includes(role.id));
    },
    async listRolePermissions(_organisationId, roleIds) {
      return roleIds.map((roleId) => ({
        roleId,
        capability: "team:view" as const,
      }));
    },
  };
}

describe("tenancy service", () => {
  it("selects only the requested organisation membership for an adult", () => {
    const memberships = [
      {
        id: "membership-riverside",
        organisationId: "organisation-riverside",
        userId: "adult-alex",
        status: "active" as const,
      },
      {
        id: "membership-northfield",
        organisationId: "organisation-northfield",
        userId: "adult-alex",
        status: "active" as const,
      },
    ];

    expect(
      selectActiveMembership(
        memberships,
        "adult-alex",
        "organisation-northfield",
      )?.id,
    ).toBe("membership-northfield");
  });

  it("does not fall back to another organisation", () => {
    expect(
      selectActiveMembership(
        [
          {
            id: "membership-riverside",
            organisationId: "organisation-riverside",
            userId: "adult-alex",
            status: "active",
          },
        ],
        "adult-alex",
        "organisation-northfield",
      ),
    ).toBeUndefined();
  });

  it("returns every held role and honours a valid requested role", async () => {
    const reader = fakeReader({ roleKeys: ["club-admin", "parent"] });
    const access = await resolveProductionWorkspaceAccess(
      reader,
      "riverside",
      "user-1",
      "parent",
    );

    expect(access.status).toBe("allowed");
    if (access.status !== "allowed") return;
    expect(access.roles).toEqual(["club", "parent"]);
    expect(access.role).toBe("parent");
  });

  it("falls back to the highest-priority role when the requested role is not held", async () => {
    const reader = fakeReader({ roleKeys: ["parent"] });
    const access = await resolveProductionWorkspaceAccess(
      reader,
      "riverside",
      "user-1",
      "club",
    );

    expect(access.status).toBe("allowed");
    if (access.status !== "allowed") return;
    expect(access.roles).toEqual(["parent"]);
    expect(access.role).toBe("parent");
  });

  it("orders roles by priority regardless of assignment order", async () => {
    const reader = fakeReader({ roleKeys: ["parent", "coach", "club-admin"] });
    const access = await resolveProductionWorkspaceAccess(
      reader,
      "riverside",
      "user-1",
    );

    expect(access.status).toBe("allowed");
    if (access.status !== "allowed") return;
    expect(access.roles).toEqual(["club", "coach", "parent"]);
    expect(access.role).toBe("club");
  });
});
