import { describe, expect, it } from "vitest";

import {
  collapseHouseholdRecipients,
  buildWeeklyDigest,
  nextAllowedDeliveryTime,
  notificationDedupeKey,
} from "@/features/communications/notifications";
import { DevNotificationOutbox } from "@/features/communications/service";

describe("notification scheduling", () => {
  it("defers a late London notification until quiet hours end", () => {
    expect(nextAllowedDeliveryTime("2026-07-20T21:30:00.000Z", {
      timeZone: "Europe/London",
      quietFromHour: 21,
      quietUntilHour: 8,
    })).toBe("2026-07-21T07:00:00.000Z");
  });

  it("collapses guardians in the same household while preserving opted-in destinations", () => {
    expect(collapseHouseholdRecipients([
      { householdId: "house-1", guardianId: "guardian-2", destination: "jordan@example.test", optedIn: true },
      { householdId: "house-1", guardianId: "guardian-1", destination: "alex@example.test", optedIn: true },
      { householdId: "house-2", guardianId: "guardian-3", destination: "sam@example.test", optedIn: false },
    ])).toEqual([
      { householdId: "house-1", guardianId: "guardian-1", destination: "alex@example.test", optedIn: true },
    ]);
  });

  it("builds a deterministic weekly digest without provider delivery claims", () => {
    expect(buildWeeklyDigest({
      organisationName: "Riverside Juniors",
      householdName: "Morgan household",
      eventSummaries: ["Training on Sunday at 09:30"],
      actionSummaries: ["Reply for the Meadow Park match by Wednesday"],
    })).toEqual({
      subject: "Riverside Juniors: your football week",
      body: "Morgan household\n\nComing up\n• Training on Sunday at 09:30\n\nActions\n• Reply for the Meadow Park match by Wednesday",
    });
  });

  it("deduplicates the deterministic development outbox", async () => {
    const outbox = new DevNotificationOutbox();
    const notification = {
      organisationId: "org-1",
      householdId: "house-1",
      eventId: "event-1",
      template: "availability-reminder",
      destination: "alex@example.test",
      scheduledFor: "2026-07-21T07:00:00.000Z",
      body: "Jamie has an availability response due.",
    } as const;

    const first = await outbox.enqueue(notification);
    const second = await outbox.enqueue(notification);

    expect(notificationDedupeKey(notification)).toBe(first.dedupeKey);
    expect(second).toEqual(first);
    expect(outbox.list()).toHaveLength(1);
    expect(first.deliveryStatus).toBe("not-sent");
    expect(outbox.mode).toBe("development");
  });
});
