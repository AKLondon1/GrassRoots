interface ResourceScope { type: string; id: string }
interface SupportSession {
  id: string;
  organisationId: string;
  operatorId: string;
  reason: string;
  authorisedResources: readonly ResourceScope[];
  startsAt: string;
  expiresAt: string;
}

const forbiddenResourceTypes = new Set(["safeguarding-concern", "safeguarding-action", "medical-profile"]);

export class SupportAccessService {
  private readonly sessions = new Map<string, SupportSession>();

  start(input: Omit<SupportSession, "id" | "expiresAt"> & { durationMinutes: number }) {
    if (!input.reason.trim()) throw new Error("A support reason is required.");
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 60) throw new Error("Support access must last between 1 and 60 minutes.");
    const expires = new Date(input.startsAt);
    expires.setUTCMinutes(expires.getUTCMinutes() + input.durationMinutes);
    const session: SupportSession = { id: `support-${this.sessions.size + 1}`, organisationId: input.organisationId, operatorId: input.operatorId, reason: input.reason, authorisedResources: input.authorisedResources.map((resource) => ({ ...resource })), startsAt: input.startsAt, expiresAt: expires.toISOString() };
    this.sessions.set(session.id, session);
    return { ...session };
  }

  authorise(sessionId: string, resource: ResourceScope, now: string) {
    const session = this.sessions.get(sessionId);
    if (!session || new Date(now) >= new Date(session.expiresAt) || forbiddenResourceTypes.has(resource.type)) return false;
    return session.authorisedResources.some((candidate) => candidate.type === resource.type && candidate.id === resource.id);
  }
}
