import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { validateUploadedFile } from "@/lib/files/upload-boundary";
import { assertSameOriginMutation } from "@/lib/security/request";
import { reportOperationalError } from "@/lib/observability/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { consumeDistributedRateLimit, distributedRateLimitHeaders } from "@/lib/security/server-rate-limit";

export async function POST(request: Request, context: { params: Promise<{ intentId: string }> }) {
  try { assertSameOriginMutation(request); } catch { return NextResponse.json({ error: "Request origin rejected." }, { status: 403 }); }
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Private upload storage is unavailable." }, { status: 503 });
  let limit;
  try { limit = await consumeDistributedRateLimit(admin as unknown as SupabaseClient, `upload-finalise:${auth.user.id}`, { limit: 20, windowSeconds: 60 }); }
  catch { return NextResponse.json({ error: "Request protection is temporarily unavailable." }, { status: 503 }); }
  if (!limit.allowed) return NextResponse.json({ error: "Too many upload finalisation requests." }, { status: 429, headers: distributedRateLimitHeaders(limit, 20) });
  const { intentId } = await context.params;
  const db = client as unknown as SupabaseClient;
  const { data: intent, error } = await db.from("private_upload_intents").select("id,storage_path,declared_mime,declared_size,status,expires_at").eq("id", intentId).single();
  if (error || !intent || intent.status !== "awaiting-upload" || new Date(intent.expires_at) <= new Date()) return NextResponse.json({ error: "This upload is unavailable or expired." }, { status: 404 });
  const { data: object, error: downloadError } = await admin.storage.from("grassroots-private-quarantine").download(String(intent.storage_path));
  if (downloadError || !object) return NextResponse.json({ error: "The quarantined file is unavailable." }, { status: 404 });
  try {
    const bytes = new Uint8Array(await object.arrayBuffer());
    validateUploadedFile({ bytes, declaredMime: String(intent.declared_mime), size: bytes.byteLength });
    if (bytes.byteLength !== Number(intent.declared_size)) throw new Error("The uploaded size does not match the signed intent.");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const { data: transitioned, error: updateError } = await (admin as unknown as SupabaseClient).rpc("mark_private_upload_quarantined", { requested_intent_id: intentId, requested_checksum_sha256: checksum });
    if (updateError || transitioned !== true) throw new Error("quarantine-update-failed");
    return NextResponse.json({
      status: "quarantined",
      message: "The file passed type checks and remains private until malware scanning approves it.",
    }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const [{ data: rejected, error: rejectionError }, { error: removalError }] = await Promise.all([
      (admin as unknown as SupabaseClient).rpc("reject_private_upload_intent", { requested_intent_id: intentId, requested_reason: "validation-rejected" }),
      admin.storage.from("grassroots-private-quarantine").remove([String(intent.storage_path)]),
    ]);
    if (rejectionError || rejected !== true) return NextResponse.json({ error: "The invalid upload could not be placed in a terminal state.", errorRef: reportOperationalError(rejectionError ?? new Error("upload-rejection-transition-failed"), "upload.rejection.failed") }, { status: 500 });
    if (removalError) reportOperationalError(removalError, "upload.quarantine-removal.failed");
    return NextResponse.json({ error: "The uploaded file failed validation.", errorRef: reportOperationalError(error, "upload.validation.failed") }, { status: 422 });
  }
}
