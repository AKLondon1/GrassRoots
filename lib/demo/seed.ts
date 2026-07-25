import type {
  Guardian,
  Household,
  Player,
  PlayerGuardian,
} from "@/features/households/types";
import { calendarTokenHash } from "@/features/events/service";
import { riversideDemoCalendarToken } from "@/lib/demo/calendar-token";

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
    ari: "00000000-0000-4000-8000-000000000604",
    ellis: "00000000-0000-4000-8000-000000000605",
    noor: "00000000-0000-4000-8000-000000000606",
    robin: "00000000-0000-4000-8000-000000000607",
    sasha: "00000000-0000-4000-8000-000000000608",
    quinn: "00000000-0000-4000-8000-000000000609",
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
  events: {
    training: "00000000-0000-4000-8000-000000001201",
    match: "00000000-0000-4000-8000-000000001202",
  },
  series: {
    training: "00000000-0000-4000-8000-000000001211",
  },
  poll: "00000000-0000-4000-8000-000000001301",
  squad: "00000000-0000-4000-8000-000000001401",
  calendarToken: "00000000-0000-4000-8000-000000001501",
} as const;

export { riversideDemoCalendarToken } from "@/lib/demo/calendar-token";

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
  readonly events: readonly DemoEvent[];
  readonly eventChangeSummaries: readonly DemoEventChangeSummary[];
  readonly availabilityResponses: readonly DemoAvailabilityResponse[];
  readonly polls: readonly DemoPoll[];
  readonly squads: readonly DemoSquad[];
  readonly squadHistory: readonly DemoSquadHistory[];
  readonly standbyReplacements: readonly DemoStandbyReplacement[];
  readonly notifications: readonly DemoNotification[];
  readonly calendarTokens: readonly DemoCalendarToken[];
  readonly coaching: DemoCoachingSeed;
  readonly financeGovernance: DemoFinanceGovernanceSeed;
}

export interface DemoFinanceGovernanceSeed {
  readonly invoice: { id: string; invoiceNumber: string; householdId: string; playerId: string; currency: "GBP"; subtotalPence: number; discountPence: number; totalPence: number; provider: "manual-development"; status: "issued" };
  readonly consent: { id: string; key: string; title: string; version: number; status: "response-needed" };
  readonly qualification: { membershipId: string; type: string; expiresOn: string };
  readonly platformSubscription: { kind: "platform-subscription"; plan: string; foundingEntitlement: boolean; status: "active" };
  readonly sensitiveAccess: { resourceType: "safeguarding-concern"; resourceId: string; outcome: "allowed"; actorMembershipId: string };
}

export interface DemoCoachingSeed {
  readonly trainingSession: {
    id: string; eventId: string; teamId: string; title: string; status: "published";
    plannedMinutes: number; items: readonly { id: string; kind: "segment" | "drill"; title: string; durationMinutes: number; order: number }[];
  };
  readonly attendance: readonly { playerId: string; status: "present" | "late"; occurredAt: string }[];
  readonly match: { id: string; eventId: string; teamId: string; state: "ready"; elapsedBeforeMs: number };
  readonly development: readonly { playerId: string; objective: string; privateObservation: string; approvedParentSummary: string; approvedAt: string }[];
}

export interface DemoEvent {
  readonly id: string;
  readonly organisationId: string;
  readonly teamId: string;
  readonly seriesId: string | null;
  readonly kind: "training" | "match";
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly responseDeadline: string;
  readonly locationName: string;
  readonly status: "scheduled" | "cancelled" | "completed";
  readonly opponent?: string;
}

export interface DemoEventChangeSummary {
  readonly id: string;
  readonly organisationId: string;
  readonly seriesId: string;
  readonly editScope: "this" | "this-and-future" | "all";
  readonly occurrenceStartsAt: string;
  readonly changedAt: string;
}

export interface DemoAvailabilityResponse {
  readonly id: string;
  readonly organisationId: string;
  readonly eventId: string;
  readonly teamId: string;
  readonly playerId: string;
  readonly guardianId: string;
  readonly status: "available" | "unavailable" | "unsure";
  readonly respondedAt: string;
}

export interface DemoPoll {
  readonly id: string;
  readonly organisationId: string;
  readonly teamId: string;
  readonly title: string;
  readonly status: "open" | "converted";
  readonly convertedSeriesId?: string;
  readonly conversionIdempotencyKey?: string;
  readonly closesAt: string;
  readonly options: readonly {
    id: string;
    startsAt: string;
    endsAt: string;
    availableRespondents: number;
    pitchCapacity: number;
  }[];
}

export interface DemoSquad {
  readonly id: string;
  readonly organisationId: string;
  readonly teamId: string;
  readonly eventId: string;
  readonly status: "published";
  readonly publishedAt: string;
  readonly members: readonly {
    playerId: string;
    status: "selected" | "standby";
    recentSelections: number;
    recentMinutes: number;
  }[];
}

export interface DemoNotification {
  readonly id: string;
  readonly organisationId: string;
  readonly householdId: string;
  readonly eventId: string;
  readonly template: string;
  readonly scheduledFor: string;
  readonly deliveryStatus: "not-sent";
  readonly provider: "development-outbox";
}

export interface DemoSquadHistory {
  readonly id: string;
  readonly organisationId: string;
  readonly squadId: string;
  readonly playerId: string;
  readonly previousStatus: "selected" | "standby" | null;
  readonly nextStatus: "selected" | "standby" | "withdrawn";
  readonly reason: string;
  readonly changedAt: string;
}

export interface DemoStandbyReplacement {
  readonly id: string;
  readonly organisationId: string;
  readonly teamId: string;
  readonly squadId: string;
  readonly withdrawnPlayerId: string;
  readonly standbyPlayerId: string;
  readonly status: "offered" | "accepted" | "declined" | "expired";
  readonly expiresAt: string;
  readonly respondedAt?: string;
}

export interface DemoCalendarToken {
  readonly id: string;
  readonly organisationId: string;
  readonly membershipId: string;
  readonly tokenHash: string;
  readonly revokedAt: string | null;
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
    { id: riversideDemoIds.players.ari, organisationId, firstName: "Ari", lastName: "Singh", dateOfBirth: "2015-03-04" },
    { id: riversideDemoIds.players.ellis, organisationId, firstName: "Ellis", lastName: "Reed", dateOfBirth: "2015-11-19" },
    { id: riversideDemoIds.players.noor, organisationId, firstName: "Noor", lastName: "Hughes", dateOfBirth: "2015-08-11" },
    { id: riversideDemoIds.players.robin, organisationId, firstName: "Robin", lastName: "Clarke", dateOfBirth: "2015-01-23" },
    { id: riversideDemoIds.players.sasha, organisationId, firstName: "Sasha", lastName: "Evans", dateOfBirth: "2015-05-16" },
    { id: riversideDemoIds.players.quinn, organisationId, firstName: "Quinn", lastName: "Bailey", dateOfBirth: "2015-09-02" },
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
    { id: "00000000-0000-4000-8000-000000000c05", organisationId, teamId: riversideDemoIds.teams.under11, memberKind: "player", memberId: riversideDemoIds.players.ari },
    { id: "00000000-0000-4000-8000-000000000c06", organisationId, teamId: riversideDemoIds.teams.under11, memberKind: "player", memberId: riversideDemoIds.players.ellis },
    { id: "00000000-0000-4000-8000-000000000c07", organisationId, teamId: riversideDemoIds.teams.under11, memberKind: "player", memberId: riversideDemoIds.players.noor },
    { id: "00000000-0000-4000-8000-000000000c08", organisationId, teamId: riversideDemoIds.teams.under11, memberKind: "player", memberId: riversideDemoIds.players.robin },
    { id: "00000000-0000-4000-8000-000000000c09", organisationId, teamId: riversideDemoIds.teams.under11, memberKind: "player", memberId: riversideDemoIds.players.sasha },
    { id: "00000000-0000-4000-8000-000000000c10", organisationId, teamId: riversideDemoIds.teams.under11, memberKind: "player", memberId: riversideDemoIds.players.quinn },
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
  events: [
    {
      id: riversideDemoIds.events.training,
      organisationId,
      teamId: riversideDemoIds.teams.under11,
      seriesId: riversideDemoIds.series.training,
      kind: "training",
      title: "Under 11s training",
      startsAt: "2026-08-02T08:30:00.000Z",
      endsAt: "2026-08-02T10:00:00.000Z",
      responseDeadline: "2026-07-30T17:00:00.000Z",
      locationName: "Riverside Sports Ground · Pitch 2",
      status: "scheduled",
    },
    {
      id: riversideDemoIds.events.match,
      organisationId,
      teamId: riversideDemoIds.teams.under11,
      seriesId: null,
      kind: "match",
      title: "Under 11s v Meadow Park Juniors",
      startsAt: "2026-08-09T09:00:00.000Z",
      endsAt: "2026-08-09T10:30:00.000Z",
      responseDeadline: "2026-08-05T18:00:00.000Z",
      locationName: "Riverside Sports Ground · Main pitch",
      status: "scheduled",
      opponent: "Meadow Park Juniors",
    },
  ],
  eventChangeSummaries: [],
  availabilityResponses: [
    {
      id: "00000000-0000-4000-8000-000000001221",
      organisationId,
      eventId: riversideDemoIds.events.match,
      teamId: riversideDemoIds.teams.under11,
      playerId: riversideDemoIds.players.jamie,
      guardianId: riversideDemoIds.guardians.parent,
      status: "available",
      respondedAt: "2026-07-20T18:05:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000001222",
      organisationId,
      eventId: riversideDemoIds.events.match,
      teamId: riversideDemoIds.teams.under11,
      playerId: riversideDemoIds.players.rowan,
      guardianId: riversideDemoIds.guardians.coach,
      status: "unsure",
      respondedAt: "2026-07-20T19:10:00.000Z",
    },
  ],
  polls: [
    {
      id: riversideDemoIds.poll,
      organisationId,
      teamId: riversideDemoIds.teams.under11,
      title: "September training time",
      status: "open",
      closesAt: "2026-07-24T18:00:00.000Z",
      options: [
        { id: "00000000-0000-4000-8000-000000001311", startsAt: "2026-09-05T08:00:00.000Z", endsAt: "2026-09-05T09:30:00.000Z", availableRespondents: 8, pitchCapacity: 10 },
        { id: "00000000-0000-4000-8000-000000001312", startsAt: "2026-09-05T10:00:00.000Z", endsAt: "2026-09-05T11:30:00.000Z", availableRespondents: 9, pitchCapacity: 9 },
        { id: "00000000-0000-4000-8000-000000001313", startsAt: "2026-09-05T16:00:00.000Z", endsAt: "2026-09-05T17:30:00.000Z", availableRespondents: 9, pitchCapacity: 7 },
      ],
    },
  ],
  squads: [
    {
      id: riversideDemoIds.squad,
      organisationId,
      teamId: riversideDemoIds.teams.under11,
      eventId: riversideDemoIds.events.match,
      status: "published",
      publishedAt: "2026-07-20T20:00:00.000Z",
      members: [
        { playerId: riversideDemoIds.players.jamie, status: "selected", recentSelections: 3, recentMinutes: 140 },
        { playerId: riversideDemoIds.players.rowan, status: "standby", recentSelections: 4, recentMinutes: 190 },
      ],
    },
  ],
  squadHistory: [
    {
      id: "00000000-0000-4000-8000-000000001411",
      organisationId,
      squadId: riversideDemoIds.squad,
      playerId: riversideDemoIds.players.jamie,
      previousStatus: null,
      nextStatus: "selected",
      reason: "Initial publication",
      changedAt: "2026-07-20T20:00:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000001412",
      organisationId,
      squadId: riversideDemoIds.squad,
      playerId: riversideDemoIds.players.rowan,
      previousStatus: null,
      nextStatus: "standby",
      reason: "Initial publication",
      changedAt: "2026-07-20T20:00:00.000Z",
    },
  ],
  standbyReplacements: [
    {
      id: "00000000-0000-4000-8000-000000001421",
      organisationId,
      teamId: riversideDemoIds.teams.under11,
      squadId: riversideDemoIds.squad,
      withdrawnPlayerId: riversideDemoIds.players.jamie,
      standbyPlayerId: riversideDemoIds.players.rowan,
      status: "offered",
      expiresAt: "2026-08-07T18:00:00.000Z",
    },
  ],
  notifications: [
    {
      id: "dev-availability-reminder",
      organisationId,
      householdId: riversideDemoIds.households.morgan,
      eventId: riversideDemoIds.events.match,
      template: "availability-reminder",
      scheduledFor: "2026-07-21T07:00:00.000Z",
      deliveryStatus: "not-sent",
      provider: "development-outbox",
    },
  ],
  calendarTokens: [
    {
      id: riversideDemoIds.calendarToken,
      organisationId,
      membershipId: riversideDemoIds.memberships.parent,
      tokenHash: calendarTokenHash(riversideDemoCalendarToken),
      revokedAt: null,
    },
  ],
  coaching: {
    trainingSession: {
      id: "00000000-0000-4000-8000-000000003001",
      eventId: riversideDemoIds.events.training,
      teamId: riversideDemoIds.teams.under11,
      title: "Passing, scanning and support",
      status: "published",
      plannedMinutes: 55,
      items: [
        { id: "00000000-0000-4000-8000-000000003011", kind: "segment", title: "Welcome and warm-up", durationMinutes: 10, order: 1 },
        { id: "00000000-0000-4000-8000-000000003012", kind: "drill", title: "Passing gates", durationMinutes: 20, order: 2 },
        { id: "00000000-0000-4000-8000-000000003013", kind: "drill", title: "Small-sided game", durationMinutes: 25, order: 3 },
      ],
    },
    attendance: [
      { playerId: riversideDemoIds.players.jamie, status: "present", occurredAt: "2026-08-02T08:31:00.000Z" },
      { playerId: riversideDemoIds.players.rowan, status: "late", occurredAt: "2026-08-02T08:36:00.000Z" },
    ],
    match: { id: "00000000-0000-4000-8000-000000003101", eventId: riversideDemoIds.events.match, teamId: riversideDemoIds.teams.under11, state: "ready", elapsedBeforeMs: 0 },
    development: [{
      playerId: riversideDemoIds.players.jamie,
      objective: "Scan before receiving",
      privateObservation: "Keep prompts brief and celebrate early scanning.",
      approvedParentSummary: "Jamie showed brave passing choices, supported teammates and used both feet.",
      approvedAt: "2026-08-10T09:00:00.000Z",
    }],
  },
  financeGovernance: {
    invoice: {
      id: "00000000-0000-4000-8000-000000004101",
      invoiceNumber: "GR-2026-014",
      householdId: riversideDemoIds.households.morgan,
      playerId: riversideDemoIds.players.jamie,
      currency: "GBP",
      subtotalPence: 15_000,
      discountPence: 2_500,
      totalPence: 12_500,
      provider: "manual-development",
      status: "issued",
    },
    consent: { id: "00000000-0000-4000-8000-000000004201", key: "photo-video", title: "Photo and video consent", version: 3, status: "response-needed" },
    qualification: { membershipId: riversideDemoIds.memberships.coach, type: "Emergency Aid", expiresOn: "2026-08-01" },
    platformSubscription: { kind: "platform-subscription", plan: "Founding club", foundingEntitlement: true, status: "active" },
    sensitiveAccess: { resourceType: "safeguarding-concern", resourceId: "00000000-0000-4000-8000-000000004220", outcome: "allowed", actorMembershipId: riversideDemoIds.memberships.club },
  },
};

export function createRiversideDemoSeed(): RiversideDemoSeed {
  return structuredClone(seed);
}
