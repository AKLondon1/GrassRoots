import { describe, expect, it } from "vitest";

import { acceptStandbyReplacement } from "@/features/squads/service";
import type { AuthorisationContext } from "@/features/tenancy/types";
import { DemoRepository } from "@/lib/demo/repository";
import { createRiversideDemoSeed, riversideDemoIds } from "@/lib/demo/seed";

const parentActor: AuthorisationContext = {
  membership: { id: riversideDemoIds.memberships.coach, organisationId: riversideDemoIds.organisation, userId: riversideDemoIds.adults.coach, status: "active" },
  roles: [{ id: "guardian-role", organisationId: riversideDemoIds.organisation, key: "guardian", label: "Guardian", capabilities: ["squads:respond"] }],
  assignments: [{ id: "guardian-assignment", membershipId: riversideDemoIds.memberships.coach, organisationId: riversideDemoIds.organisation, roleId: "guardian-role", scope: { kind: "team", organisationId: riversideDemoIds.organisation, teamId: riversideDemoIds.teams.under11 } }],
};

describe("critical flow 5: standby replacement", () => {
  it("accepts the offered place, updates neutral statuses and appends history", async () => {
    const repository = new DemoRepository(createRiversideDemoSeed());
    const replacement = createRiversideDemoSeed().standbyReplacements[0];

    await acceptStandbyReplacement(repository, parentActor, {
      organisationId: replacement.organisationId,
      teamId: replacement.teamId,
      replacementId: replacement.id,
      standbyPlayerId: replacement.standbyPlayerId,
      acceptedAt: "2026-07-21T18:00:00.000Z",
    });

    const state = repository.snapshot(riversideDemoIds.organisation);
    expect(state.squads[0].members.find(({ playerId }) => playerId === riversideDemoIds.players.rowan)?.status).toBe("selected");
    expect(state.standbyReplacements[0].status).toBe("accepted");
    expect(state.squadHistory.at(-1)).toMatchObject({ playerId: riversideDemoIds.players.rowan, reason: "Standby replacement accepted" });
  });
});
