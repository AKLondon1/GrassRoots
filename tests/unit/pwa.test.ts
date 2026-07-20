// @vitest-environment node

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("PWA foundation", () => {
  it("ships an installable web manifest with GrassRoots identity", async () => {
    const manifest = JSON.parse(
      await readFile("public/manifest.webmanifest", "utf8"),
    ) as { name: string; display: string; start_url: string };

    expect(manifest.name).toBe("GrassRoots");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
  });

  it("ships a service worker that never caches sensitive workspace requests", async () => {
    const worker = await readFile("public/sw.js", "utf8");

    expect(worker).toContain("/app/");
    expect(worker).toContain("request.method !== \"GET\"");
  });
});
