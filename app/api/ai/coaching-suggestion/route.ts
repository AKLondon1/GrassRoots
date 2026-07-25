import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertProviderSafeInput, buildCoachingSuggestionRequest, parseCoachingSuggestion, sanitizeCoachingContext } from "@/features/coaching/ai/provider";
import { environment } from "@/lib/env";
import { assertSameOriginMutation } from "@/lib/security/request";
import { consumeDistributedRateLimit, distributedRateLimitHeaders } from "@/lib/security/server-rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function extractProviderResult(payload: Record<string, unknown>) {
  let refusal: string | undefined;
  let outputText = typeof payload.output_text === "string" ? payload.output_text : undefined;
  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const value = part as { type?: string; text?: string; refusal?: string };
        if (value.type === "refusal" && value.refusal) refusal = value.refusal;
        if (value.type === "output_text" && value.text) outputText = value.text;
      }
    }
  }
  return { status: typeof payload.status === "string" ? payload.status : undefined, refusal, output_text: outputText };
}

export async function POST(request: Request) {
  try { assertSameOriginMutation(request); } catch { return NextResponse.json({ status: "forbidden" }, { status: 403 }); }
  if (!environment.server.OPENAI_COACHING_ENABLED) {
    return NextResponse.json({ status: "disabled", message: "Coaching suggestions are disabled until the club privacy gate is approved." }, { status: 503 });
  }
  if (!environment.server.OPENAI_API_KEY || !environment.server.SUPABASE_SERVICE_ROLE_KEY || !environment.public.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ status: "unconfigured", message: "Server-side AI and audit credentials are not fully configured." }, { status: 503 });
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ status: "unauthorised" }, { status: 401 });
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ status: "unauthorised" }, { status: 401 });
  const actorUserId = authData.user.id;
  const rateAdmin = createSupabaseAdminClient();
  if (!rateAdmin) return NextResponse.json({ status: "unavailable", message: "Request protection is temporarily unavailable." }, { status: 503 });
  let limit;
  try { limit = await consumeDistributedRateLimit(rateAdmin as unknown as SupabaseClient, `coaching-ai:${actorUserId}`, { limit: 10, windowSeconds: 60 }); }
  catch { return NextResponse.json({ status: "unavailable", message: "Request protection is temporarily unavailable." }, { status: 503 }); }
  if (!limit.allowed) return NextResponse.json({ status: "limited", message: "Too many suggestions were requested. Try again shortly." }, { status: 429, headers: distributedRateLimitHeaders(limit, 10) });
  let raw: Record<string, unknown>;
  try {
    raw = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ status: "invalid", message: "A JSON request is required." }, { status: 400 });
  }
  if (typeof raw.organisationId !== "string" || typeof raw.teamId !== "string") {
    return NextResponse.json({ status: "invalid", message: "Organisation, team and objective scope are required." }, { status: 400 });
  }
  if (typeof raw.objectiveId !== "string" || Object.keys(raw).some((key) => !["organisationId", "teamId", "objectiveId"].includes(key))) {
    return NextResponse.json({ status: "invalid", message: "Only canonical coaching record identifiers are accepted." }, { status: 400 });
  }
  const coachingRpc = supabase as unknown as {
    rpc(name: "get_coaching_ai_safe_context", args: { requested_organisation_id: string; requested_team_id: string; requested_objective_id: string }): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  const { data: safeData, error: contextError } = await coachingRpc.rpc("get_coaching_ai_safe_context", {
    requested_organisation_id: raw.organisationId,
    requested_team_id: raw.teamId,
    requested_objective_id: raw.objectiveId,
  });
  if (contextError || !safeData || typeof safeData !== "object" || Array.isArray(safeData)) return NextResponse.json({ status: "forbidden" }, { status: 403 });
  let context;
  try {
    const canonical = safeData as Record<string, unknown>;
    assertProviderSafeInput(canonical);
    context = sanitizeCoachingContext(canonical);
  } catch {
    return NextResponse.json({ status: "failed", message: "Canonical coaching context did not pass the provider privacy gate." }, { status: 422 });
  }
  const requestHash = createHash("sha256").update(JSON.stringify(context)).digest("hex");
  const auditClient = createClient(environment.public.NEXT_PUBLIC_SUPABASE_URL, environment.server.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as {
    rpc(name: "record_coaching_ai_run", args: {
      requested_actor_user_id: string; requested_organisation_id: string; requested_team_id: string; requested_purpose: string; requested_model: string;
      requested_prompt_version: string; requested_schema_version: string; requested_request_hash: string; requested_provider_status: string;
      requested_input_tokens: number | null; requested_output_tokens: number | null; requested_estimated_cost_gbp: number | null;
    }): PromiseLike<{ data: string | null; error: { message: string } | null }>;
  };
  async function audit(providerStatus: "ready" | "refused" | "unparsed" | "failed", usage: Record<string, unknown> = {}) {
    const inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : null;
    const outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : null;
    return auditClient.rpc("record_coaching_ai_run", {
      requested_actor_user_id: actorUserId,
      requested_organisation_id: raw.organisationId as string,
      requested_team_id: raw.teamId as string,
      requested_purpose: "development-summary-draft",
      requested_model: environment.server.OPENAI_MODEL,
      requested_prompt_version: "coaching-positive-v1",
      requested_schema_version: "coaching-suggestion-v1",
      requested_request_hash: requestHash,
      requested_provider_status: providerStatus,
      requested_input_tokens: inputTokens,
      requested_output_tokens: outputTokens,
      requested_estimated_cost_gbp: null,
    });
  }
  const providerRequest = buildCoachingSuggestionRequest({ model: environment.server.OPENAI_MODEL, context });
  let providerResponse: Response;
  try {
    providerResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${environment.server.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(providerRequest),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    await audit("failed");
    return NextResponse.json({ status: "failed", message: "The suggestion provider could not be reached." }, { status: 502 });
  }
  let payload: Record<string, unknown> = {};
  try { payload = await providerResponse.json() as Record<string, unknown>; } catch { /* Provider errors may be non-JSON. */ }
  if (!providerResponse.ok) {
    await audit("failed");
    return NextResponse.json({ status: "failed", message: "The suggestion provider was unavailable." }, { status: 502 });
  }
  const result = parseCoachingSuggestion(extractProviderResult(payload));
  const usage = payload.usage && typeof payload.usage === "object" && !Array.isArray(payload.usage) ? payload.usage as Record<string, unknown> : {};
  const { data: auditId, error: auditError } = await audit(result.status, usage);
  if (auditError || !auditId) return NextResponse.json({ status: "failed", message: "The provider result could not be audited and was discarded." }, { status: 502 });
  return NextResponse.json({
    ...result,
    needsHumanReview: result.status === "ready",
    persistence: "metadata-only",
    metadata: {
      model: environment.server.OPENAI_MODEL,
      promptVersion: "coaching-positive-v1",
      schemaVersion: "coaching-suggestion-v1",
      requestHash,
      auditId,
      usage,
      estimatedCostGbp: null,
      costNote: "Pricing is not configured; provider token usage is retained for audited calculation.",
      store: false,
    },
  });
}
