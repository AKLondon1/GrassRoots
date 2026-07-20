import type { OrganisationMembership } from "@/features/tenancy/types";

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
