export type EventKind = "training" | "match" | "meeting" | "social";
export type RecurrenceEditScope = "this" | "this-and-future" | "all";

export interface CanonicalEvent {
  readonly id: string;
  readonly organisationId: string;
  readonly teamId: string;
  readonly seriesId: string | null;
  readonly kind: EventKind;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
  readonly locationName: string | null;
  readonly responseDeadline: string | null;
  readonly status: "scheduled" | "cancelled" | "completed";
}

export interface EventChangeSummary {
  readonly field: "title" | "startsAt" | "endsAt" | "locationName" | "status";
  readonly previousValue: string | null;
  readonly nextValue: string | null;
}

export interface EventPatch {
  readonly title?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly locationName?: string | null;
  readonly status?: CanonicalEvent["status"];
}
