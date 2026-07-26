"use client";

import {
  CalendarDays,
  CircleEllipsis,
  House,
  MessageCircle,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import {
  roleLabels,
  getScreenHref,
  type AppRole,
  type ScreenDefinition,
} from "@/lib/navigation/screen-registry";
import { cn } from "@/lib/utils";

interface BottomNavigationProps {
  currentScreenId: string;
  role: AppRole;
  screens: readonly ScreenDefinition[];
  workspace: string;
}

const mobileScreenIds: Record<AppRole, readonly string[]> = {
  parent: ["home", "schedule", "messages", "payments", "household"],
  coach: ["today", "calendar", "team", "training", "players"],
  club: ["overview", "calendar", "teams", "people", "fixtures"],
  platform: ["organisations", "health", "support", "audited-access", "analytics"],
};

const destinationIcons: Record<string, LucideIcon> = {
  home: House,
  today: House,
  overview: House,
  organisations: House,
  schedule: CalendarDays,
  calendar: CalendarDays,
  messages: MessageCircle,
  payments: WalletCards,
  household: UsersRound,
  team: UsersRound,
  teams: UsersRound,
  people: UsersRound,
  players: UsersRound,
};

function BottomNavigation({
  currentScreenId,
  role,
  screens,
  workspace,
}: BottomNavigationProps) {
  const destinations = mobileScreenIds[role]
    .map((screenId) => screens.find((screen) => screen.id === screenId))
    .filter((screen): screen is ScreenDefinition => Boolean(screen));

  return (
    <nav
      aria-label={`${roleLabels[role]} mobile navigation`}
      className="shrink-0 border-t border-border bg-background px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
    >
      <ul className="grid grid-cols-5 gap-1">
        {destinations.map((screen) => {
          const active = screen.id === currentScreenId;
          const Icon = destinationIcons[screen.id] ?? CircleEllipsis;
          const label =
            role === "parent" && screen.id === "household" ? "Family" : screen.label;

          return (
            <li key={screen.id}>
              <Link
                href={getScreenHref(workspace, screen, role)}
                className={cn(
                  "flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35",
                  active ? "bg-surface-strong text-primary-strong" : "text-muted",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className="max-w-full truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { BottomNavigation };
