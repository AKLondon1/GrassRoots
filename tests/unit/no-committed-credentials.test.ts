// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * No credential may be committed. This test is the enforcement.
 *
 * Task 13 found that none of the seeded identities could authenticate, and the
 * obvious fix was to put a password in `supabase/seed.sql`. That shortcut was
 * refused, because a credential in the seed ends up in staging, in every fork, and in
 * every developer's shell history -- and a seed password is exactly the kind of thing
 * that gets copied into a real environment "just for now".
 *
 * Phase 14 solved it a different way: the seed creates complete but passwordless
 * accounts, sign-in is magic links only, and `scripts/seed-auth-identities.mjs` mints
 * links using a service-role key that lives in the environment and never in git. That
 * arrangement only stays true if something checks, so this scans every tracked file
 * on every run.
 *
 * It reads `git ls-files` rather than walking the directory, so it sees exactly what
 * is committed: an untracked local `.env` is fine and is not this test's business.
 */

const REPOSITORY_ROOT = join(import.meta.dirname, "..", "..");

/** Files whose whole job is to talk about credentials without containing one. */
const DISCUSSES_CREDENTIALS_BY_DESIGN = new Set([
  "tests/unit/no-committed-credentials.test.ts",
  ".env.example",
  ".env.production.example",
]);

interface Rule {
  readonly name: string;
  readonly pattern: RegExp;
  readonly why: string;
}

const RULES: readonly Rule[] = [
  {
    name: "bcrypt hash",
    pattern: /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/,
    why: "a bcrypt hash is a password, and Supabase stores auth.users.encrypted_password in this shape",
  },
  {
    name: "auth.users password column",
    pattern: /encrypted_password/i,
    why: "writing encrypted_password means the seed has started shipping a password",
  },
  {
    name: "JWT",
    // Three base64url segments. Supabase anon, service-role and access tokens all
    // match, and so does anything else signed and pasted in by accident.
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    why: "a JWT here is a Supabase key or a session token, whichever project it came from",
  },
  {
    name: "Supabase publishable or secret key",
    pattern: /\bsb_(?:publishable|secret)_[A-Za-z0-9_-]{10,}/,
    why: "these are project keys; the environment name may be committed, the value may not",
  },
  {
    name: "hosted Supabase project URL",
    pattern: /https:\/\/[a-z0-9]{20}\.supabase\.(?:co|in)\b/,
    why: "a project ref identifies a real database; local URLs and placeholders are fine",
  },
  {
    name: "assigned password literal",
    // `password = "..."` / `password: '...'`, but not `password_hash_algorithm` or a
    // bare mention in prose.
    pattern: /\b(?:password|passwd)\s*[:=]\s*["'`][^"'`\s]{6,}["'`]/i,
    why: "a literal secret assigned in a tracked file is committed the moment it is written",
  },
];

function trackedFiles(): readonly string[] {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return output.split("\0").filter(Boolean);
}

/** Skips binaries and lockfiles, where a base64 blob is noise rather than a secret. */
function isScannable(path: string): boolean {
  if (DISCUSSES_CREDENTIALS_BY_DESIGN.has(path)) return false;
  if (/(^|\/)package-lock\.json$/.test(path)) return false;
  return !/\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|eot|pdf|zip|gz|mp4|webm)$/i.test(path);
}

describe("no credential is committed", () => {
  const files = trackedFiles().filter(isScannable);

  it("scans a plausible number of tracked files", () => {
    // Guards the guard. If `git ls-files` ever returns nothing -- wrong cwd, no git,
    // a filter typo -- every assertion below would pass while scanning zero bytes,
    // and the test would report a safety it had not checked.
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("supabase/seed.sql");
  });

  for (const rule of RULES) {
    it(`finds no ${rule.name}`, () => {
      const offenders: string[] = [];
      for (const path of files) {
        let contents: string;
        try {
          contents = readFileSync(join(REPOSITORY_ROOT, path), "utf8");
        } catch {
          continue;
        }
        const match = rule.pattern.exec(contents);
        if (match) {
          const line = contents.slice(0, match.index).split("\n").length;
          offenders.push(`${path}:${line}`);
        }
      }

      expect(offenders, `${rule.why}. Found in: ${offenders.join(", ")}`).toEqual([]);
    });
  }

  it("keeps the seeded identities passwordless", () => {
    // The specific regression this phase could have introduced. The seed now creates
    // complete, confirmed auth.users rows so they can actually sign in; the thing that
    // must stay absent is any way to sign in as them without the mailbox.
    const seed = readFileSync(join(REPOSITORY_ROOT, "supabase", "seed.sql"), "utf8");

    expect(seed).toMatch(/insert into auth\.users/i);
    expect(seed).toContain("email_confirmed_at");
    expect(seed).not.toMatch(/\bcrypt\s*\(/i);
    expect(seed).not.toMatch(/gen_salt/i);
  });

  it("gives the seeding script no default service-role key", () => {
    const script = readFileSync(
      join(REPOSITORY_ROOT, "scripts", "seed-auth-identities.mjs"),
      "utf8",
    );

    expect(script).toContain("SUPABASE_SERVICE_ROLE_KEY");
    // `??` or `||` after the key would be a fallback, and a fallback for a
    // service-role key is a committed credential wearing a hat.
    expect(script).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*(?:\?\?|\|\|)/);
  });
});
