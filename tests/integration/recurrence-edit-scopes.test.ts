import { describe, expect, it } from "vitest";

import { editRecurringEvent } from "@/features/events/service";
import type { AuthorisationContext } from "@/features/tenancy/types";
import { DemoRepository } from "@/lib/demo/repository";
import { createRiversideDemoSeed, riversideDemoIds } from "@/lib/demo/seed";

const actor: AuthorisationContext = {
  membership: { id: riversideDemoIds.memberships.coach, organisationId: riversideDemoIds.organisation, userId: riversideDemoIds.adults.coach, status: "active" },
  roles: [{ id: "coach-role", organisationId: riversideDemoIds.organisation, key: "coach", label: "Coach", capabilities: ["events:manage"] }],
  assignments: [{ id: "assignment-1", membershipId: riversideDemoIds.memberships.coach, organisationId: riversideDemoIds.organisation, roleId: "coach-role", scope: { kind: "team", organisationId: riversideDemoIds.organisation, teamId: riversideDemoIds.teams.under11 } }],
};

describe("recurrence edit scope service", () => {
  it.each([
    ["this", "exception"],
    ["this-and-future", "split"],
    ["all", "series-update"],
  ] as const)("persists %s edits and an auditable change summary", async (scope, expectedKind) => {
    const repository = new DemoRepository(createRiversideDemoSeed());

    const result = await editRecurringEvent(repository, actor, {
      organisationId: riversideDemoIds.organisation,
      teamId: riversideDemoIds.teams.under11,
      seriesId: riversideDemoIds.series.training,
      occurrenceStartsAt: "2026-08-02T08:30:00.000Z",
      scope,
      patch: { locationName: "Pitch 3" },
    });

    expect(result).toMatchObject({ kind: expectedKind });
    const state = repository.snapshot(riversideDemoIds.organisation);
    expect(state.events.some((event) => event.locationName === "Pitch 3")).toBe(true);
    expect(state.eventChangeSummaries).toContainEqual(expect.objectContaining({
      seriesId: riversideDemoIds.series.training,
      editScope: scope,
    }));
    if (scope === "this-and-future") {
      expect(state.events.find((event) => event.id === riversideDemoIds.events.training)?.seriesId)
        .not.toBe(riversideDemoIds.series.training);
    }
  });

  it("denies an edit when the series belongs to another team", async () => {
    const repository = {
      async findSeries() { return { id: "series-1", organisationId: riversideDemoIds.organisation, teamId: riversideDemoIds.teams.under7 }; },
      async applyRecurrenceEdit(plan: unknown) { return plan; },
    };

    await expect(editRecurringEvent(repository, actor, {
      organisationId: riversideDemoIds.organisation,
      teamId: riversideDemoIds.teams.under7,
      seriesId: "series-1",
      occurrenceStartsAt: "2026-08-16T08:30:00.000Z",
      scope: "this",
      patch: { locationName: "Pitch 3" },
    })).rejects.toThrow("permission");
  });
});
