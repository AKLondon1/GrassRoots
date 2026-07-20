export type Capability = `${string}:${string}`;

export type OrganisationScope = {
  kind: "organisation";
  organisationId: string;
};

export type TeamScope = {
  kind: "team";
  organisationId: string;
  teamId: string;
};

export type ResourceScope = {
  kind: "resource";
  organisationId: string;
  resourceId: string;
  resourceType: string;
};

export type PermissionScope =
  | OrganisationScope
  | TeamScope
  | ResourceScope;

export type MembershipStatus = "active" | "invited" | "suspended" | "left";

export interface OrganisationMembership {
  id: string;
  organisationId: string;
  userId: string;
  status: MembershipStatus;
}

export interface RoleDefinition {
  id: string;
  organisationId: string;
  key: string;
  label: string;
  capabilities: readonly Capability[];
}

export interface ScopedRoleAssignment {
  id: string;
  membershipId: string;
  organisationId: string;
  roleId: string;
  scope: PermissionScope;
}

export interface AuthorisationContext {
  assignments: readonly ScopedRoleAssignment[];
  membership: OrganisationMembership;
  roles: readonly RoleDefinition[];
}
