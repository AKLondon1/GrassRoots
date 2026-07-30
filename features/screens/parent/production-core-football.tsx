import type { SupabaseClient } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import { saveProductionAvailability } from "@/features/availability/actions";
import { saveProductionPollResponse } from "@/features/polls/actions";
import { ChildSelector } from "@/features/screens/parent/child-selector";
import { loadLinkedChildren, selectLinkedChild } from "@/features/screens/parent/linked-children";
import {
  card,
  EventPanel,
  eventColumns,
  eventTitle,
  formatDate,
  formatDateTime,
  formatTime,
  relation,
  type EventRow,
  type NamedRelation,
  type SectionContext,
} from "@/features/screens/parent/sections/shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The parent journey, against live data, for one child at a time.
 *
 * Every section here is a view of a single child, so the child is resolved once at the
 * top and handed down rather than re-derived per section. That is not tidiness: the
 * guardian filter in `loadLinkedChildren` is a security boundary, and a boundary that
 * must be reapplied correctly in eight places is a boundary that will eventually be
 * applied in seven.
 *
 * TEAM MEMBERSHIP IS A LIST. `team_memberships` carries no per-player uniqueness and a
 * child moved up an age group mid-season is ordinary, so every event read filters with
 * `.in("team_id", child.teamIds)`. Equality would silently drop half a child's fixtures.
 */

interface AvailabilityRow {
  event_instance_id: string;
  player_id: string;
  status: "available" | "unavailable" | "unsure";
  note: string | null;
  updated_at: string;
}
interface PollRow { id: string; team_id: string; title: string; status: string; closes_at: string }
interface PollOptionRow { id: string; poll_id: string; starts_at: string; ends_at: string; pitch_capacity: number | null }
interface PollRespondentRow { id: string; poll_id: string; player_id: string | null; players: NamedRelation }
interface PollResponseRow { option_id: string; respondent_id: string; response: "available" | "unavailable" | "maybe" }
interface SquadRow { id: string; event_instance_id: string; team_id: string; status: string; published_at: string | null }
interface SquadMemberRow { squad_id: string; player_id: string; status: "selected" | "standby" | "withdrawn" }
interface AnnouncementRow { id: string; title: string; body: string; published_at: string }

export async function ProductionParentCoreFootballScreen({
  organisationId,
  section,
  workspace,
  childId,
}: {
  organisationId: string;
  section: string;
  workspace: string;
  /** The `?child=` in the URL. Unrecognised values fall back to the first linked child. */
  childId?: string;
}) {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("The organisation connection is unavailable.");
  const db = client as unknown as SupabaseClient;

  const linkedChildren = await loadLinkedChildren(db, organisationId);
  const child = selectLinkedChild(linkedChildren, childId);

  // A guardian with no linked child is not an error. It is the ordinary state between
  // accepting an invitation and a coach linking the family to a player.
  if (!child) {
    return (
      <EmptyState
        title="No linked children yet"
        description="When your club links a child to your guardian account, their football week appears here."
      />
    );
  }

  const context: SectionContext = { db, organisationId, workspace, child, now: new Date().toISOString() };

  return (
    <div className="space-y-5">
      <ChildSelector
        linkedChildren={linkedChildren}
        section={section}
        selectedPlayerId={child.playerId}
        workspace={workspace}
      />
      {/*
        Awaited inline rather than rendered as an element. A nested async server
        component returned as `<Section/>` leaves a test that renders `await Screen(...)`
        holding an unresolved element instead of markup.
      */}
      {await renderSection(section, context)}
    </div>
  );
}

async function renderSection(section: string, context: SectionContext) {
  if (section === "announcements") return await AnnouncementsSection(context);
  if (section === "availability") return await AvailabilitySection(context);
  if (section === "polls") return await PollsSection(context);
  if (section === "squad") return await SquadSection(context);
  if (section === "event") return await EventSection(context);
  return await ScheduleSection(section, context);
}

/**
 * Upcoming events for this child's teams. Still shared by `home`, `actions` and
 * `schedule` until each is rewritten to its own shape.
 */
async function ScheduleSection(section: string, { db, organisationId, child, now }: SectionContext) {
  const [{ data: eventData, error: eventError }, { data: announcementData, error: announcementError }] = await Promise.all([
    db.from("event_instances").select(eventColumns).eq("organisation_id", organisationId).in("team_id", child.teamIds).neq("status", "cancelled").gte("ends_at", now).order("starts_at").limit(25),
    db.from("announcements").select("id,title,body,published_at").eq("organisation_id", organisationId).eq("status", "published").order("published_at", { ascending: false }).limit(20),
  ]);
  if (eventError || announcementError) throw new Error("We could not load your linked football updates.");
  const events = (eventData ?? []) as EventRow[];
  const announcements = (announcementData ?? []) as AnnouncementRow[];
  if (!events.length && !announcements.length) return <EmptyState title="No linked activity yet" description={`Upcoming events for ${child.firstName} and published club updates will appear here.`} />;
  return <div className="space-y-5">{events.length ? <section className="space-y-4" aria-label={section === "actions" ? "Upcoming actions" : "Upcoming schedule"}>{events.map((event) => <EventPanel event={event} key={event.id} />)}</section> : null}{section === "home" && announcements.length ? <section className={card}><h2 className="text-xl font-semibold">Latest club updates</h2><ul className="mt-4 divide-y divide-border">{announcements.slice(0, 5).map((item) => <li className="py-3" key={item.id}><p className="font-semibold">{item.title}</p><p className="mt-1 line-clamp-2 text-sm text-muted">{item.body}</p></li>)}</ul></section> : null}</div>;
}

async function AnnouncementsSection({ db, organisationId }: SectionContext) {
  const { data, error } = await db.from("announcements").select("id,title,body,published_at").eq("organisation_id", organisationId).eq("status", "published").order("published_at", { ascending: false }).limit(20);
  if (error) throw new Error("We could not load club announcements.");
  const announcements = (data ?? []) as AnnouncementRow[];
  if (!announcements.length) return <EmptyState title="No announcements" description="Published updates for your linked teams will appear here." />;
  return <section className="space-y-4">{announcements.map((item) => <article className={card} key={item.id}><Status tone="info">Club update</Status><h2 className="mt-4 text-xl font-semibold">{item.title}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{item.body}</p><p className="mt-4 text-xs text-muted">Published {formatDateTime(item.published_at)}</p></article>)}</section>;
}

async function EventSection({ db, organisationId, child, now }: SectionContext) {
  const { data, error } = await db.from("event_instances").select(eventColumns).eq("organisation_id", organisationId).in("team_id", child.teamIds).neq("status", "cancelled").gte("ends_at", now).order("starts_at").limit(10);
  if (error) throw new Error("We could not load linked team events.");
  const events = (data ?? []) as EventRow[];
  if (!events.length) return <EmptyState title="No upcoming linked events" description={`Published training, matches and meetings for ${child.firstName}'s teams will appear here.`} />;
  return <section className="space-y-4" aria-label="Upcoming linked events">{events.map((event) => <EventPanel event={event} key={event.id} />)}</section>;
}

async function AvailabilitySection({ db, organisationId, workspace, child, now }: SectionContext) {
  const { data: eventData, error: eventError } = await db.from("event_instances").select(eventColumns).eq("organisation_id", organisationId).in("team_id", child.teamIds).eq("status", "scheduled").gte("ends_at", now).order("starts_at").limit(25);
  if (eventError) throw new Error("We could not load linked availability.");
  const events = (eventData ?? []) as EventRow[];
  const eventIds = events.map((event) => event.id);
  // Scoped to this child rather than every active player in the organisation. The old
  // query read `team_memberships` by organisation and leaned on RLS to narrow it.
  const { data: responseData, error: responseError } = eventIds.length
    ? await db.from("availability_responses").select("event_instance_id,player_id,status,note,updated_at").eq("organisation_id", organisationId).eq("player_id", child.playerId).in("event_instance_id", eventIds)
    : { data: [], error: null };
  if (responseError) throw new Error("We could not load current availability responses.");
  const responses = (responseData ?? []) as AvailabilityRow[];
  if (!events.length) return <EmptyState title="No availability requests" description={`Upcoming events for ${child.name} will appear here.`} />;
  return <section className="space-y-4" aria-label="Availability requests">{events.map((event) => { const response = responses.find((item) => item.event_instance_id === event.id); return <article className={card} key={event.id}><div className="flex flex-wrap items-center justify-between gap-3"><Status tone={response?.status === "available" ? "success" : response?.status ? "info" : "warning"}>{response?.status ?? "Response needed"}</Status><span className="text-sm font-semibold text-muted">{formatDate(event.starts_at)} · {formatTime(event.starts_at)}</span></div><h2 className="mt-4 text-xl font-semibold">{eventTitle(event)}</h2><p className="mt-2 text-sm text-muted">Response for {child.name}</p><form action={saveProductionAvailability} className="mt-5"><input type="hidden" name="organisationId" value={organisationId} /><input type="hidden" name="eventInstanceId" value={event.id} /><input type="hidden" name="teamId" value={event.team_id} /><input type="hidden" name="playerId" value={child.playerId} /><input type="hidden" name="workspace" value={workspace} /><fieldset className="grid gap-3 sm:grid-cols-3"><legend className="sr-only">Availability for {child.name}</legend>{["available", "unavailable", "unsure"].map((status) => <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border-strong px-3 text-sm font-semibold capitalize has-[:checked]:border-primary has-[:checked]:bg-primary-light" key={status}><input defaultChecked={response?.status === status} name="status" required type="radio" value={status} />{status}</label>)}</fieldset><label className="mt-4 block text-sm font-semibold">Note <span className="font-normal text-muted">(optional)</span><textarea className="mt-2 min-h-20 w-full rounded-xl border border-border-strong bg-background p-3" defaultValue={response?.note ?? ""} maxLength={240} name="note" /></label><Button className="mt-4" type="submit">Save availability</Button></form></article>; })}</section>;
}

async function PollsSection({ db, organisationId, workspace, child, now }: SectionContext) {
  const { data, error } = await db.from("polls").select("id,team_id,title,status,closes_at").eq("organisation_id", organisationId).in("team_id", child.teamIds).eq("status", "open").gte("closes_at", now).order("closes_at").limit(20);
  if (error) throw new Error("We could not load open time polls.");
  const polls = (data ?? []) as PollRow[];
  const pollIds = polls.map((poll) => poll.id);
  const [{ data: optionData, error: optionError }, { data: respondentData, error: respondentError }] = polls.length ? await Promise.all([
    db.from("poll_options").select("id,poll_id,starts_at,ends_at,pitch_capacity").eq("organisation_id", organisationId).in("poll_id", pollIds).order("starts_at"),
    db.from("poll_respondents").select("id,poll_id,player_id,players(first_name,last_name)").eq("organisation_id", organisationId).eq("player_id", child.playerId).in("poll_id", pollIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (optionError || respondentError) throw new Error("We could not load poll choices for linked players.");
  const options = (optionData ?? []) as PollOptionRow[];
  const respondents = (respondentData ?? []) as PollRespondentRow[];
  const { data: pollResponseData, error: pollResponseError } = respondents.length ? await db.from("poll_responses").select("option_id,respondent_id,response").eq("organisation_id", organisationId).in("respondent_id", respondents.map((respondent) => respondent.id)) : { data: [], error: null };
  if (pollResponseError) throw new Error("We could not load your current poll responses.");
  const pollResponses = (pollResponseData ?? []) as PollResponseRow[];
  if (!polls.length) return <EmptyState title="No open time polls" description="Coach-published choices for your linked teams will appear here until their closing time." />;
  return <section className="space-y-4" aria-label="Open time polls">{polls.map((poll) => { const pollRespondents = respondents.filter((respondent) => respondent.poll_id === poll.id); return <article className={card} key={poll.id}><div className="flex flex-wrap items-center justify-between gap-3"><Status tone="info">Open poll</Status><span className="text-sm text-muted">Closes {formatDate(poll.closes_at)} at {formatTime(poll.closes_at)}</span></div><h2 className="mt-4 text-xl font-semibold">{poll.title}</h2>{pollRespondents.length ? <div className="mt-5 space-y-6">{pollRespondents.map((respondent) => <section key={respondent.id} aria-label={`Responses for ${relation(respondent.players).first_name ?? child.firstName}`}><h3 className="font-semibold">{child.name}</h3><div className="mt-3 divide-y divide-border">{options.filter((option) => option.poll_id === poll.id).map((option) => { const current = pollResponses.find((response) => response.respondent_id === respondent.id && response.option_id === option.id)?.response; return <form action={saveProductionPollResponse} className="py-4" key={option.id}><input type="hidden" name="organisationId" value={organisationId} /><input type="hidden" name="pollId" value={poll.id} /><input type="hidden" name="optionId" value={option.id} /><input type="hidden" name="respondentId" value={respondent.id} /><input type="hidden" name="workspace" value={workspace} /><p className="font-medium">{formatDate(option.starts_at)} · {formatTime(option.starts_at)}–{formatTime(option.ends_at)}</p><p className="mt-1 text-xs text-muted">{option.pitch_capacity ? `Pitch capacity ${option.pitch_capacity}` : "Capacity not set"}</p><fieldset className="mt-3 flex flex-wrap gap-2"><legend className="sr-only">Response for this time</legend>{["available", "unavailable", "maybe"].map((response) => <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border-strong px-3 text-sm font-semibold capitalize has-[:checked]:border-primary has-[:checked]:bg-primary-light" key={response}><input defaultChecked={current === response} name="response" required type="radio" value={response} />{response}</label>)}</fieldset><Button className="mt-3" size="small" type="submit">Save this time</Button></form>; })}</div></section>)}</div> : <p className="mt-5 rounded-xl bg-surface px-4 py-3 text-sm text-muted">No response has been assigned to {child.firstName} for this poll yet. Contact the organiser if they should be included.</p>}</article>; })}</section>;
}

async function SquadSection({ db, organisationId, child }: SectionContext) {
  const { data, error } = await db.from("squads").select("id,event_instance_id,team_id,status,published_at").eq("organisation_id", organisationId).in("team_id", child.teamIds).eq("status", "published").order("published_at", { ascending: false }).limit(20);
  if (error) throw new Error("We could not load published squad status.");
  const squads = (data ?? []) as SquadRow[];
  // The published filter above is now defence in depth: migration 0027 narrowed the
  // guardian arm of the squad policies to published squads. Keeping it means a draft
  // team sheet never reaches a family even if that policy is later relaxed.
  const { data: memberData, error: memberError } = squads.length ? await db.from("squad_members").select("squad_id,player_id,status").eq("organisation_id", organisationId).eq("player_id", child.playerId).in("squad_id", squads.map((squad) => squad.id)) : { data: [], error: null };
  if (memberError) throw new Error("We could not load linked squad places.");
  const members = (memberData ?? []) as SquadMemberRow[];
  if (!members.length) return <EmptyState title="No published squad status" description={`When a manager publishes a squad, you will see ${child.firstName}'s status here.`} />;
  return <section className="space-y-4" aria-label="Linked squad status">{members.map((member) => { const squad = squads.find((item) => item.id === member.squad_id); return <article className={card} key={member.squad_id}><Status tone={member.status === "selected" ? "success" : member.status === "standby" ? "warning" : "neutral"}>{member.status}</Status><h2 className="mt-4 text-xl font-semibold">{child.name}</h2><p className="mt-2 text-sm text-muted">{member.status === "selected" ? "A place is confirmed in the published squad." : member.status === "standby" ? "The manager may offer a place if one becomes available." : "This player is not currently in the squad."}</p>{squad?.published_at ? <p className="mt-4 text-xs font-semibold text-muted">Published {formatDateTime(squad.published_at)}</p> : null}</article>; })}<p className="mt-4 text-sm leading-6 text-muted">Squad status uses neutral wording and does not show rankings or other children&rsquo;s selection history.</p></section>;
}
