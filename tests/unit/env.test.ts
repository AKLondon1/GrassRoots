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

  it("requires production origin, server credentials and a strong cron secret", () => {
    expect(() => parseEnvironment({ NODE_ENV: "production", NEXT_PUBLIC_DATA_MODE: "demo" })).toThrow(/APP_ORIGIN/);
    expect(() => parseEnvironment({ NODE_ENV: "production", NEXT_PUBLIC_DATA_MODE: "supabase", APP_ORIGIN: "https://grassroots.example", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" })).toThrow(/service-role/);
    expect(() => parseEnvironment({ NODE_ENV: "production", NEXT_PUBLIC_DATA_MODE: "supabase", APP_ORIGIN: "https://grassroots.example", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "s".repeat(40) })).toThrow(/CRON_SECRET/);
  });

  it("requires provider credential pairs and an API key for enabled coaching assistance", () => {
    expect(() => parseEnvironment({ NODE_ENV: "test", STRIPE_SECRET_KEY: "sk_test_1234567890123456" })).toThrow(/configured together/);
    expect(() => parseEnvironment({ NODE_ENV: "test", OPENAI_COACHING_ENABLED: "true" })).toThrow(/OPENAI_API_KEY/);
    expect(() => parseEnvironment({ NODE_ENV: "test", RESEND_API_KEY: "resend-secret" })).toThrow(/Email provider/);
    expect(() => parseEnvironment({ NODE_ENV: "test", PUSH_PROVIDER_URL: "https://push.example.test" })).toThrow(/Push provider/);
    expect(() => parseEnvironment({ NODE_ENV: "test", SCANNER_API_URL: "https://scanner.example.test" })).toThrow(/Scanner provider/);
    expect(() => parseEnvironment({ NODE_ENV: "production", NEXT_PUBLIC_DATA_MODE: "demo", APP_ORIGIN: "https://grassroots.example", PUSH_PROVIDER_URL: "http://push.example.test", PUSH_PROVIDER_TOKEN: "push-token", NEXT_PUBLIC_VAPID_PUBLIC_KEY: "vapid-key", PUSH_SUBSCRIPTION_ENCRYPTION_KEY: "e".repeat(32) })).toThrow(/push provider URL must use HTTPS/);
    expect(() => parseEnvironment({ NODE_ENV: "production", NEXT_PUBLIC_DATA_MODE: "demo", APP_ORIGIN: "https://grassroots.example", SCANNER_API_URL: "http://scanner.example.test", SCANNER_API_TOKEN: "scanner-token" })).toThrow(/scanner provider URL must use HTTPS/);
  });
});
