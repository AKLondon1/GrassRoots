"use client";

import { BellRing, CalendarDays, CheckCircle2, CreditCard, HelpCircle, MessageCircle, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import { riversideDemoCalendarToken } from "@/lib/demo/calendar-token";

const card = "rounded-2xl border border-border-strong bg-background p-5 sm:p-7";

function Feedback({ children }: { children: React.ReactNode }) {
  return <p role="status" className="mt-4 rounded-xl bg-info-soft px-4 py-3 text-sm font-medium text-info-strong">{children}</p>;
}

export function ParentAccountScreen({ section }: { section: string }) {
  if (section === "payments") return <ParentPayments />;
  if (section === "consents") return <ParentConsents />;
  if (section === "messages") return <ParentMessages />;
  if (section === "notifications") return <ParentNotifications />;
  if (section === "household") return <ParentHousehold />;
  if (section === "calendar") return <ParentCalendar />;
  if (section === "help") return <ParentHelp />;
  return null;
}

function ParentHousehold() {
  return <section data-testid="parent-household" className="max-w-3xl" aria-labelledby="household-title"><div className={card}><div className="flex items-center gap-3"><UsersRound className="size-5 text-primary-strong" aria-hidden="true"/><h2 className="text-xl font-semibold" id="household-title">Morgan household</h2></div><p className="mt-3 text-sm leading-6 text-muted">Your view includes only the children and adult relationships linked to this signed-in guardian.</p><ul className="mt-6 divide-y divide-border"><li className="py-4"><p className="font-semibold">Jamie Morgan</p><p className="mt-1 text-sm text-muted">Under 11s · communication, payments and consent enabled</p></li><li className="py-4"><p className="font-semibold">Maya Morgan</p><p className="mt-1 text-sm text-muted">Under 7s · communication and consent enabled</p></li></ul><Button className="mt-4" type="button" variant="secondary">Preview contact update</Button></div><p className="mt-4 text-sm leading-6 text-muted">Restricted-contact details are never shown to another household adult.</p></section>;
}

function ParentCalendar() {
  return <section data-testid="parent-calendar" className="max-w-3xl" aria-labelledby="calendar-links-title"><div className={card}><div className="flex items-center gap-3"><CalendarDays className="size-5 text-primary-strong" aria-hidden="true"/><h2 className="text-xl font-semibold" id="calendar-links-title">Private family calendar</h2></div><p className="mt-3 text-sm leading-6 text-muted">Subscribe to Jamie’s scheduled training and matches. Treat this private URL like a password.</p><Button asChild className="mt-6"><a href={`/api/calendar/${riversideDemoCalendarToken}`}>Open demo calendar feed</a></Button><p className="mt-4 text-xs leading-5 text-muted">In production you can revoke this feed and issue a replacement from this screen.</p></div></section>;
}

function ParentHelp() {
  return <section data-testid="parent-help" className="grid gap-5 lg:grid-cols-2" aria-labelledby="parent-help-title"><div className={card}><HelpCircle className="size-6 text-primary-strong" aria-hidden="true"/><h2 className="mt-4 text-xl font-semibold" id="parent-help-title">Help with your club account</h2><p className="mt-3 text-sm leading-6 text-muted">For team times, selection or payment questions, contact Riverside Juniors through its normal adult support channel.</p><Button className="mt-5" type="button" variant="secondary">Preview support request</Button></div><div className={card}><ShieldCheck className="size-6 text-primary-strong" aria-hidden="true"/><h2 className="mt-4 text-xl font-semibold">Safeguarding and privacy</h2><p className="mt-3 text-sm leading-6 text-muted">Use the club’s urgent safeguarding route when someone may be at risk. Account-data guidance is available separately.</p><Link className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary-strong underline decoration-2 underline-offset-4" href="/safeguarding">Read safeguarding guidance</Link></div></section>;
}

function ParentPayments() {
  const [feedback, setFeedback] = useState(false);
  return <section data-testid="parent-payments" className="max-w-4xl space-y-5" aria-labelledby="payments-title">
    <div className={card}>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><Status tone="warning">Due 31 August</Status><h2 id="payments-title" className="mt-4 text-xl font-semibold">2026–27 membership</h2><p className="mt-2 text-sm text-muted">Jamie Morgan · invoice GR-2026-014</p></div><p className="text-2xl font-semibold tracking-tight">£125.00</p></div>
      <dl className="mt-6 grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-2"><div><dt className="text-muted">Season fee</dt><dd className="mt-1 font-semibold">£150.00</dd></div><div><dt className="text-muted">Sibling discount</dt><dd className="mt-1 font-semibold text-success-strong">−£25.00</dd></div></dl>
      <div className="mt-6 flex flex-wrap gap-3"><Button type="button" onClick={() => setFeedback(true)}><CreditCard className="size-4" aria-hidden="true"/>Preview manual payment</Button><Button asChild variant="secondary"><a download="GR-2026-014-demo.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent("Riverside Juniors\nDemo invoice GR-2026-014\nJamie Morgan\nTotal GBP 125.00\nFictional non-production record")}`}>Download demo invoice</a></Button></div>
      {feedback ? <Feedback>Development ledger only: your card has not been charged. A treasurer must independently reconcile this payment.</Feedback> : null}
    </div>
    <p className="text-sm leading-6 text-muted">Secure online checkout appears only when the club connects Stripe. Payment records are separate from GrassRoots platform subscription billing.</p>
  </section>;
}

function ParentConsents() {
  const [granted, setGranted] = useState(false);
  return <section data-testid="parent-consents" className="max-w-3xl" aria-labelledby="consent-title"><div className={card}>
    <div className="flex flex-wrap items-center justify-between gap-3"><Status tone={granted ? "success" : "warning"}>{granted ? "Granted" : "Response needed"}</Status><span className="text-xs font-semibold text-muted">Version 3 · published 20 July</span></div>
    <h2 id="consent-title" className="mt-4 text-xl font-semibold">Photo and video consent</h2><p className="mt-3 text-sm leading-6 text-muted">Allow Riverside Juniors to use team photographs in private club updates. Public promotional use is not included.</p>
    <div className="mt-6 flex flex-wrap gap-3"><Button type="button" onClick={() => setGranted(true)}>Grant in preview</Button><Button type="button" variant="secondary" onClick={() => setGranted(false)}>Withdraw in preview</Button></div>
    {granted ? <Feedback>Demo only: consent is shown as granted for the current version and was not saved.</Feedback> : null}
  </div></section>;
}

function ParentMessages() {
  const [sent, setSent] = useState(false);
  return <section data-testid="parent-messages" className="max-w-3xl" aria-labelledby="messages-title"><div className={card}>
    <div className="flex items-center gap-3"><MessageCircle className="size-5 text-primary-strong" aria-hidden="true"/><div><h2 id="messages-title" className="text-xl font-semibold">Under 11 adult group conversation</h2><p className="mt-1 text-xs font-semibold text-muted">Adults only · club moderation applies</p></div></div>
    <article className="mt-6 rounded-xl bg-surface p-4"><p className="text-sm leading-6">Please use the clubhouse entrance on Sunday. The riverside gate is closed.</p><p className="mt-2 text-xs font-semibold text-muted">Sam Taylor · 18:42</p></article>
    <label className="mt-5 block text-sm font-semibold" htmlFor="parent-message">Reply to the adult group</label><textarea id="parent-message" className="mt-2 min-h-24 w-full rounded-xl border border-border-strong bg-background p-3 text-sm" maxLength={1_000}/><Button className="mt-4" type="button" onClick={() => setSent(true)}>Preview reply</Button>
    {sent ? <Feedback>Demo only: the reply was not sent. Message bodies are excluded from ordinary analytics and notification logs.</Feedback> : null}
  </div></section>;
}

function ParentNotifications() {
  const [saved, setSaved] = useState(false);
  return <section data-testid="parent-notifications" className="max-w-3xl" aria-labelledby="notifications-title"><div className={card}>
    <div className="flex items-center gap-3"><BellRing className="size-5 text-primary-strong" aria-hidden="true"/><h2 id="notifications-title" className="text-xl font-semibold">Notification preferences</h2></div><p className="mt-2 text-sm text-muted">Choose how club updates reach you. Essential safeguarding notices cannot be muted.</p>
    <fieldset className="mt-6 space-y-3"><legend className="sr-only">Delivery channels</legend>{["Email announcements", "Availability reminders", "Payment receipts", "Browser push"].map((label, index) => <label key={label} className="flex min-h-12 items-center justify-between gap-4 rounded-xl bg-surface px-4 text-sm font-semibold"><span>{label}</span><input type="checkbox" defaultChecked={index < 3}/></label>)}</fieldset>
    <Button className="mt-5" type="button" onClick={() => setSaved(true)}><CheckCircle2 className="size-4" aria-hidden="true"/>Preview preferences</Button>{saved ? <Feedback>Demo only: preferences were not saved and no push subscription was created.</Feedback> : null}
    <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true"/>Message content is not copied into delivery analytics.</p>
  </div></section>;
}
