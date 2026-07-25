import { describe, expect, it } from "vitest";

import { approveParentSummary, getParentVisibleSummary } from "@/features/coaching/development-summary";

describe("development summary approval", () => {
  it("never exposes private observations before explicit coach approval", () => {
    const review = { id: "review", playerId: "jamie", privateObservation: "Needs confidence in contact", parentSummary: "Jamie showed brave passing choices.", status: "draft" as const };
    expect(getParentVisibleSummary(review)).toBeNull();
    const approved = approveParentSummary(review, { approvedBy: "coach-membership", approvedAt: "2026-08-10T09:00:00.000Z" });
    expect(getParentVisibleSummary(approved)).toEqual({ playerId: "jamie", summary: "Jamie showed brave passing choices.", approvedAt: "2026-08-10T09:00:00.000Z" });
    expect(JSON.stringify(getParentVisibleSummary(approved))).not.toContain("Needs confidence");
  });
});
