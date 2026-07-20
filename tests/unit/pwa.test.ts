// @vitest-environment node

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("PWA foundation", () => {
  it("ships an installable web manifest with GrassRoots identity", async () => {
    const manifest = JSON.parse(
      await readFile("public/manifest.webmanifest", "utf8"),
    ) as {
      name: string;
      display: string;
      start_url: string;
      icons: Array<{ src: string; sizes: string; purpose?: string }>;
    };

    expect(manifest.name).toBe("GrassRoots");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icon-192.png", sizes: "192x192" }),
        expect.objectContaining({ src: "/icon-512.png", sizes: "512x512" }),
      ]),
    );
  });

  it.each([
    ["public/icon-192.png", 192],
    ["public/icon-512.png", 512],
  ])("ships %s at its declared square dimensions", async (path, size) => {
    const png = await readFile(path);

    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  });

  it("ships a service worker that never caches sensitive workspace requests", async () => {
    const worker = await readFile("public/sw.js", "utf8");

    expect(worker).toContain("/app/");
    expect(worker).toContain("request.method !== \"GET\"");
  });
});
