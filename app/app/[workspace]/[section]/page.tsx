import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { PeopleSetup } from "@/components/admin/people-setup";
import { ApplicationShell } from "@/components/shell/application-shell";
import { DeniedState } from "@/components/ui/denied-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createSupabaseTenancyAccessReader,
  resolveProductionWorkspaceAccess,
} from "@/features/tenancy/service";
import { getDemoCapabilities } from "@/lib/access/demo-access-policy";
import { brand } from "@/lib/brand";
import { getDemoSession } from "@/lib/demo/session";
import { environment } from "@/lib/env";
import {
  appRoles,
  parseAppRole,
  parseRequestedRole,
  resolveScreenSection,
  type AppRole,
} from "@/lib/navigation/screen-registry";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CoachCoreFootballScreen } from "@/features/screens/coach/core-football";
import { ParentCoreFootballScreen } from "@/features/screens/parent/core-football";
import { ClubOperationsScreen } from "@/features/screens/club/operations";
import { ProductionClubOperationsScreen, ProductionSupportOperationsScreen } from "@/features/screens/club/production-operations";
import { ProductionCoachingScopeSelector, ProductionCoachingScreen, ProductionParentDevelopmentScreen } from "@/features/screens/coach/production-coaching";
import { ParentAccountScreen } from "@/features/screens/parent/account";
import { ProductionParentCoreFootballScreen } from "@/features/screens/parent/production-core-football";
import { ClubGovernanceScreen } from "@/features/screens/club/governance";
import { PlatformOperationsScreen } from "@/features/screens/platform/operations";
import { ProductionClubGovernanceScreen, ProductionParentAccountScreen, ProductionPlatformOperationsScreen } from "@/features/screens/production-governance";
import { ProductionCoachCoreOverview } from "@/features/screens/coach/production-core-overview";
import { TeamPeoplePanel } from "@/features/screens/coach/production-team-people";
import { ProductionCoachScheduleScreen } from "@/features/screens/coach/production-schedule";
import { ProductionSquadSelectionScreen } from "@/features/screens/coach/production-squad-selection";
import { parseUuidCursor } from "@/lib/pagination/keyset";

export const metadata: Metadata = {
  title: `Club workspace | ${brand.name}`,
  description: `Manage grassroots football operations, coaching and household journeys in ${brand.name}.`,
};

interface WorkspaceSectionPageProps {
  params: Promise<{ section: string; workspace: string }>;
  searchParams: Promise<{ role?: string | string[]; clubRole?: string; platformScope?: string; concernId?: string; supportSessionId?: string; resourceType?: string; resourceId?: string; teamId?: string; matchId?: string; sessionId?: string; instance?: string; cursor?: string | string[] }>;
}

export default async function WorkspaceSectionPage({
  params,
  searchParams,
}: WorkspaceSectionPageProps) {
  const { section, workspace } = await params;
  const query = await searchParams;
  const cursor = parseUuidCursor(query.cursor);
  let role: AppRole;
  let roles: readonly AppRole[];
  let capabilities: readonly string[];
  let organisationId: string | null = null;

  if (environment.dataMode === "demo") {
    const requestedRole = Array.isArray(query.role) ? query.role[0] : query.role;
    role = parseAppRole(requestedRole);
    // The demo deliberately offers every role, since browsing them is the point.
    roles = appRoles;
    const session = getDemoSession(role);
    if (workspace !== session.organisation.slug) notFound();
    capabilities = [
      ...getDemoCapabilities(session.role),
      ...(session.role === "club" && query.clubRole === "welfare" ? ["safeguarding:view"] : []),
      ...(session.role === "platform" && query.platformScope === "audited" ? ["access:manage"] : []),
    ];
    organisationId = session.organisation.id;
  } else {
    const supabase = await createServerSupabaseClient();
    if (!supabase) redirect("/sign-in");
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      redirect(
        `/sign-in?next=${encodeURIComponent(`/app/${workspace}/${section}`)}`,
      );
    }

    // An unrecognised ?role= resolves to undefined rather than "parent", so the
    // member falls back to their highest-priority held role. A role they do not
    // hold is ignored by resolveProductionWorkspaceAccess, so this cannot widen
    // access.
    const requestedRole = parseRequestedRole(
      Array.isArray(query.role) ? query.role[0] : query.role,
    );
    const access = await resolveProductionWorkspaceAccess(
      createSupabaseTenancyAccessReader(supabase),
      workspace,
      data.user.id,
      requestedRole,
    );
    if (access.status === "denied") {
      return (
        <main className="flex min-h-dvh items-center justify-center bg-surface p-4 sm:p-8">
          <DeniedState
            className="bg-background"
            title="This workspace is not available for your account"
            description="You need an active organisation membership and the required scoped capability."
          />
        </main>
      );
    }
    role = access.role;
    roles = access.roles;
    capabilities = access.capabilities;
    organisationId = access.organisationId;
  }
  const resolution = resolveScreenSection({
    capabilities,
    role,
    section,
  });

  if (resolution.status === "unknown") notFound();

  if (resolution.status === "denied") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface p-4 sm:p-8">
        <DeniedState
          className="bg-background"
          title={`${resolution.screen.label} is not available for this role`}
          description={resolution.screen.states.denied}
        />
      </main>
    );
  }

  const parentCoreSections = new Set(["home", "actions", "schedule", "event", "availability", "polls", "squad", "announcements", "child"]);
  const parentAccountSections = new Set(["payments", "consents", "messages", "notifications", "household", "calendar", "help"]);
  const coachCoreSections = new Set(["today", "team", "calendar", "event-editor", "availability", "squad", "match-day", "formation", "playing-time", "attendance", "training", "drills", "players", "development", "compose", "volunteers"]);
  const phase4CoachSections = new Set(["match-day", "formation", "playing-time", "attendance", "training", "drills", "players", "development", "compose", "volunteers"]);
  const coachScheduleSections = new Set(["today", "calendar", "event-editor"]);
  const clubOperationsSections = new Set([
    "overview", "calendar", "teams", "seasons", "people", "invitations", "venues",
    "pitch-planner", "inspections", "maintenance", "fixtures", "opposition",
    "documents", "equipment", "volunteers", "reports", "audit", "support",
  ]);
  const clubGovernanceSections = new Set(["payments", "communications", "forms", "consents", "compliance", "safeguarding", "reports", "settings", "integrations", "entitlements"]);
  const platformOperationsSections = new Set(["organisations", "plans", "feature-flags", "provider-usage", "health", "support", "audited-access", "analytics"]);
  const isCoreFootballSection =
    (role === "parent" && parentCoreSections.has(section)) ||
    (role === "coach" && coachCoreSections.has(section));
  const isClubOperationsSection = role === "club" && clubOperationsSections.has(section);
  const isPlatformSupportSection = role === "platform" && section === "support";
  let screenContent: ReactNode;
  if (environment.dataMode === "demo" && role === "club" && section === "people") {
    screenContent = <PeopleSetup />;
  } else if (environment.dataMode === "demo" && role === "club" && clubGovernanceSections.has(section)) {
    screenContent = <ClubGovernanceScreen section={section} role={query.clubRole === "welfare" ? "welfare-officer" : query.clubRole === "treasurer" ? "treasurer" : "club-admin"} />;
  } else if (environment.dataMode === "demo" && role === "club" && clubOperationsSections.has(section)) {
    screenContent = <ClubOperationsScreen section={section} />;
  } else if (environment.dataMode === "demo" && role === "parent" && parentCoreSections.has(section)) {
    screenContent = <ParentCoreFootballScreen section={section} />;
  } else if (environment.dataMode === "demo" && role === "parent" && parentAccountSections.has(section)) {
    screenContent = <ParentAccountScreen section={section} />;
  } else if (environment.dataMode === "demo" && role === "coach" && coachCoreSections.has(section)) {
    screenContent = <CoachCoreFootballScreen section={section} />;
  } else if (environment.dataMode === "demo" && role === "platform" && platformOperationsSections.has(section)) {
    screenContent = <PlatformOperationsScreen section={section} />;
  } else if (environment.dataMode !== "demo" && role === "club" && clubGovernanceSections.has(section) && organisationId) {
    screenContent = <ProductionClubGovernanceScreen organisationId={organisationId} section={section} workspace={workspace} concernId={query.concernId} />;
  } else if (environment.dataMode !== "demo" && role === "parent" && parentAccountSections.has(section) && organisationId) {
    screenContent = <ProductionParentAccountScreen organisationId={organisationId} section={section} workspace={workspace} />;
  } else if (environment.dataMode !== "demo" && role === "platform" && platformOperationsSections.has(section) && section !== "support") {
    screenContent = <ProductionPlatformOperationsScreen section={section} cursor={cursor} workspace={workspace} />;
  } else if (environment.dataMode !== "demo" && isClubOperationsSection && organisationId) {
    screenContent = <ProductionClubOperationsScreen organisationId={organisationId} section={section} workspace={workspace} cursor={cursor} />;
  } else if (environment.dataMode !== "demo" && isPlatformSupportSection && organisationId) {
    screenContent = <ProductionSupportOperationsScreen organisationId={organisationId} workspace={workspace} readRequest={{ sessionId: query.supportSessionId, resourceType: query.resourceType, resourceId: query.resourceId }} />;
  } else if (environment.dataMode !== "demo" && role === "coach" && phase4CoachSections.has(section) && organisationId) {
    const coachingSelection = { teamId: query.teamId, matchId: query.matchId, sessionId: query.sessionId };
    // `players` is already where a coach goes to look at their squad, so adding
    // players and parents belongs on that same screen rather than a new route.
    // The development view stays below it, untouched.
    screenContent = <div className="space-y-5"><ProductionCoachingScopeSelector organisationId={organisationId} section={section} selection={coachingSelection}/>{section === "players" ? <TeamPeoplePanel organisationId={organisationId} workspace={workspace}/> : null}<ProductionCoachingScreen organisationId={organisationId} section={section} workspace={workspace} selection={coachingSelection}/></div>;
  } else if (environment.dataMode !== "demo" && role === "parent" && section === "child" && organisationId) {
    screenContent = <ProductionParentDevelopmentScreen organisationId={organisationId} />;
  } else if (environment.dataMode !== "demo" && role === "parent" && parentCoreSections.has(section) && section !== "child" && organisationId) {
    screenContent = <ProductionParentCoreFootballScreen organisationId={organisationId} section={section} workspace={workspace} />;
  } else if (environment.dataMode !== "demo" && role === "coach" && section === "squad" && organisationId) {
    // `instance` is set by the "Pick the squad" link on every event card.
    screenContent = <ProductionSquadSelectionScreen organisationId={organisationId} workspace={workspace} instanceId={query.instance} />;
  } else if (environment.dataMode !== "demo" && role === "coach" && coachScheduleSections.has(section) && organisationId) {
    screenContent = <ProductionCoachScheduleScreen organisationId={organisationId} section={section} workspace={workspace} />;
  } else if (environment.dataMode !== "demo" && role === "coach" && isCoreFootballSection && organisationId) {
    // `team` and `availability` stay on the overview. `team` is still a JSON dump,
    // but `availability` renders the MagicLinkIssuer over
    // list_magic_availability_scopes, which nothing else replaces. Deleting this
    // file, as the plan suggested, would have removed that.
    screenContent = <ProductionCoachCoreOverview organisationId={organisationId} section={section} workspace={workspace} />;
  } else if (environment.dataMode !== "demo" && isCoreFootballSection) {
    screenContent = (
      <EmptyState
        title={resolution.screen.states.empty.title}
        description="No scoped organisation event data is available for this screen yet. Create or publish the relevant team record to continue."
      />
    );
  }

  return (
    <ApplicationShell
      activeSection={resolution.screen.section}
      capabilities={capabilities}
      isDemo={environment.dataMode === "demo"}
      role={role}
      roles={roles}
      workspace={workspace}
    >
      {screenContent}
    </ApplicationShell>
  );
}
