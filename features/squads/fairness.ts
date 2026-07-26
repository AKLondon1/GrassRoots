export interface FairnessCandidate {
  readonly playerId: string;
  readonly availability: "available" | "unavailable" | "unsure";
  readonly recentSelections: number;
  readonly recentMinutes: number;
}

export function rankEligiblePlayers(candidates: readonly FairnessCandidate[]) {
  return candidates
    .filter(({ availability }) => availability !== "unavailable")
    .map((candidate) => ({
      ...candidate,
      recommendation: candidate.availability === "available" ? "selected" as const : "standby" as const,
    }))
    .sort((left, right) =>
      (left.availability === right.availability ? 0 : left.availability === "available" ? -1 : 1) ||
      left.recentSelections - right.recentSelections ||
      left.recentMinutes - right.recentMinutes ||
      left.playerId.localeCompare(right.playerId),
    );
}
