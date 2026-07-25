import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createQuarantinedUpload } from "@/lib/files/upload-boundary";
import { assertSameOriginMutation } from "@/lib/security/request";
import { reportOperationalError } from "@/lib/observability/health";
import { consumeDistributedRateLimit, distributedRateLimitHeaders } from "@/lib/security/server-rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseTenancyAccessReader, resolveProductionWorkspaceAccess } from "@/features/tenancy/service";

export async function POST(request: Request) {
  try { assertSameOriginMutation(request); } catch { return NextResponse.json({ error: "Request origin rejected." }, { status: 403 }); }
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Private upload storage is unavailable." }, { status: 503 });
  let limit;
  try { limit = await consumeDistributedRateLimit(admin as unknown as SupabaseClient, `upload-intent:${auth.user.id}`, { limit: 20, windowSeconds: 60 }); }
  catch { return NextResponse.json({ error: "Request protection is temporarily unavailable." }, { status: 503 }); }
  if (!limit.allowed) return NextResponse.json({ error: "Too many upload requests. Try again shortly." }, { status: 429, headers: distributedRateLimitHeaders(limit, 20) });
  let body: { workspace?: string; filename?: string; declaredMime?: string; size?: number };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: "A JSON upload description is required." }, { status: 400 }); }
  if (!body.workspace) return NextResponse.json({ error: "A club workspace is required." }, { status: 400 });
  const access = await resolveProductionWorkspaceAccess(createSupabaseTenancyAccessReader(client), body.workspace, auth.user.id);
  if (access.status === "denied" || !access.capabilities.includes("documents:manage")) return NextResponse.json({ error: "Document upload access denied." }, { status: 403 });
  try {
    const intent = createQuarantinedUpload({
      organisationId: access.organisationId,
      actorId: access.membershipId,
      filename: body.filename ?? "",
      declaredMime: body.declaredMime ?? "",
      size: body.size ?? 0,
    });
    const db = client as unknown as SupabaseClient;
    const { data: created, error } = await db.rpc("create_private_upload_intent", {
      requested_organisation_id: intent.organisationId,
      requested_storage_path: intent.storagePath,
      requested_original_filename: intent.originalFilename,
      requested_declared_mime: intent.declaredMime,
      requested_declared_size: intent.size,
    });
    const record = ((created ?? []) as Array<{ intent_id: string; expires_at: string }>)[0];
    if (error || !record) throw new Error("intent-persistence-failed");
    const { data: signed, error: signError } = await admin.storage.from("grassroots-private-quarantine").createSignedUploadUrl(intent.storagePath);
    if (signError || !signed?.signedUrl || !signed.token) throw new Error("signed-upload-failed");
    return NextResponse.json({
      intentId: record.intent_id,
      expiresAt: record.expires_at,
      signedUrl: signed.signedUrl,
      signedToken: signed.token,
      status: "awaiting-upload",
      next: `/api/uploads/${record.intent_id}/finalise`,
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const errorRef = reportOperationalError(error, "upload.intent.failed");
    return NextResponse.json({ error: "The upload could not be prepared.", errorRef }, { status: 400 });
  }
}
