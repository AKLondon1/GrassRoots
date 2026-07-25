import { describe, expect, it } from "vitest";

import { ConsentService } from "@/features/compliance/consent";
import { SafeguardingService } from "@/features/safeguarding/service";
import { LifecycleService } from "@/features/platform/lifecycle";

describe("consent, safeguarding and lifecycle flows", () => {
  it("records consent against the current definition and preserves withdrawal history", () => {
    const service = new ConsentService();
    service.publish({ organisationId: "org-1", definitionId: "photo", version: 2 });
    const response = service.respond({ organisationId: "org-1", definitionId: "photo", playerId: "player-1", guardianId: "guardian-1", version: 2, granted: true });
    const withdrawn = service.withdraw(response.id, "guardian-1");
    expect(withdrawn.withdrawnAt).toBeTruthy();
    expect(service.status("org-1", "photo", "player-1")).toBe("withdrawn");
  });

  it("allows only welfare roles to read concern detail and logs metadata", () => {
    const service = new SafeguardingService();
    const concern = service.raise({ organisationId: "org-1", actorId: "member-1", summary: "Private safeguarding detail" });
    expect(() => service.read(concern.id, { actorId: "coach-1", role: "coach", organisationId: "org-1" })).toThrow(/restricted/i);
    const allowed = service.read(concern.id, { actorId: "welfare-1", role: "welfare-officer", organisationId: "org-1" });
    expect(allowed.summary).toContain("Private");
    expect(service.audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorId: "coach-1", outcome: "denied", resourceType: "safeguarding-concern" }),
      expect.objectContaining({ actorId: "welfare-1", outcome: "allowed", resourceType: "safeguarding-concern" }),
    ]));
    expect(JSON.stringify(service.audit)).not.toContain("Private safeguarding detail");
  });

  it("exports scoped data and schedules deletion after ownership checks", () => {
    const service = new LifecycleService();
    const organisation = service.signUpOrganisation({ name: "Riverside Juniors", ownerUserId: "user-1", now: "2026-07-21T10:00:00.000Z" });
    expect(organisation.trialEndsAt).toBe("2026-08-04T10:00:00.000Z");
    service.transferOwnership(organisation.id, "user-1", "user-2");
    expect(() => service.scheduleOrganisationDeletion(organisation.id, "user-1")).toThrow(/owner/i);
    expect(service.scheduleOrganisationDeletion(organisation.id, "user-2", "2026-07-25T10:00:00.000Z").deleteAfter).toBe("2026-08-24T10:00:00.000Z");
    expect(service.scheduleOrganisationDeletion(organisation.id, "user-2", "2026-07-27T10:00:00.000Z").deleteAfter).toBe("2026-08-26T10:00:00.000Z");
    expect(service.cancelOrganisationDeletion(organisation.id, "user-2")).toEqual({ organisationId: organisation.id, deleteAfter: null });
    expect(service.exportAccount("user-2")).toMatchObject({ format: "json", userId: "user-2" });
  });
});
