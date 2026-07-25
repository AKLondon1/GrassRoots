import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { verifyStripeWebhookSignature } from "@/features/finance/service";
import { environment } from "@/lib/env";
import { assertSameOriginMutation, trustedClientIdentifier } from "@/lib/security/request";
import { consumeDistributedRateLimit, distributedRateLimitHeaders } from "@/lib/security/server-rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

interface StripeEventFixture {
  id?: string;
  type?: string;
  account?: string;
  data?: { object?: { amount_received?: number; currency?: string; metadata?: { organisationId?: string; invoiceId?: string } } };
}
export async function POST(request: Request) {
  assertSameOriginMutation(request, { trustedNonBrowser: true });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Webhook persistence is unavailable." }, { status: 503 });
  const source = trustedClientIdentifier(request.headers);
  let limit;
  try { limit = await consumeDistributedRateLimit(admin as unknown as SupabaseClient, `stripe-webhook:${source}`, { limit: 120, windowSeconds: 60 }); }
  catch { return NextResponse.json({ error: "Request protection is temporarily unavailable." }, { status: 503 }); }
  if (!limit.allowed) return NextResponse.json({ error: "Webhook rate limit exceeded." }, { status: 429, headers: distributedRateLimitHeaders(limit, 120) });
  const secret = environment.server.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  const maximumBytes = 1_048_576;
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  const raw = await request.arrayBuffer();
  if (raw.byteLength > maximumBytes) return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  let body: string;
  try { body = new TextDecoder("utf-8", { fatal: true }).decode(raw); }
  catch { return NextResponse.json({ error: "Webhook payload must be UTF-8 JSON." }, { status: 400 }); }
  try {
    verifyStripeWebhookSignature(body, signature, secret, Math.floor(Date.now() / 1000));
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }
  let event: StripeEventFixture;
  try { event = JSON.parse(body) as StripeEventFixture; } catch { return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 }); }
  const organisationId = event.data?.object?.metadata?.organisationId;
  if (!event.id || !event.type || !event.account || !organisationId) return NextResponse.json({ error: "Webhook metadata is incomplete." }, { status: 422 });
  const db = admin as unknown as SupabaseClient;
  if (event.type === "payment_intent.succeeded" && event.data?.object?.currency?.toLowerCase() !== "gbp") return NextResponse.json({ error: "Only GBP payment events are accepted." }, { status: 422 });
  const { data: connectedAccount, error: accountError } = await db.from("stripe_connected_accounts").select("id").eq("organisation_id", organisationId).eq("stripe_account_id", event.account).is("disconnected_at", null).maybeSingle();
  if (accountError || !connectedAccount) return NextResponse.json({ error: "Webhook account does not match this organisation." }, { status: 422 });
  const { data, error } = await db.rpc("process_stripe_webhook_event", {
    requested_event_id: event.id,
    requested_event_type: event.type,
    requested_organisation_id: organisationId,
    requested_payload_sha256: createHash("sha256").update(body).digest("hex"),
    requested_invoice_id: event.data?.object?.metadata?.invoiceId ?? null,
    requested_amount_pence: event.data?.object?.amount_received ?? null,
    requested_currency: event.data?.object?.currency ?? null,
  });
  if (error) return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  if (data === false) {
    const { data: receipt } = await db.from("stripe_webhook_events").select("processing_status").eq("stripe_event_id", event.id).maybeSingle();
    if (receipt?.processing_status === "failed") return NextResponse.json({ error: "Webhook settlement failed and is safe to retry." }, { status: 500 });
  }
  return NextResponse.json({ received: true, duplicate: data === false });
}
