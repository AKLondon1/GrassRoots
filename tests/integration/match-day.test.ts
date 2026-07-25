import { describe, expect, it } from "vitest";

import { approveParentSummary, getParentVisibleSummary } from "@/features/coaching/development-summary";
import { recoverMatchClock, transitionMatchClock } from "@/features/coaching/match-timer";
import { calculatePlayingTime } from "@/features/coaching/playing-time";

describe("AC-07 match day", () => {
  it("recovers the clock, records position intervals and publishes only an approved positive summary", () => {
    const running = transitionMatchClock({ status: "ready", elapsedBeforeMs: 0 }, { type: "start", at: "2026-08-09T09:00:00.000Z" });
    expect(recoverMatchClock(running, "2026-08-09T09:30:00.000Z").display).toBe("30:00");
    const records = calculatePlayingTime({ matchStartedAt: "2026-08-09T09:00:00.000Z", matchEndedAt: "2026-08-09T10:00:00.000Z", intervals: [
      { playerId: "jamie", position: "GK", enteredAt: "2026-08-09T09:00:00.000Z", leftAt: "2026-08-09T09:30:00.000Z" },
      { playerId: "jamie", position: "CM", enteredAt: "2026-08-09T09:30:00.000Z", leftAt: "2026-08-09T10:00:00.000Z" },
    ] });
    expect(records[0]?.totalMinutes).toBe(60);
    const approved = approveParentSummary({ id: "r", playerId: "jamie", privateObservation: "Never shared", parentSummary: "Jamie supported teammates and used both feet.", status: "draft" }, { approvedBy: "coach", approvedAt: "2026-08-10T09:00:00.000Z" });
    expect(getParentVisibleSummary(approved)?.summary).toContain("supported teammates");
    expect(JSON.stringify(getParentVisibleSummary(approved))).not.toContain("Never shared");
  });
});
