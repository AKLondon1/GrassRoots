import { CalendarDays, Clock3, MapPin, MoveRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import { brand } from "@/lib/brand";

function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-border bg-surface"
      aria-labelledby="hero-title"
    >
      <div className="mx-auto grid min-h-[42rem] w-full max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(25rem,0.95fr)] lg:gap-20 lg:px-8 lg:py-24">
        <div className="max-w-3xl">
          <p className="mb-5 max-w-xl text-sm font-semibold leading-6 text-primary-strong">
            One shared week for families and volunteers
          </p>
          <h1
            id="hero-title"
            className="max-w-[14ch] text-balance text-[clamp(3rem,8vw,5.75rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-ink"
          >
            The week in football, sorted.
          </h1>
          <p className="mt-7 max-w-[62ch] text-pretty text-lg leading-8 text-muted sm:text-xl sm:leading-9">
            {brand.description} See the next action first, without asking parents
            or volunteers to untangle the whole club.
          </p>
          <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button asChild>
              <a href="#weekly-view">
                See the weekly view
                <MoveRight className="size-4" aria-hidden="true" />
              </a>
            </Button>
            <Button asChild variant="secondary">
              <a href="#connected-club">Follow one event change</a>
            </Button>
          </div>
          <p className="mt-6 max-w-xl text-sm leading-6 text-muted">
            Designed for junior clubs, busy households and the people who give
            their time to make the week happen.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-lg lg:mx-0 lg:justify-self-end">
          <div className="absolute -left-3 top-10 h-[calc(100%-5rem)] w-1 rounded-full bg-primary sm:-left-5" />
          <div className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
              <div>
                <p className="text-sm font-semibold text-ink">Next for your family</p>
                <p className="mt-1 text-xs text-muted">Thursday 24 July</p>
              </div>
              <Status tone="warning">Response needed</Status>
            </div>

            <div className="py-7">
              <p className="text-sm font-medium text-primary-strong">Under 11s</p>
              <h2 className="mt-2 text-balance text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl">
                Can Jayden attend training?
              </h2>
              <dl className="mt-6 grid gap-4 text-sm text-muted sm:grid-cols-2">
                <div>
                  <dt className="flex items-center gap-3 font-medium text-ink">
                    <Clock3 className="size-4 shrink-0 text-primary-strong" aria-hidden="true" />
                    Time
                  </dt>
                  <dd className="mt-0.5 pl-7">18:00–19:15</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-3 font-medium text-ink">
                    <MapPin className="size-4 shrink-0 text-primary-strong" aria-hidden="true" />
                    Place
                  </dt>
                  <dd className="mt-0.5 pl-7">Riverside, Pitch 2</dd>
                </div>
              </dl>
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-warning-soft p-4 text-sm leading-6 text-warning-strong">
              <CalendarDays className="size-5 shrink-0" aria-hidden="true" />
              <p>
                You need to respond by Thursday at 12:00.
              </p>
            </div>
            <p className="mt-4 text-xs leading-5 text-muted">
              Illustrative product preview — no club data is connected on this page.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export { Hero };
