import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(process.cwd(), "app", "app", "[workspace]", "[section]", "page.tsx"), "utf8");
const provider = readFileSync(join(process.cwd(), "app", "api", "ai", "coaching-suggestion", "route.ts"), "utf8");
const productionScreen = readFileSync(join(process.cwd(), "features", "screens", "coach", "production-coaching.tsx"), "utf8");
const coachingActions = readFileSync(join(process.cwd(), "features", "coaching", "actions.ts"), "utf8");
const attendanceRecorder = readFileSync(join(process.cwd(), "features", "screens", "coach", "production-attendance-recorder.tsx"), "utf8");

describe("coaching production boundaries", () => {
  it("mounts production coach and approved-parent data screens", () => {
    expect(page).toContain("ProductionCoachingScreen");
    expect(page).toContain("ProductionParentDevelopmentScreen");
  });

  it("sources provider content from canonical columns and records metadata through RPC", () => {
    expect(provider).toContain('rpc("get_coaching_ai_safe_context"');
    expect(provider).toContain('rpc("record_coaching_ai_run"');
    expect(provider).not.toContain("sanitizeCoachingContext(raw)");
    expect(provider).toContain('persistence: "metadata-only"');
    expect(provider).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(provider).toContain("requested_actor_user_id");
  });

  it("wires production match, training and development without retaining attendance offline", () => {
    for (const workflow of ["ProductionMatchClock", "saveProductionFormation", "substituteProductionPlayer", "rotateProductionPositions", "correctProductionMatchEvent", "saveProductionMatchReflection", "ProductionTrainingBuilder", "createProductionDrill", "recordProductionObservation", "ProductionAiSuggestion"]) {
      expect(productionScreen).toContain(workflow);
    }
    expect(attendanceRecorder).not.toContain("IndexedDbAttendanceStore");
    expect(attendanceRecorder).not.toContain("DurableAttendanceQueue");
    expect(attendanceRecorder).toMatch(/connection.*required/i);
    expect(attendanceRecorder).toContain("syncProductionAttendanceActions");
  });

  it("keeps production coaching views scoped to the selected team and session", () => {
    expect(productionScreen).toContain('eq("team_id", String(teamData.id))');
    expect(productionScreen).toContain('eq("id", selection.sessionId).maybeSingle()');
    expect(productionScreen).toContain("selectedSessionData");
  });

  it("creates match day through an RPC and prefers the published selected squad", () => {
    expect(coachingActions).toContain('rpc("create_match_day"');
    expect(productionScreen).toContain("createProductionMatchDay");
    expect(productionScreen).toContain('eq("status", "published")');
    expect(productionScreen).toContain('eq("status", "selected")');
    expect(productionScreen).toContain("Published squad");
  });

  it("renders structured observations and playing-time rows with readable player labels", () => {
    expect(productionScreen).toContain("ObservationRecords");
    for (const label of ["Observation", "Context", "Strength", "Emerging skill", "Opportunity", "Confidence and engagement", "Position", "Next action", "Training theme", "Visibility", "Follow-up date"]) {
      expect(productionScreen).toContain(label);
    }
    expect(productionScreen).toContain("playerLabels.get");
  });
});
