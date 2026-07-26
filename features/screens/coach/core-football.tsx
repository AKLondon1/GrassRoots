"use client";

import { ArrowDown, ArrowUp, BookOpen, CalendarDays, CheckCircle2, ClipboardCheck, Clock3, MapPin, Pause, Play, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import { recoverMatchClock, transitionMatchClock, type MatchClockState } from "@/features/coaching/match-timer";

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
  if (section === "team") return <CoachTeam />;
  if (section === "match-day") return <CoachMatchDay />;
  if (section === "formation") return <CoachFormation />;
  if (section === "playing-time") return <CoachPlayingTime />;
  if (section === "attendance") return <CoachAttendance />;
  if (section === "training") return <CoachTraining />;
  if (section === "drills") return <CoachDrills />;
  if (section === "players") return <CoachPlayers />;
  if (section === "development") return <CoachDevelopment />;
  if (section === "compose") return <CoachCompose />;
  if (section === "volunteers") return <CoachVolunteers />;
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

function ScreenIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-strong">{eyebrow}</p><h2 className="mt-2 text-xl font-semibold text-ink sm:text-2xl">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p></header>;
}

function CoachTeam() {
  return <section data-testid="coach-team" aria-labelledby="coach-team-title"><ScreenIntro eyebrow="Under 11s" title="A whole-team view, without public rankings" description="Availability, attendance and recent opportunity are shown privately to help you plan fairly." /><div className="mt-5 grid gap-4 sm:grid-cols-2"><article className={card}><h3 id="coach-team-title" className="font-semibold text-ink">Jamie Morgan</h3><p className="mt-2 text-sm text-muted">Available · 92% training attendance</p><Status className="mt-4" tone="success">Objective progressing</Status></article><article className={card}><h3 className="font-semibold text-ink">Rowan Taylor</h3><p className="mt-2 text-sm text-muted">Unsure · 88% training attendance</p><Status className="mt-4" tone="info">Review due this month</Status></article></div></section>;
}

function CoachMatchDay() {
  const [clock, setClock] = useState<MatchClockState>({ status: "ready", elapsedBeforeMs: 0 });
  const [now, setNow] = useState(() => new Date().toISOString());
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (clock.status !== "running") return;
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => window.clearInterval(timer);
  }, [clock.status]);
  const recovered = recoverMatchClock(clock, now);
  function change(type: "start" | "pause" | "resume" | "end") {
    const at = new Date().toISOString();
    setClock((current) => transitionMatchClock(current, { type, at }));
    setNow(at);
    setNotice(type === "end" ? "Match completion previewed. The demo does not persist the timeline." : "Clock state is timestamp-derived and can recover after a refresh in production.");
  }
  return <section data-testid="coach-match-day" aria-labelledby="match-day-title"><ScreenIntro eyebrow="Match day" title="Under 11s v Meadow Park" description="A resilient match clock and event timeline designed for touch, keyboard and unreliable touchline connectivity." /><div className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]"><div className="rounded-2xl bg-ink p-6 text-white"><p className="text-sm font-semibold text-white/70">Official elapsed time</p><p id="match-day-title" aria-live="polite" className="mt-3 font-mono text-5xl font-semibold tabular-nums">{recovered.display}</p><p className="mt-2 text-sm text-white/70">{clock.status[0].toUpperCase() + clock.status.slice(1)}</p><div className="mt-6 flex flex-wrap gap-3">{clock.status === "ready" ? <Button type="button" onClick={() => change("start")}><Play className="size-4" aria-hidden="true" />Start match</Button> : null}{clock.status === "running" ? <Button type="button" onClick={() => change("pause")}><Pause className="size-4" aria-hidden="true" />Pause clock</Button> : null}{clock.status === "paused" ? <Button type="button" onClick={() => change("resume")}><Play className="size-4" aria-hidden="true" />Resume clock</Button> : null}{clock.status === "running" || clock.status === "paused" ? <Button type="button" variant="secondary" onClick={() => change("end")}>End match</Button> : null}</div></div><div className={card}><h3 className="font-semibold text-ink">Live actions</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><Button variant="secondary" type="button" onClick={() => setNotice("Goal previewed at the recovered timestamp.")}>Record goal</Button><Button variant="secondary" type="button" onClick={() => setNotice("Substitution preview opened. Production applies it atomically.")}>Make substitution</Button></div><ol className="mt-5 space-y-3 text-sm text-muted"><li className="rounded-xl bg-surface p-3">00:00 · Formation confirmed</li><li className="rounded-xl bg-surface p-3">All further actions use server timestamps</li></ol></div></div>{notice ? <div className="mt-4"><Feedback><strong>Demo only:</strong> {notice}</Feedback></div> : null}</section>;
}

function CoachFormation() {
  const [formation, setFormation] = useState("2-3-1");
  const positions = formation === "2-3-1" ? [["Jamie", "GK"], ["Rowan", "ST"], ["Ari", "CB"], ["Ellis", "CB"], ["Noor", "CM"], ["Robin", "LW"], ["Sasha", "RW"]] : [["Jamie", "GK"], ["Ari", "CB"], ["Ellis", "CB"], ["Noor", "DM"], ["Robin", "CM"], ["Sasha", "AM"], ["Rowan", "ST"]];
  return <section data-testid="coach-formation" aria-labelledby="formation-title"><ScreenIntro eyebrow="7-a-side" title="Starting formation" description="One goalkeeper and one position per player are required before match start." /><div className="mt-5 grid gap-5 lg:grid-cols-[0.7fr_1.3fr]"><div className={card}><label className="text-sm font-semibold text-ink" htmlFor="formation-shape">Shape</label><select id="formation-shape" className={`${input} mt-2`} value={formation} onChange={(event) => setFormation(event.target.value)}><option>2-3-1</option><option>2-1-2-1</option></select><p className="mt-4 flex items-center gap-2 text-sm text-success-strong"><ShieldCheck className="size-4" aria-hidden="true" />Formation is valid</p></div><div id="formation-title" className="grid grid-cols-2 gap-3 rounded-2xl bg-success-soft p-5 sm:grid-cols-3" aria-label="Formation pitch">{positions.map(([name, position]) => <div className="min-h-20 rounded-xl border border-success/30 bg-background p-3 text-center" key={name}><span className="block text-xs font-bold text-primary-strong">{position}</span><span className="mt-2 block text-sm font-semibold text-ink">{name}</span></div>)}</div></div></section>;
}

function CoachPlayingTime() {
  return <section data-testid="coach-playing-time" aria-labelledby="playing-time-title"><ScreenIntro eyebrow="Fair opportunity" title="Playing time" description="Minutes come from recorded pitch intervals, including goalkeeper and position rotations." /><div className="mt-5 overflow-x-auto rounded-2xl border border-border-strong bg-background"><table className="w-full min-w-[34rem] text-left text-sm"><caption id="playing-time-title" className="sr-only">Player playing-time report</caption><thead className="bg-surface text-muted"><tr><th className="p-4">Player</th><th className="p-4">Today</th><th className="p-4">Goalkeeper</th><th className="p-4">Recent total</th></tr></thead><tbody>{[["Jamie Morgan", "60 min", "30 min", "200 min"], ["Rowan Taylor", "45 min", "0 min", "235 min"]].map((row) => <tr className="border-t border-border" key={row[0]}>{row.map((value) => <td className="p-4 first:font-semibold first:text-ink" key={value}>{value}</td>)}</tr>)}</tbody></table></div><p className="mt-4 text-sm text-muted">Current spread: 15 minutes. Use this context privately; it is never a child ranking.</p></section>;
}

function CoachAttendance() {
  const [marks, setMarks] = useState<Record<string, string>>({ Jamie: "present", Rowan: "late" });
  const [queued, setQueued] = useState(false);
  return <section data-testid="coach-attendance" aria-labelledby="attendance-title"><ScreenIntro eyebrow="Online save" title="Training attendance" description="A connection is required. Child attendance is never placed in a durable browser queue." /><div className="mt-5 space-y-3">{Object.entries(marks).map(([name, value]) => <div className={`${card} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`} key={name}><h3 className="font-semibold text-ink">{name}</h3><fieldset className="flex flex-wrap gap-2"><legend className="sr-only">Attendance for {name}</legend>{["present", "late", "absent"].map((status) => <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border-strong px-3 text-sm capitalize has-[:checked]:border-primary has-[:checked]:bg-primary-light" key={status}><input type="radio" name={`attendance-${name}`} checked={value === status} onChange={() => { setMarks((current) => ({ ...current, [name]: status })); setQueued(false); }} />{status}</label>)}</fieldset></div>)}</div><Button className="mt-5" type="button" onClick={() => setQueued(true)}><ClipboardCheck className="size-4" aria-hidden="true" />Preview attendance</Button>{queued ? <div className="mt-4"><Feedback><strong>Demo only:</strong> Two attendance actions are previewed in memory only. Nothing was saved, queued or sent.</Feedback></div> : null}</section>;
}

function CoachTraining() {
  const [items, setItems] = useState(["Welcome and warm-up", "Passing gates", "Small-sided game"]);
  const [saved, setSaved] = useState(false);
  function move(index: number, delta: number) { const next = [...items]; const target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target]!, next[index]!]; setItems(next); setSaved(false); }
  return <section data-testid="coach-training" aria-labelledby="training-title"><ScreenIntro eyebrow="Sunday · 09:30" title="Training plan" description="A 60-minute session with five minutes intentionally left for transitions and a drink break." /><ol id="training-title" className="mt-5 space-y-3">{items.map((title, index) => <li className={`${card} flex items-center gap-3`} key={title}><span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-light text-sm font-bold text-primary-strong">{index + 1}</span><span className="min-w-0 flex-1 font-semibold text-ink">{title}<span className="mt-1 block text-sm font-normal text-muted">{index === 0 ? 10 : index === 1 ? 20 : 25} minutes</span></span><Button aria-label={`Move ${title} up`} disabled={index === 0} size="icon" variant="quiet" onClick={() => move(index, -1)}><ArrowUp className="size-4" aria-hidden="true" /></Button><Button aria-label={`Move ${title} down`} disabled={index === items.length - 1} size="icon" variant="quiet" onClick={() => move(index, 1)}><ArrowDown className="size-4" aria-hidden="true" /></Button></li>)}</ol><Button className="mt-5" type="button" onClick={() => setSaved(true)}>Preview training plan</Button>{saved ? <div className="mt-4"><Feedback><strong>Demo only:</strong> The ordered 55-minute plan is valid but was not saved.</Feedback></div> : null}</section>;
}

function CoachDrills() {
  return <section data-testid="coach-drills" aria-labelledby="drills-title"><ScreenIntro eyebrow="Shared club library" title="Drills" description="Reusable activities are tagged by theme and adapt to the number of players available." /><div id="drills-title" className="mt-5 grid gap-4 sm:grid-cols-2">{[["Passing gates", "Passing · Scanning", "6–14 players · 20 min"], ["Four-goal game", "Decision making · Transition", "8–16 players · 25 min"], ["Arrival ball mastery", "Technique · Warm-up", "1–18 players · 10 min"]].map(([title, tags, detail]) => <article className={card} key={title}><BookOpen className="size-5 text-primary-strong" aria-hidden="true" /><h3 className="mt-3 font-semibold text-ink">{title}</h3><p className="mt-2 text-sm text-muted">{detail}</p><p className="mt-4 text-xs font-bold uppercase tracking-wide text-primary-strong">{tags}</p></article>)}</div></section>;
}

function CoachPlayers() {
  return <section data-testid="coach-players" aria-labelledby="players-title"><ScreenIntro eyebrow="Private coach workspace" title="Player development" description="Open objectives and approved family-facing updates. Private notes require a recorded access reason." /><div id="players-title" className="mt-5 grid gap-4 sm:grid-cols-2">{[["Jamie Morgan", "Scan before receiving", "Review 10 August"], ["Rowan Taylor", "Support the press", "Review 18 August"]].map(([name, objective, review]) => <article className={card} key={name}><h3 className="font-semibold text-ink">{name}</h3><p className="mt-3 text-sm text-muted">Active objective</p><p className="mt-1 font-medium text-ink">{objective}</p><p className="mt-4 text-xs font-semibold text-muted">{review}</p></article>)}</div></section>;
}

function CoachDevelopment() {
  const [approved, setApproved] = useState(false);
  return <section data-testid="coach-development" aria-labelledby="development-title" className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]"><div className={card}><ScreenIntro eyebrow="Jamie Morgan" title="Development review" description="Private observations stay inside the coach workspace. The separate parent summary must be reviewed and approved." /><label className="mt-5 block text-sm font-semibold text-ink" htmlFor="parent-summary">Positive parent summary</label><textarea id="parent-summary" className={`${input} mt-2 min-h-32 py-3`} defaultValue="Jamie showed brave passing choices, supported teammates and used both feet." /><Button className="mt-4" type="button" onClick={() => setApproved(true)}>Approve parent summary</Button>{approved ? <div className="mt-4"><Feedback><strong>Demo only:</strong> Human approval is previewed. The summary was not persisted or shared.</Feedback></div> : null}</div><aside className="rounded-2xl bg-surface-strong p-5"><Status tone="neutral" icon={Sparkles}>AI suggestions off</Status><h3 id="development-title" className="mt-4 font-semibold text-ink">Privacy gate active</h3><p className="mt-2 text-sm leading-6 text-muted">No provider call is made without a server-side feature flag and credentials. Medical, safeguarding and private observations are always excluded. A coach must review, edit and approve any draft.</p></aside></section>;
}

function CoachCompose() {
  const [sent, setSent] = useState(false);
  return <section data-testid="coach-compose" className="max-w-3xl" aria-labelledby="compose-title"><form className={card} onSubmit={(event) => { event.preventDefault(); setSent(true); }}><ScreenIntro eyebrow="Team update" title="Compose announcement" description="Keep the message practical and appropriate for the whole team household." /><label className="mt-5 block text-sm font-semibold text-ink" htmlFor="update-title">Title</label><input id="update-title" className={`${input} mt-2`} defaultValue="Sunday arrival reminder" required /><label className="mt-4 block text-sm font-semibold text-ink" htmlFor="update-body">Message</label><textarea id="update-body" className={`${input} mt-2 min-h-32 py-3`} defaultValue="Please meet by the clubhouse at 09:40 with a labelled water bottle." required /><Button className="mt-5" type="submit">Preview announcement</Button></form>{sent ? <div className="mt-4"><Feedback><strong>Demo only:</strong> The announcement preview was not saved and no household was contacted.</Feedback></div> : null}<span id="compose-title" className="sr-only">Compose announcement form</span></section>;
}

function CoachVolunteers() {
  const [requested, setRequested] = useState(false);
  return <section data-testid="coach-volunteers" aria-labelledby="volunteers-title"><ScreenIntro eyebrow="Match support" title="Volunteers" description="See confirmed team helpers and request only the roles still needed." /><div className="mt-5 grid gap-4 sm:grid-cols-2"><article className={card}><Status tone="success">Confirmed</Status><h3 id="volunteers-title" className="mt-4 font-semibold text-ink">Priya Shah</h3><p className="mt-2 text-sm text-muted">Registration desk · 09:15</p></article><article className={card}><Status tone="warning">Needed</Status><h3 className="mt-4 font-semibold text-ink">Respect marshal</h3><p className="mt-2 text-sm text-muted">09:30–11:30 · Briefing provided</p><Button className="mt-4" variant="secondary" type="button" onClick={() => setRequested(true)}>Preview volunteer request</Button></article></div>{requested ? <div className="mt-4"><Feedback><strong>Demo only:</strong> The volunteer request was not saved or sent.</Feedback></div> : null}</section>;
}
