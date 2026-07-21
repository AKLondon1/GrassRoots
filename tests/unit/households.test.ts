import { describe, expect, it } from "vitest";

import {
  HouseholdAccessDeniedError,
  getHouseholdSummary,
  getPermittedGuardianActions,
} from "@/features/households/service";
import type { HouseholdDirectory } from "@/features/households/types";

const riversideId = "organisation-riverside";

const directory: HouseholdDirectory = {
  households: [
    {
      id: "household-morgan",
      organisationId: riversideId,
      name: "Morgan household",
    },
    {
      id: "household-taylor",
      organisationId: riversideId,
      name: "Taylor household",
    },
  ],
  players: [
    {
      id: "player-jamie",
      organisationId: riversideId,
      firstName: "Jamie",
      lastName: "Morgan",
      dateOfBirth: "2015-10-12",
    },
    {
      id: "player-maya",
      organisationId: riversideId,
      firstName: "Maya",
      lastName: "Morgan",
      dateOfBirth: "2019-04-08",
    },
    {
      id: "player-rowan",
      organisationId: riversideId,
      firstName: "Rowan",
      lastName: "Taylor",
      dateOfBirth: "2015-06-20",
    },
  ],
  guardians: [
    {
      id: "guardian-alex",
      organisationId: riversideId,
      membershipId: "membership-alex",
      displayName: "Alex Morgan",
      status: "active",
    },
    {
      id: "guardian-jordan",
      organisationId: riversideId,
      membershipId: "membership-jordan",
      displayName: "Jordan Morgan",
      status: "active",
    },
    {
      id: "guardian-sam",
      organisationId: riversideId,
      membershipId: "membership-sam",
      displayName: "Sam Taylor",
      status: "active",
    },
  ],
  playerGuardians: [
    {
      id: "link-jamie-alex",
      organisationId: riversideId,
      householdId: "household-morgan",
      playerId: "player-jamie",
      guardianId: "guardian-alex",
      relationship: "Parent",
      permissions: {
        communication: true,
        payments: true,
        consent: true,
        emergencyContact: true,
        restrictedContact: false,
      },
    },
    {
      id: "link-maya-alex",
      organisationId: riversideId,
      householdId: "household-morgan",
      playerId: "player-maya",
      guardianId: "guardian-alex",
      relationship: "Parent",
      permissions: {
        communication: true,
        payments: false,
        consent: true,
        emergencyContact: true,
        restrictedContact: false,
      },
    },
    {
      id: "link-jamie-jordan",
      organisationId: riversideId,
      householdId: "household-morgan",
      playerId: "player-jamie",
      guardianId: "guardian-jordan",
      relationship: "Parent",
      permissions: {
        communication: false,
        payments: false,
        consent: false,
        emergencyContact: false,
        restrictedContact: true,
      },
    },
    {
      id: "link-rowan-sam",
      organisationId: riversideId,
      householdId: "household-taylor",
      playerId: "player-rowan",
      guardianId: "guardian-sam",
      relationship: "Parent",
      permissions: {
        communication: true,
        payments: true,
        consent: true,
        emergencyContact: true,
        restrictedContact: false,
      },
    },
  ],
};

describe("household relationships", () => {
  it("supports multiple children and multiple guardians without child auth users", () => {
    const summary = getHouseholdSummary(directory, {
      organisationId: riversideId,
      householdId: "household-morgan",
      actingGuardianId: "guardian-alex",
      actingMembershipId: "membership-alex",
    });

    expect(summary.players.map(({ displayName }) => displayName)).toEqual([
      "Jamie Morgan",
      "Maya Morgan",
    ]);
    expect(summary.guardianCount).toBe(1);
    expect(directory.players.every((player) => !("userId" in player))).toBe(true);
  });

  it("derives each permitted action from guardian flags for that child", () => {
    expect(
      getPermittedGuardianActions(directory, {
        organisationId: riversideId,
        householdId: "household-morgan",
        playerId: "player-maya",
        actingGuardianId: "guardian-alex",
        actingMembershipId: "membership-alex",
      }),
    ).toEqual(["communicate", "record-consent", "emergency-contact"]);
  });

  it("does not expose the identity of a restricted contact in a safe summary", () => {
    const summary = getHouseholdSummary(directory, {
      organisationId: riversideId,
      householdId: "household-morgan",
      actingGuardianId: "guardian-alex",
      actingMembershipId: "membership-alex",
    });

    expect(summary.otherGuardians).toEqual([]);
    expect(JSON.stringify(summary)).not.toContain("Jordan Morgan");
    expect(JSON.stringify(summary)).not.toContain("Restricted contact");
    expect(summary.guardianCount).toBe(1);
  });

  it("lets a restricted flag win regardless of mixed-link order", () => {
    const mixedDirectory: HouseholdDirectory = {
      ...directory,
      playerGuardians: [
        ...directory.playerGuardians,
        {
          ...directory.playerGuardians[2],
          id: "link-maya-jordan-unrestricted",
          playerId: "player-maya",
          permissions: {
            ...directory.playerGuardians[2].permissions,
            restrictedContact: false,
          },
        },
      ],
    };
    const summary = getHouseholdSummary(mixedDirectory, {
      organisationId: riversideId,
      householdId: "household-morgan",
      actingGuardianId: "guardian-alex",
      actingMembershipId: "membership-alex",
    });

    expect(summary.otherGuardians).toEqual([]);
    expect(summary.guardianCount).toBe(1);
  });

  it("does not authorise pending guardians or a mismatched adult membership", () => {
    const pendingDirectory: HouseholdDirectory = {
      ...directory,
      guardians: directory.guardians.map((guardian) =>
        guardian.id === "guardian-alex"
          ? { ...guardian, membershipId: null, status: "pending" as const }
          : guardian,
      ),
    };

    expect(() =>
      getHouseholdSummary(pendingDirectory, {
        organisationId: riversideId,
        householdId: "household-morgan",
        actingGuardianId: "guardian-alex",
        actingMembershipId: "membership-alex",
      }),
    ).toThrow(HouseholdAccessDeniedError);
    expect(() =>
      getHouseholdSummary(directory, {
        organisationId: riversideId,
        householdId: "household-morgan",
        actingGuardianId: "guardian-alex",
        actingMembershipId: "membership-sam",
      }),
    ).toThrow(HouseholdAccessDeniedError);
  });

  it("denies cross-household and cross-organisation access", () => {
    expect(() =>
      getHouseholdSummary(directory, {
        organisationId: riversideId,
        householdId: "household-taylor",
        actingGuardianId: "guardian-alex",
        actingMembershipId: "membership-alex",
      }),
    ).toThrow(HouseholdAccessDeniedError);

    expect(() =>
      getHouseholdSummary(directory, {
        organisationId: "organisation-northfield",
        householdId: "household-morgan",
        actingGuardianId: "guardian-alex",
        actingMembershipId: "membership-alex",
      }),
    ).toThrow(HouseholdAccessDeniedError);
  });
});
