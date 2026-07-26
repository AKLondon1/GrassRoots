import { describe, expect, it } from "vitest";

import { validateFormation } from "@/features/coaching/formation";
import { calculatePlayingTime, fairnessSummary } from "@/features/coaching/playing-time";

describe("formation and playing time", () => {
  it("requires one goalkeeper, valid positions and unique players", () => {
    expect(validateFormation({ format: 7, slots: [
      { playerId: "p1", position: "GK" }, { playerId: "p2", position: "LB" },
      { playerId: "p3", position: "CB" }, { playerId: "p4", position: "RB" },
      { playerId: "p5", position: "CM" }, { playerId: "p6", position: "LW" },
      { playerId: "p7", position: "ST" },
    ] }).valid).toBe(true);
    expect(validateFormation({ format: 2, slots: [
      { playerId: "p1", position: "GK" }, { playerId: "p1", position: "ST" },
    ] }).errors).toContain("Each player can occupy only one position.");
  });

  it("derives minutes from substitution and position intervals", () => {
    const minutes = calculatePlayingTime({
      matchStartedAt: "2026-08-09T09:00:00.000Z",
      matchEndedAt: "2026-08-09T10:00:00.000Z",
      intervals: [
        { playerId: "jamie", position: "GK", enteredAt: "2026-08-09T09:00:00.000Z", leftAt: "2026-08-09T09:30:00.000Z" },
        { playerId: "jamie", position: "CM", enteredAt: "2026-08-09T09:30:00.000Z", leftAt: "2026-08-09T10:00:00.000Z" },
        { playerId: "rowan", position: "ST", enteredAt: "2026-08-09T09:15:00.000Z", leftAt: "2026-08-09T10:00:00.000Z" },
      ],
    });
    expect(minutes.find(({ playerId }) => playerId === "jamie")).toMatchObject({ totalMinutes: 60, goalkeeperMinutes: 30 });
    expect(fairnessSummary(minutes).spreadMinutes).toBe(15);
  });

  it("rejects overlapping intervals for the same player", () => {
    expect(() => calculatePlayingTime({ matchStartedAt: "2026-08-09T09:00:00.000Z", matchEndedAt: "2026-08-09T10:00:00.000Z", intervals: [
      { playerId: "jamie", position: "GK", enteredAt: "2026-08-09T09:00:00.000Z", leftAt: "2026-08-09T09:35:00.000Z" },
      { playerId: "jamie", position: "CM", enteredAt: "2026-08-09T09:30:00.000Z", leftAt: "2026-08-09T10:00:00.000Z" },
    ] })).toThrow(/overlap/i);
  });
});
