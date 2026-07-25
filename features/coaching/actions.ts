"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const contextSchema = z.object({ workspace: z.string().min(1).max(100), section: z.string().min(1).max(40) });
const uuid = z.uuid();
const attendanceStatus = z.enum(["expected", "present", "late", "left-early", "absent", "excused", "injured", "observing", "trialist", "unknown", "unexpected"]);

async function rpcClient() {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("The organisation connection is unavailable.");
  return client as unknown as { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }> };
}

function refresh(formData: FormData) {
  const context = contextSchema.parse({ workspace: formData.get("workspace"), section: formData.get("section") });
  revalidatePath(`/app/${context.workspace}/${context.section}`);
}

export async function transitionProductionMatch(formData: FormData) {
  const client = await rpcClient();
  const matchId = uuid.parse(formData.get("matchId"));
  const state = z.enum(["running", "paused", "completed"]).parse(formData.get("state"));
  const { error } = await client.rpc("transition_match_state", { requested_match_id: matchId, requested_state: state, requested_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function createProductionMatchDay(formData: FormData) {
  const client = await rpcClient();
  const { error } = await client.rpc("create_match_day", {
    requested_event_instance_id: uuid.parse(formData.get("eventInstanceId")),
    requested_side_size: z.coerce.number().int().min(5).max(11).parse(formData.get("sideSize")),
  });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function recordProductionMatchEvent(formData: FormData) {
  const client = await rpcClient();
  const matchId = uuid.parse(formData.get("matchId"));
  const playerId = uuid.parse(formData.get("playerId"));
  const eventType = z.enum(["goal", "assist", "save", "card", "positive-moment", "learning-moment", "injury", "note"]).parse(formData.get("eventType"));
  const { error } = await client.rpc("record_match_event", { requested_match_id: matchId, requested_event_type: eventType, requested_player_id: playerId, requested_at: new Date().toISOString(), requested_payload: {} });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function recordProductionAttendance(formData: FormData) {
  const client = await rpcClient();
  const sessionId = uuid.parse(formData.get("sessionId"));
  const playerId = uuid.parse(formData.get("playerId"));
  const status = attendanceStatus.parse(formData.get("status"));
  const occurredAt = new Date().toISOString();
  const { error } = await client.rpc("record_training_attendance", { requested_session_id: sessionId, requested_player_id: playerId, requested_status: status, requested_occurred_at: occurredAt, requested_idempotency_key: `${sessionId}:${playerId}:${occurredAt}` });
  if (error) throw new Error(error.message);
  refresh(formData);
}

const queuedAttendanceSchema = z.object({
  organisationId: uuid, sessionId: uuid, playerId: uuid.optional(), attendeeLabel: z.string().trim().min(1).max(80).optional(), status: attendanceStatus,
  occurredAt: z.iso.datetime(), idempotencyKey: z.string().min(8).max(200),
}).refine((action) => Boolean(action.playerId) !== Boolean(action.attendeeLabel), "Choose one scoped player or temporary attendee label.");

export async function syncProductionAttendanceActions(input: unknown) {
  const actions = z.array(queuedAttendanceSchema).max(250).parse(input);
  const client = await rpcClient();
  const results: { idempotencyKey: string; ok: boolean; error?: string }[] = [];
  for (const action of actions) {
    const { error } = action.playerId ? await client.rpc("record_training_attendance", {
      requested_session_id: action.sessionId, requested_player_id: action.playerId, requested_status: action.status, requested_occurred_at: action.occurredAt, requested_idempotency_key: action.idempotencyKey,
    }) : await client.rpc("record_training_guest_attendance", {
      requested_session_id: action.sessionId, requested_attendee_label: action.attendeeLabel, requested_status: action.status, requested_occurred_at: action.occurredAt, requested_idempotency_key: action.idempotencyKey,
    });
    results.push(error ? { idempotencyKey: action.idempotencyKey, ok: false, error: error.message } : { idempotencyKey: action.idempotencyKey, ok: true });
  }
  return results;
}

export async function substituteProductionPlayer(formData: FormData) {
  const client = await rpcClient();
  const { error } = await client.rpc("record_match_substitution", {
    requested_match_id: uuid.parse(formData.get("matchId")),
    outgoing_player_id: uuid.parse(formData.get("outgoingPlayerId")),
    incoming_player_id: uuid.parse(formData.get("incomingPlayerId")),
    incoming_position: z.enum(["GK","LB","CB","RB","LWB","RWB","DM","CM","AM","LW","RW","ST"]).parse(formData.get("position")),
    requested_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function rotateProductionPositions(formData: FormData) {
  const client = await rpcClient();
  const { error } = await client.rpc("rotate_match_positions", {
    requested_match_id: uuid.parse(formData.get("matchId")),
    requested_first_player_id: uuid.parse(formData.get("firstPlayerId")),
    requested_second_player_id: uuid.parse(formData.get("secondPlayerId")),
  });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function saveProductionFormation(formData: FormData) {
  const client = await rpcClient();
  const sideSize = z.coerce.number().int().min(5).max(11).parse(formData.get("sideSize"));
  const slots = Array.from({ length: sideSize }, (_, index) => ({
    playerId: uuid.parse(formData.get(`player${index}`)),
    position: z.enum(["GK","LB","CB","RB","LWB","RWB","DM","CM","AM","LW","RW","ST"]).parse(formData.get(`position${index}`)),
    sortOrder: index + 1,
  }));
  const { error } = await client.rpc("save_match_formation", {
    requested_match_id: uuid.parse(formData.get("matchId")), requested_name: z.string().trim().min(2).max(60).parse(formData.get("name")), requested_slots: slots,
  });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function correctProductionMatchEvent(formData: FormData) {
  const client = await rpcClient();
  const { error } = await client.rpc("correct_match_event", {
    requested_event_id: uuid.parse(formData.get("eventId")), requested_reason: z.string().trim().min(5).max(500).parse(formData.get("reason")), requested_patch: { void: true },
  });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function saveProductionMatchReflection(formData: FormData) {
  const client = await rpcClient();
  const { error } = await client.rpc("save_match_reflection_and_summary", {
    requested_match_id: uuid.parse(formData.get("matchId")),
    requested_private_reflection: z.string().trim().min(2).max(4000).parse(formData.get("privateReflection")),
    requested_parent_summary: z.string().trim().min(2).max(1200).parse(formData.get("parentSummary")),
  });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function recordProductionPlayingTimeCorrection(formData: FormData) {
  const client = await rpcClient();
  const { error } = await client.rpc("record_playing_time_correction", { requested_match_id: uuid.parse(formData.get("matchId")), requested_player_id: uuid.parse(formData.get("playerId")), requested_adjustment_minutes: z.coerce.number().min(-240).max(240).parse(formData.get("adjustmentMinutes")), requested_reason: z.string().trim().min(5).max(500).parse(formData.get("reason")) });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function createProductionDrill(formData: FormData) {
  const client = await rpcClient();
  const optionalNumber = (name: string) => { const value = formData.get(name); return value ? z.coerce.number().int().parse(value) : null; };
  const { error } = await client.rpc("create_coaching_drill", {
    requested_organisation_id: uuid.parse(formData.get("organisationId")),
    requested_title: z.string().trim().min(2).max(120).parse(formData.get("title")),
    requested_objective: z.string().trim().min(2).max(500).parse(formData.get("objective")),
    requested_instructions: z.string().trim().min(2).max(4000).parse(formData.get("instructions")),
    requested_duration_minutes: z.coerce.number().int().min(1).max(180).parse(formData.get("durationMinutes")),
    requested_minimum_players: z.coerce.number().int().min(1).max(40).parse(formData.get("minimumPlayers")),
    requested_maximum_players: optionalNumber("maximumPlayers"), requested_minimum_age: optionalNumber("minimumAge"), requested_maximum_age: optionalNumber("maximumAge"),
    requested_equipment: z.string().max(500).parse(formData.get("equipment") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    requested_area_description: z.string().max(240).parse(formData.get("area") ?? ""), requested_difficulty: z.enum(["beginner","developing","challenging","adaptable"]).parse(formData.get("difficulty")),
    requested_adaptations: z.string().max(1200).parse(formData.get("adaptations") ?? ""), requested_diagram_url: z.string().max(500).parse(formData.get("diagramUrl") ?? ""),
    requested_visibility: z.enum(["organisation","private"]).parse(formData.get("visibility")),
  });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function saveProductionTrainingPlan(formData: FormData) {
  const client = await rpcClient();
  const itemSchema = z.object({ kind: z.enum(["segment","drill"]), title: z.string().max(120).optional(), drillId: uuid.optional(), durationMinutes: z.number().int().min(1).max(180), participantFocus: z.string().max(240), equipment: z.array(z.string().max(80)).max(30), area: z.string().max(500), setup: z.string().max(2000), diagramUrl: z.union([z.literal(""), z.url().startsWith("https://")]), instructions: z.string().max(4000), coachingPoints: z.string().max(2000), progression: z.string().max(2000), regression: z.string().max(2000), safety: z.string().max(2000), inclusion: z.string().max(2000), goalkeeper: z.string().max(2000), notes: z.string().max(2000), key: z.string().max(100).optional() }).superRefine((item, context) => { if (item.kind === "segment" && (!item.title || item.title.trim().length < 2)) context.addIssue({ code: "custom", message: "Segment title required" }); if (item.kind === "drill" && !item.drillId) context.addIssue({ code: "custom", message: "Drill required" }); });
  const items = z.array(itemSchema).min(1).max(40).parse(JSON.parse(z.string().max(100_000).parse(formData.get("itemsJson"))));
  const common = { requested_title: z.string().trim().min(2).max(120).parse(formData.get("title")), requested_duration_minutes: z.coerce.number().int().min(10).max(240).parse(formData.get("durationMinutes")), requested_items: items };
  const sessionId = formData.get("sessionId");
  const { error } = sessionId ? await client.rpc("replace_training_plan", { requested_session_id: uuid.parse(sessionId), ...common }) : await client.rpc("save_training_plan", { requested_event_instance_id: uuid.parse(formData.get("eventInstanceId")), ...common });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function moveProductionTrainingItem(formData: FormData) {
  const client = await rpcClient();
  const { error } = await client.rpc("move_training_plan_item", {
    requested_session_id: uuid.parse(formData.get("sessionId")), requested_item_id: uuid.parse(formData.get("itemId")),
    requested_item_kind: z.enum(["segment","drill"]).parse(formData.get("itemKind")), requested_direction: z.enum(["up","down"]).parse(formData.get("direction")),
  });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function createProductionTrainingTemplate(formData: FormData) {
  const client = await rpcClient();
  const { error } = await client.rpc("create_training_template_from_session", { requested_session_id: uuid.parse(formData.get("sessionId")), requested_title: z.string().trim().min(2).max(120).parse(formData.get("templateTitle")) });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function recordProductionObservation(formData: FormData) {
  const client = await rpcClient();
  const text = (name: string, max = 1200) => z.string().trim().max(max).parse(formData.get(name) ?? "");
  const followUp = formData.get("followUpDate");
  const { error } = await client.rpc("record_coach_observation", { requested_team_id: uuid.parse(formData.get("teamId")), requested_player_id: uuid.parse(formData.get("playerId")), requested_observation: z.string().trim().min(2).max(4000).parse(formData.get("observation")), requested_context: text("context"), requested_strength: text("strength"), requested_emerging_skill: text("emergingSkill"), requested_opportunity: text("opportunity"), requested_confidence_engagement: text("confidenceEngagement"), requested_position_code: text("position",80), requested_next_action: text("nextAction"), requested_training_theme: text("trainingTheme",240), requested_visibility: z.enum(["private","coaching-staff"]).parse(formData.get("visibility")), requested_follow_up_date: followUp ? z.iso.date().parse(followUp) : null });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function createProductionDevelopmentObjective(formData: FormData) {
  const client = await rpcClient();
  const rawDate = formData.get("targetDate");
  const { error } = await client.rpc("create_development_objective", {
    requested_team_id: uuid.parse(formData.get("teamId")), requested_player_id: uuid.parse(formData.get("playerId")),
    requested_title: z.string().trim().min(2).max(160).parse(formData.get("title")), requested_target_date: rawDate ? z.iso.date().parse(rawDate) : null,
  });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function createProductionDevelopmentReview(formData: FormData) {
  const client = await rpcClient();
  const { error } = await client.rpc("create_development_review", {
    requested_team_id: uuid.parse(formData.get("teamId")), requested_player_id: uuid.parse(formData.get("playerId")),
    requested_private_review: z.string().trim().min(2).max(4000).parse(formData.get("privateReview")),
  });
  if (error) throw new Error(error.message);
  refresh(formData);
}

export async function approveProductionDevelopmentSummary(formData: FormData) {
  const client = await rpcClient();
  const list = (name: string) => z.string().max(1200).parse(formData.get(name) ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const { error } = await client.rpc("approve_development_summary", { requested_review_id: uuid.parse(formData.get("reviewId")), requested_summary: z.string().trim().min(2).max(1200).parse(formData.get("summary")), requested_current_themes: list("currentThemes"), requested_suggested_activities: list("suggestedActivities"), requested_term_review: z.string().trim().max(1200).parse(formData.get("termReview") ?? ""), requested_attendance_summary: z.string().trim().max(500).parse(formData.get("attendanceSummary") ?? "") });
  if (error) throw new Error(error.message);
  refresh(formData);
}
