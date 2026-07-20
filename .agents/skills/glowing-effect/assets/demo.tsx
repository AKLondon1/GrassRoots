"use client";

import { CalendarDays, ShieldCheck, UsersRound } from "lucide-react";

import { GlowingEffect } from "@/components/ui/glowing-effect";
import { cn } from "@/lib/utils";

const items = [
  {
    icon: CalendarDays,
    title: "One shared schedule",
    description: "Fixtures, training and family availability stay in sync.",
  },
  {
    icon: UsersRound,
    title: "Built for every role",
    description: "Parents, coaches and volunteers see the actions that matter to them.",
  },
  {
    icon: ShieldCheck,
    title: "Safeguarding by design",
    description: "Sensitive information stays permissioned, traceable and purposeful.",
  },
];

export function GlowingEffectDemo() {
  return (
    <ul className="grid list-none gap-4 md:grid-cols-3">
      {items.map(({ icon: Icon, title, description }) => (
        <li key={title} className="relative rounded-2xl border p-2">
          <GlowingEffect
            spread={32}
            glow
            disabled={false}
            proximity={56}
            inactiveZone={0.08}
            borderWidth={1}
          />
          <div className="relative h-full rounded-xl bg-background p-6 shadow-sm">
            <Icon aria-hidden="true" className="size-5 text-primary" />
            <h3 className="mt-8 text-lg font-semibold text-foreground">{title}</h3>
            <p className={cn("mt-2 text-sm leading-6 text-muted-foreground")}>{description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
