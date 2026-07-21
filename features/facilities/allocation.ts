export interface ReservationUnit {
  readonly id: string;
  readonly name: string;
  readonly capacity: number;
  readonly parentId: string | null;
  readonly exclusiveWith: readonly string[];
  readonly accessible?: boolean;
  readonly floodlit?: boolean;
}

export interface Booking {
  readonly id: string;
  readonly organisationId: string;
  readonly reservationUnitId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  readonly status: "provisional" | "confirmed" | "cancelled";
}

export interface BookingConflict {
  readonly booking: Booking;
  readonly reason: string;
}

function interval(booking: Booking) {
  return {
    start: new Date(booking.startsAt).getTime() - booking.bufferBeforeMinutes * 60_000,
    end: new Date(booking.endsAt).getTime() + booking.bufferAfterMinutes * 60_000,
  };
}

function overlaps(left: Booking, right: Booking) {
  const a = interval(left);
  const b = interval(right);
  return a.start < b.end && b.start < a.end;
}

function ancestorIds(id: string, byId: Map<string, ReservationUnit>) {
  const ids = new Set<string>();
  let cursor = byId.get(id);
  while (cursor?.parentId) {
    if (ids.has(cursor.parentId)) throw new Error("The reservation-unit hierarchy contains a cycle.");
    ids.add(cursor.parentId);
    cursor = byId.get(cursor.parentId);
  }
  return ids;
}

export function reservationUnitsConflict(leftId: string, rightId: string, units: readonly ReservationUnit[]) {
  if (leftId === rightId) return true;
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const left = byId.get(leftId);
  const right = byId.get(rightId);
  if (!left || !right) throw new Error("A reservation unit is not registered.");
  if (ancestorIds(leftId, byId).has(rightId) || ancestorIds(rightId, byId).has(leftId)) return true;
  return left.exclusiveWith.includes(rightId) || right.exclusiveWith.includes(leftId);
}

export function findBookingConflicts(input: {
  candidate: Booking;
  existing: readonly Booking[];
  units: readonly ReservationUnit[];
}): BookingConflict[] {
  return input.existing.flatMap((booking) => {
    if (booking.status === "cancelled" || booking.id === input.candidate.id) return [];
    if (!reservationUnitsConflict(booking.reservationUnitId, input.candidate.reservationUnitId, input.units)) return [];
    if (!overlaps(booking, input.candidate)) return [];
    const usesBuffer =
      new Date(booking.endsAt).getTime() <= new Date(input.candidate.startsAt).getTime() ||
      new Date(input.candidate.endsAt).getTime() <= new Date(booking.startsAt).getTime();
    return [{ booking, reason: usesBuffer ? "The setup or turnaround buffer overlaps." : "The reservation times overlap." }];
  });
}

export interface AlternativeSlot {
  readonly reservationUnitId: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface RankedAlternative extends AlternativeSlot {
  readonly score: number;
  readonly explanation: string;
}

export function rankAllocationAlternatives(input: {
  requestedStartsAt: string;
  requestedEndsAt: string;
  requestedBufferBeforeMinutes?: number;
  requestedBufferAfterMinutes?: number;
  requiredCapacity: number;
  requiresAccessible: boolean;
  units: readonly ReservationUnit[];
  existing: readonly Booking[];
  slots: readonly AlternativeSlot[];
}): RankedAlternative[] {
  const requested = new Date(input.requestedStartsAt).getTime();
  const byId = new Map(input.units.map((unit) => [unit.id, unit]));
  return input.slots.flatMap((slot) => {
    const unit = byId.get(slot.reservationUnitId);
    if (!unit || unit.capacity < input.requiredCapacity || (input.requiresAccessible && !unit.accessible)) return [];
    const candidate: Booking = {
      id: `candidate:${slot.reservationUnitId}:${slot.startsAt}`,
      organisationId: "candidate",
      ...slot,
      bufferBeforeMinutes: input.requestedBufferBeforeMinutes ?? 0,
      bufferAfterMinutes: input.requestedBufferAfterMinutes ?? 0,
      status: "provisional",
    };
    if (findBookingConflicts({ candidate, existing: input.existing, units: input.units }).length) return [];
    const minutes = Math.abs(new Date(slot.startsAt).getTime() - requested) / 60_000;
    return [{ ...slot, score: 10_000 - minutes * 10 + Math.min(unit.capacity - input.requiredCapacity, 10), explanation: minutes === 0 ? "Matches the requested time." : `${minutes} minutes from the requested start.` }];
  }).sort((a, b) => b.score - a.score || a.reservationUnitId.localeCompare(b.reservationUnitId));
}
