"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCapability } from "@/features/tenancy/authorise";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const context = {
  organisationId: z.string().uuid(),
  workspace: z.string().min(1).max(120),
};

async function database() {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to manage club roles.");
  return client as unknown as SupabaseClient;
}

/**
 * Grant a role, at organisation or team scope.
 *
 * THE RPC IS THE WRITE PATH, not a direct insert. `assign_role` is SECURITY INVOKER,
 * so `assignments_manage_scoped` on scoped_role_assignments is still the enforcement;
 * what the function adds is resolving the organisation from the membership rather
 * than from anything the browser sent, and refusing a team that belongs to another
 * club. requireCapability below is defence in depth and a better error message, never
 * the only gate -- exactly the arrangement 0032 documents.
 *
 * Scope arrives as ONE field. "organisation", or a team's uuid. Two controls would
 * let a form submit `scope_kind = 'team'` with no team, which the RPC would then have
 * to reject; collapsing them means the invalid pair cannot be expressed.
 */
export async function assignRole(formData: FormData) {
  const input = z
    .object({
      ...context,
      membershipId: z.string().uuid(),
      roleKey: z.string().trim().min(1).max(60),
      scope: z.union([z.literal("organisation"), z.string().uuid()]),
    })
    .parse(Object.fromEntries(formData));

  const access = await requireCapability(input.workspace, "roles:manage");
  if (access.organisationId !== input.organisationId) {
    throw new Error("That organisation does not belong to this workspace.");
  }

  const teamId = input.scope === "organisation" ? null : input.scope;
  const { error } = await (await database()).rpc("assign_role", {
    p_membership_id: input.membershipId,
    p_role_key: input.roleKey,
    p_scope_kind: teamId ? "team" : "organisation",
    p_scope_id: teamId,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/app/${input.workspace}/access`);
}

/**
 * Remove a role assignment.
 *
 * `revoke_role` returns false when the assignment was already gone and RAISES when
 * the caller lacks permission, so the two cases stay distinguishable. An admin who
 * clicks a stale Remove button has got the outcome they wanted, so false is not
 * surfaced as an error.
 */
export async function revokeRole(formData: FormData) {
  const input = z
    .object({ ...context, assignmentId: z.string().uuid() })
    .parse(Object.fromEntries(formData));

  const access = await requireCapability(input.workspace, "roles:manage");
  if (access.organisationId !== input.organisationId) {
    throw new Error("That organisation does not belong to this workspace.");
  }

  const { error } = await (await database()).rpc("revoke_role", {
    p_assignment_id: input.assignmentId,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/app/${input.workspace}/access`);
}
