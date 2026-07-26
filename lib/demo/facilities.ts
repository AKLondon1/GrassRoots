import type { Booking, ReservationUnit } from "@/features/facilities/allocation";

export const riversideFacilityDemo = Object.freeze({
  units: [
    { id: "demo-main-pitch", name: "Main pitch", capacity: 22, parentId: null, exclusiveWith: [], accessible: true, floodlit: false },
    { id: "demo-main-half-a", name: "Main pitch · half A", capacity: 12, parentId: "demo-main-pitch", exclusiveWith: [], accessible: true, floodlit: false },
    { id: "demo-main-half-b", name: "Main pitch · half B", capacity: 12, parentId: "demo-main-pitch", exclusiveWith: [], accessible: true, floodlit: false },
    { id: "demo-pitch-2", name: "Pitch 2", capacity: 18, parentId: null, exclusiveWith: ["demo-training-area"], accessible: true, floodlit: true },
    { id: "demo-training-area", name: "Training area", capacity: 10, parentId: null, exclusiveWith: ["demo-pitch-2"], accessible: false, floodlit: true },
  ] satisfies readonly ReservationUnit[],
  bookings: [
    {
      id: "demo-booking-under-11",
      organisationId: "00000000-0000-4000-8000-000000000101",
      reservationUnitId: "demo-main-pitch",
      startsAt: "2026-08-09T09:00:00.000Z",
      endsAt: "2026-08-09T10:30:00.000Z",
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 20,
      status: "confirmed",
    },
  ] satisfies readonly Booking[],
  documents: [
    { id: "demo-document-pitch-policy", title: "Pitch allocation policy", version: 3, requiredCapability: "documents:manage" },
  ],
  equipment: [
    { id: "demo-kit-under-11", name: "Under 11 match kit", quantity: 18, status: "reserved" },
  ],
});
