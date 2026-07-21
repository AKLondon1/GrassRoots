import { describe, expect, it } from "vitest";

import {
  findBookingConflicts,
  rankAllocationAlternatives,
  type Booking,
  type ReservationUnit,
} from "@/features/facilities/allocation";

const units: ReservationUnit[] = [
  { id: "whole", name: "Main pitch", capacity: 22, parentId: null, exclusiveWith: [] },
  { id: "half-a", name: "Main pitch · half A", capacity: 12, parentId: "whole", exclusiveWith: [] },
  { id: "half-b", name: "Main pitch · half B", capacity: 12, parentId: "whole", exclusiveWith: [] },
  { id: "pitch-2", name: "Pitch 2", capacity: 18, parentId: null, exclusiveWith: ["training-area"] },
  { id: "training-area", name: "Training area", capacity: 10, parentId: null, exclusiveWith: ["pitch-2"] },
];

const existing: Booking = {
  id: "booking-1",
  organisationId: "org-1",
  reservationUnitId: "half-a",
  startsAt: "2026-08-08T09:00:00.000Z",
  endsAt: "2026-08-08T10:00:00.000Z",
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 20,
  status: "confirmed",
};

describe("facility allocation", () => {
  it("treats a whole pitch and its subdivisions as mutually exclusive", () => {
    const conflicts = findBookingConflicts({
      candidate: { ...existing, id: "new", reservationUnitId: "whole" },
      existing: [existing],
      units,
    });
    expect(conflicts.map(({ booking }) => booking.id)).toEqual(["booking-1"]);
  });

  it("applies setup and turnaround buffers to overlap checks", () => {
    const conflicts = findBookingConflicts({
      candidate: {
        ...existing,
        id: "new",
        reservationUnitId: "half-a",
        startsAt: "2026-08-08T10:10:00.000Z",
        endsAt: "2026-08-08T11:00:00.000Z",
        bufferBeforeMinutes: 5,
        bufferAfterMinutes: 0,
      },
      existing: [existing],
      units,
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.reason).toMatch(/buffer/i);
  });

  it("ranks a conflict-free accessible alternative ahead of a distant option", () => {
    const ranked = rankAllocationAlternatives({
      requestedStartsAt: "2026-08-08T09:00:00.000Z",
      requestedEndsAt: "2026-08-08T10:00:00.000Z",
      requiredCapacity: 12,
      requiresAccessible: true,
      units: [
        { ...units[3]!, accessible: true },
        { id: "far", name: "Far pitch", capacity: 22, parentId: null, exclusiveWith: [], accessible: true },
      ],
      existing: [],
      slots: [
        { reservationUnitId: "pitch-2", startsAt: "2026-08-08T09:15:00.000Z", endsAt: "2026-08-08T10:15:00.000Z" },
        { reservationUnitId: "far", startsAt: "2026-08-08T13:00:00.000Z", endsAt: "2026-08-08T14:00:00.000Z" },
      ],
    });
    expect(ranked.map(({ reservationUnitId }) => reservationUnitId)).toEqual(["pitch-2", "far"]);
    expect(ranked[0]?.explanation).toContain("15 minutes");
  });

  it("keeps the requested setup buffer when scoring alternatives", () => {
    const ranked = rankAllocationAlternatives({
      requestedStartsAt: "2026-08-08T10:10:00.000Z",
      requestedEndsAt: "2026-08-08T11:00:00.000Z",
      requestedBufferBeforeMinutes: 15,
      requiredCapacity: 10,
      requiresAccessible: false,
      units,
      existing: [{ ...existing, reservationUnitId: "pitch-2", bufferAfterMinutes: 0 }],
      slots: [{ reservationUnitId: "pitch-2", startsAt: "2026-08-08T10:10:00.000Z", endsAt: "2026-08-08T11:00:00.000Z" }],
    });
    expect(ranked).toEqual([]);
  });
});
