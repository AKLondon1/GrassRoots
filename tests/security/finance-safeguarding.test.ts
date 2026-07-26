import { describe, expect, it } from "vitest";

import { FinanceService, MemoryFinanceStore } from "@/features/finance/service";
import { SafeguardingService } from "@/features/safeguarding/service";

describe("finance and sensitive access security", () => {
  it("rejects forged Stripe webhook signatures", async () => {
    const service = new FinanceService(new MemoryFinanceStore(), { kind: "stripe", webhookSecret: "real-secret" });
    await expect(service.receiveStripeWebhook('{"id":"evt_forged"}', "t=1,v1=forged", 1)).rejects.toThrow(/signature/i);
  });

  it("denies ordinary coaches medical and welfare detail", () => {
    const service = new SafeguardingService();
    service.setMedicalProfile({ organisationId: "org-1", playerId: "player-1", emergencySummary: "Carries inhaler", clinicalNotes: "Restricted clinical history" });
    expect(() => service.readMedical("player-1", { actorId: "coach-1", role: "coach", organisationId: "org-1", emergency: false })).toThrow(/restricted/i);
    expect(service.readMedical("player-1", { actorId: "welfare-1", role: "welfare-officer", organisationId: "org-1", emergency: true })).toEqual({ playerId: "player-1", emergencySummary: "Carries inhaler" });
    expect(JSON.stringify(service.audit)).not.toContain("clinical history");
  });

  it("does not let a general club owner substitute for the welfare role", () => {
    const service = new SafeguardingService();
    const concern = service.raise({ organisationId: "org-1", actorId: "member-1", summary: "Restricted case" });
    expect(() => service.read(concern.id, { actorId: "owner-1", role: "club-owner", organisationId: "org-1" })).toThrow(/restricted/i);
  });
});
