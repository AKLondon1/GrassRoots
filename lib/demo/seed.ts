import type {
  Guardian,
  Household,
  Player,
  PlayerGuardian,
} from "@/features/households/types";

export const riversideDemoIds = {
  organisation: "00000000-0000-4000-8000-000000000101",
  adults: {
    parent: "00000000-0000-4000-8000-000000000201",
    coach: "00000000-0000-4000-8000-000000000202",
    club: "00000000-0000-4000-8000-000000000203",
    platform: "00000000-0000-4000-8000-000000000204",
    secondGuardian: "00000000-0000-4000-8000-000000000205",
  },
  memberships: {
    parent: "00000000-0000-4000-8000-000000000301",
    coach: "00000000-0000-4000-8000-000000000302",
    club: "00000000-0000-4000-8000-000000000303",
    platform: "00000000-0000-4000-8000-000000000304",
    secondGuardian: "00000000-0000-4000-8000-000000000305",
  },
  guardians: {
    parent: "00000000-0000-4000-8000-000000000401",
    secondGuardian: "00000000-0000-4000-8000-000000000402",
    coach: "00000000-0000-4000-8000-000000000403",
  },
  households: {
    morgan: "00000000-0000-4000-8000-000000000501",
    taylor: "00000000-0000-4000-8000-000000000502",
  },
  players: {
    jamie: "00000000-0000-4000-8000-000000000601",
    maya: "00000000-0000-4000-8000-000000000602",
    rowan: "00000000-0000-4000-8000-000000000603",
  },
  season: "00000000-0000-4000-8000-000000000701",
  ageGroups: {
    under7: "00000000-0000-4000-8000-000000000711",
    under11: "00000000-0000-4000-8000-000000000712",
  },
  teams: {
    under7: "00000000-0000-4000-8000-000000000801",
    under11: "00000000-0000-4000-8000-000000000802",
  },
} as const;

export interface DemoOrganisation {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface DemoAdult {
  readonly userId: string;
  readonly membershipId: string;
  readonly organisationId: string;
  readonly displayName: string;
  readonly email: string;
  readonly roles: readonly string[];
}

export interface DemoSeason {
  readonly id: string;
  readonly organisationId: string;
  readonly name: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly active: boolean;
}

export interface DemoAgeGroup {
  readonly id: string;
  readonly organisationId: string;
  readonly name: string;
  readonly minimumAge: number;
  readonly maximumAge: number;
}

export interface DemoTeam {
  readonly id: string;
  readonly organisationId: string;
  readonly seasonId: string;
  readonly ageGroupId: string;
  readonly name: string;
}

export interface DemoTeamMembership {
  readonly id: string;
  readonly organisationId: string;
  readonly teamId: string;
  readonly memberKind: "player" | "coach" | "volunteer";
  readonly memberId: string;
}

export interface DemoCoach {
  readonly id: string;
  readonly organisationId: string;
  readonly membershipId: string;
  readonly displayName: string;
}

export interface DemoVolunteer {
  readonly id: string;
  readonly organisationId: string;
  readonly membershipId: string;
  readonly displayName: string;
  readonly kind: string;
}

export interface DemoOppositionContact {
  readonly id: string;
  readonly organisationId: string;
  readonly clubName: string;
  readonly displayName: string;
  readonly email: string;
}

export interface DemoManagerInvitation {
  readonly id: string;
  readonly organisationId: string;
  readonly teamId: string;
  readonly email: string;
  readonly role: "manager";
  readonly deliveryStatus: "not-sent";
}

export interface RiversideDemoSeed {
  readonly organisation: DemoOrganisation;
  readonly adults: readonly DemoAdult[];
  readonly seasons: readonly DemoSeason[];
  readonly ageGroups: readonly DemoAgeGroup[];
  readonly teams: readonly DemoTeam[];
  readonly teamMemberships: readonly DemoTeamMembership[];
  readonly players: readonly Player[];
  readonly guardians: readonly Guardian[];
  readonly households: readonly Household[];
  readonly playerGuardians: readonly PlayerGuardian[];
  readonly coaches: readonly DemoCoach[];
  readonly volunteers: readonly DemoVolunteer[];
  readonly oppositionContacts: readonly DemoOppositionContact[];
  readonly managerInvitations: readonly DemoManagerInvitation[];
}

const organisationId = riversideDemoIds.organisation;
const openPermissions = {
  communication: true,
  payments: true,
  consent: true,
  emergencyContact: true,
  restrictedContact: false,
} as const;

const seed: RiversideDemoSeed = {
  organisation: {
    id: organisationId,
    name: "Riverside Juniors",
    slug: "riverside-juniors",
  },
  adults: [
    {
      userId: riversideDemoIds.adults.parent,
      membershipId: riversideDemoIds.memberships.parent,
      organisationId,
      displayName: "Alex Morgan",
      email: "alex.morgan@example.test",
      roles: ["guardian"],
    },
    {
      userId: riversideDemoIds.adults.coach,
      membershipId: riversideDemoIds.memberships.coach,
      organisationId,
      displayName: "Sam Taylor",
      email: "sam.taylor@example.test",
      roles: ["coach", "guardian"],
    },
    {
      userId: riversideDemoIds.adults.club,
      membershipId: riversideDemoIds.memberships.club,
      organisationId,
      displayName: "Priya Shah",
      email: "priya.shah@example.test",
      roles: ["club-admin", "volunteer"],
    },
    {
      userId: riversideDemoIds.adults.platform,
      membershipId: riversideDemoIds.memberships.platform,
      organisationId,
      displayName: "Morgan Lee",
      email: "morgan.lee@example.test",
      roles: ["platform-operator"],
    },
    {
      userId: riversideDemoIds.adults.secondGuardian,
      membershipId: riversideDemoIds.memberships.secondGuardian,
      organisationId,
      displayName: "Jordan Morgan",
      email: "jordan.morgan@example.test",
      roles: ["guardian"],
    },
  ],
  seasons: [
    {
      id: riversideDemoIds.season,
      organisationId,
      name: "2026/27 season",
      startsOn: "2026-08-01",
      endsOn: "2027-05-31",
      active: true,
    },
  ],
  ageGroups: [
    {
      id: riversideDemoIds.ageGroups.under7,
      organisationId,
      name: "Under 7",
      minimumAge: 5,
      maximumAge: 7,
    },
    {
      id: riversideDemoIds.ageGroups.under11,
      organisationId,
      name: "Under 11",
      minimumAge: 9,
      maximumAge: 11,
    },
  ],
  teams: [
    {
      id: riversideDemoIds.teams.under7,
      organisationId,
      seasonId: riversideDemoIds.season,
      ageGroupId: riversideDemoIds.ageGroups.under7,
      name: "Under 7s",
    },
    {
      id: riversideDemoIds.teams.under11,
      organisationId,
      seasonId: riversideDemoIds.season,
      ageGroupId: riversideDemoIds.ageGroups.under11,
      name: "Under 11s",
    },
  ],
  players: [
    {
      id: riversideDemoIds.players.jamie,
      organisationId,
      firstName: "Jamie",
      lastName: "Morgan",
      dateOfBirth: "2015-10-12",
    },
    {
      id: riversideDemoIds.players.maya,
      organisationId,
      firstName: "Maya",
      lastName: "Morgan",
      dateOfBirth: "2019-04-08",
    },
    {
      id: riversideDemoIds.players.rowan,
      organisationId,
      firstName: "Rowan",
      lastName: "Taylor",
      dateOfBirth: "2015-06-20",
    },
  ],
  guardians: [
    {
      id: riversideDemoIds.guardians.parent,
      organisationId,
      membershipId: riversideDemoIds.memberships.parent,
      displayName: "Alex Morgan",
      email: "alex.morgan@example.test",
      status: "active",
    },
    {
      id: riversideDemoIds.guardians.secondGuardian,
      organisationId,
      membershipId: riversideDemoIds.memberships.secondGuardian,
      displayName: "Jordan Morgan",
      email: "jordan.morgan@example.test",
      status: "active",
    },
    {
      id: riversideDemoIds.guardians.coach,
      organisationId,
      membershipId: riversideDemoIds.memberships.coach,
      displayName: "Sam Taylor",
      email: "sam.taylor@example.test",
      status: "active",
    },
  ],
  households: [
    {
      id: riversideDemoIds.households.morgan,
      organisationId,
      name: "Morgan household",
    },
    {
      id: riversideDemoIds.households.taylor,
      organisationId,
      name: "Taylor household",
    },
  ],
  playerGuardians: [
    {
      id: "00000000-0000-4000-8000-000000000901",
      organisationId,
      householdId: riversideDemoIds.households.morgan,
      playerId: riversideDemoIds.players.jamie,
      guardianId: riversideDemoIds.guardians.parent,
      relationship: "Parent",
      permissions: openPermissions,
    },
    {
      id: "00000000-0000-4000-8000-000000000902",
      organisationId,
      householdId: riversideDemoIds.households.morgan,
      playerId: riversideDemoIds.players.maya,
      guardianId: riversideDemoIds.guardians.parent,
      relationship: "Parent",
      permissions: { ...openPermissions, payments: false },
    },
    {
      id: "00000000-0000-4000-8000-000000000903",
      organisationId,
      householdId: riversideDemoIds.households.morgan,
      playerId: riversideDemoIds.players.jamie,
      guardianId: riversideDemoIds.guardians.secondGuardian,
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
      id: "00000000-0000-4000-8000-000000000904",
      organisationId,
      householdId: riversideDemoIds.households.taylor,
      playerId: riversideDemoIds.players.rowan,
      guardianId: riversideDemoIds.guardians.coach,
      relationship: "Parent",
      permissions: openPermissions,
    },
  ],
  coaches: [
    {
      id: "00000000-0000-4000-8000-000000000a01",
      organisationId,
      membershipId: riversideDemoIds.memberships.coach,
      displayName: "Sam Taylor",
    },
  ],
  volunteers: [
    {
      id: "00000000-0000-4000-8000-000000000b01",
      organisationId,
      membershipId: riversideDemoIds.memberships.club,
      displayName: "Priya Shah",
      kind: "Registration helper",
    },
  ],
  teamMemberships: [
    {
      id: "00000000-0000-4000-8000-000000000c01",
      organisationId,
      teamId: riversideDemoIds.teams.under11,
      memberKind: "player",
      memberId: riversideDemoIds.players.jamie,
    },
    {
      id: "00000000-0000-4000-8000-000000000c02",
      organisationId,
      teamId: riversideDemoIds.teams.under7,
      memberKind: "player",
      memberId: riversideDemoIds.players.maya,
    },
    {
      id: "00000000-0000-4000-8000-000000000c03",
      organisationId,
      teamId: riversideDemoIds.teams.under11,
      memberKind: "player",
      memberId: riversideDemoIds.players.rowan,
    },
    {
      id: "00000000-0000-4000-8000-000000000c04",
      organisationId,
      teamId: riversideDemoIds.teams.under11,
      memberKind: "coach",
      memberId: "00000000-0000-4000-8000-000000000a01",
    },
  ],
  oppositionContacts: [
    {
      id: "00000000-0000-4000-8000-000000000d01",
      organisationId,
      clubName: "Meadow Park Juniors",
      displayName: "Drew Patel",
      email: "fixtures.meadow-park@example.test",
    },
  ],
  managerInvitations: [
    {
      id: "00000000-0000-4000-8000-000000000e01",
      organisationId,
      teamId: riversideDemoIds.teams.under7,
      email: "manager.under7@example.test",
      role: "manager",
      deliveryStatus: "not-sent",
    },
  ],
};

export function createRiversideDemoSeed(): RiversideDemoSeed {
  return structuredClone(seed);
}
