import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0004_facilities.sql"), "utf8");

describe("facilities migration security", () => {
  it("uses tenant-scoped RLS and least-privilege grants", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("public.has_capability");
    expect(sql).toMatch(/revoke all on[\s\S]*from authenticated/i);
    expect(sql).toMatch(/grant select[\s\S]*to authenticated/i);
  });

  it("serialises allocation and closure operations", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("allocate_facility_booking");
    expect(sql).toContain("close_and_relocate_facility_bookings");
    expect(sql).toContain("exclude using gist");
    expect(sql).toMatch(/occupied_range\s+tstzrange\s+not null/i);
    expect(sql).toContain("set_facility_booking_occupied_range");
    expect(sql).toMatch(/occupied_range with &&/i);
    expect(sql).not.toMatch(
      /exclude using gist[\s\S]*?tstzrange\(\s*starts_at\s*-\s*make_interval/i,
    );
  });

  it("keeps support access time-limited and audited", () => {
    expect(sql).toContain("support_sessions");
    expect(sql).toContain("expires_at");
    expect(sql).toContain("audit_log");
  });
});
