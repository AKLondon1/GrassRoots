import { describe, expect, it } from "vitest";

import { deliverFacilityNotices, developmentFacilityNoticeProvider } from "@/features/facilities/outbox";

describe("facility notification outbox", () => {
  it("records successful development-ledger delivery without claiming external contact", async () => {
    const sent: Array<{ id: string; providerMessageId: string }> = [];
    const failed: string[] = [];
    const count = await deliverFacilityNotices({
      claimPending: async () => [{ id: "notice-1", organisationId: "org-1", eventInstanceId: "event-1", kind: "event-cancelled", payload: {} }],
      markSent: async (id, providerMessageId) => { sent.push({ id, providerMessageId }); },
      markFailed: async (id) => { failed.push(id); },
    }, developmentFacilityNoticeProvider);
    expect(count).toBe(1);
    expect(sent).toEqual([{ id: "notice-1", providerMessageId: "development-local:notice-1" }]);
    expect(failed).toEqual([]);
    expect(developmentFacilityNoticeProvider.name).toBe("development-local-ledger");
  });
});
