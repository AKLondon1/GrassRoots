import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  House,
  MessageCircle,
  type LucideIcon,
  WalletCards,
} from "lucide-react";

import { ContainerScroll } from "@/components/ui/container-scroll";
import { Status } from "@/components/ui/status";
import { brand } from "@/lib/brand";

const agenda = [
  {
    day: "THU",
    date: "24",
    title: "Under 11s training",
    detail: "18:00 · Riverside, Pitch 2",
    tone: "warning" as const,
    status: "Response needed",
  },
  {
    day: "SAT",
    date: "26",
    title: "Home match v Northfield Juniors",
    detail: "09:30 meet · Kick-off 10:15",
    tone: "success" as const,
    status: "Jayden is going",
  },
] as const;

const previewNavigation = [
  [House, "Home", true],
  [CalendarDays, "Schedule", false],
  [MessageCircle, "Messages", false],
  [WalletCards, "Payments", false],
] satisfies ReadonlyArray<readonly [LucideIcon, string, boolean]>;

function ProductShowcase() {
  return (
    <section
      id="weekly-view"
      aria-labelledby="weekly-view-title"
      className="scroll-mt-4 overflow-hidden bg-background"
    >
      <ContainerScroll
        titleComponent={
          <div className="px-2">
            <p className="text-sm font-semibold text-primary-strong">
              A calm answer in five seconds
            </p>
            <h2
              id="weekly-view-title"
              className="mt-4 text-balance text-[clamp(2.5rem,6vw,4.75rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-ink"
            >
              Your week at a glance. Your next action up front.
            </h2>
            <p className="mx-auto mt-5 max-w-[65ch] text-pretty text-base leading-7 text-muted sm:text-lg sm:leading-8">
              One agenda brings timings, places, responses and changes together.
              People see the detail their role needs — and no more.
            </p>
          </div>
        }
      >
        <WeeklyViewPreview />
      </ContainerScroll>
    </section>
  );
}

function WeeklyViewPreview() {
  return (
    <div className="flex h-full min-w-0 flex-col bg-background text-ink">
      <div className="flex min-h-14 items-center justify-between border-b border-border px-4 sm:px-6">
        <div className="flex items-center gap-2.5 font-semibold tracking-[-0.02em]">
          <span
            className="flex size-7 items-center justify-center rounded-lg bg-primary-strong text-[10px] font-bold text-primary-foreground"
            aria-label={brand.identity.markLabel}
          >
            {brand.identity.mark}
          </span>
          {brand.name}
        </div>
        <Status tone="info">Parent view</Status>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-52 shrink-0 border-r border-border bg-surface p-4 md:block">
          <p className="px-2 text-xs font-semibold text-muted">Riverside Juniors</p>
          <ul aria-label="Illustrative product destinations" className="mt-4 space-y-1">
            {previewNavigation.map(([Icon, label, active]) => (
              <li
                key={String(label)}
                className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                  active ? "bg-primary-strong text-primary-foreground" : "text-muted"
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0 flex-1 overflow-hidden p-4 sm:p-6 lg:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted">Good morning, Amara</p>
              <h3 className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                Your football week
              </h3>
            </div>
            <div className="hidden items-center gap-2 text-sm font-medium text-muted sm:flex">
              <BellRing className="size-4 text-primary" aria-hidden="true" />
              1 action to take
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-warning-soft p-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-strong" aria-hidden="true" />
              <div>
                <p className="font-semibold text-warning-strong">Can Jayden attend training?</p>
                <p className="mt-1 text-sm leading-6 text-warning-strong/85">
                  Reply by Thursday at 12:00.
                </p>
              </div>
            </div>
            <span className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-warning-strong sm:mt-0">
              Review response <ChevronRight className="size-4" aria-hidden="true" />
            </span>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-ink">Coming up</h4>
              <span className="text-xs text-muted">Illustrative product preview</span>
            </div>
            <div className="mt-3 divide-y divide-border rounded-xl border border-border">
              {agenda.map((event) => (
                <article
                  key={event.title}
                  className="flex items-center gap-3 p-3 sm:gap-5 sm:p-4"
                >
                  <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-strong">
                    <span className="text-[10px] font-bold text-muted">{event.day}</span>
                    <span className="text-base font-semibold text-ink">{event.date}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h5 className="truncate text-sm font-semibold text-ink sm:text-base">
                      {event.title}
                    </h5>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted sm:text-sm">
                      <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
                      {event.detail}
                    </p>
                  </div>
                  <Status tone={event.tone} className="hidden lg:inline-flex">
                    {event.status}
                  </Status>
                  {event.tone === "success" ? (
                    <CheckCircle2 className="size-5 shrink-0 text-success lg:hidden" aria-label={event.status} />
                  ) : (
                    <CircleAlert className="size-5 shrink-0 text-warning lg:hidden" aria-label={event.status} />
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { ProductShowcase };
