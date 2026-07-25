import { describe, expect, it } from "vitest";

import { assertOfflineSafeOperation, isPublicCacheRequest } from "@/lib/pwa/offline-policy";

describe("offline data policy", () => {
  it("allows only explicitly non-sensitive queued mutations", () => {
    expect(() => assertOfflineSafeOperation({ kind: "ui-preference", payload: { density: "compact" } })).not.toThrow();
    expect(() => assertOfflineSafeOperation({ kind: "attendance", payload: { playerId: "child-1" } })).toThrow(/online/i);
    expect(() => assertOfflineSafeOperation({ kind: "message", payload: { body: "medical detail" } })).toThrow(/online/i);
  });

  it("caches only exact public shell routes without queries", () => {
    expect(isPublicCacheRequest(new URL("https://app.test/"))).toBe(true);
    expect(isPublicCacheRequest(new URL("https://app.test/manifest.webmanifest"))).toBe(true);
    expect(isPublicCacheRequest(new URL("https://app.test/app/riverside/home"))).toBe(false);
    expect(isPublicCacheRequest(new URL("https://app.test/?token=secret"))).toBe(false);
  });
});
