export type GuardianAction =
  | "communicate"
  | "manage-payments"
  | "record-consent"
  | "emergency-contact";

export interface Player {
  readonly id: string;
  readonly organisationId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: string;
}

export interface Guardian {
  readonly id: string;
  readonly organisationId: string;
  readonly membershipId: string | null;
  readonly displayName: string;
  readonly email?: string;
  readonly status: "pending" | "active" | "inactive";
}

export interface Household {
  readonly id: string;
  readonly organisationId: string;
  readonly name: string;
}

export interface GuardianPermissionFlags {
  readonly communication: boolean;
  readonly payments: boolean;
  readonly consent: boolean;
  readonly emergencyContact: boolean;
  readonly restrictedContact: boolean;
}

export interface PlayerGuardian {
  readonly id: string;
  readonly organisationId: string;
  readonly householdId: string;
  readonly playerId: string;
  readonly guardianId: string;
  readonly relationship: string;
  readonly permissions: GuardianPermissionFlags;
}

export interface HouseholdDirectory {
  readonly households: readonly Household[];
  readonly players: readonly Player[];
  readonly guardians: readonly Guardian[];
  readonly playerGuardians: readonly PlayerGuardian[];
}

export interface SafeHouseholdSummary {
  readonly id: string;
  readonly name: string;
  readonly guardianCount: number;
  readonly players: readonly {
    id: string;
    displayName: string;
    permittedActions: readonly GuardianAction[];
  }[];
  readonly otherGuardians: readonly {
    displayName: string;
    relationship: string;
  }[];
}
