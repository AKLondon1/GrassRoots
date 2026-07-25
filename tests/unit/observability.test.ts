import { describe, expect, it } from "vitest";

import { buildHealthSnapshot, normaliseOperationalError } from "@/lib/observability/health";

describe("operational health", () => {
  it("reports bounded provider readiness without exposing credentials", () => {
    expect(buildHealthSnapshot({ dataMode: "supabase", database: "reachable", emailConfigured: false, stripeConfigured: true, scannerConfigured: false }, "2026-07-21T10:00:00.000Z")).toEqual({
      status: "degraded",
      checkedAt: "2026-07-21T10:00:00.000Z",
      checks: { database: "reachable", email: "unconfigured", payments: "configured", fileScanning: "unconfigured" },
    });
  });

  it("emits an error reference and redacted classification only", () => {
    const event = normaliseOperationalError(new Error("parent@example.test failed with secret token"), "2026-07-21T10:00:00.000Z", "request-1");
    expect(event.errorRef).toMatch(/^GR-/);
    expect(JSON.stringify(event)).not.toContain("parent@example.test");
    expect(JSON.stringify(event)).not.toContain("secret token");
  });
});
