import { describe, expect, it } from "vitest";

import { recommendPollOption } from "@/features/polls/recommendation";
import { convertPollToSeries } from "@/features/polls/service";
import type { AuthorisationContext } from "@/features/tenancy/types";

const pollActor: AuthorisationContext = {
  membership: { id: "membership-1", organisationId: "org-1", userId: "coach-1", status: "active" },
  roles: [{ id: "manager", organisationId: "org-1", key: "manager", label: "Manager", capabilities: ["polls:manage"] }],
  assignments: [{ id: "assignment-1", membershipId: "membership-1", organisationId: "org-1", roleId: "manager", scope: { kind: "team", organisationId: "org-1", teamId: "team-1" } }],
};

describe("poll recommendations", () => {
  const options = [
    { id: "early", startsAt: "2026-09-05T09:00:00.000Z", availableRespondents: 8, pitchCapacity: 10 },
    { id: "late", startsAt: "2026-09-05T11:00:00.000Z", availableRespondents: 9, pitchCapacity: 9 },
    { id: "evening", startsAt: "2026-09-05T17:00:00.000Z", availableRespondents: 9, pitchCapacity: 7 },
  ];

  it("recommends the feasible option with the strongest attendance", () => {
    expect(recommendPollOption(options)?.id).toBe("late");
  });

  it("breaks an exact tie using the earliest option", () => {
    expect(recommendPollOption([
      { id: "second", startsAt: "2026-09-05T11:00:00.000Z", availableRespondents: 8, pitchCapacity: 8 },
      { id: "first", startsAt: "2026-09-05T09:00:00.000Z", availableRespondents: 8, pitchCapacity: 8 },
    ])?.id).toBe("first");
  });
});

describe("poll conversion", () => {
  it("creates the event series once and closes the poll", async () => {
    const calls: string[] = [];
    let conversion: { organisationId: string; teamId: string; pollId: string; optionId: string; result: unknown } | null = null;
    const repository = {
      async findConversion() { return conversion; },
      async findPoll() {
        return { id: "poll-1", organisationId: "org-1", teamId: "team-1", status: "open" as const, title: "Autumn training" };
      },
      async findOption() {
        return { id: "option-1", pollId: "poll-1", startsAt: "2026-09-05T09:00:00.000Z", endsAt: "2026-09-05T10:00:00.000Z" };
      },
      async convert(input: { organisationId: string; teamId: string; pollId: string; optionId: string; seriesId: string }) {
        calls.push(input.seriesId);
        conversion = { organisationId: input.organisationId, teamId: input.teamId, pollId: input.pollId, optionId: input.optionId, result: input };
        return input;
      },
    };

    const first = await convertPollToSeries(repository, pollActor, {
      organisationId: "org-1",
      teamId: "team-1",
      pollId: "poll-1",
      optionId: "option-1",
      idempotencyKey: "convert-1",
    });
    const second = await convertPollToSeries(repository, pollActor, {
      organisationId: "org-1",
      teamId: "team-1",
      pollId: "poll-1",
      optionId: "option-1",
      idempotencyKey: "convert-1",
    });

    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
  });

  it("does not reuse a conversion key for a different option", async () => {
    let conversion: { organisationId: string; teamId: string; pollId: string; optionId: string; result: unknown } | null = null;
    const repository = {
      async findConversion() { return conversion; },
      async findPoll() { return { id: "poll-1", organisationId: "org-1", teamId: "team-1", status: "open" as const, title: "Autumn training" }; },
      async findOption(_pollId: string, optionId: string) { return { id: optionId, pollId: "poll-1", startsAt: "2026-09-05T09:00:00.000Z", endsAt: "2026-09-05T10:00:00.000Z" }; },
      async convert(input: { organisationId: string; teamId: string; pollId: string; optionId: string }) {
        conversion = { organisationId: input.organisationId, teamId: input.teamId, pollId: input.pollId, optionId: input.optionId, result: input };
        return input;
      },
    };
    const base = { organisationId: "org-1", teamId: "team-1", pollId: "poll-1", idempotencyKey: "convert-conflict-01" };

    await convertPollToSeries(repository, pollActor, { ...base, optionId: "option-1" });

    await expect(convertPollToSeries(repository, pollActor, { ...base, optionId: "option-2" })).rejects.toThrow("another poll option");
  });
});
