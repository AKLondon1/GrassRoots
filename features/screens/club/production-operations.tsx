import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { QuarantineUpload } from "@/components/files/quarantine-upload";
import { InvitationIssuer } from "@/components/people/invitation-issuer";
import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import { allocateFacilityBooking, closeFacilityAndResolveBooking, createMaintenanceRequest, createVenue, createVolunteerShift, promoteCleanClubDocument, reserveEquipment, revokeSupportSessionAction, startSupportSession, submitSupportRequest } from "@/features/facilities/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { keysetPage } from "@/lib/pagination/keyset";
import { createAgeGroup, createOppositionContact, createSeason, createTeam } from "@/features/people/production-actions";
import { TeamPeoplePanel } from "@/features/screens/coach/production-team-people";

interface UnitRow { id: string; name: string; capacity: number; accessible: boolean; floodlit: boolean }
interface BookingRow { id: string; reservation_unit_id: string; event_instance_id: string | null; title: string; starts_at: string; ends_at: string; buffer_before_minutes: number; buffer_after_minutes: number; status: string }
interface EventInstanceRow { id: string; event_id: string; starts_at: string; ends_at: string }

export async function ProductionClubOperationsScreen({ organisationId, section, workspace, cursor }: { organisationId: string; section: string; workspace: string; cursor?: string }) {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("The organisation connection is unavailable.");
  const db = client as unknown as SupabaseClient;
  const [{ data: unitData, error: unitError }, { data: bookingData, error: bookingError }, { data: instanceData, error: instanceError }, { data: eventData, error: eventError }] = await Promise.all([
    db.from("reservation_units").select("id,name,capacity,accessible,floodlit").eq("organisation_id", organisationId).eq("active", true).order("name").limit(250),
    db.from("facility_bookings").select("id,reservation_unit_id,event_instance_id,title,starts_at,ends_at,buffer_before_minutes,buffer_after_minutes,status").eq("organisation_id", organisationId).neq("status", "cancelled").order("starts_at").limit(500),
    db.from("event_instances").select("id,event_id,starts_at,ends_at").eq("organisation_id", organisationId).eq("status", "scheduled").order("starts_at").limit(500),
    db.from("events").select("id,title").eq("organisation_id", organisationId).order("id").limit(500),
  ]);
  if (unitError || bookingError || instanceError || eventError) throw new Error("We could not load the facility plan.");
  const units = (unitData ?? []) as UnitRow[];
  const bookings = (bookingData ?? []) as BookingRow[];
  const eventTitles = new Map(((eventData ?? []) as Array<{ id: string; title: string }>).map((event) => [event.id, event.title]));
  const allocatedInstances = new Set(bookings.flatMap((booking) => booking.event_instance_id ? [booking.event_instance_id] : []));
  const unallocatedInstances = ((instanceData ?? []) as EventInstanceRow[]).filter((instance) => !allocatedInstances.has(instance.id));

  if (section === "pitch-planner") {
    if (!units.length) return <EmptyState title="No reservation units yet" description="Add a venue and its bookable pitch areas before allocating a fixture." />;
    return <div className="space-y-6"><LiveBookings units={units} bookings={bookings}/>{unallocatedInstances.length ? <section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Allocate an unallocated fixture</h2><form action={allocateFacilityBooking} className="mt-5 grid gap-4 sm:grid-cols-2"><HiddenContext organisationId={organisationId} workspace={workspace}/><label className="text-sm font-semibold">Fixture<select name="eventInstanceId" className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3">{unallocatedInstances.map((instance) => <option key={instance.id} value={instance.id}>{eventTitles.get(instance.event_id) ?? "Club event"} · {new Date(instance.starts_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}</option>)}</select></label><SelectUnit units={units}/><Field label="Setup buffer (minutes)" name="bufferBefore" type="number" defaultValue="15"/><Field label="Turnaround buffer (minutes)" name="bufferAfter" type="number" defaultValue="15"/><Button type="submit" className="sm:col-span-2 sm:w-fit">Allocate fixture</Button></form></section> : <EmptyState title="Every scheduled fixture is allocated" description="New unallocated fixtures will appear here automatically."/>}</div>;
  }

  if (section === "inspections") {
    if (!bookings.length) return <EmptyState title="No affected bookings" description="There are no active bookings to assess for a closure." />;
    const booking = bookings[0]!;
    const { data: affectedData, error: affectedError } = await db.rpc("preview_facility_closure_impacts", {
      requested_organisation_id: organisationId, requested_unit_id: booking.reservation_unit_id,
      requested_starts_at: booking.starts_at, requested_ends_at: booking.ends_at,
    });
    if (affectedError) throw new Error("We could not calculate the closure impact.");
    const affected = (affectedData ?? []) as BookingRow[];
    return <section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Close a pitch and resolve affected bookings</h2><p className="mt-2 text-sm text-muted">This locked transaction updates bookings, connected events, calendar visibility, urgent outbox and audit trail together.</p><form action={closeFacilityAndResolveBooking} className="mt-5 grid gap-4 sm:grid-cols-2"><HiddenContext organisationId={organisationId} workspace={workspace}/><input type="hidden" name="reservationUnitId" value={booking.reservation_unit_id}/><input type="hidden" name="startsAt" value={booking.starts_at}/><input type="hidden" name="endsAt" value={booking.ends_at}/><Field label="Closure reason" name="reason" defaultValue="Pitch unsafe after inspection"/>{affected.map((affectedBooking) => <label key={affectedBooking.id} className="text-sm font-semibold">Resolve {affectedBooking.title}<select name={`resolution:${affectedBooking.id}`} className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3"><option value="cancel">Cancel event and queue urgent notice</option>{units.filter((unit) => unit.id !== affectedBooking.reservation_unit_id).map((unit) => <option key={unit.id} value={unit.id}>Move to {unit.name}</option>)}</select></label>)}<Button type="submit" className="sm:col-span-2 sm:w-fit">Close pitch and apply resolutions</Button></form></section>;
  }

  if (section === "equipment") {
    const { data, error } = await db.from("equipment_items").select("id,name,quantity").eq("organisation_id", organisationId).order("name").limit(250);
    if (error) throw new Error("We could not load equipment.");
    const items = (data ?? []) as Array<{ id: string; name: string; quantity: number }>;
    if (!items.length) return <EmptyState title="No equipment items yet" description="Create equipment inventory before reserving kit."/>;
    return <section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Reserve equipment</h2><p className="mt-2 text-sm text-muted">Availability is checked in a locked transaction across overlapping reservations.</p><form action={reserveEquipment} className="mt-5 grid gap-4 sm:grid-cols-2"><HiddenContext organisationId={organisationId} workspace={workspace}/><label className="text-sm font-semibold">Equipment<select name="equipmentItemId" className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3">{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.quantity} total</option>)}</select></label><Field label="Quantity" name="quantity" type="number" defaultValue="1"/><Field label="Starts at" name="startsAt" type="datetime-local"/><Field label="Ends at" name="endsAt" type="datetime-local"/><Button type="submit" className="sm:col-span-2 sm:w-fit">Reserve equipment</Button></form></section>;
  }

  if (section === "support") {
    const { data, error } = await db.from("support_requests").select("id,subject,status,created_at").eq("organisation_id", organisationId).order("created_at", { ascending: false }).limit(20);
    if (error) throw new Error("We could not load support requests.");
    const requests = (data ?? []) as Array<{ id: string; subject: string; status: string; created_at: string }>;
    return <div className="space-y-5"><section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Request platform support</h2><p className="mt-2 text-sm text-muted">Support access is separately authorised, time-limited, resource-bounded, revocable and audited.</p><form action={submitSupportRequest} className="mt-5 grid gap-4"><HiddenContext organisationId={organisationId} workspace={workspace}/><Field label="Subject" name="subject"/><label className="text-sm font-semibold">Description<textarea required minLength={10} maxLength={2000} name="description" className="mt-2 min-h-28 w-full rounded-[10px] border border-border-strong bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35"/></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Authorised record type (optional)<select name="resourceType" className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3"><option value="">No record access</option><option value="facility_booking">Facility booking</option><option value="event">Event</option><option value="facility">Facility</option><option value="venue">Venue</option></select></label><Field label="Authorised record ID (optional)" name="resourceId" required={false}/></div><Button type="submit" className="w-fit">Submit support request</Button></form></section>{requests.length ? <section className="rounded-2xl border border-border-strong bg-background p-5"><h2 className="font-semibold">Recent requests</h2><ul className="mt-3 divide-y divide-border">{requests.map((request) => <li key={request.id} className="flex items-center justify-between gap-3 py-3"><span>{request.subject}</span><Status tone="info">{request.status}</Status></li>)}</ul></section> : null}</div>;
  }

  if (section === "venues") {
    const { data, error } = await db.from("venues").select("id,name,address").eq("organisation_id", organisationId).order("name").limit(250);
    if (error) throw new Error("We could not load venues.");
    return <OperationalForm title="Create venue" rows={(data ?? []) as Array<Record<string, unknown>>}><form action={createVenue} className="grid gap-4 sm:grid-cols-2"><HiddenContext organisationId={organisationId} workspace={workspace}/><Field label="Venue name" name="name"/><Field label="Address" name="address"/><Button type="submit" className="sm:col-span-2 sm:w-fit">Create venue</Button></form></OperationalForm>;
  }

  if (section === "maintenance") {
    const [{ data: facilityData, error: facilityError }, { data: requestData, error: requestError }] = await Promise.all([db.from("facilities").select("id,name").eq("organisation_id", organisationId).order("name").limit(250), db.from("maintenance_requests").select("id,title,status").eq("organisation_id", organisationId).order("created_at", { ascending: false }).limit(100)]);
    if (facilityError || requestError) throw new Error("We could not load maintenance.");
    const facilities = (facilityData ?? []) as Array<{ id: string; name: string }>;
    if (!facilities.length) return <EmptyState title="No facilities yet" description="Create a venue and facility before adding maintenance."/>;
    return <OperationalForm title="Create maintenance request" rows={(requestData ?? []) as Array<Record<string, unknown>>}><form action={createMaintenanceRequest} className="grid gap-4 sm:grid-cols-2"><HiddenContext organisationId={organisationId} workspace={workspace}/><label className="text-sm font-semibold">Facility<select name="facilityId" className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3">{facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}</select></label><Field label="Title" name="title"/><Field label="Description" name="description"/><label className="text-sm font-semibold">Priority<select name="priority" className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></label><Button type="submit" className="sm:col-span-2 sm:w-fit">Create request</Button></form></OperationalForm>;
  }

  if (section === "documents") {
    const [{ data, error }, { data: cleanIntents, error: intentError }] = await Promise.all([
      db.from("club_documents").select("id,title,current_version").eq("organisation_id", organisationId).order("title").limit(250),
      db.from("private_upload_intents").select("id,original_filename,scanned_at").eq("organisation_id", organisationId).eq("status", "clean").order("scanned_at").limit(100),
    ]);
    if (error || intentError) throw new Error("We could not load private documents.");
    return <div className="space-y-5"><QuarantineUpload workspace={workspace}/>{(cleanIntents ?? []).length ? <section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Promote scanner-approved uploads</h2><ul className="mt-5 divide-y divide-border">{((cleanIntents ?? []) as Array<{ id: string; original_filename: string }>).map((intent) => <li className="py-4" key={intent.id}><p className="font-semibold">{intent.original_filename}</p><form action={promoteCleanClubDocument} className="mt-3 flex flex-wrap items-end gap-3"><HiddenContext organisationId={organisationId} workspace={workspace}/><input name="intentId" type="hidden" value={intent.id}/><Field label="Document title" name="title"/><Button type="submit">Promote privately</Button></form></li>)}</ul></section> : <p className="rounded-xl bg-surface p-4 text-sm text-muted">No scanner-approved uploads are ready for promotion.</p>}<OperationalForm title="Private document register" rows={(data ?? []) as Array<Record<string, unknown>>}><p className="text-sm text-muted">Versions are created only from a clean quarantine intent; paths and checksums cannot be entered manually.</p></OperationalForm></div>;
  }

  if (section === "volunteers") {
    const { data, error } = await db.from("volunteer_shifts").select("id,title,starts_at,required_people").eq("organisation_id", organisationId).order("starts_at").limit(250);
    if (error) throw new Error("We could not load volunteer shifts.");
    return <OperationalForm title="Create volunteer shift" rows={(data ?? []) as Array<Record<string, unknown>>}><form action={createVolunteerShift} className="grid gap-4 sm:grid-cols-2"><HiddenContext organisationId={organisationId} workspace={workspace}/><Field label="Shift title" name="title"/><Field label="People needed" name="requiredPeople" type="number" defaultValue="1"/><Field label="Starts at" name="startsAt" type="datetime-local"/><Field label="Ends at" name="endsAt" type="datetime-local"/><Button type="submit" className="sm:col-span-2 sm:w-fit">Create shift</Button></form></OperationalForm>;
  }

  if (section === "overview") {
    return <div className="grid gap-5 sm:grid-cols-3"><Summary label="Active facility bookings" value={bookings.length}/><Summary label="Unallocated fixtures" value={unallocatedInstances.length}/><Summary label="Reservation units" value={units.length}/><div className="sm:col-span-3"><LiveBookings units={units} bookings={bookings}/></div></div>;
  }

  if (section === "calendar" || section === "fixtures") {
    return <EventList instances={(instanceData ?? []) as EventInstanceRow[]} titles={eventTitles}/>;
  }

  if (section === "reports") {
    return <section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Live facilities report</h2><div className="mt-5 grid gap-4 sm:grid-cols-3"><Summary label="Active bookings" value={bookings.length}/><Summary label="Unallocated fixtures" value={unallocatedInstances.length}/><Summary label="Bookable units" value={units.length}/></div><p className="mt-5 text-sm text-muted">The audited CSV contains every permission-filtered booking. The watermarked PDF is a concise record-count summary suitable for filing.</p><div className="mt-5 flex flex-wrap gap-3"><Button asChild><a href={`/api/exports/facilities?workspace=${encodeURIComponent(workspace)}&format=csv`}>Download full audited CSV</a></Button><Button asChild variant="secondary"><a href={`/api/exports/facilities?workspace=${encodeURIComponent(workspace)}&format=pdf`}>Download PDF summary</a></Button></div></section>;
  }

  if (section === "seasons") {
    const { data, error } = await db.from("seasons").select("id,name,starts_on,ends_on,is_active").eq("organisation_id", organisationId).order("starts_on", { ascending: false }).limit(250);
    if (error) throw new Error("We could not load seasons.");
    return <OperationalForm title="Create season" rows={(data ?? []) as Array<Record<string, unknown>>}><form action={createSeason} className="grid gap-4 sm:grid-cols-3"><HiddenContext organisationId={organisationId} workspace={workspace}/><Field label="Season name" name="name"/><Field label="Starts on" name="startsOn" type="date"/><Field label="Ends on" name="endsOn" type="date"/><Button type="submit" className="sm:w-fit">Create season</Button></form></OperationalForm>;
  }

  if (section === "teams") {
    const [{ data: seasons, error: seasonError }, { data: ageGroups, error: ageError }, { data: teams, error: teamError }] = await Promise.all([
      db.from("seasons").select("id,name").eq("organisation_id", organisationId).order("starts_on", { ascending: false }).limit(250),
      db.from("age_groups").select("id,name,minimum_age,maximum_age").eq("organisation_id", organisationId).order("minimum_age").limit(100),
      db.from("teams").select("id,name,status").eq("organisation_id", organisationId).order("name").limit(250),
    ]);
    if (seasonError || ageError || teamError) throw new Error("We could not load team setup.");
    const seasonOptions = (seasons ?? []) as Array<{ id: string; name: string }>;
    const ageOptions = (ageGroups ?? []) as Array<{ id: string; name: string }>;
    return <div className="space-y-5"><section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Create team</h2>{seasonOptions.length && ageOptions.length ? <form action={createTeam} className="mt-5 grid gap-4 sm:grid-cols-3"><HiddenContext organisationId={organisationId} workspace={workspace}/><Field label="Team name" name="name"/><label className="text-sm font-semibold">Season<select name="seasonId" className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3">{seasonOptions.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label><label className="text-sm font-semibold">Age group<select name="ageGroupId" className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3">{ageOptions.map((age) => <option key={age.id} value={age.id}>{age.name}</option>)}</select></label><Button type="submit" className="sm:w-fit">Create team</Button></form> : <p className="mt-4 text-sm text-muted">Create at least one season and age group to enable team creation.</p>}</section><section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Add age group</h2><form action={createAgeGroup} className="mt-5 grid gap-4 sm:grid-cols-3"><HiddenContext organisationId={organisationId} workspace={workspace}/><Field label="Name" name="name"/><Field label="Minimum age" name="minimumAge" type="number"/><Field label="Maximum age" name="maximumAge" type="number"/><Button type="submit" className="sm:w-fit">Add age group</Button></form></section><OperationalForm title="Saved teams" rows={(teams ?? []) as Array<Record<string, unknown>>}><p className="text-sm text-muted">Teams are scoped to a season and age group and protected by organisation permissions.</p></OperationalForm></div>;
  }

  // Shared with the coach's own people screen. A club administrator sees every
  // team here because RLS gives them organisation scope; a coach sees only the
  // teams they staff. The panel itself needs no branch for the difference.
  if (section === "people") {
    return <TeamPeoplePanel organisationId={organisationId} workspace={workspace}/>;
  }

  if (section === "opposition") {
    const { data, error } = await db.from("opposition_contacts").select("id,club_name,display_name,email,phone").eq("organisation_id", organisationId).order("club_name").limit(250);
    if (error) throw new Error("We could not load opposition contacts.");
    return <OperationalForm title="Add opposition contact" rows={(data ?? []) as Array<Record<string, unknown>>}><form action={createOppositionContact} className="grid gap-4 sm:grid-cols-2"><HiddenContext organisationId={organisationId} workspace={workspace}/><Field label="Club name" name="clubName"/><Field label="Contact name" name="displayName"/><Field label="Email (optional)" name="email" type="email" required={false}/><Field label="Phone (optional)" name="phone" type="tel" required={false}/><Button type="submit" className="sm:w-fit">Add contact</Button></form></OperationalForm>;
  }

  if (section === "invitations") {
    const [{ data: roles, error: roleError }, { data: invites, error: inviteError }] = await Promise.all([
      db.from("roles").select("id,name").eq("organisation_id", organisationId).order("name").limit(100),
      db.from("organisation_invites").select("id,email,expires_at,accepted_at").eq("organisation_id", organisationId).order("created_at", { ascending: false }).limit(100),
    ]);
    if (roleError || inviteError) throw new Error("We could not load adult invitations.");
    return <OperationalForm title="Invite an adult" rows={(invites ?? []).map((invite) => ({ ...(invite as Record<string, unknown>), name: (invite as { email: string }).email, status: (invite as { accepted_at: string | null }).accepted_at ? "accepted" : "pending" }))}><InvitationIssuer workspace={workspace} roles={(roles ?? []) as Array<{ id: string; name: string }>}/></OperationalForm>;
  }

  const tableBySection: Record<string, string> = {
    audit: "audit_log",
  };
  const table = tableBySection[section];
  if (table) {
    let query = db.from(table).select("*").eq("organisation_id", organisationId).order("id").limit(21);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) throw new Error(`We could not load ${section}.`);
    const page = keysetPage((data ?? []) as Array<Record<string, unknown> & { id: string }>);
    const rows = page.items;
    if (!rows.length) return <EmptyState title={`No ${section} yet`} description="Create the first authorised record to begin this workflow." />;
    return <section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Live {section}</h2><Status tone="success">Saved organisation data</Status></div><ul className="mt-5 divide-y divide-border">{rows.map((row) => <li key={String(row.id)} className="py-4 first:pt-0"><p className="font-semibold">{String(row.name ?? row.title ?? row.subject ?? row.action ?? "Operational record")}</p><p className="mt-1 text-sm text-muted">Record {String(row.id)}</p></li>)}</ul>{page.nextCursor ? <Button asChild className="mt-5" variant="secondary"><Link href={`/app/${workspace}/${section}?cursor=${page.nextCursor}`}>Next page</Link></Button> : null}</section>;
  }
  return <LiveBookings units={units} bookings={bookings}/>;
}

export async function ProductionSupportOperationsScreen({ organisationId, workspace, readRequest }: { organisationId: string; workspace: string; readRequest: { sessionId?: string; resourceType?: string; resourceId?: string } }) {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("The support connection is unavailable.");
  const db = client as unknown as SupabaseClient;
  const [{ data: requestData, error: requestError }, { data: sessionData, error: sessionError }] = await Promise.all([
    db.from("support_requests").select("id,subject,status").eq("organisation_id", organisationId).in("status", ["open", "investigating"]).order("id").limit(50),
    db.from("support_sessions").select("id,reason,expires_at,allowed_resources").eq("organisation_id", organisationId).is("revoked_at", null).order("id").limit(50),
  ]);
  if (requestError || sessionError) throw new Error("We could not load support access.");
  const requests = (requestData ?? []) as Array<{ id: string; subject: string; status: string }>;
  const sessions = (sessionData ?? []) as Array<{ id: string; reason: string; expires_at: string; allowed_resources: string[] }>;
  let readResult: unknown = null;
  if (readRequest.sessionId && readRequest.resourceType && readRequest.resourceId) {
    const { data, error } = await db.rpc("read_support_resource", { requested_session_id: readRequest.sessionId, requested_resource_type: readRequest.resourceType, requested_resource_id: readRequest.resourceId });
    if (error) throw new Error("The authorised support resource could not be read.");
    readResult = data;
  }
  return <div className="space-y-5"><section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Start audited support access</h2><p className="mt-2 text-sm text-muted">Access is limited to records explicitly authorised on the request and expires within 60 minutes.</p>{requests.length ? <form action={startSupportSession} className="mt-5 grid gap-4 sm:grid-cols-2"><HiddenContext organisationId={organisationId} workspace={workspace}/><label className="text-sm font-semibold">Authorised request<select name="supportRequestId" className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3">{requests.map((request) => <option key={request.id} value={request.id}>{request.subject}</option>)}</select></label><Field label="Duration (minutes)" name="durationMinutes" type="number" defaultValue="30"/><Field label="Specific access reason" name="reason"/><Button type="submit" className="sm:col-span-2 sm:w-fit">Start support session</Button></form> : <p className="mt-5 text-sm text-muted">No open authorised support requests.</p>}</section>{sessions.map((session) => <section key={session.id} className="rounded-2xl border border-border-strong bg-background p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Active support session</h2><p className="mt-1 text-sm text-muted">Expires {new Date(session.expires_at).toLocaleString("en-GB")} · {session.allowed_resources.join(", ") || "No record access"}</p></div><Status tone="warning">Time-limited</Status></div><form method="get" className="mt-4 grid gap-3 sm:grid-cols-3"><input type="hidden" name="role" value="platform"/><input type="hidden" name="supportSessionId" value={session.id}/><label className="text-sm font-semibold">Resource type<select name="resourceType" className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3">{session.allowed_resources.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><Field label="Authorised record ID" name="resourceId"/><Button type="submit" className="sm:self-end">Read and audit resource</Button></form><form action={revokeSupportSessionAction} className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row"><HiddenContext organisationId={organisationId} workspace={workspace}/><input type="hidden" name="sessionId" value={session.id}/><Field label="Revocation reason" name="reason"/><Button type="submit" variant="secondary" className="sm:self-end">Revoke access</Button></form></section>)}{readResult ? <section className="rounded-2xl border border-border-strong bg-background p-5"><h2 className="font-semibold">Audited resource result</h2><pre className="mt-3 overflow-x-auto rounded-xl bg-surface p-4 text-xs">{JSON.stringify(readResult, null, 2)}</pre></section> : null}</div>;
}

function HiddenContext({ organisationId, workspace }: { organisationId: string; workspace: string }) { return <><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="workspace" value={workspace}/></>; }
function Field({ label, name, type = "text", defaultValue, required = true }: { label: string; name: string; type?: string; defaultValue?: string; required?: boolean }) { return <label className="text-sm font-semibold">{label}<input required={required} name={name} type={type} defaultValue={defaultValue} className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35"/></label>; }
function SelectUnit({ units }: { units: UnitRow[] }) { return <label className="text-sm font-semibold">Reservation unit<select name="reservationUnitId" className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3">{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} · capacity {unit.capacity}</option>)}</select></label>; }
function LiveBookings({ units, bookings }: { units: UnitRow[]; bookings: BookingRow[] }) { const names = new Map(units.map((unit) => [unit.id, unit.name])); return bookings.length ? <section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Current facility commitments</h2><ul className="mt-5 space-y-3">{bookings.map((booking) => <li key={booking.id} className="rounded-xl bg-surface p-4"><p className="font-semibold">{booking.title}</p><p className="mt-1 text-sm text-muted">{names.get(booking.reservation_unit_id) ?? "Facility"} · {new Date(booking.starts_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}</p></li>)}</ul></section> : <EmptyState title="No facility bookings yet" description="Allocate the first pitch commitment for this organisation."/>; }
function Summary({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-surface p-4"><p className="text-sm font-semibold text-muted">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>; }
function EventList({ instances, titles }: { instances: EventInstanceRow[]; titles: Map<string, string> }) { return instances.length ? <section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Scheduled club events</h2><ul className="mt-5 divide-y divide-border">{instances.map((instance) => <li key={instance.id} className="py-4 first:pt-0"><p className="font-semibold">{titles.get(instance.event_id) ?? "Club event"}</p><p className="mt-1 text-sm text-muted">{new Date(instance.starts_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}</p></li>)}</ul></section> : <EmptyState title="No scheduled events" description="Create a team event to populate the club calendar."/>; }
function OperationalForm({ title, rows, children }: { title: string; rows: Array<Record<string, unknown>>; children: ReactNode }) { return <div className="space-y-5"><section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-5">{children}</div></section>{rows.length ? <section className="rounded-2xl border border-border-strong bg-background p-5"><h2 className="font-semibold">Saved organisation records</h2><ul className="mt-3 divide-y divide-border">{rows.map((row) => <li key={String(row.id)} className="py-3"><p className="font-semibold">{String(row.name ?? row.title ?? (row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : row.club_name) ?? "Operational record")}</p><p className="mt-1 text-sm text-muted">{String(row.status ?? row.address ?? row.date_of_birth ?? row.display_name ?? `Version ${row.current_version ?? 1}`)}</p></li>)}</ul></section> : null}</div>; }
