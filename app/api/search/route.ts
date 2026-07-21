import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createSupabaseTenancyAccessReader, resolveProductionWorkspaceAccess } from "@/features/tenancy/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 80) ?? "";
  const workspace = url.searchParams.get("workspace")?.trim() ?? "";
  if (query.length < 2 || !workspace) return NextResponse.json({ results: [] });
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ results: [] }, { status: 401 });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ results: [] }, { status: 401 });
  const access = await resolveProductionWorkspaceAccess(createSupabaseTenancyAccessReader(client), workspace, auth.user.id);
  if (access.status === "denied") return NextResponse.json({ results: [] }, { status: 403 });
  const db = client as unknown as SupabaseClient;
  const searches: Array<Promise<{ data: unknown[] | null; section: string }>> = [];
  if (access.capabilities.includes("documents:manage")) searches.push((async () => { const { data } = await db.from("club_documents").select("id,title").eq("organisation_id", access.organisationId).ilike("title", `%${query}%`).limit(5); return { data, section: "documents" }; })());
  if (access.capabilities.includes("venues:manage")) searches.push((async () => { const { data } = await db.from("venues").select("id,name").eq("organisation_id", access.organisationId).ilike("name", `%${query}%`).limit(5); return { data, section: "venues" }; })());
  if (access.capabilities.includes("equipment:manage")) searches.push((async () => { const { data } = await db.from("equipment_items").select("id,name").eq("organisation_id", access.organisationId).ilike("name", `%${query}%`).limit(5); return { data, section: "equipment" }; })());
  const resolved = await Promise.all(searches);
  const results = resolved.flatMap((response) => (response.data ?? []).map((raw) => {
    const row = raw as { id: string; title?: string; name?: string };
    return { id: row.id, title: row.title ?? row.name ?? "Record", detail: response.section, section: response.section };
  }));
  return NextResponse.json({ results });
}
