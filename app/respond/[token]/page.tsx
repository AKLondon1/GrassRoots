import type { Metadata } from "next";
import { CalendarDays, Clock3, MapPin, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import { loadMagicAvailabilityContext } from "@/features/availability/magic-response";
import { brand } from "@/lib/brand";
import { submitMagicAvailabilityResponse } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Availability response | ${brand.name}`, robots: { index: false, follow: false } };

export default async function MagicAvailabilityPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ status?: string }> }) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const context = await loadMagicAvailabilityContext(token);
  if (!context) return <UnavailableResponse invalid={query.status === "invalid"} />;
  const startsAt = new Date(context.startsAt);
  const endsAt = new Date(context.endsAt);
  return (
    <main className="min-h-dvh bg-surface px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <Link className="inline-flex min-h-11 items-center gap-2 font-semibold text-ink" href="/" aria-label={`${brand.name} home`}><span className="flex size-8 items-center justify-center rounded-[10px] bg-primary-strong text-xs font-bold text-primary-foreground" aria-hidden="true">{brand.identity.mark}</span>{brand.name}</Link>
        <section className="mt-8 rounded-2xl border border-border-strong bg-background p-5 sm:p-8" aria-labelledby="availability-response-title">
          <Status tone="info"><ShieldCheck className="size-3.5" aria-hidden="true" />Secure one-time response</Status>
          <p className="mt-5 text-sm font-semibold text-primary-strong">{context.organisationName}</p>
          <h1 id="availability-response-title" className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink">Can {context.playerName} attend?</h1>
          <h2 className="mt-4 text-lg font-semibold text-ink">{context.eventTitle}</h2>
          <dl className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-2">
            <div className="flex gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true"/><div><dt className="sr-only">Date</dt><dd>{startsAt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</dd></div></div>
            <div className="flex gap-2"><Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true"/><div><dt className="sr-only">Time</dt><dd>{startsAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}–{endsAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</dd></div></div>
            {context.locationName ? <div className="flex gap-2 sm:col-span-2"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true"/><div><dt className="sr-only">Location</dt><dd>{context.locationName}</dd></div></div> : null}
          </dl>
          {context.currentStatus ? <p className="mt-5 rounded-xl bg-info-soft px-4 py-3 text-sm text-info-strong">Current response: <strong>{context.currentStatus}</strong>. Submitting replaces it.</p> : null}
          <form action={submitMagicAvailabilityResponse} className="mt-7">
            <input type="hidden" name="token" value={token}/>
            <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="text-sm font-semibold text-ink">Availability</legend>{["available", "unavailable", "unsure"].map((status) => <label key={status} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border-strong px-4 text-sm font-semibold capitalize has-[:checked]:border-primary has-[:checked]:bg-primary-light"><input required type="radio" name="status" value={status} defaultChecked={context.currentStatus === status}/>{status}</label>)}</fieldset>
            <label className="mt-5 block text-sm font-semibold text-ink" htmlFor="response-note">Note <span className="font-normal text-muted">(optional)</span></label>
            <textarea className="mt-2 min-h-24 w-full rounded-xl border border-border-strong bg-background p-3 text-base" id="response-note" name="note" maxLength={240}/>
            <label className="mt-5 block max-w-xs text-sm font-semibold text-ink" htmlFor="transport-seats">Spare transport seats <span className="font-normal text-muted">(optional)</span><input className="mt-2 min-h-12 w-full rounded-xl border border-border-strong bg-background px-3 text-base" id="transport-seats" name="transportSeats" type="number" min={0} max={8}/></label>
            <Button className="mt-6 w-full sm:w-auto" type="submit">Send response</Button>
          </form>
          <p className="mt-6 text-xs leading-5 text-muted">This link works once and expires automatically. Do not forward it.</p>
        </section>
      </div>
    </main>
  );
}

function UnavailableResponse({ invalid }: { invalid: boolean }) {
  return <main className="flex min-h-dvh items-center justify-center bg-surface p-4"><section className="max-w-lg rounded-2xl border border-border-strong bg-background p-6 sm:p-8" aria-labelledby="link-unavailable-title"><Status tone="warning">Link unavailable</Status><h1 className="mt-5 text-2xl font-semibold text-ink" id="link-unavailable-title">Request a fresh availability link</h1><p className="mt-3 text-sm leading-6 text-muted">{invalid ? "The response details were not valid." : "This link may have expired, already been used, or been withdrawn."} Contact your team organiser if you still need to respond.</p><Button asChild className="mt-6" variant="secondary"><Link href="/">Return to {brand.name}</Link></Button></section></main>;
}
