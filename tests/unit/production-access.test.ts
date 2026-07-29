import { describe, expect, it, vi } from "vitest";

import {
  resolveProductionWorkspaceAccess,
  type TenancyAccessReader,
} from "@/features/tenancy/service";
import { resolveScreenSection } from "@/lib/navigation/screen-registry";

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
        organisationId: "organisation-riverside",
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
      roles: ["coach"],
      capabilities: ["team:view", "events:view"],
      scopedGrants: [
        {
          organisationId: "organisation-riverside",
          scopeKind: "organisation",
          scopeId: "organisation-riverside",
          resourceType: null,
          role: { id: "role-coach", key: "coach", label: "Coach" },
          capabilities: ["team:view", "events:view"],
        },
      ],
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

  it("admits a team-only coach without broadening navigation beyond that role's capabilities", async () => {
    const access = await resolveProductionWorkspaceAccess(
      reader({
        listAssignments: vi.fn().mockResolvedValue([
          {
            organisationId: "organisation-riverside",
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

    expect(access.status).toBe("allowed");
    if (access.status !== "allowed") throw new Error("expected allowed access");
    expect(
      resolveScreenSection({
        capabilities: access.capabilities,
        role: access.role,
        section: "today",
      }),
    ).toMatchObject({ status: "allowed" });
    expect(
      resolveScreenSection({
        capabilities: access.capabilities,
        role: access.role,
        section: "event-editor",
      }),
    ).toMatchObject({ status: "denied" });
    expect(access.scopedGrants).toEqual([
      {
        organisationId: "organisation-riverside",
        scopeKind: "team",
        scopeId: "team-u11",
        resourceType: null,
        role: { id: "role-coach", key: "coach", label: "Coach" },
        capabilities: ["team:view", "events:view"],
      },
    ]);
  });

  it("admits a resource-only facilities role and preserves its exact resource grant", async () => {
    const access = await resolveProductionWorkspaceAccess(
      reader({
        listAssignments: vi.fn().mockResolvedValue([
          {
            organisationId: "organisation-riverside",
            roleId: "role-facilities",
            scopeKind: "resource",
            scopeId: "pitch-two",
            resourceType: "pitch",
          },
        ]),
        listRoles: vi.fn().mockResolvedValue([
          {
            id: "role-facilities",
            key: "facilities-manager",
            label: "Facilities manager",
          },
        ]),
        listRolePermissions: vi.fn().mockResolvedValue([
          { roleId: "role-facilities", capability: "pitches:inspect" },
        ]),
      }),
      "riverside-juniors",
      "adult-coach",
    );

    expect(access.status).toBe("allowed");
    if (access.status !== "allowed") throw new Error("expected allowed access");
    expect(
      resolveScreenSection({
        capabilities: access.capabilities,
        role: access.role,
        section: "inspections",
      }),
    ).toMatchObject({ status: "allowed" });
    expect(
      resolveScreenSection({
        capabilities: access.capabilities,
        role: access.role,
        section: "maintenance",
      }),
    ).toMatchObject({ status: "denied" });
    expect(access.scopedGrants).toEqual([
      {
        organisationId: "organisation-riverside",
        scopeKind: "resource",
        scopeId: "pitch-two",
        resourceType: "pitch",
        role: {
          id: "role-facilities",
          key: "facilities-manager",
          label: "Facilities manager",
        },
        capabilities: ["pitches:inspect"],
      },
    ]);
    expect(Object.isFrozen(access.scopedGrants)).toBe(true);
    expect(Object.isFrozen(access.scopedGrants[0])).toBe(true);
    expect(Object.isFrozen(access.scopedGrants[0].role)).toBe(true);
    expect(Object.isFrozen(access.scopedGrants[0].capabilities)).toBe(true);
  });

  it("excludes cross-organisation assignments and unassigned role capabilities", async () => {
    const access = await resolveProductionWorkspaceAccess(
      reader({
        listAssignments: vi.fn().mockResolvedValue([
          {
            organisationId: "organisation-riverside",
            roleId: "role-coach",
            scopeKind: "team",
            scopeId: "team-u11",
            resourceType: null,
          },
          {
            organisationId: "organisation-northfield",
            roleId: "role-owner",
            scopeKind: "organisation",
            scopeId: "organisation-northfield",
            resourceType: null,
          },
        ]),
        listRoles: vi.fn().mockResolvedValue([
          { id: "role-coach", key: "coach", label: "Coach" },
          { id: "role-owner", key: "owner", label: "Owner" },
        ]),
        listRolePermissions: vi.fn().mockResolvedValue([
          { roleId: "role-coach", capability: "team:view" },
          { roleId: "role-owner", capability: "club:manage" },
        ]),
      }),
      "riverside-juniors",
      "adult-coach",
    );

    expect(access.status).toBe("allowed");
    if (access.status !== "allowed") throw new Error("expected allowed access");
    expect(access.role).toBe("coach");
    expect(access.capabilities).toEqual(["team:view"]);
    expect(access.scopedGrants).toHaveLength(1);
    expect(access.scopedGrants[0]).toMatchObject({
      organisationId: "organisation-riverside",
      scopeKind: "team",
      scopeId: "team-u11",
    });
  });

  it("does not reinterpret one same-organisation persona's capability as another persona's grant", async () => {
    const access = await resolveProductionWorkspaceAccess(
      reader({
        listAssignments: vi.fn().mockResolvedValue([
          {
            organisationId: "organisation-riverside",
            roleId: "role-coach",
            scopeKind: "team",
            scopeId: "team-u11",
            resourceType: null,
          },
          {
            organisationId: "organisation-riverside",
            roleId: "role-auditor",
            scopeKind: "organisation",
            scopeId: "organisation-riverside",
            resourceType: null,
          },
        ]),
        listRoles: vi.fn().mockResolvedValue([
          { id: "role-coach", key: "coach", label: "Coach" },
          { id: "role-auditor", key: "auditor", label: "Auditor" },
        ]),
        listRolePermissions: vi.fn().mockResolvedValue([
          { roleId: "role-coach", capability: "events:view" },
          { roleId: "role-auditor", capability: "audit:view" },
        ]),
      }),
      "riverside-juniors",
      "adult-coach",
    );

    expect(access.status).toBe("allowed");
    if (access.status !== "allowed") throw new Error("expected allowed access");
    expect(access.role).toBe("club");
    expect(access.capabilities).toEqual(["audit:view"]);
    expect(access.scopedGrants).toHaveLength(2);
    expect(
      resolveScreenSection({
        capabilities: access.capabilities,
        role: access.role,
        section: "audit",
      }),
    ).toMatchObject({ status: "allowed" });
    expect(
      resolveScreenSection({
        capabilities: access.capabilities,
        role: access.role,
        section: "calendar",
      }),
    ).toMatchObject({ status: "denied" });
  });
});
