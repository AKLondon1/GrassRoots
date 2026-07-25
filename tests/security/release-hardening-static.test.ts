// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("release hardening boundaries", () => {
  it("keeps production attendance personal data out of durable browser storage", async () => {
    const source = await readFile("features/screens/coach/production-attendance-recorder.tsx", "utf8");
    expect(source).not.toContain("IndexedDbAttendanceStore");
    expect(source).not.toContain("DurableAttendanceQueue");
    expect(source).toMatch(/connection.*required/i);
  });

  it("keeps private uploads quarantined until validated and scanned", async () => {
    const migration = await readFile("supabase/migrations/0008_release_hardening.sql", "utf8");
    expect(migration).toMatch(/grassroots-private-quarantine[\s\S]*false/i);
    expect(migration).toMatch(/status.*awaiting-upload.*quarantined.*scanning.*clean.*rejected/i);
    expect(migration).toMatch(/status <> 'clean'.*checksum_sha256.*scanned_at/i);
    expect(
      migration.match(
        /constraint private_upload_intents_storage_path_check\s+check/gi,
      ),
    ).toHaveLength(2);
    expect(migration).toMatch(/grant select on public\.private_upload_intents to authenticated/i);
    expect(migration).not.toMatch(/grant select,insert,update on public\.private_upload_intents/i);
    expect(migration).toMatch(/record_private_upload_scan[\s\S]*to service_role/i);
    expect(migration).toMatch(/register_promoted_private_document[\s\S]*insert into public\.stored_files/i);
  });

  it("uses one-time digest-only response links and atomic consumption", async () => {
    const migration = await readFile("supabase/migrations/0008_release_hardening.sql", "utf8");
    expect(migration).toMatch(/token_digest text not null unique/i);
    expect(migration).not.toMatch(/raw_token/i);
    expect(migration).toMatch(/update public\.magic_response_tokens[\s\S]*consumed_at = now\(\)[\s\S]*expires_at > now\(\)/i);
  });

  it("checks live session revocations at the request boundary", async () => {
    const middleware = await readFile("lib/supabase/middleware.ts", "utf8");
    expect(middleware).toMatch(/claims\.session_id/);
    expect(middleware).toMatch(/from\("session_revocations"\)/);
    expect(middleware).toMatch(/signOut\(\{ scope: "local" \}\)/);
  });

  it("uses the database-backed limiter in production mutation routes", async () => {
    const sources = await Promise.all([
      "app/(auth)/sign-in/actions.ts",
      "app/api/ai/coaching-suggestion/route.ts",
      "app/api/stripe/webhook/route.ts",
      "app/api/internal/jobs/route.ts",
      "app/api/uploads/intents/route.ts",
      "app/api/uploads/[intentId]/finalise/route.ts",
    ].map((path) => readFile(path, "utf8")));
    for (const source of sources) {
      expect(source).toContain("consumeDistributedRateLimit");
      expect(source).not.toContain("InMemoryRateLimiter");
    }
  });

  it("documents that pgTAP must be run against a disposable database", async () => {
    const deployment = await readFile("docs/DEPLOYMENT.md", "utf8");
    expect(deployment).toMatch(/disposable.*database/i);
    expect(deployment).toMatch(/pgTAP/i);
  });

  it("exports the documented personal-data inventory while excluding restricted bodies", async () => {
    const worker = await readFile("app/api/internal/jobs/route.ts", "utf8");
    for (const category of ["linkedPlayers", "availabilityResponses", "pollResponses", "squadSelections", "consentResponses", "memberInvoices", "trainingAttendance", "approvedDevelopmentSummaries"]) {
      expect(worker).toContain(category);
    }
    expect(worker).toContain("excludedSensitiveBodies");
    expect(worker).not.toMatch(/from\("safeguarding_concerns"\)[\s\S]*select/);
    expect(worker).not.toMatch(/from\("player_medical_profiles"\)[\s\S]*select/);
  });

  it("actively probes the required database and returns an unavailable HTTP status", async () => {
    const probe = await readFile("lib/observability/health-probe.ts", "utf8");
    const route = await readFile("app/api/health/route.ts", "utf8");
    expect(probe).toMatch(/from\("organisations"\).*select/);
    expect(probe).toContain("database health timeout");
    expect(route).toMatch(/unavailable.*503/);
  });

  it("keeps worker cleanup batches bounded and inventories every private bucket", async () => {
    const worker = await readFile("app/api/internal/jobs/route.ts", "utf8");
    expect(worker).toContain("grassroots-private-exports");
    expect(worker).toContain("grassroots-private-quarantine");
    expect(worker).toContain("grassroots-private-files");
    expect(worker).toMatch(/expiredExports[\s\S]*limit\(100\)/);
  });
});
