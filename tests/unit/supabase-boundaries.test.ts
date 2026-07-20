import { describe, expect, it } from "vitest";

import { resolveSupabasePublicConfig } from "@/lib/supabase/types";

describe("Supabase public boundary", () => {
  it("keeps demo mode available without credentials", () => {
    expect(resolveSupabasePublicConfig({ mode: "demo" })).toBeNull();
  });

  it("requires a complete public configuration in Supabase mode", () => {
    expect(() =>
      resolveSupabasePublicConfig({
        mode: "supabase",
        url: "https://example.supabase.co",
      }),
    ).toThrow(/URL and anonymous key/);
  });

  it("returns only browser-safe credentials", () => {
    expect(
      resolveSupabasePublicConfig({
        mode: "supabase",
        url: "https://example.supabase.co",
        anonKey: "public-anon-key",
      }),
    ).toEqual({
      url: "https://example.supabase.co",
      anonKey: "public-anon-key",
    });
  });
});
