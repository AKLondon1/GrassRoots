"use client";

import {
  CalendarDays,
  ClipboardCheck,
  CloudRain,
  FileText,
  MapPin,
  PackageCheck,
  Search,
  ShieldCheck,
  UsersRound,
  Wrench,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";

const summaryItems = [
  { label: "Saturday fixtures", value: "4", detail: "Three allocated, one needs a decision", icon: CalendarDays },
  { label: "Open maintenance", value: "2", detail: "One job affects a playing surface", icon: Wrench },
  { label: "Volunteer gaps", value: "1", detail: "Under 7s welcome desk", icon: UsersRound },
];

const sectionsWithDirectory = new Set(["teams", "seasons", "people", "invitations", "fixtures", "opposition"]);

export function ClubOperationsScreen({ section }: { section: string }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [relocation, setRelocation] = useState("pitch-2-1100");
  const [showClosureResolution, setShowClosureResolution] = useState(false);
  const [closureResolution, setClosureResolution] = useState("cancel");
  const preview = (message: string) => setFeedback(message);

  if (section === "overview" || section === "calendar") {
    return (
      <div className="space-y-6">
        <section aria-labelledby="club-week-title" className="rounded-2xl bg-primary-strong p-5 text-primary-foreground sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="club-week-title" className="text-xl font-semibold tracking-[-0.025em]">The club week at a glance</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-primary-foreground/85">Saturday’s plan has one resolvable pitch clash. Inspections and volunteer cover are shown beside the bookings they affect.</p>
            </div>
            <Status tone="warning">1 decision needed</Status>
          </div>
        </section>
        <div className="grid gap-4 md:grid-cols-3">
          {summaryItems.map(({ label, value, detail, icon: Icon }) => (
            <section key={label} className="rounded-2xl border border-border-strong bg-background p-5">
              <Icon className="size-5 text-primary-strong" aria-hidden="true" />
              <p className="mt-5 text-3xl font-semibold tracking-[-0.03em]">{value}</p>
              <h2 className="mt-2 font-semibold">{label}</h2>
              <p className="mt-1 text-sm leading-5 text-muted">{detail}</p>
            </section>
          ))}
        </div>
        <FixtureAgenda />
      </div>
    );
  }

  if (section === "pitch-planner") {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7" aria-labelledby="pitch-plan-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 id="pitch-plan-title" className="text-xl font-semibold">Saturday pitch plan</h2><p className="mt-2 text-sm leading-6 text-muted">08 August · Riverside Sports Ground · buffers included</p></div>
            <Status tone="warning">1 conflict</Status>
          </div>
          <ol className="mt-6 space-y-3" aria-label="Pitch allocations">
            <Allocation time="09:00–10:30" pitch="Main pitch" team="Under 11s v Meadow Park" tone="danger" note="Overlaps council block from 10:15" />
            <Allocation time="09:30–10:30" pitch="Pitch 2" team="Under 7s training" tone="success" note="15-minute turnaround protected" />
            <Allocation time="11:00–12:30" pitch="Pitch 2" team="Available alternative" tone="info" note="Capacity 18 · accessible route" />
          </ol>
          <div className="mt-6 rounded-xl bg-surface p-4">
            <label htmlFor="relocation" className="text-sm font-semibold">Move Under 11s fixture</label>
            <p id="relocation-help" className="mt-1 text-sm text-muted">A keyboard-accessible alternative to dragging the fixture.</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <select id="relocation" aria-describedby="relocation-help" value={relocation} onChange={(event) => setRelocation(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-border-strong bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35">
                <option value="pitch-2-1100">Pitch 2 · 11:00 · recommended</option>
                <option value="training-area-0900">Training area · 09:00 · capacity too low</option>
              </select>
              <Button type="button" onClick={() => preview(relocation === "pitch-2-1100" ? "Demo preview only: Under 11s would move to Pitch 2 at 11:00. This change was not saved and nobody was notified." : "This alternative cannot be used because its capacity is too low.")}>Preview relocation</Button>
            </div>
          </div>
        </section>
        <Feedback message={feedback} />
      </div>
    );
  }

  if (section === "inspections") {
    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7">
          <div className="flex items-center gap-3"><ClipboardCheck className="size-5 text-primary-strong" aria-hidden="true" /><h2 className="text-xl font-semibold">Morning inspection</h2></div>
          <p className="mt-2 text-sm leading-6 text-muted">Main pitch · completed 07:40 by Priya Shah</p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-3"><InspectionItem label="Surface" value="Waterlogged area" warning /><InspectionItem label="Goals" value="Secure" /><InspectionItem label="Access route" value="Clear" /></dl>
          <div className="mt-6 flex flex-wrap gap-3"><Button type="button" onClick={() => { setShowClosureResolution(true); preview("Demo preview only: a closure would affect one fixture. No booking was changed and no message was sent."); }}>Preview pitch closure</Button><Button type="button" variant="secondary" onClick={() => preview("Demo preview only: the maintenance task was not created.")}>Preview maintenance task</Button></div>
          {showClosureResolution ? <div className="mt-6 rounded-xl bg-surface p-4"><h3 className="font-semibold">Affected event: Under 11s v Meadow Park</h3><p className="mt-1 text-sm text-muted">09 August · 09:00 · 18 linked family calendar feeds</p><label htmlFor="closure-resolution" className="mt-4 block text-sm font-semibold">Resolve affected Under 11s fixture</label><select id="closure-resolution" value={closureResolution} onChange={(event) => setClosureResolution(event.target.value)} className="mt-2 min-h-11 w-full rounded-[10px] border border-border-strong bg-background px-3"><option value="cancel">Cancel event</option><option value="pitch-2">Move to Pitch 2</option></select><Button className="mt-4" type="button" onClick={() => preview(closureResolution === "cancel" ? "Demo preview only: the event would be cancelled, removed from family calendar feeds and an urgent notice queued. Nothing was saved or sent." : "Demo preview only: the event would move to Pitch 2, calendars would update and an urgent notice would be queued. Nothing was saved or sent.")}>Preview closure outcome</Button></div> : null}
        </section>
        <Feedback message={feedback} />
      </div>
    );
  }

  if (section === "venues") return <Venues />;
  if (section === "maintenance") return <Maintenance feedback={feedback} onPreview={preview} />;
  if (section === "documents") return <Documents feedback={feedback} onPreview={preview} />;
  if (section === "equipment") return <Equipment feedback={feedback} onPreview={preview} />;
  if (section === "volunteers") return <VolunteerRota feedback={feedback} onPreview={preview} />;
  if (section === "reports" || section === "audit") return <Reports section={section} feedback={feedback} onPreview={preview} />;
  if (section === "support") return <Support feedback={feedback} onPreview={preview} />;
  if (sectionsWithDirectory.has(section)) return <Directory section={section} />;

  return <FixtureAgenda />;
}

function Feedback({ message }: { message: string | null }) {
  return message ? <p role="status" className="rounded-xl bg-info-soft px-4 py-3 text-sm font-medium leading-6 text-info-strong">{message}</p> : null;
}

function Allocation({ time, pitch, team, tone, note }: { time: string; pitch: string; team: string; tone: "danger" | "success" | "info"; note: string }) {
  return <li className="grid gap-2 rounded-xl border border-border p-4 sm:grid-cols-[7rem_1fr_auto] sm:items-center"><time className="text-sm font-semibold">{time}</time><div><p className="font-semibold">{team}</p><p className="mt-1 text-sm text-muted">{pitch} · {note}</p></div><Status tone={tone}>{tone === "danger" ? "Conflict" : tone === "success" ? "Allocated" : "Alternative"}</Status></li>;
}

function InspectionItem({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="rounded-xl bg-surface p-4"><dt className="text-xs font-semibold text-muted">{label}</dt><dd className={`mt-2 text-sm font-semibold ${warning ? "text-warning-strong" : "text-ink"}`}>{value}</dd></div>;
}

function Venues() {
  return <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]"><section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><div className="flex items-center gap-3"><MapPin className="size-5 text-primary-strong" aria-hidden="true"/><h2 className="text-xl font-semibold">Riverside Sports Ground</h2></div><p className="mt-2 text-sm text-muted">Mill Lane, Riverside · step-free entrance from the east car park</p><dl className="mt-6 divide-y divide-border"><VenueRow name="Main pitch" detail="11v11 · divisible into half A and half B"/><VenueRow name="Pitch 2" detail="9v9 · floodlit · accessible route"/><VenueRow name="Training area" detail="5v5 · excluded while Pitch 2 is in full use"/><VenueRow name="External 3G hire" detail="Supplier request drafted · £85.00 · not confirmed"/></dl></section><aside className="rounded-2xl bg-info-soft p-5"><CloudRain className="size-5 text-info-strong" aria-hidden="true"/><h2 className="mt-4 font-semibold">Development weather fixture</h2><p className="mt-2 text-sm leading-6 text-info-strong">Recent rain · 8 mm. This is not a live forecast and must not be used for safety decisions.</p></aside></div>;
}

function VenueRow({ name, detail }: { name: string; detail: string }) { return <div className="py-4 first:pt-0 last:pb-0"><dt className="font-semibold">{name}</dt><dd className="mt-1 text-sm text-muted">{detail}</dd></div>; }

function Maintenance({ feedback, onPreview }: { feedback: string | null; onPreview: (message: string) => void }) {
  return <div className="space-y-5"><section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Maintenance board</h2><div className="mt-5 space-y-3"><Task title="Repair drainage channel" detail="Main pitch · high priority · assigned to grounds team" tone="warning"/><Task title="Replace corner flags" detail="Equipment store · due 14 August" tone="info"/></div><Button className="mt-5" type="button" onClick={() => onPreview("Demo preview only: a maintenance request was prepared but not saved.")}>Preview new request</Button></section><Feedback message={feedback}/></div>;
}

function Task({ title, detail, tone }: { title: string; detail: string; tone: "warning" | "info" }) { return <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-4"><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-muted">{detail}</p></div><Status tone={tone}>{tone === "warning" ? "High" : "Planned"}</Status></article>; }

function Documents({ feedback, onPreview }: { feedback: string | null; onPreview: (message: string) => void }) {
  return <div className="space-y-5"><section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Club knowledge</h2><p className="mt-2 text-sm text-muted">Versioned documents are searchable only for roles allowed to view them.</p></div><Search className="size-5 text-primary-strong" aria-hidden="true"/></div><article className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-surface p-4"><div className="flex items-start gap-3"><FileText className="mt-0.5 size-5 text-primary-strong" aria-hidden="true"/><div><h3 className="font-semibold">Pitch allocation policy</h3><p className="mt-1 text-sm text-muted">Version 3 · approved 12 July 2026 · replaces version 2</p></div></div><Status tone="success">Current</Status></article><div className="mt-5 flex flex-wrap gap-3"><Button type="button" onClick={() => onPreview("Export preview: 1 permitted record, watermarked for Riverside Juniors and recorded in the audit log. No file was generated in demo mode.")}>Preview CSV export</Button><Button type="button" variant="secondary" onClick={() => onPreview("PDF preview: the export would be watermarked and audited. No file was generated in demo mode.")}>Preview PDF export</Button></div></section><Feedback message={feedback}/></div>;
}

function Equipment({ feedback, onPreview }: { feedback: string | null; onPreview: (message: string) => void }) {
  return <div className="space-y-5"><section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><div className="flex items-center gap-3"><PackageCheck className="size-5 text-primary-strong" aria-hidden="true"/><h2 className="text-xl font-semibold">Kit and equipment</h2></div><article className="mt-6 rounded-xl bg-surface p-4"><h3 className="font-semibold">Under 11 match kit</h3><p className="mt-1 text-sm text-muted">Reserved for 08 August · collection 08:15 · 18 shirts</p><Status className="mt-3" tone="success">Reserved</Status></article><Button className="mt-5" type="button" onClick={() => onPreview("Demo preview only: the equipment reservation was not saved.")}>Preview reservation</Button></section><Feedback message={feedback}/></div>;
}

function VolunteerRota({ feedback, onPreview }: { feedback: string | null; onPreview: (message: string) => void }) {
  return <div className="space-y-5"><section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><div className="flex items-center gap-3"><UsersRound className="size-5 text-primary-strong" aria-hidden="true"/><h2 className="text-xl font-semibold">Saturday volunteer rota</h2></div><article className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-surface p-4"><div><h3 className="font-semibold">Match-day welcome desk</h3><p className="mt-1 text-sm text-muted">08:30–09:15 · 1 person needed · Under 11s fixture</p></div><Status tone="warning">Unfilled</Status></article><Button className="mt-5" type="button" onClick={() => onPreview("Demo preview only: the volunteer offer was not sent and the rota was not changed.")}>Preview volunteer request</Button></section><Feedback message={feedback}/></div>;
}

function Reports({ section, feedback, onPreview }: { section: string; feedback: string | null; onPreview: (message: string) => void }) {
  return <div className="space-y-5"><section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><div className="flex items-center gap-3"><ShieldCheck className="size-5 text-primary-strong" aria-hidden="true"/><h2 className="text-xl font-semibold">{section === "audit" ? "Audit trail" : "Operational reports"}</h2></div><p className="mt-2 text-sm leading-6 text-muted">Exports include only records allowed by your current capability. Formula-like CSV values are neutralised and every export is watermarked and audited.</p><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-sm"><thead><tr className="border-b border-border text-muted"><th className="px-3 py-3 font-semibold">Time</th><th className="px-3 py-3 font-semibold">Action</th><th className="px-3 py-3 font-semibold">Outcome</th></tr></thead><tbody><tr><td className="px-3 py-4">21 Jul · 09:10</td><td className="px-3 py-4">Pitch plan viewed</td><td className="px-3 py-4">Authorised</td></tr><tr className="border-t border-border"><td className="px-3 py-4">20 Jul · 18:42</td><td className="px-3 py-4">Inspection recorded</td><td className="px-3 py-4">Complete</td></tr></tbody></table></div><Button className="mt-5" type="button" onClick={() => onPreview("Demo export preview only: the file would be permission-filtered, watermarked and audited.")}>Preview report export</Button></section><Feedback message={feedback}/></div>;
}

function Support({ feedback, onPreview }: { feedback: string | null; onPreview: (message: string) => void }) {
  return <div className="space-y-5"><section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Support request</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Platform support cannot casually browse club records. Any approved access is reason-bound, time-limited and audited.</p><label htmlFor="support-reason" className="mt-5 block text-sm font-semibold">What do you need help with?</label><textarea id="support-reason" defaultValue="Pitch booking reference GR-18 cannot be relocated" className="mt-2 min-h-28 w-full rounded-[10px] border border-border-strong bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35"/><Button className="mt-4" type="button" onClick={() => onPreview("Demo preview only: the support request was not submitted. A real support session would expire after 30 minutes and create an audit entry.")}>Preview support request</Button></section><Feedback message={feedback}/></div>;
}

function Directory({ section }: { section: string }) {
  const title = section === "teams" ? "Teams and season" : section === "seasons" ? "2026–27 season" : section === "invitations" ? "Manager invitations" : section === "opposition" ? "Opposition directory" : section === "fixtures" ? "Fixture register" : "Club people";
  return <section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><div className="flex items-center gap-3"><UsersRound className="size-5 text-primary-strong" aria-hidden="true"/><h2 className="text-xl font-semibold">{title}</h2></div><p className="mt-2 text-sm leading-6 text-muted">Riverside Juniors’ fictional demo data is scoped to this organisation and is not saved.</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><article className="rounded-xl bg-surface p-4"><h3 className="font-semibold">Under 11s</h3><p className="mt-1 text-sm text-muted">Sam Taylor · 3 registered players</p></article><article className="rounded-xl bg-surface p-4"><h3 className="font-semibold">Under 7s</h3><p className="mt-1 text-sm text-muted">Manager invitation pending</p></article></div></section>;
}

function FixtureAgenda() {
  return <section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"><h2 className="text-xl font-semibold">Fixtures and facility commitments</h2><div className="mt-5 space-y-3"><Task title="Under 11s v Meadow Park" detail="08 Aug · 09:00 · main pitch · allocation needs review" tone="warning"/><Task title="Under 7s training" detail="08 Aug · 09:30 · Pitch 2 · volunteer welcome desk unfilled" tone="info"/></div></section>;
}
