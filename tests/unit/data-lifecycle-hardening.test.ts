import { describe, expect, it } from "vitest";

import { buildAnonymisationPatch, createCorrectionRequest, evaluateRetention } from "@/features/platform/privacy-lifecycle";

describe("privacy lifecycle", () => {
  it("limits correction requests to explicit supported fields", () => {
    expect(createCorrectionRequest({ userId: "user-1", field: "displayName", proposedValue: "Alex Morgan", reason: "My name is wrong" })).toMatchObject({ status: "pending", field: "displayName" });
    expect(() => createCorrectionRequest({ userId: "user-1", field: "role", proposedValue: "owner", reason: "please" })).toThrow(/field/i);
  });

  it("anonymises identity fields without deleting financial or safeguarding records unlawfully", () => {
    expect(buildAnonymisationPatch("user-123")).toEqual({
      displayName: "Former member",
      guardianEmail: "deleted+user-123@invalid.grassroots.local",
    });
  });

  it("honours active legal holds before scheduled retention deletion", () => {
    expect(evaluateRetention({ deleteAfter: "2026-07-21T10:00:00.000Z", legalHoldUntil: "2026-08-01T00:00:00.000Z" }, "2026-07-22T00:00:00.000Z")).toBe("held");
    expect(evaluateRetention({ deleteAfter: "2026-07-21T10:00:00.000Z", legalHoldUntil: null }, "2026-07-22T00:00:00.000Z")).toBe("eligible");
  });
});
