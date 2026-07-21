import type { Booking, ReservationUnit } from "@/features/facilities/allocation";

export interface FacilityClosureRecord {
  readonly id: string;
  readonly organisationId: string;
  readonly reservationUnitId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly reason: string;
}

export interface FacilityRepository {
  listReservationUnits(organisationId: string): Promise<readonly ReservationUnit[]>;
  listBookings(organisationId: string, startsAt: string, endsAt: string): Promise<readonly Booking[]>;
  allocateBooking(booking: Booking): Promise<Booking>;
  closeAndRelocate(input: {
    organisationId: string;
    reservationUnitId: string;
    startsAt: string;
    endsAt: string;
    reason: string;
    replacementUnits: Readonly<Record<string, string>>;
  }): Promise<{ closure: FacilityClosureRecord; relocatedBookingIds: readonly string[] }>;
}

