import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const communicationActions = readFileSync(join(process.cwd(), "features", "communications", "actions.ts"), "utf8");
const complianceActions = readFileSync(join(process.cwd(), "features", "compliance", "actions.ts"), "utf8");
const productionScreen = readFileSync(join(process.cwd(), "features", "screens", "production-governance.tsx"), "utf8");
const jobRoute = readFileSync(join(process.cwd(), "app", "api", "internal", "jobs", "route.ts"), "utf8");

describe("phase 5 production boundaries", () => {
  it("derives the message author from the authenticated membership", () => {
    expect(communicationActions).toContain("auth.getUser");
    expect(communicationActions).toContain('from("memberships")');
    expect(communicationActions).not.toMatch(/authorMembershipId.*Object\.fromEntries/i);
  });

  it("persists preferences for the current membership and never accepts a target membership id", () => {
    expect(communicationActions).toContain("saveCommunicationPreferences");
    expect(communicationActions).not.toMatch(/membershipId:\s*z\./);
  });

  it("does not directly select restricted safeguarding or medical body tables", () => {
    expect(productionScreen).not.toContain('from("safeguarding_concerns")');
    expect(productionScreen).not.toContain('from("player_medical_profiles")');
    expect(productionScreen).toContain('rpc("list_safeguarding_concern_metadata"');
    expect(productionScreen).toContain('rpc("read_safeguarding_concern"');
  });

  it("uses a current-version, consent-authorised guardian request RPC", () => {
    expect(productionScreen).toContain('rpc("list_current_guardian_consent_requests"');
    expect(productionScreen).not.toContain('from("players")');
    expect(productionScreen).toContain('name="playerId" value={player.player_id}');
  });

  it("routes production withdrawal through the guarded consent RPC", () => {
    expect(complianceActions).toContain("withdrawConsent");
    expect(complianceActions).toContain('rpc("withdraw_consent"');
  });

  it("protects and executes the durable background-job adapter", () => {
    expect(jobRoute).toContain("CRON_SECRET");
    expect(jobRoute).toContain('rpc("lease_background_jobs"');
    expect(jobRoute).toContain('rpc("finish_background_job"');
    expect(jobRoute).toContain("timingSafeEqual");
  });
});
