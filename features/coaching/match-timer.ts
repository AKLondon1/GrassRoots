export type MatchClockState =
  | { status: "ready"; elapsedBeforeMs: number; startedAt?: never }
  | { status: "running"; elapsedBeforeMs: number; startedAt: string }
  | { status: "paused" | "ended"; elapsedBeforeMs: number; startedAt?: never; pausedAt?: string; endedAt?: string };

export type MatchClockAction = { type: "start" | "resume" | "pause" | "end" | "reset"; at: string };

function elapsedAt(state: MatchClockState, now: string): number {
  if (state.status !== "running") return state.elapsedBeforeMs;
  const delta = Date.parse(now) - Date.parse(state.startedAt);
  if (!Number.isFinite(delta) || delta < 0) throw new Error("Match clock timestamps are invalid.");
  return state.elapsedBeforeMs + delta;
}

function formatElapsed(elapsedMs: number): string {
  const seconds = Math.floor(elapsedMs / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function recoverMatchClock(state: MatchClockState, now: string) {
  const elapsedMs = elapsedAt(state, now);
  return { status: state.status, elapsedMs, display: formatElapsed(elapsedMs) };
}

export function transitionMatchClock(state: MatchClockState, action: MatchClockAction): MatchClockState {
  if (Number.isNaN(Date.parse(action.at))) throw new Error("A valid transition timestamp is required.");
  if (action.type === "reset") return { status: "ready", elapsedBeforeMs: 0 };
  if (action.type === "start" && state.status === "ready") return { status: "running", elapsedBeforeMs: state.elapsedBeforeMs, startedAt: action.at };
  if (action.type === "resume" && state.status === "paused") return { status: "running", elapsedBeforeMs: state.elapsedBeforeMs, startedAt: action.at };
  if (action.type === "pause" && state.status === "running") return { status: "paused", elapsedBeforeMs: elapsedAt(state, action.at), pausedAt: action.at };
  if (action.type === "end" && (state.status === "running" || state.status === "paused")) return { status: "ended", elapsedBeforeMs: elapsedAt(state, action.at), endedAt: action.at };
  throw new Error(`Cannot ${action.type} a ${state.status} match clock.`);
}
