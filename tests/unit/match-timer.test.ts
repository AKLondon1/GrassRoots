import { describe, expect, it } from "vitest";

import { recoverMatchClock, transitionMatchClock } from "@/features/coaching/match-timer";

describe("timestamp-derived match clock", () => {
  it("recovers elapsed time after a refresh without relying on a browser interval", () => {
    const clock = recoverMatchClock({ status: "running", startedAt: "2026-08-09T09:00:00.000Z", elapsedBeforeMs: 120_000 }, "2026-08-09T09:08:00.000Z");
    expect(clock.elapsedMs).toBe(600_000);
    expect(clock.display).toBe("10:00");
  });

  it("keeps paused time stable and resumes from an audited timestamp", () => {
    const paused = transitionMatchClock({ status: "running", startedAt: "2026-08-09T09:00:00.000Z", elapsedBeforeMs: 0 }, { type: "pause", at: "2026-08-09T09:12:30.000Z" });
    expect(recoverMatchClock(paused, "2026-08-09T09:20:00.000Z").display).toBe("12:30");
    const resumed = transitionMatchClock(paused, { type: "resume", at: "2026-08-09T09:20:00.000Z" });
    expect(recoverMatchClock(resumed, "2026-08-09T09:22:30.000Z").display).toBe("15:00");
  });
});
