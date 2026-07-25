import { createCipheriv, createHash, randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseTenancyAccessReader, resolveProductionWorkspaceAccess } from "@/features/tenancy/service";
import { environment } from "@/lib/env";
import { assertSameOriginMutation } from "@/lib/security/request";
import { consumeDistributedRateLimit } from "@/lib/security/server-rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const subscriptionSchema = z.object({ endpoint: z.url(), expirationTime: z.number().nullable().optional(), keys: z.object({ p256dh: z.string().min(20), auth: z.string().min(8) }) });
const schema = z.object({ workspace: z.string().min(1).max(120), subscription: subscriptionSchema });

function encryptSubscription(subscription: z.infer<typeof subscriptionSchema>) {
  const secret = environment.server.PUSH_SUBSCRIPTION_ENCRYPTION_KEY;
  if (!secret) throw new Error("push-encryption-unconfigured");
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(subscription), "utf8"), cipher.final()]);
  return { version: 1, algorithm: "aes-256-gcm", iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
}

async function context(request: Request) {
  try { assertSameOriginMutation(request); } catch { return { error: NextResponse.json({ error: "Request origin rejected." }, { status: 403 }) }; }
  const client = await createServerSupabaseClient();
  if (!client) return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  let input: z.infer<typeof schema>;
  try { input = schema.parse(await request.json()); } catch { return { error: NextResponse.json({ error: "A valid browser push subscription is required." }, { status: 400 }) }; }
  const access = await resolveProductionWorkspaceAccess(createSupabaseTenancyAccessReader(client), input.workspace, auth.user.id);
  if (access.status === "denied") return { error: NextResponse.json({ error: "Organisation access denied." }, { status: 403 }) };
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: NextResponse.json({ error: "Push registration is unavailable." }, { status: 503 }) };
  try {
    const limit = await consumeDistributedRateLimit(admin as unknown as SupabaseClient, `push-subscription:${access.membershipId}`, { limit: 10, windowSeconds: 900 });
    if (!limit.allowed) return { error: NextResponse.json({ error: "Too many push changes. Try again later." }, { status: 429 }) };
  } catch { return { error: NextResponse.json({ error: "Request protection is temporarily unavailable." }, { status: 503 }) }; }
  return { client: client as unknown as SupabaseClient, access, input };
}

async function notifyProvider(operation: "subscribe" | "unsubscribe", membershipId: string, subscription: z.infer<typeof subscriptionSchema>) {
  if (!environment.server.PUSH_PROVIDER_URL || !environment.server.PUSH_PROVIDER_TOKEN) throw new Error("push-provider-unconfigured");
  const response = await fetch(environment.server.PUSH_PROVIDER_URL, { method: "POST", headers: { Authorization: `Bearer ${environment.server.PUSH_PROVIDER_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ operation, recipientMembershipId: membershipId, subscription }), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`push-provider-${response.status}`);
}

export async function POST(request: Request) {
  const resolved = await context(request);
  if ("error" in resolved) return resolved.error;
  try {
    await notifyProvider("subscribe", resolved.access.membershipId, resolved.input.subscription);
    const endpointHash = createHash("sha256").update(resolved.input.subscription.endpoint).digest("hex");
    const { error } = await resolved.client.from("push_subscriptions").upsert({ organisation_id: resolved.access.organisationId, membership_id: resolved.access.membershipId, endpoint_hash: endpointHash, encrypted_subscription: encryptSubscription(resolved.input.subscription), revoked_at: null }, { onConflict: "organisation_id,endpoint_hash" });
    if (error) throw new Error("push-subscription-save-failed");
    return NextResponse.json({ subscribed: true }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Browser push could not be enabled." }, { status: 503 }); }
}

export async function DELETE(request: Request) {
  const resolved = await context(request);
  if ("error" in resolved) return resolved.error;
  try {
    await notifyProvider("unsubscribe", resolved.access.membershipId, resolved.input.subscription);
    const endpointHash = createHash("sha256").update(resolved.input.subscription.endpoint).digest("hex");
    const { error } = await resolved.client.from("push_subscriptions").update({ revoked_at: new Date().toISOString() }).eq("organisation_id", resolved.access.organisationId).eq("membership_id", resolved.access.membershipId).eq("endpoint_hash", endpointHash);
    if (error) throw new Error("push-subscription-revoke-failed");
    return NextResponse.json({ subscribed: false }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Browser push could not be disabled." }, { status: 503 }); }
}
