import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  createSupabaseTenancyAccessReader,
  resolveProductionWorkspaceAccess,
} from "@/features/tenancy/service";
import { brand } from "@/lib/brand";
import { environment } from "@/lib/env";
import {
  getAllowedScreensForRole,
  getDefaultScreen,
  getScreenHref,
  parseAppRole,
  parseRequestedRole,
} from "@/lib/navigation/screen-registry";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `Illustrative workspace | ${brand.name}`,
  description: `A non-persistent, illustrative ${brand.name} application shell.`,
};

interface WorkspacePageProps {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ role?: string | string[] }>;
}

export default async function WorkspacePage({
  params,
  searchParams,
}: WorkspacePageProps) {
  const { workspace } = await params;
  const query = await searchParams;
  const requested = Array.isArray(query.role) ? query.role[0] : query.role;

  if (environment.dataMode === "demo") {
    const demoRole = parseAppRole(requested);
    redirect(getScreenHref(workspace, getDefaultScreen(demoRole), demoRole));
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

  // The role switcher sends members here rather than guessing a destination, so a
  // requested role must be honoured. resolveProductionWorkspaceAccess ignores any
  // role the member does not hold, and scopes `capabilities` to whichever role ends
  // up active, which is exactly what choosing a landable screen needs.
  const access = await resolveProductionWorkspaceAccess(
    createSupabaseTenancyAccessReader(supabase),
    workspace,
    data.user.id,
    parseRequestedRole(requested),
  );
  if (access.status === "denied") redirect("/sign-in?error=workspace");

  // Keyed on the ACTIVE role, not on the member's highest-priority one.
  // getDefaultScreenForRoles reads roles[0], which is the same thing only while a
  // member holds one role. Someone holding platform as well as club was sent to the
  // platform default, "organisations", with `?role=club` stamped on it -- a screen
  // the active role cannot open, so the switcher landed on a denied state. This is
  // the selection resolveAuthenticatedHome already makes.
  const landing =
    getAllowedScreensForRole(access.role, access.capabilities)[0] ??
    getDefaultScreen(access.role);

  redirect(getScreenHref(workspace, landing, access.role));
}
