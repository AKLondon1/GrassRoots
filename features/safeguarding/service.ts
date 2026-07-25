type SensitiveRole = "welfare-officer";
type AccessRole = SensitiveRole | "coach" | "club-admin" | "club-owner" | "guardian";

interface AccessContext {
  actorId: string;
  role: AccessRole;
  organisationId: string;
  emergency?: boolean;
}

interface Concern {
  id: string;
  organisationId: string;
  raisedBy: string;
  summary: string;
  status: "open" | "closed";
}

interface MedicalProfile {
  organisationId: string;
  playerId: string;
  emergencySummary: string;
  clinicalNotes: string;
}

export interface SensitiveAccessAudit {
  actorId: string;
  organisationId: string;
  resourceType: "safeguarding-concern" | "medical-profile";
  resourceId: string;
  action: "read";
  outcome: "allowed" | "denied";
  occurredAt: string;
}

export class SafeguardingService {
  private readonly concerns: Concern[] = [];
  private readonly medical = new Map<string, MedicalProfile>();
  readonly audit: SensitiveAccessAudit[] = [];

  raise(input: { organisationId: string; actorId: string; summary: string }): Concern {
    if (!input.summary.trim()) throw new Error("A concern summary is required.");
    const concern: Concern = { id: `concern-${this.concerns.length + 1}`, organisationId: input.organisationId, raisedBy: input.actorId, summary: input.summary, status: "open" };
    this.concerns.push(concern);
    return { ...concern };
  }

  read(id: string, context: AccessContext): Concern {
    const concern = this.concerns.find((item) => item.id === id && item.organisationId === context.organisationId);
    const allowed = Boolean(concern && context.role === "welfare-officer");
    this.record(context, "safeguarding-concern", id, allowed);
    if (!allowed || !concern) throw new Error("Safeguarding detail is restricted to authorised welfare roles.");
    return { ...concern };
  }

  setMedicalProfile(profile: MedicalProfile) {
    this.medical.set(`${profile.organisationId}:${profile.playerId}`, { ...profile });
  }

  readMedical(playerId: string, context: AccessContext) {
    const profile = this.medical.get(`${context.organisationId}:${playerId}`);
    const welfare = context.role === "welfare-officer";
    const allowed = Boolean(profile && welfare);
    this.record(context, "medical-profile", playerId, allowed);
    if (!allowed || !profile) throw new Error("Medical detail is restricted.");
    return context.emergency
      ? { playerId: profile.playerId, emergencySummary: profile.emergencySummary }
      : { ...profile };
  }

  private record(context: AccessContext, resourceType: SensitiveAccessAudit["resourceType"], resourceId: string, allowed: boolean) {
    this.audit.push({ actorId: context.actorId, organisationId: context.organisationId, resourceType, resourceId, action: "read", outcome: allowed ? "allowed" : "denied", occurredAt: new Date().toISOString() });
  }
}
