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
  parseAppRole,
  resolveScreenSection,
  type AppRole,
} from "@/lib/navigation/screen-registry";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CoachCoreFootballScreen } from "@/features/screens/coach/core-football";
import { ParentCoreFootballScreen } from "@/features/screens/parent/core-football";

export const metadata: Metadata = {
  title: `Illustrative workspace | ${brand.name}`,
  description: `A non-persistent, illustrative ${brand.name} application shell.`,
};

interface WorkspaceSectionPageProps {
  params: Promise<{ section: string; workspace: string }>;
  searchParams: Promise<{ role?: string | string[] }>;
}

export default async function WorkspaceSectionPage({
  params,
  searchParams,
}: WorkspaceSectionPageProps) {
  const { section, workspace } = await params;
  let role: AppRole;
  let capabilities: readonly string[];

  if (environment.dataMode === "demo") {
    const query = await searchParams;
    const requestedRole = Array.isArray(query.role) ? query.role[0] : query.role;
    role = parseAppRole(requestedRole);
    const session = getDemoSession(role);
    if (workspace !== session.organisation.slug) notFound();
    capabilities = getDemoCapabilities(session.role);
  } else {
    const supabase = await createServerSupabaseClient();
    if (!supabase) redirect("/sign-in");
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      redirect(
        `/sign-in?next=${encodeURIComponent(`/app/${workspace}/${section}`)}`,
      );
    }

    const access = await resolveProductionWorkspaceAccess(
      createSupabaseTenancyAccessReader(supabase),
      workspace,
      data.user.id,
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
    capabilities = access.capabilities;
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

  const parentCoreSections = new Set(["actions", "schedule", "event", "availability", "polls", "squad", "announcements"]);
  const coachCoreSections = new Set(["today", "calendar", "event-editor", "availability", "squad"]);
  const isCoreFootballSection =
    (role === "parent" && parentCoreSections.has(section)) ||
    (role === "coach" && coachCoreSections.has(section));
  let screenContent: ReactNode;
  if (environment.dataMode === "demo" && role === "club" && section === "people") {
    screenContent = <PeopleSetup />;
  } else if (environment.dataMode === "demo" && role === "parent" && parentCoreSections.has(section)) {
    screenContent = <ParentCoreFootballScreen section={section} />;
  } else if (environment.dataMode === "demo" && role === "coach" && coachCoreSections.has(section)) {
    screenContent = <CoachCoreFootballScreen section={section} />;
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
      workspace={workspace}
    >
      {screenContent}
    </ApplicationShell>
  );
}
