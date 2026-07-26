// @vitest-environment node
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/0018_beta_auth_allowlist.sql";

describe("beta account-creation allowlist", () => {
  it("keeps pre-account Google access behind a private, expiring allowlist hook", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toMatch(/create table public\.beta_auth_allowlist/i);
    expect(migration).toMatch(/email = lower\(btrim\(email\)\)/i);
    expect(migration).toMatch(/expires_at > created_at/i);
    const standardEmailPattern = String.raw`^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$`;

    expect(migration).toContain(`email ~ '${standardEmailPattern}'`);
    expect(migration).toContain(`candidate_email !~ '${standardEmailPattern}'`);
    expect(migration).not.toContain(String.raw`\\.`);
    expect(migration).toMatch(
      /create function public\.hook_restrict_beta_signup\(event jsonb\)/i,
    );
    expect(migration).toMatch(/coalesce\(provider, ''\) <> 'google'/i);
    expect(migration).toMatch(/organisation_invites[\s\S]*accepted_at is null/i);
    expect(migration).toMatch(/expires_at > now\(\)/i);
    expect(migration).toMatch(/http_code', 403/i);
    expect(migration).toMatch(/revoke all on table public\.beta_auth_allowlist/i);
    expect(migration).toMatch(/grant select, insert, update, delete on table public\.beta_auth_allowlist to service_role/i);
    expect(migration).toMatch(/revoke all on function public\.hook_restrict_beta_signup\(jsonb\) from public/i);
    expect(migration).toMatch(/grant execute on function public\.hook_restrict_beta_signup\(jsonb\) to supabase_auth_admin/i);
  });

  it("declares the Before User Created hook in the Supabase project contract", async () => {
    const config = await readFile("supabase/config.toml", "utf8");

    expect(config).toMatch(/\[auth\.hook\.before_user_created\]/);
    expect(config).toMatch(/enabled = true/);
    expect(config).toContain(
      'uri = "pg-functions://postgres/public/hook_restrict_beta_signup"',
    );
  });
});
