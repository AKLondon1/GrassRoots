"use client";

import {
  CalendarDays,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import {
  roleLabels,
  getScreenHref,
  type AppRole,
  type ScreenComponentKind,
  type ScreenDefinition,
} from "@/lib/navigation/screen-registry";
import { cn } from "@/lib/utils";

interface SideNavigationProps {
  currentScreenId: string;
  role: AppRole;
  screens: readonly ScreenDefinition[];
  workspace: string;
}

const kindIcons: Record<ScreenComponentKind, LucideIcon> = {
  agenda: LayoutDashboard,
  board: LayoutDashboard,
  calendar: CalendarDays,
  detail: ClipboardList,
  directory: FolderKanban,
  form: ClipboardList,
  list: ClipboardList,
  planner: CalendarDays,
  report: FolderKanban,
  settings: Settings,
};

function SideNavigation({
  currentScreenId,
  role,
  screens,
  workspace,
}: SideNavigationProps) {
  return (
    <nav aria-label={`${roleLabels[role]} navigation`} className="h-full">
      <p className="px-3 pb-3 text-xs font-semibold text-muted">
        {roleLabels[role]}
      </p>
      <ul className="space-y-1">
        {screens.map((screen) => {
          const Icon = kindIcons[screen.componentKind];
          const active = screen.id === currentScreenId;

          return (
            <li key={screen.id}>
              <Link
                href={getScreenHref(workspace, screen, role)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35",
                  active
                    ? "bg-primary-strong text-primary-foreground"
                    : "text-muted hover:bg-surface-strong hover:text-ink",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{screen.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { SideNavigation };
