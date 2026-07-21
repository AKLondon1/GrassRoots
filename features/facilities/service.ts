import { findBookingConflicts, reservationUnitsConflict, type Booking, type ReservationUnit } from "@/features/facilities/allocation";

export class FacilityConflictError extends Error {
  constructor() {
    super("This facility is already reserved for the requested period.");
    this.name = "FacilityConflictError";
  }
}

export class FacilityService {
  private bookings: Booking[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly organisationId: string, private readonly units: readonly ReservationUnit[]) {}

  private serialise<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  allocate(input: Omit<Booking, "organisationId" | "status">) {
    return this.serialise(() => {
      const candidate: Booking = { ...input, organisationId: this.organisationId, status: "confirmed" };
      if (findBookingConflicts({ candidate, existing: this.bookings, units: this.units }).length) throw new FacilityConflictError();
      this.bookings = [...this.bookings, candidate];
      return structuredClone(candidate);
    });
  }

  closeAndRelocate(input: {
    reservationUnitId: string;
    startsAt: string;
    endsAt: string;
    reason: string;
    replacements: Readonly<Record<string, string | "cancel">>;
  }) {
    return this.serialise(() => {
      if (!input.reason.trim()) throw new Error("A closure reason is required.");
      const affected = this.bookings.filter((booking) =>
        booking.status !== "cancelled" &&
        reservationUnitsConflict(booking.reservationUnitId, input.reservationUnitId, this.units) &&
        new Date(booking.startsAt).getTime() - booking.bufferBeforeMinutes * 60_000 < new Date(input.endsAt).getTime() &&
        new Date(input.startsAt).getTime() < new Date(booking.endsAt).getTime() + booking.bufferAfterMinutes * 60_000,
      );
      const replacements = affected.map((booking) => {
        const target = input.replacements[booking.id];
        if (!target) throw new Error(`Booking ${booking.id} needs a replacement unit.`);
        return target === "cancel" ? { ...booking, status: "cancelled" as const } : { ...booking, reservationUnitId: target };
      });
      const unaffected = this.bookings.filter((booking) => !affected.some(({ id }) => id === booking.id));
      const staged: Booking[] = [...unaffected];
      for (const replacement of replacements) {
        if (replacement.status !== "cancelled" && findBookingConflicts({ candidate: replacement, existing: staged, units: this.units }).length) throw new FacilityConflictError();
        staged.push(replacement);
      }
      this.bookings = staged;
      return {
        closure: { ...input, organisationId: this.organisationId },
        relocated: affected.flatMap((booking) => input.replacements[booking.id] === "cancel" ? [] : [{ bookingId: booking.id, from: booking.reservationUnitId, to: input.replacements[booking.id]! }]),
        cancelled: affected.filter((booking) => input.replacements[booking.id] === "cancel").map(({ id }) => id),
      };
    });
  }

  listBookings() {
    return structuredClone(this.bookings);
  }
}
