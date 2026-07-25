export type TrainingPlanItem = {
  id: string;
  kind: "segment" | "drill";
  title: string;
  durationMinutes: number;
  order: number;
};

export function buildTrainingPlan(input: { sessionMinutes: number; items: readonly TrainingPlanItem[] }) {
  if (!Number.isInteger(input.sessionMinutes) || input.sessionMinutes <= 0) {
    throw new Error("Session duration must be a positive whole number of minutes.");
  }
  const orders = new Set<number>();
  const ids = new Set<string>();
  for (const item of input.items) {
    if (!item.id.trim() || ids.has(item.id)) throw new Error("Plan item IDs must be unique.");
    if (!Number.isInteger(item.order) || item.order < 1 || orders.has(item.order)) throw new Error("Each plan item needs a unique order position.");
    if (!Number.isInteger(item.durationMinutes) || item.durationMinutes <= 0) throw new Error("Item durations must be positive whole minutes.");
    ids.add(item.id);
    orders.add(item.order);
  }
  const items = [...input.items].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const plannedMinutes = items.reduce((sum, item) => sum + item.durationMinutes, 0);
  if (plannedMinutes > input.sessionMinutes) throw new Error("The training plan exceeds the session duration.");
  return { items, plannedMinutes, unallocatedMinutes: input.sessionMinutes - plannedMinutes };
}

export function reorderPlanItems(ids: readonly string[], movingId: string, destinationIndex: number): string[] {
  const next = ids.filter((id) => id !== movingId);
  if (!ids.includes(movingId)) throw new Error("The plan item is not present.");
  if (!Number.isInteger(destinationIndex) || destinationIndex < 0 || destinationIndex > next.length) throw new Error("The destination is outside the plan.");
  next.splice(destinationIndex, 0, movingId);
  return next;
}
