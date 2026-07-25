import { describe, expect, it } from "vitest";

import { DataRightsService } from "@/features/platform/data-rights";
import { SupportAccessService } from "@/features/platform/support-access";

describe("data rights and support boundaries", () => {
  it("exports subject-owned records but redacts restricted bodies", () => {
    const service = new DataRightsService();
    const result = service.createExport({
      userId: "user-1",
      organisationId: "org-1",
      records: [
        { type: "membership", id: "member-1", organisationId: "org-1", ownerUserId: "user-1", data: { displayName: "Alex" } },
        { type: "message", id: "message-1", organisationId: "org-1", ownerUserId: "user-1", data: { body: "Private body", createdAt: "2026-07-21" } },
        { type: "safeguarding", id: "concern-1", organisationId: "org-1", ownerUserId: "user-1", data: { detail: "Never export this body" } },
      ],
    });
    expect(result.records).toContainEqual(expect.objectContaining({ type: "membership" }));
    expect(JSON.stringify(result)).not.toContain("Private body");
    expect(JSON.stringify(result)).not.toContain("Never export this body");
  });

  it("never mixes tenant records and recursively removes body-like fields", () => {
    const service = new DataRightsService();
    const result = service.createExport({
      userId: "user-1",
      organisationId: "org-1",
      records: [
        { type: "membership", id: "member-other", organisationId: "org-2", ownerUserId: "user-1", data: { displayName: "Wrong tenant" } },
        { type: "message", id: "message-1", organisationId: "org-1", ownerUserId: "user-1", data: { createdAt: "2026-07-21", metadata: { clinical_notes: "nested secret", safe: "not allowlisted" } } },
      ],
    });

    expect(result.records.map(({ id }) => id)).toEqual(["message-1"]);
    expect(JSON.stringify(result)).not.toContain("Wrong tenant");
    expect(JSON.stringify(result)).not.toContain("nested secret");
    expect(JSON.stringify(result)).not.toContain("not allowlisted");
  });

  it("applies retention holds before deletion jobs become eligible", () => {
    const service = new DataRightsService();
    const scheduled = service.scheduleAccountDeletion({ userId: "user-1", requestedAt: "2026-07-21T10:00:00.000Z", retentionHoldUntil: "2026-09-01T00:00:00.000Z" });
    expect(scheduled.status).toBe("retention-hold");
    expect(service.releaseEligible("2026-08-20T10:00:00.000Z")).toEqual([]);
    expect(service.releaseEligible("2026-09-01T00:00:00.000Z")).toEqual([expect.objectContaining({ userId: "user-1", status: "queued" })]);
  });

  it("keeps support sessions resource-bound and blocks welfare bodies", () => {
    const service = new SupportAccessService();
    const session = service.start({ organisationId: "org-1", operatorId: "operator-1", reason: "Investigate invoice sync", authorisedResources: [{ type: "member-invoice", id: "invoice-1" }], startsAt: "2026-07-21T10:00:00.000Z", durationMinutes: 30 });
    expect(service.authorise(session.id, { type: "member-invoice", id: "invoice-1" }, "2026-07-21T10:10:00.000Z")).toBe(true);
    expect(service.authorise(session.id, { type: "safeguarding-concern", id: "concern-1" }, "2026-07-21T10:10:00.000Z")).toBe(false);
    expect(service.authorise(session.id, { type: "member-invoice", id: "invoice-1" }, "2026-07-21T10:31:00.000Z")).toBe(false);
  });
});
