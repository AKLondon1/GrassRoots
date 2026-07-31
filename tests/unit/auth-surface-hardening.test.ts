// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  resolveProductionWorkspaceAccess,
  selectActiveMembership,
  type TenancyAccessReader,
} from "@/features/tenancy/service";

/**
 * Phase 14d: the parts of the auth surface that were confirmed by reading rather than by
 * asserting. Each block below answers one 14d question and pins the answer down.
 *
 * The standing rule is that assumptions become assertions before they become code. These
 * were assumptions.
 */

const REPOSITORY_ROOT = join(import.meta.dirname, "..", "..");

/**
 * A reader whose membership lookup can be made to fail, which the fixture in
 * tenancy-service.test.ts cannot: that one hardcodes `status: "active"`, so every test
 * written against it enters the workspace and the refusal path is never taken.
 */
function readerWithMembership(
  membership: {
    id: string;
    organisationId: string;
    userId: string;
    status: "active";
  } | null,
): TenancyAccessReader {
  return {
    async findOrganisation(slug) {
      return { id: "organisation-riverside", slug };
    },
    async findActiveMembership() {
      return membership;
    },
    async listAssignments(_membershipId, organisationId) {
      return [
        {
          organisationId,
          roleId: "role-0",
          scopeKind: "organisation" as const,
          scopeId: organisationId,
          resourceType: null,
        },
      ];
    },
    async listRoles(_organisationId, roleIds) {
      return roleIds.map((id) => ({ id, key: "parent", label: "parent" }));
    },
    async listRolePermissions(_organisationId, roleIds) {
      return roleIds.map((roleId) => ({ roleId, capability: "team:view" as const }));
    },
  };
}

describe("a suspended membership cannot enter a workspace", () => {
  // 14d asks whether the `status = 'active'` check in resolveActingGuardian
  // (features/people/acting-guardian.ts:44) is also true at the session and
  // workspace-resolution layer, or only per-action. It is also true here -- and this is
  // what stops it quietly becoming per-action only.

  it("refuses a membership that is not active", () => {
    expect(
      selectActiveMembership(
        [
          {
            id: "membership-riverside",
            organisationId: "organisation-riverside",
            userId: "adult-alex",
            // Anything other than "active" must not resolve. A suspended parent keeps
            // their row -- the club needs the history -- so absence is not the signal.
            status: "suspended" as unknown as "active",
          },
        ],
        "adult-alex",
        "organisation-riverside",
      ),
    ).toBeUndefined();
  });

  it("denies workspace access when no active membership resolves", async () => {
    const access = await resolveProductionWorkspaceAccess(
      readerWithMembership(null),
      "riverside",
      "adult-alex",
    );

    expect(access.status).toBe("denied");
    if (access.status !== "denied") return;
    // "membership", not "capability": the refusal happens before any capability is read,
    // so a suspended member never reaches a permission check at all.
    expect(access.reason).toBe("membership");
  });

  it("still admits an active membership, so the test above is not passing vacuously", async () => {
    const access = await resolveProductionWorkspaceAccess(
      readerWithMembership({
        id: "membership-riverside",
        organisationId: "organisation-riverside",
        userId: "adult-alex",
        status: "active",
      }),
      "riverside",
      "adult-alex",
    );

    expect(access.status).toBe("allowed");
  });
});

describe("the email sign-in path inherits the callback's PKCE and cookie handling", () => {
  // 14d: two OAuth cookie bugs were fixed in PRs #2 and #3, and the email flow uses the
  // same callback route, so those regressions must be re-tested against it.
  //
  // They already are -- but only by implication, and the implication is invisible.
  // tests/unit/auth-callback-route.test.ts covers cookie propagation and consumed
  // flow-state duplicates under a describe block titled "OAuth callback Route Handler".
  // A reader scanning test names would conclude the email path is untested.
  //
  // Duplicating those five tests with "magic link" in the title would assert nothing new,
  // because there is one route and one implementation. What was genuinely unasserted is
  // the join: that the email path routes INTO that guarded handler rather than around it.
  // If someone gave signInWithOtp its own callback, every PKCE and cookie protection
  // would be silently bypassed and no existing test would notice.

  const actions = readFileSync(
    join(REPOSITORY_ROOT, "app", "(auth)", "sign-in", "actions.ts"),
    "utf8",
  );

  it("sends the magic link to the same /auth/callback the PKCE tests guard", () => {
    expect(actions).toMatch(/\/auth\/callback\?next=/);
    // One callback path in the whole file: the email flow must not introduce a second.
    expect(actions.match(/\/auth\/callback/g)).toHaveLength(1);
  });

  it("builds that callback only from a trusted origin", () => {
    // The redirect base is APP_ORIGIN, and a mismatched request origin throws before the
    // URL is built. Both halves must survive, or the callback becomes attacker-chosen.
    expect(actions).toContain("environment.server.APP_ORIGIN");
    expect(actions).toMatch(/throw new Error\("Untrusted origin"\)/);
  });

  it("normalises the next path rather than passing it through", () => {
    // normaliseInternalPath is the redirect allowlist. An open redirect on a sign-in
    // callback is the classic way these get exploited.
    expect(actions).toMatch(/normaliseInternalPath\(/);
  });

  it("never creates an account from the sign-in form", () => {
    // shouldCreateUser: false is load-bearing twice over. It keeps the form from becoming
    // a way to mint accounts, and it is why an unknown address errors -- which is what the
    // enumeration defence then has to hide.
    expect(actions).toMatch(/shouldCreateUser:\s*false/);
  });
});

describe("sign-in cannot be probed for which addresses have accounts", () => {
  // 14d: the response to "email not registered" must be indistinguishable from "link sent".
  const actions = readFileSync(
    join(REPOSITORY_ROOT, "app", "(auth)", "sign-in", "actions.ts"),
    "utf8",
  );

  it("returns one shared response object rather than two matching literals", () => {
    // Two identical string literals drift apart the first time someone edits one of them.
    // A single constant cannot.
    expect(actions).toMatch(/const SENT_RESPONSE\b/);
    const sentResponseUses = actions.match(/\bSENT_RESPONSE\b/g) ?? [];
    expect(sentResponseUses.length).toBeGreaterThanOrEqual(3);
  });

  it("does not report a send failure to the caller", () => {
    // The error branch must return the same response as success. If this ever becomes a
    // distinguishable message, the form turns into a way of asking whether a named parent
    // at a named club has an account.
    expect(actions).not.toMatch(/return\s*\{\s*status:\s*"error"[^}]*not\s+(found|registered)/i);
  });
});
