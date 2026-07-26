import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getDefaultScreen,
  getScreenHref,
  type AppRole,
} from "@/lib/navigation/screen-registry";
import type { Database } from "@/lib/supabase/types";

export interface AuthenticatedHomeReader {
  findFirstActiveWorkspace(
    userId: string,
  ): Promise<{ workspace: string; roleKey: string } | null>;
}

function roleForKey(key: string): AppRole {
  if (key === "parent" || key === "guardian") return "parent";
  if (key === "coach" || key === "manager") return "coach";
  if (key === "platform-owner" || key === "platform-operator") return "platform";
  return "club";
}

function getProductionScreenHref(workspace: string, role: AppRole): string {
  return getScreenHref(workspace, getDefaultScreen(role), role).split("?")[0];
}

export async function resolveAuthenticatedHome(
  reader: AuthenticatedHomeReader,
  userId: string,
) {
  const target = await reader.findFirstActiveWorkspace(userId);
  if (!target) return { status: "invitation-required" } as const;

  const role = roleForKey(target.roleKey);
  return {
    status: "allowed",
    href: getProductionScreenHref(target.workspace, role),
  } as const;
}

export function createSupabaseAuthenticatedHomeReader(
  client: SupabaseClient<Database>,
): AuthenticatedHomeReader {
  return {
    async findFirstActiveWorkspace(userId) {
      const database = client as unknown as SupabaseClient;
      const { data: memberships, error: membershipError } = await database
        .from("memberships")
        .select("id, organisation_id, joined_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("joined_at", { ascending: true })
        .limit(20);
      if (membershipError) throw new Error("Could not resolve account access.");

      for (const membership of memberships ?? []) {
        const [
          { data: organisation, error: organisationError },
          { data: assignment, error: assignmentError },
        ] = await Promise.all([
          database
            .from("organisations")
            .select("slug")
            .eq("id", membership.organisation_id)
            .eq("status", "active")
            .maybeSingle(),
          database
            .from("scoped_role_assignments")
            .select("role_id")
            .eq("organisation_id", membership.organisation_id)
            .eq("membership_id", membership.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);
        if (organisationError || assignmentError) {
          throw new Error("Could not resolve account access.");
        }
        if (!organisation || !assignment) continue;

        const { data: role, error: roleError } = await database
          .from("roles")
          .select("key")
          .eq("organisation_id", membership.organisation_id)
          .eq("id", assignment.role_id)
          .maybeSingle();
        if (roleError) throw new Error("Could not resolve account access.");
        if (role) {
          return {
            workspace: String(organisation.slug),
            roleKey: String(role.key),
          };
        }
      }

      return null;
    },
  };
}
