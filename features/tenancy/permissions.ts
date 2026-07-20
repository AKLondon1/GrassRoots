import type {
  AuthorisationContext,
  Capability,
  PermissionScope,
} from "@/features/tenancy/types";

export class PermissionDeniedError extends Error {
  constructor() {
    super("Your current organisation membership does not include this permission.");
    this.name = "PermissionDeniedError";
  }
}

interface ResolveCapabilitiesInput extends AuthorisationContext {
  scope: PermissionScope;
}

function assignmentCoversScope(
  assignmentScope: PermissionScope,
  requestedScope: PermissionScope,
): boolean {
  if (assignmentScope.organisationId !== requestedScope.organisationId) {
    return false;
  }

  if (assignmentScope.kind === "organisation") return true;

  if (assignmentScope.kind === "team" && requestedScope.kind === "team") {
    return assignmentScope.teamId === requestedScope.teamId;
  }

  if (
    assignmentScope.kind === "resource" &&
    requestedScope.kind === "resource"
  ) {
    return (
      assignmentScope.resourceId === requestedScope.resourceId &&
      assignmentScope.resourceType === requestedScope.resourceType
    );
  }

  return false;
}

export function resolveCapabilities({
  assignments,
  membership,
  roles,
  scope,
}: ResolveCapabilitiesInput): readonly Capability[] {
  if (
    membership.status !== "active" ||
    membership.organisationId !== scope.organisationId
  ) {
    return [];
  }

  const roleById = new Map(
    roles
      .filter((role) => role.organisationId === membership.organisationId)
      .map((role) => [role.id, role]),
  );
  const resolved = new Set<Capability>();

  for (const assignment of assignments) {
    if (
      assignment.membershipId !== membership.id ||
      assignment.organisationId !== membership.organisationId ||
      assignment.scope.organisationId !== membership.organisationId ||
      !assignmentCoversScope(assignment.scope, scope)
    ) {
      continue;
    }

    const role = roleById.get(assignment.roleId);
    role?.capabilities.forEach((capability) => resolved.add(capability));
  }

  return [...resolved];
}

export function hasCapability(
  context: AuthorisationContext,
  capability: Capability,
  scope: PermissionScope,
  options: { throwOnDenied?: boolean } = {},
): boolean {
  const allowed = resolveCapabilities({ ...context, scope }).includes(capability);

  if (!allowed && options.throwOnDenied) throw new PermissionDeniedError();

  return allowed;
}
