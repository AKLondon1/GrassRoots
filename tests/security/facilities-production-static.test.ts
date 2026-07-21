import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/migrations/0004_facilities.sql"), "utf8");
const route = readFileSync(join(root, "app/app/[workspace]/[section]/page.tsx"), "utf8");
const actions = readFileSync(join(root, "features/facilities/actions.ts"), "utf8");

describe("production facility boundaries", () => {
  it("routes production operations to live Supabase-backed screens and validated RPC actions", () => {
    expect(route).toContain("ProductionClubOperationsScreen");
    expect(actions).toContain("bookingSchema.parse");
    expect(actions).toContain("allocate_facility_booking");
    expect(actions).toContain("close_and_relocate_facility_bookings");
  });

  it("keeps closure and equipment mutations behind locked RPCs", () => {
    const dmlGrant = migration.match(/grant select, insert, update, delete on[\s\S]*?to authenticated;/gi)?.join("\n") ?? "";
    expect(dmlGrant).not.toContain("public.facility_closures");
    expect(dmlGrant).not.toContain("public.equipment_reservations");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("reserved_quantity + requested_quantity > available_quantity");
  });

  it("atomically propagates cancellations to events, calendar state and urgent notices", () => {
    expect(migration).toContain("update public.event_instances set status = 'cancelled'");
    expect(migration).toContain("insert into public.event_change_summaries");
    expect(migration).toContain("insert into public.facility_notification_outbox");
    expect(migration).toContain("'event-cancelled'");
  });

  it("binds support requests and audits bounded support resource access", () => {
    expect(migration).toContain("membership.user_id = auth.uid()");
    expect(migration).toContain("requested_resource_type = any(session.allowed_resources)");
    expect(migration).toContain("'support.resource.read'");
    expect(migration).toContain("revoke_support_session");
  });
});
