import {
  getHouseholdSummary,
  HouseholdAccessDeniedError,
} from "@/features/households/service";
import type { HouseholdDirectory } from "@/features/households/types";
import type { PeopleImportRow } from "@/features/people/import/schema";
import { peopleImportRowSchema } from "@/features/people/import/schema";
import {
  peopleImportDedupeKey,
  previewPeopleCsv,
  type PeopleImportPreview,
  type PeopleImportWriter,
} from "@/features/people/import/service";
import type { RiversideDemoSeed } from "@/lib/demo/seed";

function localId(prefix: string, value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

export class DemoRepository implements PeopleImportWriter {
  readonly persistence = Object.freeze({
    mode: "demo" as const,
    persistent: false as const,
    deliveryEnabled: false as const,
  });

  private state: RiversideDemoSeed;
  private readonly appliedPreviews = new Set<string>();

  constructor(seed: RiversideDemoSeed) {
    this.state = structuredClone(seed);
  }

  private requireOrganisation(organisationId: string) {
    if (organisationId !== this.state.organisation.id) {
      throw new HouseholdAccessDeniedError();
    }
  }

  snapshot(organisationId: string): RiversideDemoSeed {
    this.requireOrganisation(organisationId);
    return structuredClone(this.state);
  }

  getClubSetup(organisationId: string) {
    this.requireOrganisation(organisationId);
    const activeSeason = this.state.seasons.find(({ active }) => active);
    const managerInvitation = this.state.managerInvitations[0];
    if (!activeSeason || !managerInvitation) {
      throw new Error("The fictional club setup is incomplete.");
    }
    return {
      organisation: structuredClone(this.state.organisation),
      activeSeason: structuredClone(activeSeason),
      teams: structuredClone(this.state.teams),
      managerInvitation: structuredClone(managerInvitation),
    };
  }

  getHouseholdSummary(
    organisationId: string,
    householdId: string,
    actingGuardianId: string,
    actingMembershipId: string,
  ) {
    this.requireOrganisation(organisationId);
    const directory: HouseholdDirectory = this.state;
    return getHouseholdSummary(directory, {
      organisationId,
      householdId,
      actingGuardianId,
      actingMembershipId,
    });
  }

  previewPeopleImport(
    organisationId: string,
    csv: string,
  ): PeopleImportPreview {
    this.requireOrganisation(organisationId);
    return previewPeopleCsv(csv, {
      organisationId,
      existingDedupeKeys: this.listPeopleDedupeKeys(),
      validTeamNames: this.state.teams.map(({ name }) => name),
    });
  }

  private listPeopleDedupeKeys(): readonly string[] {
    return this.state.playerGuardians.flatMap((link) => {
      const player = this.state.players.find(({ id }) => id === link.playerId);
      const guardian = this.state.guardians.find(
        ({ id }) => id === link.guardianId,
      );
      if (!player || !guardian?.email) return [];
      return [
        peopleImportDedupeKey({
          player_first_name: player.firstName,
          player_last_name: player.lastName,
          date_of_birth: player.dateOfBirth,
          team: "",
          guardian_name: guardian.displayName,
          guardian_email: guardian.email,
          relationship: link.relationship,
          communication: link.permissions.communication,
          payments: link.permissions.payments,
          consent: link.permissions.consent,
        }),
      ];
    });
  }

  applyPeopleRows(
    previewId: string,
    organisationId: string,
    rows: readonly PeopleImportRow[],
  ): { status: "applied"; appliedCount: number } {
    this.requireOrganisation(organisationId);
    if (this.appliedPreviews.has(previewId)) {
      throw new Error("This import preview has already been applied.");
    }

    const existingDedupeKeys = new Set(this.listPeopleDedupeKeys());
    const validTeamNames = new Set(
      this.state.teams.map(({ name }) => name.trim().toLowerCase()),
    );
    rows.forEach((row) => {
      if (!peopleImportRowSchema.safeParse(row).success) {
        throw new Error("This import row is no longer valid.");
      }
      if (!validTeamNames.has(row.team.trim().toLowerCase())) {
        throw new Error("This team is not available in the organisation.");
      }
      if (existingDedupeKeys.has(peopleImportDedupeKey(row))) {
        throw new Error("This person already exists in the organisation.");
      }
    });

    const players = [...this.state.players];
    const guardians = [...this.state.guardians];
    const households = [...this.state.households];
    const playerGuardians = [...this.state.playerGuardians];
    const teamMemberships = [...this.state.teamMemberships];

    rows.forEach((row, index) => {
      const rowKey = `${previewId}|${index}|${peopleImportDedupeKey(row)}`;
      const playerId = localId("demo-player", rowKey);
      const guardianId = localId("demo-guardian", row.guardian_email);
      const householdId = localId("demo-household", row.guardian_email);
      const guardian = guardians.find(
        ({ email }) => email?.toLowerCase() === row.guardian_email.toLowerCase(),
      );
      if (!guardian) {
        guardians.push({
          id: guardianId,
          organisationId,
          membershipId: null,
          displayName: row.guardian_name,
          email: row.guardian_email.toLowerCase(),
          status: "pending",
        });
      }
      if (!households.some(({ id }) => id === householdId)) {
        households.push({
          id: householdId,
          organisationId,
          name: `${row.player_last_name} household`,
        });
      }
      players.push({
        id: playerId,
        organisationId,
        firstName: row.player_first_name,
        lastName: row.player_last_name,
        dateOfBirth: row.date_of_birth,
      });
      playerGuardians.push({
        id: localId("demo-link", rowKey),
        organisationId,
        householdId,
        playerId,
        guardianId: guardian?.id ?? guardianId,
        relationship: row.relationship,
        permissions: {
          communication: row.communication,
          payments: row.payments,
          consent: row.consent,
          emergencyContact: false,
          restrictedContact: false,
        },
      });
      const team = this.state.teams.find(
        ({ name }) => name.toLowerCase() === row.team.toLowerCase(),
      );
      if (team) {
        teamMemberships.push({
          id: localId("demo-team-member", rowKey),
          organisationId,
          teamId: team.id,
          memberKind: "player",
          memberId: playerId,
        });
      }
    });

    this.state = {
      ...this.state,
      players,
      guardians,
      households,
      playerGuardians,
      teamMemberships,
    };
    this.appliedPreviews.add(previewId);
    return { status: "applied", appliedCount: rows.length };
  }
}
