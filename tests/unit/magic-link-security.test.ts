import { describe, expect, it } from "vitest";

import { OneTimeTokenRegistry, digestOneTimeToken } from "@/lib/security/one-time-token";

describe("one-time response tokens", () => {
  it("stores only a digest and accepts a live token once", async () => {
    const registry = new OneTimeTokenRegistry();
    await registry.issue({ rawToken: "opaque-token", subjectId: "guardian-1", expiresAt: "2026-07-21T10:10:00.000Z" });
    expect(registry.snapshot()[0]?.tokenDigest).toBe(await digestOneTimeToken("opaque-token"));
    expect(await registry.consume("opaque-token", "2026-07-21T10:09:59.000Z")).toMatchObject({ subjectId: "guardian-1" });
    await expect(registry.consume("opaque-token", "2026-07-21T10:09:59.000Z")).rejects.toThrow(/unavailable/i);
  });

  it("returns the same failure for expired and unknown tokens", async () => {
    const registry = new OneTimeTokenRegistry();
    await registry.issue({ rawToken: "expired", subjectId: "guardian-1", expiresAt: "2026-07-21T10:00:00.000Z" });
    await expect(registry.consume("expired", "2026-07-21T10:00:00.000Z")).rejects.toThrow("This secure link is unavailable.");
    await expect(registry.consume("unknown", "2026-07-21T10:00:00.000Z")).rejects.toThrow("This secure link is unavailable.");
  });
});
