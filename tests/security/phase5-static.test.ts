import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const finance = readFileSync(join(process.cwd(), "supabase", "migrations", "0006_comms_finance.sql"), "utf8");
const safeguarding = readFileSync(join(process.cwd(), "supabase", "migrations", "0007_consent_safeguarding_ops.sql"), "utf8");
const webhookRoute = readFileSync(join(process.cwd(), "app", "api", "stripe", "webhook", "route.ts"), "utf8");

describe("phase 5 migration boundaries", () => {
  it("separates club payments from platform subscriptions and validates money", () => {
    expect(finance).toContain("member_invoices");
    expect(finance).toContain("platform_subscriptions");
    expect(finance).toContain("platform_operators");
    expect(finance).toContain("currency = 'GBP'");
    expect(finance).toContain("stripe_webhook_events");
    expect(finance).toContain("process_stripe_webhook_event");
  });

  it("uses least privilege and redacts ordinary communication audit data", () => {
    expect(finance).toContain("enable row level security");
    expect(finance).toMatch(/revoke all on[\s\S]*from authenticated/i);
    expect(finance).toContain("message body must not be copied");
    expect(finance).toContain(
      "m.id = conversation_reports.reported_by_membership_id and m.organisation_id = conversation_reports.organisation_id",
    );
    expect(safeguarding).toContain("audit_log_reject_sensitive_body");
  });

  it("keeps medical and safeguarding data in restricted tables and RPCs", () => {
    expect(safeguarding).toContain("player_medical_profiles");
    expect(safeguarding).toContain("safeguarding_concerns");
    expect(safeguarding).toContain("read_emergency_player_profile");
    expect(safeguarding).toContain("read_safeguarding_concern");
    expect(safeguarding).toContain("sensitive_access_log");
    expect(safeguarding).toContain("security definer");
  });

  it("binds signed webhooks to the organisation connected account without retaining the raw body", () => {
    expect(webhookRoute).toContain('request.headers.get("stripe-signature")');
    expect(webhookRoute).toContain('from("stripe_connected_accounts")');
    expect(webhookRoute).toContain("stripe_account_id");
    expect(webhookRoute).not.toMatch(/insert\([^)]*body/i);
  });
});
