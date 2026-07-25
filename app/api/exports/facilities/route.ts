import type { SupabaseClient } from "@supabase/supabase-js";

import { createPersistedExport } from "@/features/operations/exports";
import { createSupabaseExportAuditWriter } from "@/features/operations/supabase-export-writer";
import { createSupabaseTenancyAccessReader, resolveProductionWorkspaceAccess } from "@/features/tenancy/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspace = url.searchParams.get("workspace") ?? "";
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const client = await createServerSupabaseClient();
  if (!client) return new Response("Sign in required", { status: 401 });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return new Response("Sign in required", { status: 401 });
  const access = await resolveProductionWorkspaceAccess(createSupabaseTenancyAccessReader(client), workspace, auth.user.id);
  if (access.status === "denied" || !access.capabilities.includes("reports:view")) return new Response("Report access denied", { status: 403 });
  const db = client as unknown as SupabaseClient;
  const { data: organisation } = await db.from("organisations").select("name").eq("id", access.organisationId).single();
  const bookings: Array<Record<string, unknown> & { id: string }> = [];
  let cursor: string | undefined;
  do {
    let query = db
      .from("facility_bookings")
      .select("id,title,starts_at,ends_at,status,reservation_unit_id")
      .eq("organisation_id", access.organisationId)
      .order("id")
      .limit(500);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) return new Response("Could not prepare facilities report", { status: 500 });
    const page = (data ?? []) as Array<Record<string, unknown> & { id: string }>;
    bookings.push(...page);
    cursor = page.length === 500 ? page.at(-1)?.id : undefined;
  } while (cursor);
  const exportResult = await createPersistedExport({
    organisationId: access.organisationId,
    organisationName: String(organisation?.name ?? "Organisation"),
    actorMembershipId: access.membershipId,
    capability: "reports:view",
    format,
    title: "Facility bookings",
    rows: bookings,
    now: new Date().toISOString(),
  }, createSupabaseExportAuditWriter(db));
  const extension = format === "pdf" ? "pdf" : "csv";
  return new Response(exportResult.content, {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="grassroots-facilities-${format === "pdf" ? "summary" : "bookings"}.${extension}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
