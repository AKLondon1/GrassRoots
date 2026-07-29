import {
  createSupabaseTenancyAccessReader,
  resolveProductionWorkspaceAccess,
  type ProductionWorkspaceAccess,
} from "@/features/tenancy/service";
import type { Capability } from "@/features/tenancy/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type AllowedAccess = Extract<ProductionWorkspaceAccess, { status: "allowed" }>;

export type CapabilityScope =
  | { kind: "organisation" }
  | { kind: "team"; teamId: string };

/**
 * Whether `access` carries `capability` at `scope`.
 *
 * Deliberately reads `scopedGrants`, never the `capabilities` array: that array is
 * narrowed to the active role and exists to drive navigation. Authorising a write
 * from it would mean a member's permissions changed when they switched role in the
 * header, which is not what a permission means.
 *
 * An organisation-scoped grant satisfies a team-scoped requirement, because it
 * covers every team. A team-scoped grant never satisfies an organisation-scoped
 * requirement, which is what keeps a manager off club-wide actions.
 */
export function grantsCapability(
  access: AllowedAccess,
  capability: Capability,
  scope: CapabilityScope,
): boolean {
  return access.scopedGrants.some((grant) => {
    if (grant.organisationId !== access.organisationId) return false;
    if (!grant.capabilities.includes(capability)) return false;
    if (grant.scopeKind === "organisation") return true;
    return (
      scope.kind === "team" &&
      grant.scopeKind === "team" &&
      grant.scopeId === scope.teamId
    );
  });
}

/**
 * Resolve the signed-in member and refuse unless they hold `capability`.
 *
 * RLS remains the backstop. This is defence in depth: without it, a server action
 * is one policy edit away from writing whatever it likes, with no test to catch it.
 */
export async function requireCapability(
  workspace: string,
  capability: Capability,
  scope: CapabilityScope = { kind: "organisation" },
): Promise<AllowedAccess> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Sign in to manage club setup.");

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in to manage club setup.");

  const access = await resolveProductionWorkspaceAccess(
    createSupabaseTenancyAccessReader(supabase),
    workspace,
    data.user.id,
  );

  if (access.status !== "allowed") {
    throw new Error("You do not have access to this workspace.");
  }

  if (!grantsCapability(access, capability, scope)) {
    throw new Error("You do not have permission to do that.");
  }

  return access;
}
