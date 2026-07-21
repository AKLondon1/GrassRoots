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
import type { AvailabilityResponseInput } from "@/features/availability/schema";
import { planRecurringEdit } from "@/features/events/recurrence";

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

  listEvents(organisationId: string, teamId?: string) {
    this.requireOrganisation(organisationId);
    return structuredClone(
      this.state.events.filter((event) => !teamId || event.teamId === teamId),
    );
  }

  async findEvent(organisationId: string, eventId: string) {
    this.requireOrganisation(organisationId);
    return structuredClone(
      this.state.events.find((event) => event.id === eventId) ?? null,
    );
  }

  async findSeries(organisationId: string, seriesId: string) {
    this.requireOrganisation(organisationId);
    const event = this.state.events.find((candidate) => candidate.seriesId === seriesId);
    return event ? { id: seriesId, organisationId, teamId: event.teamId } : null;
  }

  async applyRecurrenceEdit(plan: ReturnType<typeof planRecurringEdit>) {
    const template = this.state.events.find((event) => event.seriesId === plan.seriesId);
    if (!template) throw new Error("The demo event series is not available.");
    const patchEvent = (event: RiversideDemoSeed["events"][number], seriesId = event.seriesId) => ({
      ...event,
      seriesId,
      ...(plan.patch.title ? { title: plan.patch.title } : {}),
      ...(plan.patch.startsAt ? { startsAt: plan.patch.startsAt } : {}),
      ...(plan.patch.endsAt ? { endsAt: plan.patch.endsAt } : {}),
      ...(plan.patch.locationName !== undefined ? { locationName: plan.patch.locationName ?? "Venue to be confirmed" } : {}),
      ...(plan.patch.status ? { status: plan.patch.status } : {}),
    });
    let events = [...this.state.events];
    let occurrenceStartsAt: string;
    let editScope: "this" | "this-and-future" | "all";
    if (plan.kind === "exception") {
      occurrenceStartsAt = plan.occurrenceStartsAt;
      editScope = "this";
      const existing = events.find((event) => event.seriesId === plan.seriesId && event.startsAt === plan.occurrenceStartsAt);
      if (existing) {
        events = events.map((event) => event.id === existing.id ? patchEvent(event) : event);
      } else {
        events.push(patchEvent({ ...template, id: localId("demo-event-instance", `${plan.seriesId}|${plan.occurrenceStartsAt}`), startsAt: plan.occurrenceStartsAt }));
      }
    } else if (plan.kind === "split") {
      occurrenceStartsAt = plan.splitAt;
      editScope = "this-and-future";
      const newSeriesId = localId("demo-series", `${plan.seriesId}|${plan.splitAt}`);
      events = events.map((event) => event.seriesId === plan.seriesId && event.startsAt >= plan.splitAt ? patchEvent(event, newSeriesId) : event);
    } else {
      occurrenceStartsAt = template.startsAt;
      editScope = "all";
      events = events.map((event) => event.seriesId === plan.seriesId ? patchEvent(event) : event);
    }
    this.state = {
      ...this.state,
      events,
      eventChangeSummaries: [
        ...this.state.eventChangeSummaries,
        {
          id: localId("demo-event-change", `${plan.seriesId}|${editScope}|${occurrenceStartsAt}`),
          organisationId: template.organisationId,
          seriesId: plan.seriesId,
          editScope,
          occurrenceStartsAt,
          changedAt: "2026-07-21T12:00:00.000Z",
        },
      ],
    };
    return plan;
  }

  async upsertResponse(input: AvailabilityResponseInput & { guardianId: string; respondedAt: string }) {
    this.requireOrganisation(input.organisationId);
    const current = this.state.availabilityResponses.find(
      (response) => response.eventId === input.eventId && response.playerId === input.playerId,
    );
    const response = {
      id: current?.id ?? localId("demo-availability", `${input.eventId}|${input.playerId}`),
      organisationId: input.organisationId,
      eventId: input.eventId,
      teamId: input.teamId,
      playerId: input.playerId,
      guardianId: input.guardianId,
      status: input.status,
      respondedAt: input.respondedAt,
    } as const;
    this.state = {
      ...this.state,
      availabilityResponses: [
        ...this.state.availabilityResponses.filter(({ id }) => id !== response.id),
        response,
      ],
    };
    return structuredClone(response);
  }

  async findGuardianForPlayer(
    organisationId: string,
    teamId: string,
    playerId: string,
    membershipId: string,
  ) {
    this.requireOrganisation(organisationId);
    const guardian = this.state.guardians.find((candidate) =>
      candidate.organisationId === organisationId && candidate.membershipId === membershipId,
    );
    if (!guardian) return null;
    return this.state.playerGuardians.some((link) =>
      link.organisationId === organisationId &&
      link.playerId === playerId &&
      link.guardianId === guardian.id &&
      this.state.teamMemberships.some((membership) =>
        membership.organisationId === organisationId &&
        membership.teamId === teamId &&
        membership.memberKind === "player" &&
        membership.memberId === playerId,
      ),
    ) ? guardian.id : null;
  }

  async findPoll(organisationId: string, pollId: string) {
    this.requireOrganisation(organisationId);
    const poll = this.state.polls.find(({ id }) => id === pollId);
    return poll
      ? { id: poll.id, organisationId: poll.organisationId, teamId: poll.teamId, status: poll.status === "converted" ? "converted" as const : "open" as const, title: poll.title }
      : null;
  }

  async findConversion(organisationId: string, idempotencyKey: string) {
    this.requireOrganisation(organisationId);
    const poll = this.state.polls.find((candidate) => candidate.conversionIdempotencyKey === idempotencyKey);
    const event = poll?.convertedSeriesId
      ? this.state.events.find((candidate) => candidate.seriesId === poll.convertedSeriesId)
      : null;
    const optionId = event ? poll?.options.find((option) => option.startsAt === event.startsAt)?.id : null;
    return poll && event && optionId ? {
      organisationId,
      teamId: poll.teamId,
      pollId: poll.id,
      optionId,
      result: { organisationId, teamId: poll.teamId, pollId: poll.id, optionId, seriesId: poll.convertedSeriesId, eventId: event.id },
    } : null;
  }

  async findOption(pollId: string, optionId: string) {
    const poll = this.state.polls.find(({ id }) => id === pollId);
    const option = poll?.options.find(({ id }) => id === optionId);
    return option ? { id: option.id, pollId, startsAt: option.startsAt, endsAt: option.endsAt } : null;
  }

  async convert(input: {
    organisationId: string;
    teamId: string;
    pollId: string;
    optionId: string;
    idempotencyKey: string;
    seriesId: string;
    title: string;
    startsAt: string;
    endsAt: string;
  }) {
    this.requireOrganisation(input.organisationId);
    const eventId = localId("demo-event", input.seriesId);
    this.state = {
      ...this.state,
      polls: this.state.polls.map((poll) =>
        poll.id === input.pollId ? { ...poll, status: "converted" as const, convertedSeriesId: input.seriesId, conversionIdempotencyKey: input.idempotencyKey } : poll,
      ),
      events: [
        ...this.state.events,
        {
          id: eventId,
          organisationId: input.organisationId,
          teamId: input.teamId,
          seriesId: input.seriesId,
          kind: "training" as const,
          title: input.title,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          responseDeadline: input.startsAt,
          locationName: "Venue to be confirmed",
          status: "scheduled" as const,
        },
      ],
    };
    return { ...input, eventId };
  }

  async findReplacement(replacementId: string) {
    return structuredClone(
      this.state.standbyReplacements.find(({ id }) => id === replacementId) ?? null,
    );
  }

  async canMembershipRespondForPlayer(
    organisationId: string,
    teamId: string,
    playerId: string,
    membershipId: string,
  ) {
    this.requireOrganisation(organisationId);
    const guardian = this.state.guardians.find(
      (candidate) => candidate.organisationId === organisationId && candidate.membershipId === membershipId,
    );
    return Boolean(guardian && await this.findGuardianForPlayer(organisationId, teamId, playerId, membershipId));
  }

  async acceptReplacement(input: {
    replacementId: string;
    organisationId: string;
    squadId: string;
    withdrawnPlayerId: string;
    selectedPlayerId: string;
    acceptedAt: string;
    status: "accepted";
    historyReason: "standby-replacement";
  }) {
    this.requireOrganisation(input.organisationId);
    const squad = this.state.squads.find(({ id }) => id === input.squadId);
    if (!squad) throw new Error("The squad is not available.");
    this.state = {
      ...this.state,
      squads: this.state.squads.map((candidate) => candidate.id === squad.id ? {
        ...candidate,
        members: candidate.members.map((member) =>
          member.playerId === input.selectedPlayerId
            ? { ...member, status: "selected" as const }
            : member.playerId === input.withdrawnPlayerId
              ? { ...member, status: "standby" as const }
              : member,
        ),
      } : candidate),
      standbyReplacements: this.state.standbyReplacements.map((replacement) =>
        replacement.id === input.replacementId
          ? { ...replacement, status: "accepted" as const, respondedAt: input.acceptedAt }
          : replacement,
      ),
      squadHistory: [
        ...this.state.squadHistory,
        {
          id: localId("demo-squad-history", `${input.replacementId}|${input.acceptedAt}`),
          organisationId: input.organisationId,
          squadId: input.squadId,
          playerId: input.selectedPlayerId,
          previousStatus: "standby" as const,
          nextStatus: "selected" as const,
          reason: "Standby replacement accepted",
          changedAt: input.acceptedAt,
        },
      ],
    };
    return {
      status: input.status,
      selectedPlayerId: input.selectedPlayerId,
      withdrawnPlayerId: input.withdrawnPlayerId,
      historyReason: input.historyReason,
    };
  }

  async findCalendarToken(tokenHash: string) {
    return structuredClone(
      this.state.calendarTokens.find((token) => token.tokenHash === tokenHash) ?? null,
    );
  }

  async listCalendarEvents(tokenId: string, organisationId: string) {
    this.requireOrganisation(organisationId);
    if (!this.state.calendarTokens.some(({ id }) => id === tokenId)) return [];
    return this.state.events.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      locationName: event.locationName,
    }));
  }

  listNotificationState(organisationId: string): RiversideDemoSeed["notifications"] {
    this.requireOrganisation(organisationId);
    return structuredClone(this.state.notifications);
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
