import { describe, expect, it } from "vitest";

import { convertPollToSeries } from "@/features/polls/service";
import type { AuthorisationContext } from "@/features/tenancy/types";
import { DemoRepository } from "@/lib/demo/repository";
import { createRiversideDemoSeed, riversideDemoIds } from "@/lib/demo/seed";

const coachActor: AuthorisationContext = {
  membership: { id: riversideDemoIds.memberships.coach, organisationId: riversideDemoIds.organisation, userId: riversideDemoIds.adults.coach, status: "active" },
  roles: [{ id: "coach-role", organisationId: riversideDemoIds.organisation, key: "coach", label: "Coach", capabilities: ["polls:manage"] }],
  assignments: [{ id: "coach-assignment", membershipId: riversideDemoIds.memberships.coach, organisationId: riversideDemoIds.organisation, roleId: "coach-role", scope: { kind: "team", organisationId: riversideDemoIds.organisation, teamId: riversideDemoIds.teams.under11 } }],
};

describe("critical flow 3: time poll conversion", () => {
  it("converts the chosen option into the canonical calendar once", async () => {
    const repository = new DemoRepository(createRiversideDemoSeed());
    const option = createRiversideDemoSeed().polls[0].options[1];

    const result = await convertPollToSeries(repository, coachActor, {
      organisationId: riversideDemoIds.organisation,
      teamId: riversideDemoIds.teams.under11,
      pollId: riversideDemoIds.poll,
      optionId: option.id,
      idempotencyKey: "poll-conversion-option-02",
    });

    expect(result).toMatchObject({ pollId: riversideDemoIds.poll, optionId: option.id });
    const state = repository.snapshot(riversideDemoIds.organisation);
    expect(state.polls[0]).toMatchObject({ status: "converted" });
    expect(state.events.some(({ startsAt, title }) => startsAt === option.startsAt && title === "September training time")).toBe(true);
  });
});
