import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Capability,
  OrganisationMembership,
  ScopedCapabilityGrant,
} from "@/features/tenancy/types";
import type { AppRole } from "@/lib/navigation/screen-registry";
import type { Database } from "@/lib/supabase/types";

export function selectActiveMembership(
  memberships: readonly OrganisationMembership[],
  userId: string,
  organisationId: string,
): OrganisationMembership | undefined {
  return memberships.find(
    (membership) =>
      membership.userId === userId &&
      membership.organisationId === organisationId &&
      membership.status === "active",
  );
}

interface OrganisationRecord {
  id: string;
  slug: string;
}

interface AssignmentRecord {
  organisationId: string;
  roleId: string;
  scopeKind: "organisation" | "team" | "resource";
  scopeId: string;
  resourceType: string | null;
}

interface RoleRecord {
  id: string;
  key: string;
  label: string;
}

interface RolePermissionRecord {
  roleId: string;
  capability: `${string}:${string}`;
}

export interface TenancyAccessReader {
  findOrganisation(slug: string): Promise<OrganisationRecord | null>;
  findActiveMembership(
    userId: string,
    organisationId: string,
  ): Promise<OrganisationMembership | null>;
  listAssignments(
    membershipId: string,
    organisationId: string,
  ): Promise<readonly AssignmentRecord[]>;
  listRoles(
    organisationId: string,
    roleIds: readonly string[],
  ): Promise<readonly RoleRecord[]>;
  listRolePermissions(
    organisationId: string,
    roleIds: readonly string[],
  ): Promise<readonly RolePermissionRecord[]>;
}

export type ProductionWorkspaceAccess =
  | {
      status: "allowed";
      organisationId: string;
      membershipId: string;
      role: AppRole;
      /** Navigation hints only; never authorise a record mutation from this union. */
      capabilities: readonly Capability[];
      /** Downstream mutations must match their exact target against these grants. */
      scopedGrants: readonly ScopedCapabilityGrant[];
    }
  | { status: "denied"; reason: "membership" | "capability" };

function appRoleForAssignedKey(key: string): AppRole {
  if (key === "parent" || key === "guardian") return "parent";
  if (key === "coach" || key === "manager") return "coach";
  if (key === "platform-owner" || key === "platform-operator") {
    return "platform";
  }
  return "club";
}

function appRoleForAssignedKeys(keys: readonly string[]): AppRole | undefined {
  const mapped = new Set(keys.map(appRoleForAssignedKey));

  return (["platform", "club", "coach", "parent"] as const).find((role) =>
    mapped.has(role),
  );
}

export async function resolveProductionWorkspaceAccess(
  reader: TenancyAccessReader,
  workspace: string,
  userId: string,
): Promise<ProductionWorkspaceAccess> {
  const organisation = await reader.findOrganisation(workspace);
  if (!organisation) return { status: "denied", reason: "membership" };

  const membership = await reader.findActiveMembership(userId, organisation.id);
  if (!membership) return { status: "denied", reason: "membership" };

  const assignments = await reader.listAssignments(
    membership.id,
    organisation.id,
  );
  const scopedAssignments = assignments.filter(
    (assignment) => assignment.organisationId === organisation.id,
  );
  const roleIds = [...new Set(scopedAssignments.map(({ roleId }) => roleId))];
  if (roleIds.length === 0) return { status: "denied", reason: "capability" };

  const [roles, permissions] = await Promise.all([
    reader.listRoles(organisation.id, roleIds),
    reader.listRolePermissions(organisation.id, roleIds),
  ]);
  const assignedRoles = roles.filter(({ id }) => roleIds.includes(id));
  const role = appRoleForAssignedKeys(assignedRoles.map(({ key }) => key));
  const roleById = new Map(
    assignedRoles.map((assignedRole) => [assignedRole.id, assignedRole]),
  );
  const capabilitiesByRole = new Map<string, readonly Capability[]>();
  roleIds.forEach((roleId) => {
    capabilitiesByRole.set(
      roleId,
      Object.freeze([
        ...new Set(
          permissions
            .filter((permission) => permission.roleId === roleId)
            .map(({ capability }) => capability),
        ),
      ]),
    );
  });
  const scopedGrants = Object.freeze(
    scopedAssignments.flatMap((assignment): ScopedCapabilityGrant[] => {
      const assignedRole = roleById.get(assignment.roleId);
      if (!assignedRole) return [];
      return [
        Object.freeze({
          organisationId: assignment.organisationId,
          scopeKind: assignment.scopeKind,
          scopeId: assignment.scopeId,
          resourceType: assignment.resourceType,
          role: Object.freeze({
            id: assignedRole.id,
            key: assignedRole.key,
            label: assignedRole.label,
          }),
          capabilities:
            capabilitiesByRole.get(assignment.roleId) ?? Object.freeze([]),
        }),
      ];
    }),
  );
  const capabilities = Object.freeze(
    role
      ? [
          ...new Set(
            scopedGrants
              .filter((grant) => appRoleForAssignedKey(grant.role.key) === role)
              .flatMap((grant) => grant.capabilities),
          ),
        ]
      : [],
  );

  if (!role || capabilities.length === 0) {
    return { status: "denied", reason: "capability" };
  }

  return {
    status: "allowed",
    organisationId: organisation.id,
    membershipId: membership.id,
    role,
    capabilities,
    scopedGrants,
  };
}

function failOnQueryError(error: { message: string } | null) {
  if (error) throw new Error("Could not resolve organisation access.");
}

export function createSupabaseTenancyAccessReader(
  client: SupabaseClient<Database>,
): TenancyAccessReader {
  const databaseClient = client as unknown as SupabaseClient;
  return {
    async findOrganisation(slug) {
      const { data, error } = await databaseClient
        .from("organisations")
        .select("id, slug")
        .eq("slug", slug)
        .eq("status", "active")
        .maybeSingle();
      failOnQueryError(error);
      return data;
    },
    async findActiveMembership(userId, organisationId) {
      const { data, error } = await databaseClient
        .from("memberships")
        .select("id, organisation_id, user_id, status")
        .eq("organisation_id", organisationId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      failOnQueryError(error);
      const membership = data as {
        id: string;
        organisation_id: string;
        user_id: string;
      } | null;
      return membership
        ? {
            id: membership.id,
            organisationId: membership.organisation_id,
            userId: membership.user_id,
            status: "active",
          }
        : null;
    },
    async listAssignments(membershipId, organisationId) {
      const { data, error } = await databaseClient
        .from("scoped_role_assignments")
        .select("organisation_id, role_id, scope_kind, scope_id, resource_type")
        .eq("organisation_id", organisationId)
        .eq("membership_id", membershipId);
      failOnQueryError(error);
      const assignments = (data ?? []) as Array<{
        organisation_id: string;
        role_id: string;
        scope_kind: "organisation" | "team" | "resource";
        scope_id: string;
        resource_type: string | null;
      }>;
      return assignments.map((assignment) => ({
        organisationId: assignment.organisation_id,
        roleId: assignment.role_id,
        scopeKind: assignment.scope_kind,
        scopeId: assignment.scope_id,
        resourceType: assignment.resource_type,
      }));
    },
    async listRoles(organisationId, roleIds) {
      if (roleIds.length === 0) return [];
      const { data, error } = await databaseClient
        .from("roles")
        .select("id, key, name")
        .eq("organisation_id", organisationId)
        .in("id", [...roleIds]);
      failOnQueryError(error);
      const roles = (data ?? []) as Array<{
        id: string;
        key: string;
        name: string;
      }>;
      return roles.map((role) => ({
        id: role.id,
        key: role.key,
        label: role.name,
      }));
    },
    async listRolePermissions(organisationId, roleIds) {
      if (roleIds.length === 0) return [];
      const { data: grantsData, error: grantsError } = await databaseClient
        .from("role_permissions")
        .select("role_id, permission_id")
        .eq("organisation_id", organisationId)
        .in("role_id", [...roleIds]);
      failOnQueryError(grantsError);
      const grants = (grantsData ?? []) as Array<{
        role_id: string;
        permission_id: string;
      }>;
      const permissionIds = [
        ...new Set(grants.map(({ permission_id }) => permission_id)),
      ];
      if (permissionIds.length === 0) return [];

      const { data: permissionsData, error: permissionsError } = await databaseClient
        .from("permissions")
        .select("id, key")
        .in("id", permissionIds);
      failOnQueryError(permissionsError);
      const permissions = (permissionsData ?? []) as Array<{
        id: string;
        key: string;
      }>;
      const capabilityById = new Map(
        permissions.map(({ id, key }) => [
          id,
          key as `${string}:${string}`,
        ]),
      );

      return grants.flatMap((grant) => {
        const capability = capabilityById.get(grant.permission_id);
        return capability ? [{ roleId: grant.role_id, capability }] : [];
      });
    },
  };
}
