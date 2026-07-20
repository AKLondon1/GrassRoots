import { describe, expect, it } from "vitest";

import { securityHeaders } from "@/lib/security/headers";

describe("securityHeaders", () => {
  it("defines the baseline browser protections", () => {
    const names = securityHeaders.map(({ key }) => key.toLowerCase());

    expect(names).toContain("content-security-policy");
    expect(names).toContain("referrer-policy");
    expect(names).toContain("x-content-type-options");
    expect(names).toContain("permissions-policy");
  });
});
