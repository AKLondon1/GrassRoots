export interface PositionInterval { playerId: string; position: string; enteredAt: string; leftAt: string }

export function calculatePlayingTime(input: { matchStartedAt: string; matchEndedAt: string; intervals: readonly PositionInterval[] }) {
  const start = Date.parse(input.matchStartedAt);
  const end = Date.parse(input.matchEndedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Match boundaries are invalid.");
  const totals = new Map<string, { totalMs: number; goalkeeperMs: number; positions: Set<string> }>();
  const previousEnd = new Map<string, number>();
  const intervals = [...input.intervals].sort((a, b) => a.playerId.localeCompare(b.playerId) || Date.parse(a.enteredAt) - Date.parse(b.enteredAt));
  for (const interval of intervals) {
    const entered = Math.max(start, Date.parse(interval.enteredAt));
    const left = Math.min(end, Date.parse(interval.leftAt));
    if (!Number.isFinite(entered) || !Number.isFinite(left) || left <= entered) throw new Error("Playing-time intervals must have increasing timestamps.");
    if ((previousEnd.get(interval.playerId) ?? -Infinity) > entered) throw new Error("Playing-time intervals for a player cannot overlap.");
    previousEnd.set(interval.playerId, left);
    const current = totals.get(interval.playerId) ?? { totalMs: 0, goalkeeperMs: 0, positions: new Set<string>() };
    current.totalMs += left - entered;
    if (interval.position === "GK") current.goalkeeperMs += left - entered;
    current.positions.add(interval.position);
    totals.set(interval.playerId, current);
  }
  return [...totals.entries()].map(([playerId, value]) => ({
    playerId,
    totalMinutes: Math.round(value.totalMs / 60_000),
    goalkeeperMinutes: Math.round(value.goalkeeperMs / 60_000),
    positions: [...value.positions],
  })).sort((a, b) => a.playerId.localeCompare(b.playerId));
}

export function fairnessSummary(records: readonly { totalMinutes: number }[]) {
  if (records.length === 0) return { minimumMinutes: 0, maximumMinutes: 0, spreadMinutes: 0 };
  const values = records.map(({ totalMinutes }) => totalMinutes);
  const minimumMinutes = Math.min(...values);
  const maximumMinutes = Math.max(...values);
  return { minimumMinutes, maximumMinutes, spreadMinutes: maximumMinutes - minimumMinutes };
}
