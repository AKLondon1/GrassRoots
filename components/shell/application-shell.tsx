"use client";

import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  MapPin,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BottomNavigation } from "@/components/shell/bottom-navigation";
import { CommandMenu } from "@/components/shell/command-menu";
import { RoleSwitcher } from "@/components/shell/role-switcher";
import { SideNavigation } from "@/components/shell/side-navigation";
import { Status } from "@/components/ui/status";
import { brand } from "@/lib/brand";
import {
  getAllowedScreensForRole,
  roleLabels,
  type AppRole,
} from "@/lib/navigation/screen-registry";

interface ApplicationShellProps {
  activeSection: string;
  capabilities: readonly string[];
  children?: ReactNode;
  isDemo?: boolean;
  role: AppRole;
  workspace: string;
}

const roleDemo = {
  parent: {
    title: "Your football week",
    summary: "One response is needed before Thursday lunchtime.",
    focus: "Can Jayden attend training?",
    detail: "Thursday 24 July · 18:00 · Riverside, Pitch 2",
    status: "Response needed",
    tone: "warning" as const,
    secondaryTitle: "Home match v Northfield Juniors",
    secondaryDetail: "Saturday · Meet at 09:30",
  },
  coach: {
    title: "Today with Under 11s",
    summary: "Training starts at 18:00. Two availability replies are outstanding.",
    focus: "Prepare tonight’s session",
    detail: "Riverside, Pitch 2 · 14 expected players",
    status: "2 replies needed",
    tone: "warning" as const,
    secondaryTitle: "Session plan shared",
    secondaryDetail: "Warm-up, passing, small-sided game",
  },
  club: {
    title: "Club overview",
    summary: "Three volunteer tasks need attention across the club this week.",
    focus: "Confirm Saturday pitch allocation",
    detail: "Four home fixtures · one pitch still unallocated",
    status: "Action needed",
    tone: "warning" as const,
    secondaryTitle: "People and invitations",
    secondaryDetail: "Two manager invitations awaiting acceptance",
  },
  platform: {
    title: "Platform overview",
    summary: "Operational information is summarised without exposing club records.",
    focus: "Review provider health",
    detail: "Development adapters only · no production credentials connected",
    status: "Demo providers",
    tone: "info" as const,
    secondaryTitle: "Audited access",
    secondaryDetail: "Sensitive access requires a reason and an audit record",
  },
} as const;

function ApplicationShell({
  activeSection,
  capabilities,
  children,
  isDemo = true,
  role,
  workspace,
}: ApplicationShellProps) {
  const screens = getAllowedScreensForRole(role, capabilities);
  const currentScreen =
    screens.find((screen) => screen.section === activeSection) ?? screens[0];
  const demo = roleDemo[role];
  const isDefaultScreen = currentScreen.id === screens[0].id;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface text-ink">
      <header className="shrink-0 border-b border-border bg-background">
        <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2.5 rounded-lg pr-2 font-semibold tracking-[-0.02em] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
            aria-label={`${brand.name} public home`}
          >
            <span
              className="flex size-8 items-center justify-center rounded-[10px] bg-primary-strong text-xs font-bold text-primary-foreground"
              aria-hidden="true"
            >
              {brand.identity.mark}
            </span>
            <span className="hidden sm:inline">{brand.name}</span>
          </Link>

          <div className="flex items-center gap-2">
            <CommandMenu isDemo={isDemo} role={role} screens={screens} workspace={workspace} />
            {isDemo ? <RoleSwitcher value={role} workspace={workspace} /> : null}
          </div>
        </div>
        {isDemo ? (
          <div className="border-t border-info/20 bg-info-soft px-4 py-2 text-center text-xs font-medium leading-5 text-info-strong sm:px-6">
            <strong>Illustrative demo.</strong> Sign-in and saving are not connected;
            changes are not saved.
          </div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border bg-background p-4 lg:block">
          <p className="mb-5 px-3 text-sm font-semibold text-ink">
            {formatWorkspace(workspace)}
          </p>
          <SideNavigation
            currentScreenId={currentScreen.id}
            role={role}
            screens={screens}
            workspace={workspace}
          />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-primary-strong">
                  {roleLabels[role]}{isDemo ? " preview" : ""}
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink sm:text-4xl">
                  {isDefaultScreen ? demo.title : currentScreen.label}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
                  {isDefaultScreen ? demo.summary : currentScreen.states.empty.description}
                </p>
              </div>
              <Status tone="info">
                {isDemo ? "Demo mode" : "Organisation access"}
              </Status>
            </div>

            {children ? <div className="mt-8">{children}</div> : <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.55fr)]">
              <section
                className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7"
                aria-labelledby="shell-focus-title"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-muted">Next useful action</p>
                  <Status tone={demo.tone}>{demo.status}</Status>
                </div>
                <h2
                  id="shell-focus-title"
                  className="mt-5 text-balance text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl"
                >
                  {demo.focus}
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted">{demo.detail}</p>

                <dl className="mt-7 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
                  <div>
                    <dt className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <Clock3 className="size-4 text-primary-strong" aria-hidden="true" />
                      Updated
                    </dt>
                    <dd className="mt-1 pl-6 text-sm text-muted">A few moments ago</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <ShieldCheck className="size-4 text-primary-strong" aria-hidden="true" />
                      Capability
                    </dt>
                    <dd className="mt-1 pl-6 text-sm text-muted">
                      {currentScreen.capability}
                    </dd>
                  </div>
                </dl>
              </section>

              <aside className="rounded-2xl bg-surface-strong p-5 sm:p-6" aria-label="Coming up">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary-strong">
                  <CalendarDays className="size-4" aria-hidden="true" />
                  Coming up
                </div>
                <h2 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-ink">
                  {demo.secondaryTitle}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">{demo.secondaryDetail}</p>
                <div className="mt-6 flex items-start gap-3 border-t border-border-strong pt-5">
                  {role === "parent" ? (
                    <MapPin className="mt-0.5 size-4 shrink-0 text-primary-strong" aria-hidden="true" />
                  ) : role === "coach" ? (
                    <UsersRound className="mt-0.5 size-4 shrink-0 text-primary-strong" aria-hidden="true" />
                  ) : role === "club" ? (
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning-strong" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-info-strong" aria-hidden="true" />
                  )}
                  <p className="text-xs leading-5 text-muted">
                    {isDemo
                      ? "Preview data is fictional and remains in this browser session only."
                      : "Access is limited by your active organisation membership and assigned capabilities."}
                  </p>
                </div>
              </aside>
            </div>}
          </div>
        </main>
      </div>

      <BottomNavigation
        currentScreenId={currentScreen.id}
        role={role}
        screens={screens}
        workspace={workspace}
      />
    </div>
  );
}

function formatWorkspace(workspace: string) {
  return workspace
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export { ApplicationShell };
