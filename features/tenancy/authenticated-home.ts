import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getAllowedScreensForRole,
  getScreenHref,
} from "@/lib/navigation/screen-registry";
import type { Database } from "@/lib/supabase/types";

import {
  createSupabaseTenancyAccessReader,
  resolveProductionWorkspaceAccess,
  type ProductionWorkspaceAccess,
} from "./service";

export interface AuthenticatedHomeReader {
  listCandidateWorkspaces(userId: string): Promise<readonly string[]>;
  resolveWorkspaceAccess(
    workspace: string,
    userId: string,
  ): Promise<ProductionWorkspaceAccess>;
}

function getProductionScreenHref(
  workspace: string,
  access: Extract<ProductionWorkspaceAccess, { status: "allowed" }>,
): string | null {
  const screen = getAllowedScreensForRole(access.role, access.capabilities)[0];
  if (!screen) return null;

  return getScreenHref(workspace, screen, access.role).split("?")[0];
}

export async function resolveAuthenticatedHome(
  reader: AuthenticatedHomeReader,
  userId: string,
) {
  const workspaces = await reader.listCandidateWorkspaces(userId);

  for (const workspace of workspaces) {
    const access = await reader.resolveWorkspaceAccess(workspace, userId);
    if (access.status !== "allowed") continue;

    const href = getProductionScreenHref(workspace, access);
    if (href) return { status: "allowed", href } as const;
  }

  return { status: "invitation-required" } as const;
}

export function createSupabaseAuthenticatedHomeReader(
  client: SupabaseClient<Database>,
): AuthenticatedHomeReader {
  const tenancyReader = createSupabaseTenancyAccessReader(client);

  return {
    async listCandidateWorkspaces(userId) {
      const database = client as unknown as SupabaseClient;
      const { data: memberships, error: membershipError } = await database
        .from("memberships")
        .select("organisation_id, joined_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("joined_at", { ascending: true });
      if (membershipError) throw new Error("Could not resolve account access.");

      const organisationIds = (memberships ?? []).map(({ organisation_id }) =>
        String(organisation_id),
      );
      const organisations = await Promise.all(
        organisationIds.map(async (organisationId) => {
          const { data, error } = await database
            .from("organisations")
            .select("slug")
            .eq("id", organisationId)
            .eq("status", "active")
            .maybeSingle();
          if (error) throw new Error("Could not resolve account access.");
          return data ? String(data.slug) : null;
        }),
      );

      return [...new Set(organisations.filter((slug): slug is string => slug !== null))];
    },
    resolveWorkspaceAccess(workspace, userId) {
      return resolveProductionWorkspaceAccess(tenancyReader, workspace, userId);
    },
  };
}
