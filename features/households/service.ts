import type {
  GuardianAction,
  HouseholdDirectory,
  PlayerGuardian,
  SafeHouseholdSummary,
} from "@/features/households/types";

export class HouseholdAccessDeniedError extends Error {
  constructor() {
    super("This household is not available to the current guardian.");
    this.name = "HouseholdAccessDeniedError";
  }
}

interface HouseholdAccessInput {
  organisationId: string;
  householdId: string;
  actingGuardianId: string;
  actingMembershipId: string;
}

interface PlayerAccessInput extends HouseholdAccessInput {
  playerId: string;
}

function requireActingLinks(
  directory: HouseholdDirectory,
  input: HouseholdAccessInput,
): readonly PlayerGuardian[] {
  const household = directory.households.find(
    (candidate) =>
      candidate.id === input.householdId &&
      candidate.organisationId === input.organisationId,
  );
  const guardian = directory.guardians.find(
    (candidate) =>
      candidate.id === input.actingGuardianId &&
      candidate.organisationId === input.organisationId &&
      candidate.status === "active" &&
      candidate.membershipId === input.actingMembershipId,
  );
  const links = directory.playerGuardians.filter(
    (link) =>
      link.organisationId === input.organisationId &&
      link.householdId === input.householdId &&
      link.guardianId === input.actingGuardianId,
  );

  if (!household || !guardian || links.length === 0) {
    throw new HouseholdAccessDeniedError();
  }
  return links;
}

function actionsForLink(link: PlayerGuardian): readonly GuardianAction[] {
  const actions: GuardianAction[] = [];
  if (link.permissions.communication) actions.push("communicate");
  if (link.permissions.payments) actions.push("manage-payments");
  if (link.permissions.consent) actions.push("record-consent");
  if (link.permissions.emergencyContact) actions.push("emergency-contact");
  return actions;
}

export function getPermittedGuardianActions(
  directory: HouseholdDirectory,
  input: PlayerAccessInput,
): readonly GuardianAction[] {
  const links = requireActingLinks(directory, input);
  const link = links.find((candidate) => candidate.playerId === input.playerId);
  const player = directory.players.find(
    (candidate) =>
      candidate.id === input.playerId &&
      candidate.organisationId === input.organisationId,
  );
  if (!link || !player) throw new HouseholdAccessDeniedError();
  return actionsForLink(link);
}

export function getHouseholdSummary(
  directory: HouseholdDirectory,
  input: HouseholdAccessInput,
): SafeHouseholdSummary {
  const actingLinks = requireActingLinks(directory, input);
  const household = directory.households.find(
    (candidate) => candidate.id === input.householdId,
  )!;
  const playerIds = new Set(actingLinks.map(({ playerId }) => playerId));
  const householdLinks = directory.playerGuardians.filter(
    (link) =>
      link.organisationId === input.organisationId &&
      link.householdId === input.householdId &&
      playerIds.has(link.playerId),
  );
  const players = [...playerIds].map((playerId) => {
    const player = directory.players.find(
      (candidate) =>
        candidate.id === playerId &&
        candidate.organisationId === input.organisationId,
    );
    if (!player) throw new HouseholdAccessDeniedError();
    return {
      id: player.id,
      displayName: `${player.firstName} ${player.lastName}`,
      permittedActions: actionsForLink(
        actingLinks.find((link) => link.playerId === playerId)!,
      ),
    };
  });

  const linksByOtherGuardian = new Map<string, PlayerGuardian[]>();
  householdLinks.forEach((link) => {
    if (link.guardianId === input.actingGuardianId) return;
    const links = linksByOtherGuardian.get(link.guardianId) ?? [];
    links.push(link);
    linksByOtherGuardian.set(link.guardianId, links);
  });
  const otherGuardians = [...linksByOtherGuardian.entries()].flatMap(
    ([guardianId, links]) => {
      if (links.some((link) => link.permissions.restrictedContact)) return [];
      const link = links[0];
      const guardian = directory.guardians.find(
        (candidate) =>
          candidate.id === guardianId &&
          candidate.organisationId === input.organisationId,
      );
      if (!guardian) return [];
      return [
        {
          displayName: guardian.displayName,
          relationship: link.relationship,
        },
      ];
    },
  );

  return {
    id: household.id,
    name: household.name,
    guardianCount: 1 + otherGuardians.length,
    players,
    otherGuardians,
  };
}
