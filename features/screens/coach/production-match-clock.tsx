"use client";

import { useEffect, useMemo, useState } from "react";

import { recoverMatchClock, type MatchClockState } from "@/features/coaching/match-timer";

export function ProductionMatchClock({ state, elapsedBeforeMs, startedAt }: { state: string; elapsedBeforeMs: number; startedAt: string | null }) {
  const clock = useMemo<MatchClockState>(() => state === "running" && startedAt
    ? { status: "running", elapsedBeforeMs, startedAt }
    : state === "completed" ? { status: "ended", elapsedBeforeMs } : state === "paused" ? { status: "paused", elapsedBeforeMs } : { status: "ready", elapsedBeforeMs }, [elapsedBeforeMs, startedAt, state]);
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    if (clock.status !== "running") return;
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 250);
    return () => window.clearInterval(timer);
  }, [clock.status]);
  const recovered = recoverMatchClock(clock, now);
  return <div className="mt-4 rounded-xl border border-border bg-surface-subtle p-4" aria-live="off">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Recovered server clock</p>
    <output className="mt-1 block font-mono text-4xl font-bold tabular-nums text-ink" aria-label={`Match time ${recovered.display}`}>{recovered.display}</output>
    <p className="mt-1 text-xs text-muted">Continues from the persisted server timestamp after refresh.</p>
  </div>;
}
