import { describe, expect, it } from "vitest";

import { parseEnvironment } from "@/lib/env";

describe("parseEnvironment", () => {
  it("selects the clearly labelled demo repository when Supabase is unset", () => {
    expect(parseEnvironment({ NODE_ENV: "development" }).dataMode).toBe("demo");
  });

  it("requires the Supabase URL and anonymous key as a pair", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "development",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toThrow(/Supabase URL and anonymous key/);
  });

  it("never exposes the server service role in public configuration", () => {
    const parsed = parseEnvironment({
      NODE_ENV: "test",
      SUPABASE_SERVICE_ROLE_KEY: "server-only-secret",
    });

    expect(parsed.public).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("requires an explicit data mode for production builds", () => {
    expect(() => parseEnvironment({ NODE_ENV: "production" })).toThrow(
      /explicit data mode/,
    );
  });
});
