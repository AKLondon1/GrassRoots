import { CalendarClock, MapPin, MessageSquareText, ShieldCheck } from "lucide-react";

import { GlowingEffect } from "@/components/ui/glowing-effect";

const outcomes = [
  {
    icon: CalendarClock,
    title: "The schedule stays dependable",
    description: "The event now shows 18:15 and Pitch 2 for everyone who can see it.",
  },
  {
    icon: MessageSquareText,
    title: "Families get the useful change",
    description: "The message says what moved, from where, and what they need to do.",
  },
  {
    icon: ShieldCheck,
    title: "Each role keeps its boundary",
    description: "Parents see family detail; volunteers keep the operational context they need.",
  },
] as const;

function FeatureStory() {
  return (
    <section
      id="connected-club"
      aria-labelledby="connected-club-title"
      className="scroll-mt-4 bg-ink text-background"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-14 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[minmax(0,0.82fr)_minmax(34rem,1.18fr)] lg:items-center lg:gap-20 lg:px-8 lg:py-36">
        <div>
          <p className="text-sm font-semibold text-primary-light">One connected event</p>
          <h2
            id="connected-club-title"
            className="mt-4 max-w-[12ch] text-balance text-[clamp(2.75rem,6vw,5rem)] font-semibold leading-[1.02] tracking-[-0.04em]"
          >
            Change it once. Keep everyone steady.
          </h2>
          <p className="mt-6 max-w-[62ch] text-pretty text-lg leading-8 text-ink-on-dark-muted">
            A wet pitch should not create five conflicting message threads. GrassRoots
            starts with the event, records the change clearly, then gives each person
            the part they can act on.
          </p>
        </div>

        <div className="relative rounded-2xl bg-ink-raised p-1">
          <GlowingEffect
            disabled={false}
            glow
            spread={32}
            proximity={56}
            borderWidth={1}
            movementDuration={0.2}
          />
          <article className="relative rounded-[13px] bg-ink-raised px-5 py-6 sm:px-8 sm:py-8">
            <div className="flex items-start gap-4 border-b border-border-on-dark pb-6">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-strong text-primary-foreground">
                <MapPin className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-primary-light">Training updated</p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
                  Moved from Pitch 1 to Pitch 2 at 18:15
                </h3>
                <p className="mt-2 text-sm leading-6 text-ink-on-dark-muted">
                  Riverside Juniors Under 11s · Thursday 24 July
                </p>
              </div>
            </div>

            <ol className="divide-y divide-border-on-dark">
              {outcomes.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex gap-4 py-5 first:pt-6 last:pb-0">
                  <Icon className="mt-1 size-5 shrink-0 text-primary-light" aria-hidden="true" />
                  <div>
                    <h4 className="font-semibold">{title}</h4>
                    <p className="mt-1 text-sm leading-6 text-ink-on-dark-muted">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </article>
        </div>
      </div>
    </section>
  );
}

export { FeatureStory };
