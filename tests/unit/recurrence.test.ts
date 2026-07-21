import { describe, expect, it } from "vitest";

import {
  expandWeeklyRecurrence,
  planRecurringEdit,
} from "@/features/events/recurrence";

describe("weekly recurrence", () => {
  it("keeps the same London wall-clock time across the spring DST boundary", () => {
    const occurrences = expandWeeklyRecurrence({
      startsAt: "2027-03-21T09:30:00.000Z",
      durationMinutes: 90,
      intervalWeeks: 1,
      count: 3,
      timeZone: "Europe/London",
    });

    expect(occurrences.map(({ startsAt }) => startsAt)).toEqual([
      "2027-03-21T09:30:00.000Z",
      "2027-03-28T08:30:00.000Z",
      "2027-04-04T08:30:00.000Z",
    ]);
  });

  it("keeps the same London wall-clock time across the autumn DST boundary", () => {
    const occurrences = expandWeeklyRecurrence({
      startsAt: "2026-10-18T08:30:00.000Z",
      durationMinutes: 60,
      intervalWeeks: 1,
      count: 3,
      timeZone: "Europe/London",
    });

    expect(occurrences.map(({ startsAt }) => startsAt)).toEqual([
      "2026-10-18T08:30:00.000Z",
      "2026-10-25T09:30:00.000Z",
      "2026-11-01T09:30:00.000Z",
    ]);
  });
});

describe("recurrence edit scopes", () => {
  const original = {
    seriesId: "series-1",
    occurrenceStartsAt: "2026-09-12T09:00:00.000Z",
    patch: { startsAt: "2026-09-12T10:00:00.000Z" },
  } as const;

  it("plans one occurrence as an exception", () => {
    expect(planRecurringEdit({ ...original, scope: "this" })).toEqual({
      kind: "exception",
      seriesId: "series-1",
      occurrenceStartsAt: original.occurrenceStartsAt,
      patch: original.patch,
    });
  });

  it("plans this and future as an atomic series split", () => {
    expect(planRecurringEdit({ ...original, scope: "this-and-future" })).toEqual({
      kind: "split",
      seriesId: "series-1",
      splitAt: original.occurrenceStartsAt,
      patch: original.patch,
    });
  });

  it("plans all occurrences as a series update", () => {
    const patch = { ...original.patch, title: "Training moved" };
    expect(planRecurringEdit({ ...original, patch, scope: "all" })).toEqual({
      kind: "series-update",
      seriesId: "series-1",
      patch,
    });
  });

  it.each(["this", "this-and-future"] as const)("rejects an unrenderable title override for %s", (scope) => {
    expect(() => planRecurringEdit({
      ...original,
      scope,
      patch: { title: "Training moved" },
    })).toThrow("whole recurring series");
  });
});
