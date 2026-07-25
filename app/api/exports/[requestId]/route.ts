import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const privateHeaders = { "Cache-Control": "private, no-store", Pragma: "no-cache", "X-Robots-Tag": "noindex" };

export async function GET(_request: Request, context: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await context.params;
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ error: "Sign in to download an export." }, { status: 401, headers: privateHeaders });
  const db = client as unknown as SupabaseClient;
  const [{ data, error }, { data: auth }] = await Promise.all([db.from("data_export_requests").select("storage_path,status,expires_at,scope,subject_user_id").eq("id", requestId).single(), db.auth.getUser()]);
  if (data?.scope === "account" && data.subject_user_id !== auth.user?.id) return NextResponse.json({ error: "This account export belongs to another user." }, { status: 403, headers: privateHeaders });
  if (error || !data || data.status !== "ready" || !data.storage_path || !data.expires_at || new Date(data.expires_at) <= new Date()) return NextResponse.json({ error: "This export is unavailable or expired." }, { status: 404, headers: privateHeaders });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Export storage is unavailable." }, { status: 503, headers: privateHeaders });
  const { data: signed, error: signedError } = await admin.storage.from("grassroots-private-exports").createSignedUrl(String(data.storage_path), 60, { download: true });
  if (signedError || !signed?.signedUrl) return NextResponse.json({ error: "A private download link could not be created." }, { status: 500, headers: privateHeaders });
  return NextResponse.redirect(signed.signedUrl, { headers: privateHeaders });
}
