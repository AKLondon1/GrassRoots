interface OrganisationRecord {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
  trialEndsAt: string;
  foundingEntitlement: boolean;
  deleteAfter: string | null;
}

function addDays(value: string, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export class LifecycleService {
  private readonly organisations = new Map<string, OrganisationRecord>();

  signUpOrganisation(input: { name: string; ownerUserId: string; now?: string; foundingEntitlement?: boolean }) {
    const createdAt = input.now ?? new Date().toISOString();
    const id = `org-${this.organisations.size + 1}`;
    const record: OrganisationRecord = {
      id,
      name: input.name.trim(),
      ownerUserId: input.ownerUserId,
      createdAt,
      trialEndsAt: addDays(createdAt, 14),
      foundingEntitlement: input.foundingEntitlement ?? false,
      deleteAfter: null,
    };
    if (!record.name) throw new Error("Organisation name is required.");
    this.organisations.set(id, record);
    return { ...record };
  }

  transferOwnership(organisationId: string, actorUserId: string, nextOwnerUserId: string) {
    const record = this.organisations.get(organisationId);
    if (!record || record.ownerUserId !== actorUserId) throw new Error("Only the current owner can transfer ownership.");
    if (!nextOwnerUserId || nextOwnerUserId === actorUserId) throw new Error("A different next owner is required.");
    record.ownerUserId = nextOwnerUserId;
    return { ...record };
  }

  scheduleOrganisationDeletion(organisationId: string, actorUserId: string, now = new Date().toISOString()) {
    const record = this.organisations.get(organisationId);
    if (!record || record.ownerUserId !== actorUserId) throw new Error("Only the current owner can schedule deletion.");
    record.deleteAfter = addDays(now, 30);
    return { organisationId, deleteAfter: record.deleteAfter };
  }

  cancelOrganisationDeletion(organisationId: string, actorUserId: string) {
    const record = this.organisations.get(organisationId);
    if (!record || record.ownerUserId !== actorUserId) throw new Error("Only the current owner can cancel deletion.");
    record.deleteAfter = null;
    return { organisationId, deleteAfter: record.deleteAfter };
  }

  exportAccount(userId: string) {
    return {
      format: "json" as const,
      userId,
      organisations: [...this.organisations.values()].filter(({ ownerUserId }) => ownerUserId === userId).map(({ id, name }) => ({ id, name })),
      generatedAt: new Date().toISOString(),
    };
  }
}
