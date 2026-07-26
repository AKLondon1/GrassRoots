import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0005_coaching.sql"), "utf8");

describe("coaching migration security", () => {
  it("protects private observations with scoped RLS and audited reads", () => {
    expect(sql).toContain("coach_observations");
    expect(sql).toContain("log_coach_observation_access");
    expect(sql).toContain("public.has_capability");
    expect(sql).toMatch(/enable row level security/gi);
    expect(sql).toMatch(/revoke all on[\s\S]*from authenticated/i);
  });

  it("allows match state changes only through atomic RPCs", () => {
    expect(sql).toContain("transition_match_state");
    expect(sql).toContain("record_match_substitution");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toMatch(/grant execute on function public\.transition_match_state/i);
    expect(sql).toContain("record_match_event");
    expect(sql).toContain("match_position_intervals_no_overlap");
    expect(sql).toContain("playing_time_records");
    expect(sql).toContain("requested_at := clock_timestamp()");
    expect(sql).toContain("save_match_formation");
    expect(sql).toContain("rotate_match_positions");
    expect(sql).toContain("correct_match_event");
    expect(sql).toMatch(
      /if tg_table_name = 'formations' then[\s\S]*requested_match_id := coalesce\(new\.match_id, old\.match_id\)/i,
    );
    expect(sql).not.toMatch(
      /declare requested_match_id uuid := case when tg_table_name = 'formations'/i,
    );
    expect(sql).toMatch(
      /if tg_table_name = 'parent_development_summaries' then[\s\S]*new\.review_id/i,
    );
  });

  it("provisions production capabilities and protects approval and AI audit boundaries", () => {
    expect(sql).toContain("'training:manage'");
    expect(sql).toContain("'matches:manage'");
    expect(sql).toContain("enforce_parent_summary_approval");
    expect(sql).toContain("get_coaching_ai_safe_context");
    expect(sql).toContain("record_coaching_ai_run");
    expect(sql).toContain("is_approved_development_review");
    expect(sql).toMatch(
      /parent_development_linked[\s\S]*public\.is_approved_development_review/i,
    );
    expect(sql).not.toMatch(/grant[^;]*insert[^;]*public\.coaching_ai_runs[^;]*to authenticated/i);
    expect(sql).not.toMatch(/grant execute on function public\.record_coaching_ai_run[^;]*to authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.record_coaching_ai_run[^;]*to service_role/i);
    expect(sql).toMatch(
      /record_coaching_ai_run[\s\S]*auth\.role\(\) is distinct from 'service_role'/i,
    );
  });

  it("models complete coaching records and server-side production mutations", () => {
    for (const value of ["minimum_age", "equipment text[]", "area_description", "difficulty", "adaptations", "diagram_url", "visibility", "'left-early'", "'assist'", "'save'", "'positive-moment'", "'learning-moment'", "'injury'", "save_training_plan", "create_coaching_drill", "record_coach_observation", "approve_development_summary"]) {
      expect(sql).toContain(value);
    }
  });
});
