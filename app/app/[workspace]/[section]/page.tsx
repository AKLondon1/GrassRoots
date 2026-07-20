import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ApplicationShell } from "@/components/shell/application-shell";
import { DeniedState } from "@/components/ui/denied-state";
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

  return (
    <ApplicationShell
      activeSection={resolution.screen.section}
      capabilities={capabilities}
      isDemo={environment.dataMode === "demo"}
      role={role}
      workspace={workspace}
    />
  );
}
