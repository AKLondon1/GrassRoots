import { describe, expect, it } from "vitest";

import { evaluateConsent } from "@/features/compliance/consent";
import { qualificationStatus } from "@/features/compliance/qualifications";

describe("consent validity", () => {
  it("requires a response to the current published version", () => {
    expect(evaluateConsent({ currentVersion: 3, responseVersion: 2, grantedAt: "2026-07-01T10:00:00.000Z", withdrawnAt: null })).toBe("needs-response");
    expect(evaluateConsent({ currentVersion: 3, responseVersion: 3, grantedAt: "2026-07-01T10:00:00.000Z", withdrawnAt: null })).toBe("valid");
  });

  it("treats withdrawal as immediately invalid", () => {
    expect(evaluateConsent({ currentVersion: 3, responseVersion: 3, grantedAt: "2026-07-01T10:00:00.000Z", withdrawnAt: "2026-07-02T09:00:00.000Z" })).toBe("withdrawn");
  });
});

describe("qualification expiry", () => {
  it("distinguishes current, expiring and expired qualifications", () => {
    const today = new Date("2026-07-21T12:00:00.000Z");
    expect(qualificationStatus("2026-10-01", today)).toBe("current");
    expect(qualificationStatus("2026-08-01", today)).toBe("expiring");
    expect(qualificationStatus("2026-07-20", today)).toBe("expired");
  });
});
