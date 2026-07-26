import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarDays, Clock3, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import { saveProductionAvailability } from "@/features/availability/actions";
import { saveProductionPollResponse } from "@/features/polls/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const panel = "rounded-2xl border border-border-strong bg-background p-5 sm:p-7";
type NamedObject = { title?: string; kind?: string; name?: string; first_name?: string; last_name?: string };
type NamedRelation = NamedObject | NamedObject[] | null;
interface EventRow { id: string; team_id: string; starts_at: string; ends_at: string; response_deadline: string | null; location_name: string | null; status: string; events: NamedRelation; teams: NamedRelation }
interface LinkedPlayerRow { team_id: string; player_id: string; players: NamedRelation }
interface AvailabilityRow { event_instance_id: string; player_id: string; status: "available"|"unavailable"|"unsure"; note: string|null; updated_at: string }
interface PollRow { id: string; team_id: string; title: string; status: string; closes_at: string }
interface PollOptionRow { id: string; poll_id: string; starts_at: string; ends_at: string; pitch_capacity: number|null }
interface PollRespondentRow { id: string; poll_id: string; player_id: string|null; players: NamedRelation }
interface PollResponseRow { option_id: string; respondent_id: string; response: "available"|"unavailable"|"maybe" }
interface SquadRow { id: string; event_instance_id: string; team_id: string; status: string; published_at: string|null }
interface SquadMemberRow { squad_id: string; player_id: string; status: "selected"|"standby"|"withdrawn"; players: NamedRelation }

function relation(value: NamedRelation): NamedObject { return (Array.isArray(value) ? value[0] : value) ?? {}; }
function eventTitle(event: EventRow) { return relation(event.events).title ?? "Team event"; }
function playerName(player: { players: NamedRelation }) { const row = relation(player.players); return `${row.first_name ?? "Linked"} ${row.last_name ?? "player"}`.trim(); }
function formatDate(value: string) { return new Date(value).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); }
function formatTime(value: string) { return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }

export async function ProductionParentCoreFootballScreen({ organisationId, section, workspace }: { organisationId: string; section: string; workspace: string }) {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("The organisation connection is unavailable.");
  const db = client as unknown as SupabaseClient;
  const now = new Date().toISOString();

  if (["home", "actions", "schedule", "announcements"].includes(section)) {
    const [{ data: eventData, error: eventError }, { data: announcementData, error: announcementError }] = await Promise.all([
      db.from("event_instances").select("id,team_id,starts_at,ends_at,response_deadline,location_name,status,events(title,kind),teams(name)").eq("organisation_id", organisationId).neq("status", "cancelled").gte("ends_at", now).order("starts_at").limit(25),
      db.from("announcements").select("id,title,body,published_at").eq("organisation_id", organisationId).eq("status", "published").order("published_at", { ascending: false }).limit(20),
    ]);
    if (eventError || announcementError) throw new Error("We could not load your linked football updates.");
    const events = (eventData ?? []) as EventRow[];
    const announcements = (announcementData ?? []) as Array<{ id: string; title: string; body: string; published_at: string }>;
    if (section === "announcements") return announcements.length ? <section className="space-y-4">{announcements.map((item) => <article className={panel} key={item.id}><Status tone="info">Club update</Status><h2 className="mt-4 text-xl font-semibold">{item.title}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{item.body}</p><p className="mt-4 text-xs text-muted">Published {new Date(item.published_at).toLocaleString("en-GB")}</p></article>)}</section> : <EmptyState title="No announcements" description="Published updates for your linked teams will appear here."/>;
    if (!events.length && !announcements.length) return <EmptyState title="No linked activity yet" description="Upcoming events and published club updates will appear here."/>;
    return <div className="space-y-5">{events.length ? <section className="space-y-4" aria-label={section === "actions" ? "Upcoming actions" : "Upcoming schedule"}>{events.map((event) => <EventPanel event={event} key={event.id}/>)}</section> : null}{section === "home" && announcements.length ? <section className={panel}><h2 className="text-xl font-semibold">Latest club updates</h2><ul className="mt-4 divide-y divide-border">{announcements.slice(0, 5).map((item) => <li className="py-3" key={item.id}><p className="font-semibold">{item.title}</p><p className="mt-1 line-clamp-2 text-sm text-muted">{item.body}</p></li>)}</ul></section> : null}</div>;
  }

  if (section === "event") {
    const { data, error } = await db.from("event_instances").select("id,team_id,starts_at,ends_at,response_deadline,location_name,status,events(title,kind),teams(name)").eq("organisation_id", organisationId).neq("status", "cancelled").gte("ends_at", now).order("starts_at").limit(10);
    if (error) throw new Error("We could not load linked team events.");
    const events = (data ?? []) as EventRow[];
    if (!events.length) return <EmptyState title="No upcoming linked events" description="Published training, matches and meetings for your linked teams will appear here."/>;
    return <section className="space-y-4" aria-label="Upcoming linked events">{events.map((event) => <EventPanel event={event} key={event.id}/>)}</section>;
  }

  if (section === "availability") {
    const [{ data: eventData, error: eventError }, { data: playerData, error: playerError }] = await Promise.all([
      db.from("event_instances").select("id,team_id,starts_at,ends_at,response_deadline,location_name,status,events(title,kind),teams(name)").eq("organisation_id", organisationId).eq("status", "scheduled").gte("ends_at", now).order("starts_at").limit(25),
      db.from("team_memberships").select("team_id,player_id,players(first_name,last_name)").eq("organisation_id", organisationId).eq("member_kind", "player").eq("status", "active").not("player_id", "is", null).limit(100),
    ]);
    if (eventError || playerError) throw new Error("We could not load linked availability.");
    const events = (eventData ?? []) as EventRow[];
    const players = (playerData ?? []) as LinkedPlayerRow[];
    const eventIds = events.map((event) => event.id);
    const { data: responseData, error: responseError } = eventIds.length
      ? await db.from("availability_responses").select("event_instance_id,player_id,status,note,updated_at").eq("organisation_id", organisationId).in("event_instance_id", eventIds)
      : { data: [], error: null };
    if (responseError) throw new Error("We could not load current availability responses.");
    const responses = (responseData ?? []) as AvailabilityRow[];
    const scopes = events.flatMap((event) => players.filter((player) => player.team_id === event.team_id).map((player) => ({ event, player, response: responses.find((item) => item.event_instance_id === event.id && item.player_id === player.player_id) })));
    if (!scopes.length) return <EmptyState title="No availability requests" description="Upcoming events that include a child linked to your guardian account will appear here."/>;
    return <section className="space-y-4" aria-label="Availability requests">{scopes.map(({ event, player, response }) => <article className={panel} key={`${event.id}:${player.player_id}`}><div className="flex flex-wrap items-center justify-between gap-3"><Status tone={response?.status === "available" ? "success" : response?.status ? "info" : "warning"}>{response?.status ?? "Response needed"}</Status><span className="text-sm font-semibold text-muted">{formatDate(event.starts_at)} · {formatTime(event.starts_at)}</span></div><h2 className="mt-4 text-xl font-semibold">{eventTitle(event)}</h2><p className="mt-2 text-sm text-muted">Response for {playerName(player)}</p><form action={saveProductionAvailability} className="mt-5"><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="eventInstanceId" value={event.id}/><input type="hidden" name="teamId" value={event.team_id}/><input type="hidden" name="playerId" value={player.player_id}/><input type="hidden" name="workspace" value={workspace}/><fieldset className="grid gap-3 sm:grid-cols-3"><legend className="sr-only">Availability for {playerName(player)}</legend>{["available","unavailable","unsure"].map((status) => <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border-strong px-3 text-sm font-semibold capitalize has-[:checked]:border-primary has-[:checked]:bg-primary-light" key={status}><input defaultChecked={response?.status === status} name="status" required type="radio" value={status}/>{status}</label>)}</fieldset><label className="mt-4 block text-sm font-semibold">Note <span className="font-normal text-muted">(optional)</span><textarea className="mt-2 min-h-20 w-full rounded-xl border border-border-strong bg-background p-3" defaultValue={response?.note ?? ""} maxLength={240} name="note"/></label><Button className="mt-4" type="submit">Save availability</Button></form></article>)}</section>;
  }

  if (section === "polls") {
    const { data, error } = await db.from("polls").select("id,team_id,title,status,closes_at").eq("organisation_id", organisationId).eq("status", "open").gte("closes_at", now).order("closes_at").limit(20);
    if (error) throw new Error("We could not load open time polls.");
    const polls = (data ?? []) as PollRow[];
    const pollIds = polls.map((poll) => poll.id);
    const [{ data: optionData, error: optionError }, { data: respondentData, error: respondentError }] = polls.length ? await Promise.all([
      db.from("poll_options").select("id,poll_id,starts_at,ends_at,pitch_capacity").eq("organisation_id", organisationId).in("poll_id", pollIds).order("starts_at"),
      db.from("poll_respondents").select("id,poll_id,player_id,players(first_name,last_name)").eq("organisation_id", organisationId).in("poll_id", pollIds).not("player_id", "is", null),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (optionError || respondentError) throw new Error("We could not load poll choices for linked players.");
    const options = (optionData ?? []) as PollOptionRow[];
    const respondents = (respondentData ?? []) as PollRespondentRow[];
    const { data: pollResponseData, error: pollResponseError } = respondents.length ? await db.from("poll_responses").select("option_id,respondent_id,response").eq("organisation_id", organisationId).in("respondent_id", respondents.map((respondent) => respondent.id)) : { data: [], error: null };
    if (pollResponseError) throw new Error("We could not load your current poll responses.");
    const pollResponses = (pollResponseData ?? []) as PollResponseRow[];
    if (!polls.length) return <EmptyState title="No open time polls" description="Coach-published choices for your linked teams will appear here until their closing time."/>;
    return <section className="space-y-4" aria-label="Open time polls">{polls.map((poll) => { const pollRespondents = respondents.filter((respondent) => respondent.poll_id === poll.id); return <article className={panel} key={poll.id}><div className="flex flex-wrap items-center justify-between gap-3"><Status tone="info">Open poll</Status><span className="text-sm text-muted">Closes {formatDate(poll.closes_at)} at {formatTime(poll.closes_at)}</span></div><h2 className="mt-4 text-xl font-semibold">{poll.title}</h2>{pollRespondents.length ? <div className="mt-5 space-y-6">{pollRespondents.map((respondent) => <section key={respondent.id} aria-label={`Responses for ${playerName(respondent)}`}><h3 className="font-semibold">{playerName(respondent)}</h3><div className="mt-3 divide-y divide-border">{options.filter((option) => option.poll_id === poll.id).map((option) => { const current = pollResponses.find((response) => response.respondent_id === respondent.id && response.option_id === option.id)?.response; return <form action={saveProductionPollResponse} className="py-4" key={option.id}><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="pollId" value={poll.id}/><input type="hidden" name="optionId" value={option.id}/><input type="hidden" name="respondentId" value={respondent.id}/><input type="hidden" name="workspace" value={workspace}/><p className="font-medium">{formatDate(option.starts_at)} · {formatTime(option.starts_at)}–{formatTime(option.ends_at)}</p><p className="mt-1 text-xs text-muted">{option.pitch_capacity ? `Pitch capacity ${option.pitch_capacity}` : "Capacity not set"}</p><fieldset className="mt-3 flex flex-wrap gap-2"><legend className="sr-only">Response for this time</legend>{["available","unavailable","maybe"].map((response) => <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border-strong px-3 text-sm font-semibold capitalize has-[:checked]:border-primary has-[:checked]:bg-primary-light" key={response}><input defaultChecked={current === response} name="response" required type="radio" value={response}/>{response}</label>)}</fieldset><Button className="mt-3" size="small" type="submit">Save this time</Button></form>; })}</div></section>)}</div> : <p className="mt-5 rounded-xl bg-surface px-4 py-3 text-sm text-muted">No linked-player response has been assigned to this poll yet. Contact the organiser if you should be included.</p>}</article>; })}</section>;
  }

  const { data, error } = await db.from("squads").select("id,event_instance_id,team_id,status,published_at").eq("organisation_id", organisationId).eq("status", "published").order("published_at", { ascending: false }).limit(20);
  if (error) throw new Error("We could not load published squad status.");
  const squads = (data ?? []) as SquadRow[];
  const { data: memberData, error: memberError } = squads.length ? await db.from("squad_members").select("squad_id,player_id,status,players(first_name,last_name)").eq("organisation_id", organisationId).in("squad_id", squads.map((squad) => squad.id)) : { data: [], error: null };
  if (memberError) throw new Error("We could not load linked squad places.");
  const members = (memberData ?? []) as SquadMemberRow[];
  if (!members.length) return <EmptyState title="No published squad status" description="When a manager publishes a squad, you will see only the status of children linked to your guardian account."/>;
  return <section className="space-y-4" aria-label="Linked squad status">{members.map((member) => { const squad = squads.find((item) => item.id === member.squad_id); return <article className={panel} key={`${member.squad_id}:${member.player_id}`}><Status tone={member.status === "selected" ? "success" : member.status === "standby" ? "warning" : "neutral"}>{member.status}</Status><h2 className="mt-4 text-xl font-semibold">{playerName(member)}</h2><p className="mt-2 text-sm text-muted">{member.status === "selected" ? "A place is confirmed in the published squad." : member.status === "standby" ? "The manager may offer a place if one becomes available." : "This player is not currently in the squad."}</p>{squad?.published_at ? <p className="mt-4 text-xs font-semibold text-muted">Published {new Date(squad.published_at).toLocaleString("en-GB")}</p> : null}</article>; })}</section>;
}

function EventPanel({ event }: { event: EventRow }) {
  return <article className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><Status tone="info">{relation(event.events).kind ?? "event"}</Status><span className="text-sm font-semibold text-muted">{formatDate(event.starts_at)}</span></div><h2 className="mt-4 text-xl font-semibold">{eventTitle(event)}</h2><dl className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-2"><div className="flex gap-2"><Clock3 className="mt-0.5 size-4" aria-hidden="true"/><dt className="sr-only">Time</dt><dd>{formatTime(event.starts_at)}–{formatTime(event.ends_at)}</dd></div><div className="flex gap-2"><CalendarDays className="mt-0.5 size-4" aria-hidden="true"/><dt className="sr-only">Team</dt><dd>{relation(event.teams).name ?? "Linked team"}</dd></div>{event.location_name ? <div className="flex gap-2 sm:col-span-2"><MapPin className="mt-0.5 size-4" aria-hidden="true"/><dt className="sr-only">Location</dt><dd>{event.location_name}</dd></div> : null}</dl>{event.response_deadline ? <p className="mt-4 text-xs font-semibold text-muted">Availability closes {new Date(event.response_deadline).toLocaleString("en-GB")}</p> : null}</article>;
}
