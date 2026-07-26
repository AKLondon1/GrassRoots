import { describe, expect, it } from "vitest";

import {
  resolveAuthenticatedHome,
  type AuthenticatedHomeReader,
} from "@/features/tenancy/authenticated-home";
import type { ProductionWorkspaceAccess } from "@/features/tenancy/service";

function allowed(
  role: "parent" | "coach" | "club" | "platform",
  capabilities: readonly `${string}:${string}`[],
): ProductionWorkspaceAccess {
  return {
    status: "allowed",
    organisationId: "organisation-riverside",
    membershipId: "membership-adult",
    role,
    capabilities,
    scopedGrants: [],
  };
}

function reader(
  workspaces: readonly string[],
  accessForWorkspace: (workspace: string) => Promise<ProductionWorkspaceAccess>,
): AuthenticatedHomeReader {
  return {
    listCandidateWorkspaces: async () => workspaces,
    resolveWorkspaceAccess: async (workspace) => accessForWorkspace(workspace),
  };
}

describe("authenticated home", () => {
  it("routes an assigned adult to the first active workspace with an allowed screen", async () => {
    await expect(
      resolveAuthenticatedHome(
        reader(["riverside-juniors"], async () =>
          allowed("coach", ["team:view"]),
        ),
        "adult-1",
      ),
    ).resolves.toEqual({
      status: "allowed",
      href: "/app/riverside-juniors/today",
    });
  });

  it("uses the canonical multi-role resolver result instead of the first assigned role", async () => {
    await expect(
      resolveAuthenticatedHome(
        reader(["riverside-juniors"], async () =>
          allowed("club", ["audit:view"]),
        ),
        "adult-multiple-roles",
      ),
    ).resolves.toEqual({
      status: "allowed",
      href: "/app/riverside-juniors/audit",
    });
  });

  it("chooses the first screen the resolved role can actually access when its default is unavailable", async () => {
    await expect(
      resolveAuthenticatedHome(
        reader(["riverside-juniors"], async () =>
          allowed("club", ["events:view"]),
        ),
        "adult-calendar-only",
      ),
    ).resolves.toEqual({
      status: "allowed",
      href: "/app/riverside-juniors/calendar",
    });
  });

  it("considers a valid membership after the twentieth candidate", async () => {
    const workspaces = Array.from({ length: 21 }, (_, index) =>
      `club-${index + 1}`,
    );

    await expect(
      resolveAuthenticatedHome(
        reader(workspaces, async (workspace) =>
          workspace === "club-21"
            ? allowed("coach", ["team:view"])
            : { status: "denied", reason: "capability" },
        ),
        "adult-many-clubs",
      ),
    ).resolves.toEqual({
      status: "allowed",
      href: "/app/club-21/today",
    });
  });

  it("denies an authenticated adult without an active assigned membership", async () => {
    await expect(
      resolveAuthenticatedHome(reader([], async () => ({ status: "denied", reason: "membership" })), "adult-uninvited"),
    ).resolves.toEqual({ status: "invitation-required" });
  });
});
