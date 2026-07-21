"use client";

import { CalendarDays, CheckCircle2, Clock3, MapPin, Megaphone } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import { riversideDemoCalendarToken } from "@/lib/demo/calendar-token";

const card = "rounded-2xl border border-border-strong bg-background p-5 sm:p-6";
const input = "min-h-12 w-full rounded-[10px] border border-border-strong bg-background px-3 text-base text-ink outline-none focus:border-primary focus:ring-3 focus:ring-ring/25";

function DemoFeedback({ children }: { children: React.ReactNode }) {
  return <div role="status" className="rounded-xl bg-info-soft px-4 py-3 text-sm font-medium leading-6 text-info-strong">{children}</div>;
}

function EventCard({ match = false }: { match?: boolean }) {
  return (
    <article className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Status tone={match ? "info" : "success"}>{match ? "Match" : "Training"}</Status>
        <span className="text-sm font-semibold text-muted">{match ? "Sun 9 Aug" : "Sun 2 Aug"}</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-ink">{match ? "Under 11s v Meadow Park Juniors" : "Under 11s training"}</h3>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Clock3 className="size-4" aria-hidden="true" />{match ? "10:00–11:30" : "09:30–11:00"}</p>
      <p className="mt-2 flex items-start gap-2 text-sm text-muted"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Riverside Sports Ground · {match ? "Main pitch" : "Pitch 2"}</p>
    </article>
  );
}

export function ParentCoreFootballScreen({ section }: { section: string }) {
  if (section === "actions") return <ParentActions />;
  if (section === "schedule") return <ParentSchedule />;
  if (section === "event") return <ParentEvent />;
  if (section === "availability") return <ParentAvailability />;
  if (section === "polls") return <ParentPoll />;
  if (section === "squad") return <ParentSquad />;
  if (section === "announcements") return <ParentAnnouncements />;
  return null;
}

function ParentActions() {
  return (
    <section data-testid="parent-actions" aria-labelledby="parent-actions-title" className="grid gap-5 lg:grid-cols-2">
      <div className={card}>
        <Status tone="warning">Due Wednesday</Status>
        <h2 id="parent-actions-title" className="mt-4 text-xl font-semibold text-ink">Can Jamie play on Sunday?</h2>
        <p className="mt-2 text-sm leading-6 text-muted">Reply for the Meadow Park match by 18:00 on 5 August.</p>
        <Link className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary-strong underline decoration-2 underline-offset-4" href="/app/riverside-juniors/availability?role=parent">Respond to availability</Link>
      </div>
      <div className={card}>
        <Status tone="info">One open poll</Status>
        <h2 className="mt-4 text-xl font-semibold text-ink">Choose a September training time</h2>
        <p className="mt-2 text-sm leading-6 text-muted">Three options are open until Friday at 19:00.</p>
        <Link className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary-strong underline decoration-2 underline-offset-4" href="/app/riverside-juniors/polls?role=parent">Answer the time poll</Link>
      </div>
    </section>
  );
}

function ParentSchedule() {
  return (
    <section data-testid="parent-schedule" aria-labelledby="family-agenda-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 id="family-agenda-title" className="text-xl font-semibold text-ink">Family agenda</h2><p className="mt-2 text-sm text-muted">Jamie’s next two Under 11s commitments.</p></div>
        <a className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary-strong underline decoration-2 underline-offset-4" href={`/api/calendar/${riversideDemoCalendarToken}`}><CalendarDays className="size-4" aria-hidden="true" />Private calendar feed</a>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2"><EventCard /><EventCard match /></div>
    </section>
  );
}

function ParentEvent() {
  return (
    <section data-testid="parent-event" className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]" aria-labelledby="event-detail-title">
      <div><h2 id="event-detail-title" className="sr-only">Event information</h2><EventCard match /></div>
      <aside className="rounded-2xl bg-surface-strong p-5 sm:p-6" aria-label="What changed">
        <Status tone="info">Updated Monday</Status>
        <h2 className="mt-4 text-lg font-semibold text-ink">What changed</h2>
        <dl className="mt-4 space-y-4 text-sm"><div><dt className="font-semibold text-ink">Pitch</dt><dd className="mt-1 text-muted"><s>Pitch 2</s> → Main pitch</dd></div><div><dt className="font-semibold text-ink">Meet time</dt><dd className="mt-1 text-muted"><s>09:45</s> → 09:40</dd></div></dl>
      </aside>
    </section>
  );
}

function ParentAvailability() {
  const [reply, setReply] = useState("available");
  const [saved, setSaved] = useState(false);
  function submit(event: FormEvent) { event.preventDefault(); setSaved(true); }
  return (
    <section data-testid="parent-availability" className="max-w-2xl" aria-labelledby="availability-question">
      <form className={card} onSubmit={submit}>
        <Status tone="warning">Reply by Wednesday at 18:00</Status>
        <h2 id="availability-question" className="mt-4 text-xl font-semibold text-ink">Can Jamie attend the Meadow Park match?</h2>
        <fieldset className="mt-6 grid gap-3 sm:grid-cols-3"><legend className="sr-only">Availability response</legend>{["Available", "Unavailable", "Unsure"].map((label) => <label key={label} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border-strong px-4 text-sm font-semibold text-ink has-[:checked]:border-primary has-[:checked]:bg-primary-light"><input type="radio" name="availability" value={label.toLowerCase()} checked={reply === label.toLowerCase()} onChange={(event) => { setReply(event.target.value); setSaved(false); }} />{label}</label>)}</fieldset>
        <label className="mt-5 block text-sm font-semibold text-ink" htmlFor="availability-note">Note for the manager <span className="font-normal text-muted">(optional)</span></label>
        <textarea id="availability-note" className={`${input} mt-2 min-h-24 py-3`} maxLength={240} placeholder="Add only practical attendance information" />
        <Button className="mt-5 w-full sm:w-auto" type="submit">Preview response</Button>
      </form>
      {saved ? <div className="mt-4"><DemoFeedback><strong>Demo only:</strong> {reply[0].toUpperCase() + reply.slice(1)} is previewed for Jamie. The response was not saved and no manager was notified.</DemoFeedback></div> : null}
    </section>
  );
}

function ParentPoll() {
  const [choice, setChoice] = useState("late-morning");
  const [saved, setSaved] = useState(false);
  return (
    <section data-testid="parent-polls" className="max-w-3xl" aria-labelledby="poll-title">
      <form className={card} onSubmit={(event) => { event.preventDefault(); setSaved(true); }}>
        <Status tone="info">Closes Friday at 19:00</Status><h2 id="poll-title" className="mt-4 text-xl font-semibold text-ink">September training time</h2><p className="mt-2 text-sm leading-6 text-muted">Choose the time Jamie can attend. Pitch capacity is shown alongside each option.</p>
        <fieldset className="mt-5 grid gap-3"><legend className="sr-only">Training time options</legend>{[
          ["morning", "Saturday 5 September · 09:00", "8 available · capacity 10"],
          ["late-morning", "Saturday 5 September · 11:00", "9 available · capacity 9 · recommended"],
          ["evening", "Saturday 5 September · 17:00", "9 available · capacity 7"],
        ].map(([value, label, detail]) => <label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-strong p-4 has-[:checked]:border-primary has-[:checked]:bg-primary-light"><input className="mt-1" type="radio" name="poll-option" value={value} checked={choice === value} onChange={(event) => { setChoice(event.target.value); setSaved(false); }} /><span><span className="block font-semibold text-ink">{label}</span><span className="mt-1 block text-sm text-muted">{detail}</span></span></label>)}</fieldset>
        <Button className="mt-5 w-full sm:w-auto" type="submit">Preview poll response</Button>
      </form>
      {saved ? <div className="mt-4"><DemoFeedback><strong>Demo only:</strong> Your choice is previewed but was not saved.</DemoFeedback></div> : null}
    </section>
  );
}

function ParentSquad() {
  return (
    <section data-testid="parent-squad" className="max-w-2xl" aria-labelledby="squad-status-title">
      <div className={card}><div className="flex items-center gap-3"><CheckCircle2 className="size-6 text-success-strong" aria-hidden="true" /><Status tone="success">Selected</Status></div><h2 id="squad-status-title" className="mt-4 text-xl font-semibold text-ink">Jamie has a place in Sunday’s squad</h2><p className="mt-2 text-sm leading-6 text-muted">Meet at 09:40 by the main pitch. If plans change, update availability so the manager can offer the place to standby.</p><Link className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary-strong underline decoration-2 underline-offset-4" href="/app/riverside-juniors/availability?role=parent">Update availability</Link></div>
      <p className="mt-4 text-sm leading-6 text-muted">Squad status uses neutral wording and does not show rankings or other children’s selection history.</p>
    </section>
  );
}

function ParentAnnouncements() {
  const [read, setRead] = useState(false);
  return (
    <section data-testid="parent-announcements" className="max-w-3xl" aria-labelledby="announcements-title">
      <div className={card}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Megaphone className="size-5 text-primary-strong" aria-hidden="true" /><h2 id="announcements-title" className="text-xl font-semibold text-ink">Pitch and arrival update</h2></div>{read ? <Status tone="neutral">Read</Status> : <Status tone="info">New</Status>}</div><p className="mt-4 text-sm leading-6 text-muted">Sunday’s match is on the main pitch. Please meet by the clubhouse at 09:40.</p><p className="mt-3 text-xs font-semibold text-muted">Team update · Monday at 18:20 · Development outbox, not sent</p><Button className="mt-5" variant="secondary" type="button" onClick={() => setRead(true)}>Mark as read in preview</Button></div>
      {read ? <div className="mt-4"><DemoFeedback><strong>Demo only:</strong> Read state changed in this preview and was not saved.</DemoFeedback></div> : null}
    </section>
  );
}
