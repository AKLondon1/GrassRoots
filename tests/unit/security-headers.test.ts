import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, securityHeaders } from "@/lib/security/headers";

describe("securityHeaders", () => {
  it("defines the baseline browser protections", () => {
    const names = securityHeaders.map(({ key }) => key.toLowerCase());

    expect(names).toContain("referrer-policy");
    expect(names).toContain("x-content-type-options");
    expect(names).toContain("permissions-policy");
    expect(names).toContain("strict-transport-security");
  });

  it("uses a request nonce instead of allowing arbitrary inline scripts", () => {
    const policy = buildContentSecurityPolicy("nonce-value", false);
    expect(policy).toContain("script-src 'self' 'nonce-nonce-value' 'strict-dynamic'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
  });
});
