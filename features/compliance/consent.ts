export type ConsentStatus = "valid" | "withdrawn" | "needs-response";

export function evaluateConsent(input: { currentVersion: number; responseVersion: number | null; grantedAt: string | null; withdrawnAt: string | null }): ConsentStatus {
  if (input.withdrawnAt) return "withdrawn";
  if (!input.grantedAt || input.responseVersion !== input.currentVersion) return "needs-response";
  return "valid";
}

interface ConsentResponse {
  id: string;
  organisationId: string;
  definitionId: string;
  playerId: string;
  guardianId: string;
  version: number;
  grantedAt: string | null;
  declinedAt: string | null;
  withdrawnAt: string | null;
}

export class ConsentService {
  private readonly definitions = new Map<string, number>();
  private readonly responses: ConsentResponse[] = [];

  publish(input: { organisationId: string; definitionId: string; version: number }) {
    const key = `${input.organisationId}:${input.definitionId}`;
    const current = this.definitions.get(key) ?? 0;
    if (!Number.isInteger(input.version) || input.version <= current) throw new Error("Consent version must increase.");
    this.definitions.set(key, input.version);
  }

  respond(input: { organisationId: string; definitionId: string; playerId: string; guardianId: string; version: number; granted: boolean }): ConsentResponse {
    const key = `${input.organisationId}:${input.definitionId}`;
    if (this.definitions.get(key) !== input.version) throw new Error("Consent response must use the current version.");
    const at = new Date().toISOString();
    const response: ConsentResponse = {
      id: `consent-${this.responses.length + 1}`,
      ...input,
      grantedAt: input.granted ? at : null,
      declinedAt: input.granted ? null : at,
      withdrawnAt: null,
    };
    this.responses.push(response);
    return { ...response };
  }

  withdraw(responseId: string, guardianId: string): ConsentResponse {
    const response = this.responses.find(({ id }) => id === responseId);
    if (!response || response.guardianId !== guardianId) throw new Error("Consent response is not available to this guardian.");
    if (response.withdrawnAt) throw new Error("Consent is already withdrawn.");
    response.withdrawnAt = new Date().toISOString();
    return { ...response };
  }

  status(organisationId: string, definitionId: string, playerId: string): ConsentStatus {
    const currentVersion = this.definitions.get(`${organisationId}:${definitionId}`) ?? 0;
    const response = this.responses.findLast((item) => item.organisationId === organisationId && item.definitionId === definitionId && item.playerId === playerId);
    return evaluateConsent({ currentVersion, responseVersion: response?.version ?? null, grantedAt: response?.grantedAt ?? null, withdrawnAt: response?.withdrawnAt ?? null });
  }
}
