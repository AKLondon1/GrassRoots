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
 * Resolve the signed-in member's access, or null if they have none here.
 *
 * `requireCapability` is for a write that has already been decided on. A screen
 * that has to decide what to OFFER cannot use it, because it throws: the coach
 * composer needs the grant list itself, so it can list exactly the teams the author
 * may publish to and hide the club-wide option from someone who may not. Offering a
 * control the database will refuse is the same class of defect as the empty
 * dropdowns migration 0026 fixed.
 */
export async function resolveAccess(workspace: string): Promise<AllowedAccess | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const access = await resolveProductionWorkspaceAccess(
    createSupabaseTenancyAccessReader(supabase),
    workspace,
    data.user.id,
  );

  return access.status === "allowed" ? access : null;
}

/**
 * Every team the member holds `capability` over, and whether they hold it
 * club-wide.
 *
 * An organisation-scoped grant covers every team, which is why `organisation` is
 * reported separately rather than expanded into a team list the caller would then
 * have to keep in step with the teams table.
 */
export function capabilityScopes(
  access: AllowedAccess,
  capability: Capability,
): { organisation: boolean; teamIds: readonly string[] } {
  const relevant = access.scopedGrants.filter(
    (grant) =>
      grant.organisationId === access.organisationId &&
      grant.capabilities.includes(capability),
  );

  return {
    organisation: relevant.some((grant) => grant.scopeKind === "organisation"),
    teamIds: [
      ...new Set(
        relevant.flatMap((grant) => (grant.scopeKind === "team" ? [grant.scopeId] : [])),
      ),
    ],
  };
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
