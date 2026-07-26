import { requireEventCapability } from "@/features/events/service";
import type { AuthorisationContext } from "@/features/tenancy/types";

interface SquadRepository {
  findReplacement(replacementId: string): Promise<{
    id: string;
    organisationId: string;
    teamId: string;
    squadId: string;
    withdrawnPlayerId: string;
    standbyPlayerId: string;
    status: "offered" | "accepted" | "declined" | "expired";
    expiresAt: string;
  } | null>;
  canMembershipRespondForPlayer(organisationId: string, teamId: string, playerId: string, membershipId: string): Promise<boolean>;
  acceptReplacement(value: {
    replacementId: string;
    organisationId: string;
    squadId: string;
    withdrawnPlayerId: string;
    selectedPlayerId: string;
    acceptedAt: string;
    status: "accepted";
    historyReason: "standby-replacement";
  }): Promise<unknown>;
}

export async function acceptStandbyReplacement(
  repository: SquadRepository,
  actor: AuthorisationContext,
  input: { organisationId: string; teamId: string; replacementId: string; standbyPlayerId: string; acceptedAt: string },
) {
  const replacement = await repository.findReplacement(input.replacementId);
  if (!replacement || replacement.organisationId !== input.organisationId || replacement.teamId !== input.teamId || replacement.standbyPlayerId !== input.standbyPlayerId) {
    throw new Error("This standby offer is not available.");
  }
  requireEventCapability(actor, "squads:respond", {
    organisationId: replacement.organisationId,
    teamId: replacement.teamId,
  });
  if (!await repository.canMembershipRespondForPlayer(
    replacement.organisationId,
    replacement.teamId,
    replacement.standbyPlayerId,
    actor.membership.id,
  )) {
    throw new Error("Only a linked guardian can respond to this standby offer.");
  }
  if (replacement.status !== "offered") throw new Error("This standby offer is no longer open.");
  if (new Date(input.acceptedAt) > new Date(replacement.expiresAt)) {
    throw new Error("This standby offer has expired.");
  }
  return repository.acceptReplacement({
    replacementId: replacement.id,
    organisationId: replacement.organisationId,
    squadId: replacement.squadId,
    withdrawnPlayerId: replacement.withdrawnPlayerId,
    selectedPlayerId: replacement.standbyPlayerId,
    acceptedAt: input.acceptedAt,
    status: "accepted",
    historyReason: "standby-replacement",
  });
}
