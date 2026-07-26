import { describe, expect, it } from "vitest";

import { submitAvailability } from "@/features/availability/service";
import type { AuthorisationContext } from "@/features/tenancy/types";
import { DemoRepository } from "@/lib/demo/repository";
import { createRiversideDemoSeed, riversideDemoIds } from "@/lib/demo/seed";

const parentActor: AuthorisationContext = {
  membership: { id: riversideDemoIds.memberships.parent, organisationId: riversideDemoIds.organisation, userId: riversideDemoIds.adults.parent, status: "active" },
  roles: [{ id: "parent-role", organisationId: riversideDemoIds.organisation, key: "guardian", label: "Guardian", capabilities: ["availability:respond"] }],
  assignments: [{ id: "parent-assignment", membershipId: riversideDemoIds.memberships.parent, organisationId: riversideDemoIds.organisation, roleId: "parent-role", scope: { kind: "organisation", organisationId: riversideDemoIds.organisation } }],
};

describe("critical flow 2: parent availability", () => {
  it("updates the manager totals and family response in the transient repository", async () => {
    const repository = new DemoRepository(createRiversideDemoSeed());

    await submitAvailability(repository, parentActor, {
      organisationId: riversideDemoIds.organisation,
      eventId: riversideDemoIds.events.training,
      teamId: riversideDemoIds.teams.under11,
      playerId: riversideDemoIds.players.jamie,
      guardianId: riversideDemoIds.guardians.parent,
      status: "unavailable",
      idempotencyKey: "training-reply-jamie-01",
    }, new Date("2026-07-21T12:00:00.000Z"));

    const state = repository.snapshot(riversideDemoIds.organisation);
    expect(state.availabilityResponses.find(({ eventId }) => eventId === riversideDemoIds.events.training)).toMatchObject({
      playerId: riversideDemoIds.players.jamie,
      status: "unavailable",
    });
    expect(state.availabilityResponses.filter(({ eventId, status }) => eventId === riversideDemoIds.events.training && status === "unavailable")).toHaveLength(1);
  });

  it("cannot use an organisation-scoped parent grant to reply for another household", async () => {
    const repository = new DemoRepository(createRiversideDemoSeed());

    await expect(submitAvailability(repository, parentActor, {
      organisationId: riversideDemoIds.organisation,
      eventId: riversideDemoIds.events.match,
      teamId: riversideDemoIds.teams.under11,
      playerId: riversideDemoIds.players.rowan,
      guardianId: riversideDemoIds.guardians.parent,
      status: "available",
      idempotencyKey: "cross-household-reply-01",
    }, new Date("2026-07-21T12:00:00.000Z"))).rejects.toThrow("linked player");
  });
});
