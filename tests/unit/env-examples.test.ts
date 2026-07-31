// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseEnvironment } from "@/lib/env";

/**
 * The committed env examples, parsed through the same schema the application uses.
 *
 * Task 13 ran `npm run build` for the first time in a phase and it failed: production
 * requires an explicit data mode and a canonical HTTPS origin, and the only committed
 * example carried `http://localhost:3000`. The guard was right and the documentation
 * was wrong, so `.env.production.example` now exists.
 *
 * An example nobody executes is a comment, and comments rot. These tests execute
 * them: if the guard in lib/env.ts tightens, the example fails here rather than in
 * somebody's deploy.
 */

const REPOSITORY_ROOT = join(import.meta.dirname, "..", "..");

/** Minimal dotenv: enough for `KEY=value` and `#` comments, which is all these use. */
function readEnvExample(name: string): Record<string, string> {
  const contents = readFileSync(join(REPOSITORY_ROOT, name), "utf8");
  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const value = trimmed.slice(separator + 1).trim();
    // An empty value in an example means "you supply this", which is not the same as
    // "set to empty string" and must not be handed to the schema as one.
    if (value) values[trimmed.slice(0, separator).trim()] = value;
  }
  return values;
}

/**
 * The values an operator supplies, which an example must never contain.
 *
 * The example ships these keys blank on purpose, and the schema requires the
 * Supabase URL and anon key to be present together, so the file alone can never
 * parse -- and should not. What the example is responsible for is the part Task 13
 * found wrong: the data mode and the origin. Filling the blanks here separates
 * "this example is incomplete", which is correct, from "this example is invalid",
 * which is the bug.
 */
const OPERATOR_SUPPLIED = {
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-placeholder-32-chars",
  CRON_SECRET: "cron-secret-placeholder-at-least-32-chars",
} as const;

describe(".env.production.example", () => {
  const example = readEnvExample(".env.production.example");

  it("parses cleanly as a production environment once secrets are supplied", () => {
    // The assertion Task 13 needed and did not have. NODE_ENV=production is what
    // `next build` sets, and is what turns both guards on.
    expect(() =>
      parseEnvironment({ ...example, ...OPERATOR_SUPPLIED, NODE_ENV: "production" }),
    ).not.toThrow();
  });

  it("resolves to Supabase mode, not demo", () => {
    const parsed = parseEnvironment({
      ...example,
      ...OPERATOR_SUPPLIED,
      NODE_ENV: "production",
    });

    expect(parsed.dataMode).toBe("supabase");
  });

  it("carries an APP_ORIGIN the production guard accepts", () => {
    // The specific line that made `npm run build` unrunnable from a clean checkout.
    // Isolated from the rest so a regression names itself.
    expect(example.APP_ORIGIN).toMatch(/^https:\/\//);
    expect(example.APP_ORIGIN).not.toMatch(/:\d+|\*|\/$/);
  });

  it("commits no secret values", () => {
    // Names are documentation; values are credentials. Every secret here must be
    // present as a key and empty as a value.
    for (const key of [
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "CRON_SECRET",
    ]) {
      expect(example[key], `${key} must be left empty in an example`).toBeUndefined();
    }
  });
});

describe(".env.example", () => {
  const example = readEnvExample(".env.example");

  it("parses cleanly for local development", () => {
    expect(() =>
      parseEnvironment({ ...example, NODE_ENV: "development" }),
    ).not.toThrow();
  });

  it("is deliberately rejected as a production environment", () => {
    // This is the failure Task 13 hit, pinned so nobody "fixes" the local example by
    // making it production-valid. Its APP_ORIGIN is http and carries a port, and a
    // production build must refuse both. If this ever stops throwing, the guard has
    // been weakened.
    expect(() =>
      parseEnvironment({ ...example, NODE_ENV: "production" }),
    ).toThrow(/APP_ORIGIN/i);
  });
});
