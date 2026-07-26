import { describe, expect, it } from "vitest";

import { FacilityService, FacilityConflictError } from "@/features/facilities/service";
import type { ReservationUnit } from "@/features/facilities/allocation";

const units: ReservationUnit[] = [
  { id: "main", name: "Main pitch", capacity: 22, parentId: null, exclusiveWith: [] },
  { id: "half-a", name: "Half A", capacity: 12, parentId: "main", exclusiveWith: [] },
  { id: "half-b", name: "Half B", capacity: 12, parentId: "main", exclusiveWith: [] },
  { id: "pitch-2", name: "Pitch 2", capacity: 18, parentId: null, exclusiveWith: [] },
];

describe("facility operations flow", () => {
  it("serialises concurrent allocation attempts for the same unit", async () => {
    const service = new FacilityService("org-1", units);
    const input = { reservationUnitId: "main", startsAt: "2026-08-08T09:00:00.000Z", endsAt: "2026-08-08T10:00:00.000Z", bufferBeforeMinutes: 0, bufferAfterMinutes: 15 };
    const attempts = await Promise.allSettled([
      service.allocate({ ...input, id: "one" }),
      service.allocate({ ...input, id: "two" }),
    ]);
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(1);
  });

  it("closes a pitch and atomically relocates affected bookings", async () => {
    const service = new FacilityService("org-1", units);
    await service.allocate({ id: "one", reservationUnitId: "main", startsAt: "2026-08-08T09:00:00.000Z", endsAt: "2026-08-08T10:00:00.000Z", bufferBeforeMinutes: 0, bufferAfterMinutes: 0 });
    const result = await service.closeAndRelocate({ reservationUnitId: "main", startsAt: "2026-08-08T08:00:00.000Z", endsAt: "2026-08-08T12:00:00.000Z", reason: "Waterlogged", replacements: { one: "pitch-2" } });
    expect(result.relocated).toEqual([{ bookingId: "one", from: "main", to: "pitch-2" }]);
    expect(service.listBookings()[0]?.reservationUnitId).toBe("pitch-2");
  });

  it("rolls back a closure when a replacement conflicts", async () => {
    const service = new FacilityService("org-1", units);
    await service.allocate({ id: "one", reservationUnitId: "main", startsAt: "2026-08-08T09:00:00.000Z", endsAt: "2026-08-08T10:00:00.000Z", bufferBeforeMinutes: 0, bufferAfterMinutes: 0 });
    await service.allocate({ id: "occupied", reservationUnitId: "pitch-2", startsAt: "2026-08-08T09:00:00.000Z", endsAt: "2026-08-08T10:00:00.000Z", bufferBeforeMinutes: 0, bufferAfterMinutes: 0 });
    await expect(service.closeAndRelocate({ reservationUnitId: "main", startsAt: "2026-08-08T08:00:00.000Z", endsAt: "2026-08-08T12:00:00.000Z", reason: "Waterlogged", replacements: { one: "pitch-2" } })).rejects.toBeInstanceOf(FacilityConflictError);
    expect(service.listBookings().find(({ id }) => id === "one")?.reservationUnitId).toBe("main");
  });

  it("supports an atomic cancel resolution", async () => {
    const service = new FacilityService("org-1", units);
    await service.allocate({ id: "one", reservationUnitId: "main", startsAt: "2026-08-08T09:00:00.000Z", endsAt: "2026-08-08T10:00:00.000Z", bufferBeforeMinutes: 0, bufferAfterMinutes: 0 });
    const result = await service.closeAndRelocate({ reservationUnitId: "main", startsAt: "2026-08-08T08:00:00.000Z", endsAt: "2026-08-08T12:00:00.000Z", reason: "Unsafe surface", replacements: { one: "cancel" } });
    expect(result.cancelled).toEqual(["one"]);
    expect(service.listBookings()[0]?.status).toBe("cancelled");
  });
});
