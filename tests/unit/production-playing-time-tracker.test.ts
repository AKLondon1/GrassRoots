import { describe, expect, it } from "vitest";

import { calculateLivePlayingTime } from "@/features/screens/coach/production-playing-time-tracker";

const intervals = [
  { playerId: "starter", position: "CM", enteredAt: "2026-07-21T10:00:00Z", leftAt: "2026-07-21T10:10:00Z" },
  { playerId: "starter", position: "CM", enteredAt: "2026-07-21T10:15:00Z", leftAt: "2026-07-21T10:25:00Z" },
  { playerId: "substitute", position: "ST", enteredAt: "2026-07-21T10:20:00Z", leftAt: "2026-07-21T10:25:00Z" },
];

describe("calculateLivePlayingTime", () => {
  it("counts all resumed periods for a starter", () => {
    expect(calculateLivePlayingTime("starter", intervals, Date.parse("2026-07-21T10:25:00Z"))).toMatchObject({
      playedMs: 1_200_000,
      starterMs: 1_200_000,
    });
  });

  it("does not classify a later substitute as a starter", () => {
    expect(calculateLivePlayingTime("substitute", intervals, Date.parse("2026-07-21T10:25:00Z"))).toMatchObject({
      playedMs: 300_000,
      starterMs: 0,
    });
  });
});
