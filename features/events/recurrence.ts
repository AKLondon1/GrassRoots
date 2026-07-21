import { recurrenceEditSchema } from "@/features/events/schema";
import { addLocalDays, localPartsToUtc, partsInTimeZone } from "@/features/events/time-zone";
import type { EventPatch, RecurrenceEditScope } from "@/features/events/types";

export interface WeeklyRecurrenceInput {
  readonly startsAt: string;
  readonly durationMinutes: number;
  readonly intervalWeeks: number;
  readonly count: number;
  readonly timeZone: string;
}

export function expandWeeklyRecurrence(input: WeeklyRecurrenceInput) {
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 104) {
    throw new Error("Recurrence count must be between 1 and 104.");
  }
  if (!Number.isInteger(input.intervalWeeks) || input.intervalWeeks < 1) {
    throw new Error("Recurrence interval must be at least one week.");
  }
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.valueOf())) throw new Error("A valid recurrence start is required.");
  const localStart = partsInTimeZone(start, input.timeZone);

  return Array.from({ length: input.count }, (_, index) => {
    const startsAt = localPartsToUtc(
      addLocalDays(localStart, index * input.intervalWeeks * 7),
      input.timeZone,
    );
    const endsAt = new Date(startsAt.valueOf() + input.durationMinutes * 60_000);
    return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
  });
}

interface RecurrenceEditInput {
  readonly seriesId: string;
  readonly occurrenceStartsAt: string;
  readonly scope: RecurrenceEditScope;
  readonly patch: EventPatch;
}

export function planRecurringEdit(input: RecurrenceEditInput) {
  const parsed = recurrenceEditSchema.parse(input);
  if (parsed.scope !== "all" && parsed.patch.title !== undefined) {
    throw new Error("Title changes apply to the whole recurring series.");
  }
  if (parsed.scope === "this") {
    return { kind: "exception" as const, seriesId: parsed.seriesId, occurrenceStartsAt: parsed.occurrenceStartsAt, patch: parsed.patch };
  }
  if (parsed.scope === "this-and-future") {
    return { kind: "split" as const, seriesId: parsed.seriesId, splitAt: parsed.occurrenceStartsAt, patch: parsed.patch };
  }
  return { kind: "series-update" as const, seriesId: parsed.seriesId, patch: parsed.patch };
}
