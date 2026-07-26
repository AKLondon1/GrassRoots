import { describe, expect, it } from "vitest";

import { AttendanceQueue } from "@/features/coaching/attendance-queue";
import { buildTrainingPlan } from "@/features/coaching/training-plan";

describe("AC-06 training attendance", () => {
  it("plans a session, takes attendance offline and safely acknowledges sync", () => {
    const plan = buildTrainingPlan({ sessionMinutes: 60, items: [
      { id: "warm-up", kind: "segment", title: "Welcome and warm-up", durationMinutes: 10, order: 1 },
      { id: "passing", kind: "drill", title: "Passing gates", durationMinutes: 20, order: 2 },
      { id: "game", kind: "drill", title: "Small-sided game", durationMinutes: 25, order: 3 },
    ] });
    const queue = new AttendanceQueue();
    queue.enqueue({ organisationId: "org", sessionId: "training", playerId: "jamie", status: "present", occurredAt: "2026-08-02T08:31:00.000Z" });
    queue.enqueue({ organisationId: "org", sessionId: "training", playerId: "rowan", status: "late", occurredAt: "2026-08-02T08:36:00.000Z" });
    expect(plan.plannedMinutes).toBe(55);
    expect(queue.pending()).toHaveLength(2);
    queue.acknowledge(queue.pending()[0]!.idempotencyKey);
    expect(queue.pending()).toHaveLength(1);
  });
});
