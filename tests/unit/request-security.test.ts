import { describe, expect, it } from "vitest";

import {
  InMemoryRateLimiter,
  assertSameOriginMutation,
  createErrorReference,
  redactSensitiveValue,
  trustedClientIdentifier,
} from "@/lib/security/request";

describe("request security", () => {
  it("accepts same-origin mutations and rejects cross-site requests", () => {
    expect(() => assertSameOriginMutation(new Request("https://app.grassroots.test/api/x", {
      method: "POST",
      headers: { origin: "https://app.grassroots.test", "sec-fetch-site": "same-origin" },
    }))).not.toThrow();

    expect(() => assertSameOriginMutation(new Request("https://app.grassroots.test/api/x", {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    }))).toThrow(/origin/i);
  });

  it("permits signed provider and cron routes to opt out of browser-origin checks", () => {
    expect(() => assertSameOriginMutation(new Request("https://app.grassroots.test/api/stripe/webhook", { method: "POST" }), { trustedNonBrowser: true })).not.toThrow();
  });

  it("uses only deployment-controlled client address headers", () => {
    expect(trustedClientIdentifier(new Headers({ "x-forwarded-for": "203.0.113.4" }))).toBe("edge-unavailable");
    expect(trustedClientIdentifier(new Headers({ "x-vercel-forwarded-for": "203.0.113.4, 10.0.0.1" }))).toBe("203.0.113.4");
  });

  it("limits repeated requests in a bounded window without leaking other keys", () => {
    const limiter = new InMemoryRateLimiter({ limit: 2, windowMs: 60_000 });
    expect(limiter.consume("one", 0).allowed).toBe(true);
    expect(limiter.consume("one", 1).allowed).toBe(true);
    expect(limiter.consume("one", 2).allowed).toBe(false);
    expect(limiter.consume("two", 2).allowed).toBe(true);
    expect(limiter.consume("one", 60_001).allowed).toBe(true);
  });

  it("redacts secrets and sensitive bodies while retaining diagnostic structure", () => {
    expect(redactSensitiveValue({
      email: "parent@example.test",
      medicalNotes: "asthma",
      token: "secret",
      nested: { status: "failed", cardNumber: "4242424242424242" },
    })).toEqual({
      email: "[REDACTED]",
      medicalNotes: "[REDACTED]",
      token: "[REDACTED]",
      nested: { status: "failed", cardNumber: "[REDACTED]" },
    });
    expect(createErrorReference("2026-07-21T10:00:00.000Z", "request-id-123")).toMatch(/^GR-[A-F0-9]{12}$/);
  });
});
