import { createHash, randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

import { environment } from "@/lib/env";
import { assertSameOriginMutation } from "@/lib/security/request";
import { consumeDistributedRateLimit } from "@/lib/security/server-rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseTenancyAccessReader, resolveProductionWorkspaceAccess } from "@/features/tenancy/service";

const schema = z.object({ workspace: z.string().min(1).max(120), eventInstanceId: z.uuid(), guardianId: z.uuid(), playerId: z.uuid() });

export async function POST(request: Request) {
  try { assertSameOriginMutation(request); } catch { return NextResponse.json({ error: "Request origin rejected." }, { status: 403 }); }
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  let input: z.infer<typeof schema>;
  try { input = schema.parse(await request.json()); } catch { return NextResponse.json({ error: "A valid linked event response scope is required." }, { status: 400 }); }
  const access = await resolveProductionWorkspaceAccess(createSupabaseTenancyAccessReader(client), input.workspace, auth.user.id);
  if (access.status === "denied" || !access.capabilities.includes("availability:manage")) return NextResponse.json({ error: "Availability management access denied." }, { status: 403 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "One-time link storage is unavailable." }, { status: 503 });
  try {
    const limit = await consumeDistributedRateLimit(admin as unknown as SupabaseClient, `availability-magic:${access.membershipId}`, { limit: 20, windowSeconds: 900 });
    if (!limit.allowed) return NextResponse.json({ error: "Too many links were requested. Try again later." }, { status: 429 });
  } catch { return NextResponse.json({ error: "Request protection is temporarily unavailable." }, { status: 503 }); }
  const rawToken = randomBytes(32).toString("base64url");
  const digest = createHash("sha256").update(rawToken).digest("hex");
  const { error } = await (admin as unknown as SupabaseClient).rpc("issue_magic_availability_token", { requested_organisation_id: access.organisationId, requested_event_instance_id: input.eventInstanceId, requested_guardian_id: input.guardianId, requested_player_id: input.playerId, requested_token_digest: digest, requested_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1_000).toISOString() });
  if (error) return NextResponse.json({ error: "This response link scope is no longer available." }, { status: 422 });
  const origin = environment.server.APP_ORIGIN ?? new URL(request.url).origin;
  return NextResponse.json({ link: new URL(`/respond/${rawToken}`, origin).toString(), expiresInHours: 48 }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
