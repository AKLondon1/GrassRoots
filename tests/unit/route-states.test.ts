import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoute = join(process.cwd(), "app", "app", "[workspace]");

describe("workspace route states", () => {
  it("owns section, loading, and error routes at the workspace boundary", () => {
    const expectedFiles = [
      join(workspaceRoute, "[section]", "page.tsx"),
      join(workspaceRoute, "loading.tsx"),
      join(workspaceRoute, "error.tsx"),
    ];

    for (const path of expectedFiles) expect(existsSync(path)).toBe(true);

    expect(readFileSync(expectedFiles[0], "utf8")).toContain("DeniedState");
    expect(readFileSync(expectedFiles[0], "utf8")).toContain(
      "getDemoCapabilities",
    );
    expect(readFileSync(expectedFiles[0], "utf8")).not.toContain(
      "getCapabilitiesForRole",
    );
    expect(readFileSync(expectedFiles[1], "utf8")).toContain("Skeleton");
    expect(readFileSync(expectedFiles[2], "utf8")).toContain("ErrorState");
  });
});
