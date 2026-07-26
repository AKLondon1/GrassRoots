import { describe, expect, it } from "vitest";

import { submitAvailability } from "@/features/availability/service";
import type { AuthorisationContext } from "@/features/tenancy/types";

const organisationId = "org-1";
const teamId = "team-1";
const actor: AuthorisationContext = {
  membership: { id: "membership-1", organisationId, userId: "adult-1", status: "active" },
  roles: [{ id: "parent-role", organisationId, key: "parent", label: "Parent", capabilities: ["availability:respond"] }],
  assignments: [{
    id: "assignment-1",
    membershipId: "membership-1",
    organisationId,
    roleId: "parent-role",
    scope: { kind: "team", organisationId, teamId },
  }],
};

describe("availability submission", () => {
  it("is idempotent for the same response key", async () => {
    let writes = 0;
    const repository = {
      async findEvent() {
        return { id: "event-1", organisationId, teamId, responseDeadline: "2026-09-10T17:00:00.000Z" };
      },
      async findGuardianForPlayer() { return "guardian-1"; },
      async upsertResponse(value: unknown) {
        writes += 1;
        return value;
      },
    };
    const input = {
      organisationId,
      eventId: "event-1",
      teamId,
      playerId: "player-1",
      guardianId: "guardian-1",
      status: "available" as const,
      idempotencyKey: "reply-001",
    };

    const first = await submitAvailability(repository, actor, input, new Date("2026-09-10T12:00:00.000Z"));
    const second = await submitAvailability(repository, actor, input, new Date("2026-09-10T12:01:00.000Z"));

    expect(first).toEqual(second);
    expect(writes).toBe(1);
  });

  it("rejects a response after the deadline", async () => {
    const repository = {
      async findEvent() {
        return { id: "event-1", organisationId, teamId, responseDeadline: "2026-09-10T17:00:00.000Z" };
      },
      async findGuardianForPlayer() { return "guardian-1"; },
      async upsertResponse(value: unknown) { return value; },
    };

    await expect(submitAvailability(repository, actor, {
      organisationId,
      eventId: "event-1",
      teamId,
      playerId: "player-1",
      guardianId: "guardian-1",
      status: "unsure",
      idempotencyKey: "late-001",
    }, new Date("2026-09-10T17:00:01.000Z"))).rejects.toThrow("deadline has passed");
  });

  it("does not replay an idempotency key for different response data", async () => {
    const repository = {
      async findEvent() { return { id: "event-1", organisationId, teamId, responseDeadline: "2026-09-10T17:00:00.000Z" }; },
      async findGuardianForPlayer() { return "guardian-1"; },
      async upsertResponse(value: unknown) { return value; },
    };
    const base = { organisationId, eventId: "event-1", teamId, playerId: "player-1", guardianId: "guardian-1", idempotencyKey: "reply-conflict-01" };

    await submitAvailability(repository, actor, { ...base, status: "available" }, new Date("2026-09-10T12:00:00.000Z"));

    await expect(submitAvailability(repository, actor, { ...base, status: "unavailable" }, new Date("2026-09-10T12:01:00.000Z"))).rejects.toThrow("different availability data");
  });

  it("denies a reply against a different team scope", async () => {
    const repository = {
      async findEvent() {
        return { id: "event-2", organisationId, teamId: "team-2", responseDeadline: "2026-09-10T17:00:00.000Z" };
      },
      async findGuardianForPlayer() { return "guardian-1"; },
      async upsertResponse(value: unknown) { return value; },
    };

    await expect(submitAvailability(repository, actor, {
      organisationId,
      eventId: "event-2",
      teamId: "team-2",
      playerId: "player-1",
      guardianId: "guardian-1",
      status: "unavailable",
      idempotencyKey: "wrong-team",
    }, new Date("2026-09-10T12:00:00.000Z"))).rejects.toThrow("permission");
  });

  it("denies a guardian responding for a player they do not represent", async () => {
    const repository = {
      async findEvent() {
        return { id: "event-1", organisationId, teamId, responseDeadline: "2026-09-10T17:00:00.000Z" };
      },
      async findGuardianForPlayer() { return null; },
      async upsertResponse(value: unknown) { return value; },
    };

    await expect(submitAvailability(repository, actor, {
      organisationId,
      eventId: "event-1",
      teamId,
      playerId: "player-not-linked",
      guardianId: "guardian-1",
      status: "available",
      idempotencyKey: "not-my-player",
    }, new Date("2026-09-10T12:00:00.000Z"))).rejects.toThrow("linked player");
  });

  it("rejects a client-supplied guardian identity that differs from the actor membership", async () => {
    const repository = {
      async findEvent() { return { id: "event-1", organisationId, teamId, responseDeadline: "2026-09-10T17:00:00.000Z" }; },
      async findGuardianForPlayer() { return "guardian-for-membership"; },
      async upsertResponse(value: unknown) { return value; },
    };

    await expect(submitAvailability(repository, actor, {
      organisationId,
      eventId: "event-1",
      teamId,
      playerId: "player-1",
      guardianId: "another-guardian",
      status: "available",
      idempotencyKey: "spoofed-guardian",
    }, new Date("2026-09-10T12:00:00.000Z"))).rejects.toThrow("signed-in membership");
  });
});
