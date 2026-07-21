"use client";

import { CalendarDays, CheckCircle2, Clock3, MapPin, UsersRound } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";

const card = "rounded-2xl border border-border-strong bg-background p-5 sm:p-6";
const input = "min-h-12 w-full rounded-[10px] border border-border-strong bg-background px-3 text-base text-ink outline-none focus:border-primary focus:ring-3 focus:ring-ring/25";

function Feedback({ children }: { children: React.ReactNode }) {
  return <div role="status" className="rounded-xl bg-info-soft px-4 py-3 text-sm font-medium leading-6 text-info-strong">{children}</div>;
}

export function CoachCoreFootballScreen({ section }: { section: string }) {
  if (section === "today") return <CoachToday />;
  if (section === "calendar") return <CoachCalendar />;
  if (section === "event-editor") return <CoachEventEditor />;
  if (section === "availability") return <CoachAvailability />;
  if (section === "squad") return <CoachSquad />;
  return null;
}

function CoachToday() {
  return (
    <section data-testid="coach-today" className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]" aria-labelledby="today-focus-title">
      <div className={card}><Status tone="success">Training · 09:30</Status><h2 id="today-focus-title" className="mt-4 text-xl font-semibold text-ink">Under 11s training</h2><p className="mt-3 flex items-center gap-2 text-sm text-muted"><MapPin className="size-4" aria-hidden="true" />Riverside Sports Ground · Pitch 2</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><Link className="inline-flex min-h-12 items-center justify-center rounded-[10px] bg-primary-strong px-4 font-semibold text-primary-foreground" href="/app/riverside-juniors/availability?role=coach">Review availability</Link><Link className="inline-flex min-h-12 items-center justify-center rounded-[10px] border border-border-strong px-4 font-semibold text-ink" href="/app/riverside-juniors/event-editor?role=coach">Edit event</Link></div></div>
      <aside className="rounded-2xl bg-surface-strong p-5 sm:p-6"><h2 className="text-lg font-semibold text-ink">Today’s picture</h2><dl className="mt-5 grid grid-cols-2 gap-4"><div><dt className="text-sm text-muted">Available</dt><dd className="mt-1 text-2xl font-semibold text-ink">8</dd></div><div><dt className="text-sm text-muted">Awaiting reply</dt><dd className="mt-1 text-2xl font-semibold text-ink">2</dd></div></dl></aside>
    </section>
  );
}

function CoachCalendar() {
  return (
    <section data-testid="coach-calendar" aria-labelledby="team-calendar-title"><div className="flex items-center gap-2"><CalendarDays className="size-5 text-primary-strong" aria-hidden="true" /><h2 id="team-calendar-title" className="text-xl font-semibold text-ink">Under 11s agenda</h2></div><div className="mt-5 grid gap-4 lg:grid-cols-2">{[["Training", "Sun 2 Aug · 09:30", "Pitch 2"], ["Meadow Park match", "Sun 9 Aug · 10:00", "Main pitch"]].map(([title, time, place]) => <article className={card} key={title}><Status tone={title === "Training" ? "success" : "info"}>{title === "Training" ? "Training" : "Match"}</Status><h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3><p className="mt-3 flex items-center gap-2 text-sm text-muted"><Clock3 className="size-4" aria-hidden="true" />{time}</p><p className="mt-2 flex items-center gap-2 text-sm text-muted"><MapPin className="size-4" aria-hidden="true" />{place}</p></article>)}</div></section>
  );
}

function CoachEventEditor() {
  const [title, setTitle] = useState("Under 11s training");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    if (!title.trim()) { setError("Enter an event title."); return; }
    setError(""); setSaved(true);
  }
  return (
    <section data-testid="coach-event-editor" className="max-w-3xl" aria-labelledby="editor-title">
      <form className={card} onSubmit={submit} noValidate><h2 id="editor-title" className="text-xl font-semibold text-ink">Edit recurring training</h2><p className="mt-2 text-sm leading-6 text-muted">Wall-clock time stays at 09:30 in Europe/London when the clocks change.</p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2"><label className="text-sm font-semibold text-ink sm:col-span-2">Event title<input className={`${input} mt-2`} value={title} onChange={(event) => { setTitle(event.target.value); setError(""); setSaved(false); }} /></label><label className="text-sm font-semibold text-ink">Starts<input className={`${input} mt-2`} type="datetime-local" defaultValue="2026-08-02T09:30" /></label><label className="text-sm font-semibold text-ink">Ends<input className={`${input} mt-2`} type="datetime-local" defaultValue="2026-08-02T11:00" /></label><label className="text-sm font-semibold text-ink sm:col-span-2">Location<input className={`${input} mt-2`} defaultValue="Riverside Sports Ground · Pitch 2" /></label><label className="text-sm font-semibold text-ink sm:col-span-2">Apply changes to<select aria-label="Apply changes to" className={`${input} mt-2`} defaultValue="this"><option value="this">This occurrence</option><option value="this-and-future">This and future occurrences</option><option value="all">All occurrences</option></select></label></div>
        {error ? <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-strong">{error}</p> : null}<Button className="mt-5 w-full sm:w-auto" type="submit">Preview event changes</Button>
      </form>{saved ? <div className="mt-4"><Feedback><strong>Demo only:</strong> The event change and its recurrence scope are previewed but were not saved. No calendar or notification was updated.</Feedback></div> : null}
    </section>
  );
}

function CoachAvailability() {
  const [reminded, setReminded] = useState(false);
  return (
    <section data-testid="coach-availability" aria-labelledby="availability-board-title"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 id="availability-board-title" className="text-xl font-semibold text-ink">Meadow Park match</h2><p className="mt-2 text-sm text-muted">Replies due Wednesday at 18:00.</p></div><Button type="button" variant="secondary" onClick={() => setReminded(true)}>Preview reminder</Button></div><div className="mt-5 grid gap-4 sm:grid-cols-3">{[["Available", "8", "success"], ["Unsure", "1", "warning"], ["Awaiting reply", "2", "neutral"]].map(([label, total, tone]) => <div className={card} key={label}><Status tone={tone as "success" | "warning" | "neutral"}>{label}</Status><p className="mt-4 text-3xl font-semibold text-ink">{total}</p></div>)}</div>{reminded ? <div className="mt-4"><Feedback><strong>Demo only:</strong> One reminder per household was queued in the development outbox for after quiet hours. Nothing was sent.</Feedback></div> : null}</section>
  );
}

function CoachSquad() {
  const [published, setPublished] = useState(false);
  return (
    <section data-testid="coach-squad" className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]" aria-labelledby="selection-guide-title">
      <div className={card}><div className="flex items-center gap-2"><UsersRound className="size-5 text-primary-strong" aria-hidden="true" /><h2 id="selection-guide-title" className="text-xl font-semibold text-ink">Selection guide</h2></div><p className="mt-2 text-sm leading-6 text-muted">Availability and recent opportunities inform the order. The guide never ranks children publicly.</p><div className="mt-5 space-y-3">{[["Jamie Morgan", "Available", "3 recent selections · 140 recent minutes", true], ["Rowan Taylor", "Unsure", "4 recent selections · 190 recent minutes", false]].map(([name, availability, detail, selected]) => <label key={String(name)} className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border border-border-strong p-4"><input className="mt-1" type="checkbox" defaultChecked={Boolean(selected)} /><span className="min-w-0 flex-1"><span className="block font-semibold text-ink">{name}</span><span className="mt-1 block text-sm text-muted">{availability} · {detail}</span></span></label>)}</div><Button className="mt-5 w-full sm:w-auto" type="button" onClick={() => setPublished(true)}>Preview squad publication</Button>{published ? <div className="mt-4"><Feedback><strong>Demo only:</strong> Squad statuses and history were previewed but not saved. No notifications were sent.</Feedback></div> : null}</div>
      <aside className="rounded-2xl bg-surface-strong p-5 sm:p-6"><Status tone="info">Fairness context</Status><h2 className="mt-4 text-lg font-semibold text-ink">Standby is a team need, not a ranking</h2><p className="mt-2 text-sm leading-6 text-muted">If a selected player withdraws, the offered place is recorded and the standby family chooses whether to accept.</p><div className="mt-5 flex items-center gap-2 text-sm font-semibold text-success-strong"><CheckCircle2 className="size-4" aria-hidden="true" />History will be recorded</div></aside>
    </section>
  );
}
