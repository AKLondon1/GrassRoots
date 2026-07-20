import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

describe("demo access policy", () => {
  it("defines role capabilities independently from the screen catalogue", async () => {
    const policyPath = join(
      process.cwd(),
      "lib",
      "access",
      "demo-access-policy.ts",
    );

    expect(existsSync(policyPath)).toBe(true);
    if (!existsSync(policyPath)) return;

    const policy = (await vi.importActual("@/lib/access/demo-access-policy")) as {
      getDemoCapabilities: (role: string) => readonly string[];
    };

    expect(policy.getDemoCapabilities("club")).toContain("club:view");
    expect(policy.getDemoCapabilities("club")).not.toContain("safeguarding:view");
    expect(policy.getDemoCapabilities("coach")).not.toContain(
      "development:manage",
    );
    expect(policy.getDemoCapabilities("platform")).not.toContain(
      "access:manage",
    );
  });
});
