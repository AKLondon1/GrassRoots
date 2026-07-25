import { describe, expect, it } from "vitest";

import { buildTrainingPlan, reorderPlanItems } from "@/features/coaching/training-plan";

describe("training plan", () => {
  it("orders segments and drills deterministically within the session duration", () => {
    const plan = buildTrainingPlan({
      sessionMinutes: 60,
      items: [
        { id: "game", kind: "drill", title: "Small-sided game", durationMinutes: 25, order: 3 },
        { id: "arrival", kind: "segment", title: "Arrival", durationMinutes: 10, order: 1 },
        { id: "skill", kind: "drill", title: "Passing gates", durationMinutes: 20, order: 2 },
      ],
    });
    expect(plan.items.map(({ id }) => id)).toEqual(["arrival", "skill", "game"]);
    expect(plan.plannedMinutes).toBe(55);
    expect(plan.unallocatedMinutes).toBe(5);
  });

  it("rejects plans that overrun or contain duplicate positions", () => {
    expect(() => buildTrainingPlan({ sessionMinutes: 30, items: [
      { id: "a", kind: "drill", title: "A", durationMinutes: 20, order: 1 },
      { id: "b", kind: "drill", title: "B", durationMinutes: 20, order: 1 },
    ] })).toThrow(/order|position/i);
  });

  it("reorders without changing duration", () => {
    const reordered = reorderPlanItems(["arrival", "skill", "game"], "game", 0);
    expect(reordered).toEqual(["game", "arrival", "skill"]);
  });
});
