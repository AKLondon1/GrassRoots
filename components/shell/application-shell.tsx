"use client";

import {
  CalendarDays,
  Clock3,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { signOutCurrentSession } from "@/app/(auth)/sign-out/actions";
import { BottomNavigation } from "@/components/shell/bottom-navigation";
import { CommandMenu } from "@/components/shell/command-menu";
import { RoleSwitcher } from "@/components/shell/role-switcher";
import { SideNavigation } from "@/components/shell/side-navigation";
import { Status } from "@/components/ui/status";
import { Button } from "@/components/ui/button";
import { PushRegistration } from "@/components/pwa/push-registration";
import { brand } from "@/lib/brand";
import { EmptyState } from "@/components/ui/empty-state";
import { getScreenCopy } from "@/lib/navigation/screen-copy";
import {
  getAllowedScreensForRole,
  roleLabels,
  type AppRole,
  type ScreenDefinition,
} from "@/lib/navigation/screen-registry";

interface ApplicationShellProps {
  activeSection: string;
  capabilities: readonly string[];
  children?: ReactNode;
  isDemo?: boolean;
  role: AppRole;
  /**
   * Every role the member holds. Defaults to just the active role, so a
   * single-role member never sees a switcher offering them nothing.
   */
  roles?: readonly AppRole[];
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
  roles = [role],
  workspace,
}: ApplicationShellProps) {
  const screens = getAllowedScreensForRole(role, capabilities);
  // A member can hold a role whose screens all require capabilities they lack.
  // Dereferencing screens[0] below would throw, so recover before that happens.
  if (screens.length === 0) {
    return <NoScreensState role={role} workspace={workspace} />;
  }
  const currentScreen =
    screens.find((screen) => screen.section === activeSection) ?? screens[0];
  const demo = roleDemo[role];
  const isDefaultScreen = currentScreen.id === screens[0].id;
  const screenCopy = getScreenCopy(currentScreen);
  const showDemoCopy = isDemo && isDefaultScreen;

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
            {!isDemo ? <PushRegistration workspace={workspace} /> : null}
            {roles.length > 1 ? (
          <RoleSwitcher value={role} workspace={workspace} roles={roles} />
        ) : null}
            {isDemo ? (
              <Button asChild size="small" variant="quiet"><Link href="/sign-in"><LogOut className="size-4" aria-hidden="true"/><span className="hidden sm:inline">Leave demo</span><span className="sr-only sm:hidden">Leave demo</span></Link></Button>
            ) : (
              <form action={signOutCurrentSession}><Button aria-label="Sign out of this session" size="small" type="submit" variant="quiet"><LogOut className="size-4" aria-hidden="true"/><span className="hidden sm:inline">Sign out</span></Button></form>
            )}
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

        <main
          aria-labelledby="application-page-title"
          className="min-w-0 flex-1 overflow-y-auto px-4 py-6 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/35 sm:px-6 sm:py-8 lg:px-10 lg:py-10"
          tabIndex={0}
        >
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-primary-strong">
                  {roleLabels[role]}{isDemo ? " preview" : ""}
                </p>
                <h1
                  className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink sm:text-4xl"
                  id="application-page-title"
                >
                  {showDemoCopy ? demo.title : screenCopy.title}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
                  {showDemoCopy ? demo.summary : screenCopy.description}
                </p>
              </div>
              <Status tone="info">
                {isDemo ? "Demo mode" : "Organisation access"}
              </Status>
            </div>

            {isDemo ? (
              <p className="mt-5 text-xs leading-5 text-muted" role="note">
                Preview data is fictional and remains in this browser session only.
              </p>
            ) : null}

            {children ? (
              <div className="mt-8">{children}</div>
            ) : isDemo ? (
              <DemoFocusPanels currentScreen={currentScreen} demo={demo} />
            ) : (
              <div className="mt-8">
                <EmptyState
                  title={`${currentScreen.label} is not built yet`}
                  description="This screen is planned but not part of the current release. Nothing here is real data."
                />
              </div>
            )}
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

interface DemoFocusPanelsProps {
  currentScreen: ScreenDefinition;
  demo: (typeof roleDemo)[AppRole];
}

/**
 * The original two-panel focus block, extracted verbatim so the demo keeps
 * exactly the look it had. It is fictional, so it renders only in demo mode.
 */
function DemoFocusPanels({ currentScreen, demo }: DemoFocusPanelsProps) {
  return (
    <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.55fr)]">
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
              </aside>
    </div>
  );
}

interface NoScreensStateProps {
  role: AppRole;
  workspace: string;
}

/**
 * A member can hold a role whose screens all require capabilities they have not
 * been granted. That is a configuration gap, not a crash, so say so plainly and
 * name who can fix it.
 */
function NoScreensState({ role, workspace }: NoScreensStateProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-4 sm:p-8">
      <EmptyState
        className="bg-background"
        title="No screens are available for this role"
        description={`Your ${roleLabels[role].toLowerCase()} role in ${formatWorkspace(workspace)} has no capabilities assigned yet. A club administrator needs to grant one before this area can open.`}
      />
    </main>
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
