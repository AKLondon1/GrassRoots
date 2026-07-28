import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  createSupabaseTenancyAccessReader,
  resolveProductionWorkspaceAccess,
} from "@/features/tenancy/service";
import { brand } from "@/lib/brand";
import { environment } from "@/lib/env";
import {
  getDefaultScreen,
  getDefaultScreenForRoles,
  getScreenHref,
} from "@/lib/navigation/screen-registry";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `Illustrative workspace | ${brand.name}`,
  description: `A non-persistent, illustrative ${brand.name} application shell.`,
};

interface WorkspacePageProps {
  params: Promise<{ workspace: string }>;
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { workspace } = await params;

  if (environment.dataMode === "demo") {
    redirect(getScreenHref(workspace, getDefaultScreen("parent"), "parent"));
  }

  // Production members are not all parents. Landing everyone on the parent default
  // sent a club admin straight into "Home is not available for this role", so
  // resolve which roles this member actually holds before choosing where to land.
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/sign-in");

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/app/${workspace}`)}`);
  }

  const access = await resolveProductionWorkspaceAccess(
    createSupabaseTenancyAccessReader(supabase),
    workspace,
    data.user.id,
  );
  if (access.status === "denied") redirect("/sign-in?error=workspace");

  redirect(
    getScreenHref(
      workspace,
      getDefaultScreenForRoles(access.roles),
      access.role,
    ),
  );
}
