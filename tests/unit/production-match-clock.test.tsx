import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductionMatchClock } from "@/features/screens/coach/production-match-clock";

describe("production match clock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("recovers the persisted server elapsed time and advances while running", () => {
    vi.setSystemTime(new Date("2026-08-09T09:08:00.000Z"));
    render(<ProductionMatchClock state="running" elapsedBeforeMs={120_000} startedAt="2026-08-09T09:00:00.000Z"/>);
    expect(screen.getByLabelText("Match time 10:00")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByLabelText("Match time 10:01")).toBeInTheDocument();
  });
});
