import { describe, expect, it } from "vitest";

import { rankEligiblePlayers } from "@/features/squads/fairness";
import { acceptStandbyReplacement } from "@/features/squads/service";
import type { AuthorisationContext } from "@/features/tenancy/types";

const squadActor: AuthorisationContext = {
  membership: { id: "membership-1", organisationId: "org-1", userId: "guardian-1", status: "active" },
  roles: [{ id: "parent", organisationId: "org-1", key: "parent", label: "Parent", capabilities: ["squads:respond"] }],
  assignments: [{ id: "assignment-1", membershipId: "membership-1", organisationId: "org-1", roleId: "parent", scope: { kind: "team", organisationId: "org-1", teamId: "team-1" } }],
};

describe("squad fairness", () => {
  it("ranks available players with fewer recent selections first", () => {
    const ranked = rankEligiblePlayers([
      { playerId: "regular", availability: "available", recentSelections: 5, recentMinutes: 210 },
      { playerId: "rotation", availability: "available", recentSelections: 2, recentMinutes: 120 },
      { playerId: "unsure", availability: "unsure", recentSelections: 0, recentMinutes: 0 },
      { playerId: "away", availability: "unavailable", recentSelections: 0, recentMinutes: 0 },
    ]);

    expect(ranked.map(({ playerId, recommendation }) => ({ playerId, recommendation }))).toEqual([
      { playerId: "rotation", recommendation: "selected" },
      { playerId: "regular", recommendation: "selected" },
      { playerId: "unsure", recommendation: "standby" },
    ]);
  });

  it("moves an accepting standby player into a withdrawn place and records history", async () => {
    const repository = {
      async findReplacement() {
        return { id: "replacement-1", organisationId: "org-1", teamId: "team-1", squadId: "squad-1", withdrawnPlayerId: "player-a", standbyPlayerId: "player-b", status: "offered" as const, expiresAt: "2026-09-05T18:00:00.000Z" };
      },
      async canMembershipRespondForPlayer() { return true; },
      async acceptReplacement(value: unknown) { return value; },
    };

    const result = await acceptStandbyReplacement(repository, squadActor, {
      organisationId: "org-1",
      teamId: "team-1",
      replacementId: "replacement-1",
      standbyPlayerId: "player-b",
      acceptedAt: "2026-09-04T18:00:00.000Z",
    });

    expect(result).toMatchObject({ status: "accepted", selectedPlayerId: "player-b", withdrawnPlayerId: "player-a" });
  });

  it("denies a standby response from a membership not linked to that player", async () => {
    const repository = {
      async findReplacement() {
        return { id: "replacement-1", organisationId: "org-1", teamId: "team-1", squadId: "squad-1", withdrawnPlayerId: "player-a", standbyPlayerId: "player-b", status: "offered" as const, expiresAt: "2026-09-05T18:00:00.000Z" };
      },
      async canMembershipRespondForPlayer() { return false; },
      async acceptReplacement(value: unknown) { return value; },
    };

    await expect(acceptStandbyReplacement(repository, squadActor, {
      organisationId: "org-1",
      teamId: "team-1",
      replacementId: "replacement-1",
      standbyPlayerId: "player-b",
      acceptedAt: "2026-09-04T18:00:00.000Z",
    })).rejects.toThrow("linked guardian");
  });

  it("rejects acceptance after the standby offer expires", async () => {
    const repository = {
      async findReplacement() { return { id: "replacement-1", organisationId: "org-1", teamId: "team-1", squadId: "squad-1", withdrawnPlayerId: "player-a", standbyPlayerId: "player-b", status: "offered" as const, expiresAt: "2026-09-04T17:59:59.000Z" }; },
      async canMembershipRespondForPlayer() { return true; },
      async acceptReplacement(value: unknown) { return value; },
    };

    await expect(acceptStandbyReplacement(repository, squadActor, {
      organisationId: "org-1",
      teamId: "team-1",
      replacementId: "replacement-1",
      standbyPlayerId: "player-b",
      acceptedAt: "2026-09-04T18:00:00.000Z",
    })).rejects.toThrow("expired");
  });
});
