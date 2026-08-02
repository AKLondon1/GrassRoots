import type { SupabaseClient } from "@supabase/supabase-js";

import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import { MagicLinkIssuer, type MagicLinkScope } from "@/components/availability/magic-link-issuer";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const panel = "rounded-2xl border border-border-strong bg-background p-5 sm:p-7";

export async function ProductionCoachCoreOverview({ organisationId, section, workspace }: { organisationId: string; section: string; workspace: string }) {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("The organisation connection is unavailable.");
  const db = client as unknown as SupabaseClient;
  if (section === "team") {
    const { data, error } = await db.from("teams").select("id,name,status,seasons(name),age_groups(name)").eq("organisation_id", organisationId).order("name").limit(100);
    if (error) throw new Error("We could not load your scoped teams.");
    return <Rows title="Your scoped teams" rows={(data ?? []) as Array<Record<string, unknown>>}/>;
  }
  if (section === "squad") {
    const { data, error } = await db.from("squads").select("id,status,published_at,event_instances(starts_at,events(title)),squad_members(id,status,players(first_name,last_name))").eq("organisation_id", organisationId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error("We could not load squad records.");
    return <Rows title="Live squad records" rows={(data ?? []) as Array<Record<string, unknown>>}/>;
  }
  const now = new Date().toISOString();
  const { data, error } = await db.from("event_instances").select("id,team_id,starts_at,ends_at,response_deadline,location_name,status,events(title,kind,teams(name))").eq("organisation_id", organisationId).gte("ends_at", now).neq("status", "cancelled").order("starts_at").limit(50);
  if (error) throw new Error("We could not load upcoming team events.");
  const events = (data ?? []) as Array<Record<string, unknown> & { id: string }>;
  if (section === "availability") {
    const scopes = (await Promise.all(events.slice(0, 20).map(async (event) => {
      const { data: rows, error: scopeError } = await db.rpc("list_magic_availability_scopes", { requested_organisation_id: organisationId, requested_event_instance_id: event.id });
      if (scopeError) throw new Error("We could not load availability recipients.");
      return ((rows ?? []) as Array<{ event_instance_id: string; guardian_id: string; player_id: string; guardian_name: string; player_name: string; event_title: string }>).map((row): MagicLinkScope => ({ eventInstanceId: row.event_instance_id, guardianId: row.guardian_id, playerId: row.player_id, label: `${row.event_title} · ${row.player_name} · ${row.guardian_name}` }));
    }))).flat();
    const eventIds = events.map(({ id }) => id);
    const { data: responses, error: responseError } = eventIds.length ? await db.from("availability_responses").select("id,event_instance_id,status,responded_at,players(first_name,last_name)").eq("organisation_id", organisationId).in("event_instance_id", eventIds).order("responded_at", { ascending: false }).limit(500) : { data: [], error: null };
    if (responseError) throw new Error("We could not load availability responses.");
    return <div className="space-y-5"><MagicLinkIssuer scopes={scopes} workspace={workspace}/><Rows title="Current availability responses" rows={(responses ?? []) as Array<Record<string, unknown>>}/></div>;
  }
  const labels: Record<string, string> = { today: "Today and upcoming", calendar: "Team calendar", "event-editor": "Canonical event records" };
  return <Rows title={labels[section] ?? "Upcoming team events"} rows={events}/>;
}

function Rows({ title, rows }: { title: string; rows: Array<Record<string, unknown>> }) {
  if (!rows.length) return <EmptyState title={title} description="No scoped live records are available yet."/>;
  return <section className={panel}><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{title}</h2><Status tone="success">Live data</Status></div><ul className="mt-5 divide-y divide-border">{rows.map((row, index) => <li className="py-4" key={String(row.id ?? index)}><p className="font-semibold">{String(row.title ?? row.name ?? row.status ?? "Operational record")}</p><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-muted">{JSON.stringify(row, null, 2)}</pre></li>)}</ul></section>;
}
