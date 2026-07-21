export interface SupportSession {
  readonly organisationId: string;
  readonly actorId: string;
  readonly reason: string;
  readonly startsAt: string;
  readonly expiresAt: string;
  readonly authorisedResources: readonly { readonly type: "venue" | "facility" | "facility_booking" | "event"; readonly id: string }[];
  readonly revokedAt: string | null;
  readonly revocationReason: string | null;
  readonly audit: { readonly action: "support.session.started"; readonly recordedAt: string };
}

export function createSupportSession(input: { organisationId: string; actorId: string; reason: string; now: string; durationMinutes: number; authorisedResources?: SupportSession["authorisedResources"] }): SupportSession {
  if (input.reason.trim().length < 10) throw new Error("A specific support access reason of at least 10 characters is required.");
  if (input.durationMinutes < 1 || input.durationMinutes > 60) throw new Error("Support access must last between 1 and 60 minutes.");
  return {
    organisationId: input.organisationId,
    actorId: input.actorId,
    reason: input.reason.trim(),
    startsAt: input.now,
    expiresAt: new Date(new Date(input.now).getTime() + input.durationMinutes * 60_000).toISOString(),
    authorisedResources: Object.freeze([...(input.authorisedResources ?? [])]),
    revokedAt: null,
    revocationReason: null,
    audit: { action: "support.session.started", recordedAt: input.now },
  };
}

export function isSupportSessionActive(session: SupportSession, now: string) {
  const at = new Date(now).getTime();
  return session.revokedAt === null && at >= new Date(session.startsAt).getTime() && at < new Date(session.expiresAt).getTime();
}

export function revokeSupportSession(session: SupportSession, now: string, reason: string): SupportSession {
  if (reason.trim().length < 5) throw new Error("A revocation reason is required.");
  return { ...session, revokedAt: now, revocationReason: reason.trim() };
}
