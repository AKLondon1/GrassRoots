import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  join(root, "supabase/migrations/0002_people_households.sql"),
  "utf8",
);
const databaseTests = readFileSync(
  join(root, "supabase/tests/people_households.sql"),
  "utf8",
);

describe("people migration static safety", () => {
  it("nulls only guardian membership identity when a membership is deleted", () => {
    expect(migration).toMatch(/on delete set null \(membership_id\)/i);
    expect(databaseTests).toMatch(/guardian becomes pending/i);
  });

  it("validates team-scoped assignments and invitations against a same-tenant team", () => {
    expect(migration).toMatch(/validate_team_scope_reference/i);
    expect(migration).toMatch(/on public\.scoped_role_assignments/i);
    expect(migration).toMatch(/on public\.organisation_invites/i);
    expect(migration).toMatch(
      /team\.id = new\.scope_id[\s\S]*team\.organisation_id = new\.organisation_id/i,
    );
    expect(databaseTests).toMatch(/cross-organisation team assignment/i);
    expect(databaseTests).toMatch(/unknown team invitation/i);
  });
});
