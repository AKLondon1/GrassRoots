import { describe, expect, it, vi } from "vitest";

import {
  resolveProductionWorkspaceAccess,
  type TenancyAccessReader,
} from "@/features/tenancy/service";

function reader(
  overrides: Partial<TenancyAccessReader> = {},
): TenancyAccessReader {
  return {
    findOrganisation: vi.fn().mockResolvedValue({
      id: "organisation-riverside",
      slug: "riverside-juniors",
    }),
    findActiveMembership: vi.fn().mockResolvedValue({
      id: "membership-coach",
      organisationId: "organisation-riverside",
      userId: "adult-coach",
      status: "active",
    }),
    listAssignments: vi.fn().mockResolvedValue([
      {
        roleId: "role-coach",
        scopeKind: "organisation",
        scopeId: "organisation-riverside",
        resourceType: null,
      },
    ]),
    listRoles: vi.fn().mockResolvedValue([
      { id: "role-coach", key: "coach", label: "Coach" },
    ]),
    listRolePermissions: vi.fn().mockResolvedValue([
      { roleId: "role-coach", capability: "team:view" },
      { roleId: "role-coach", capability: "events:view" },
    ]),
    ...overrides,
  };
}

describe("production workspace access", () => {
  it("derives the role from scoped assignments so a forged platform query is irrelevant", async () => {
    const access = await resolveProductionWorkspaceAccess(
      reader(),
      "riverside-juniors",
      "adult-coach",
    );

    expect(access).toEqual({
      status: "allowed",
      organisationId: "organisation-riverside",
      membershipId: "membership-coach",
      role: "coach",
      capabilities: ["team:view", "events:view"],
    });
    expect(access).not.toHaveProperty("role", "platform");
  });

  it("denies a missing or inactive organisation membership", async () => {
    const access = await resolveProductionWorkspaceAccess(
      reader({ findActiveMembership: vi.fn().mockResolvedValue(null) }),
      "riverside-juniors",
      "adult-coach",
    );

    expect(access).toEqual({ status: "denied", reason: "membership" });
  });

  it("denies team-only assignments at the organisation workspace boundary", async () => {
    const access = await resolveProductionWorkspaceAccess(
      reader({
        listAssignments: vi.fn().mockResolvedValue([
          {
            roleId: "role-coach",
            scopeKind: "team",
            scopeId: "team-u11",
            resourceType: null,
          },
        ]),
      }),
      "riverside-juniors",
      "adult-coach",
    );

    expect(access).toEqual({ status: "denied", reason: "capability" });
  });
});
