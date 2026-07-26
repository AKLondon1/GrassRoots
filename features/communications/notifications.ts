import { createHash } from "node:crypto";

import { addLocalDays, localPartsToUtc, partsInTimeZone } from "@/features/events/time-zone";

export interface HouseholdRecipient {
  readonly householdId: string;
  readonly guardianId: string;
  readonly destination: string;
  readonly optedIn: boolean;
}

export function collapseHouseholdRecipients(recipients: readonly HouseholdRecipient[]) {
  const seen = new Set<string>();
  return [...recipients]
    .filter(({ optedIn }) => optedIn)
    .sort((left, right) =>
      left.householdId.localeCompare(right.householdId) ||
      left.destination.localeCompare(right.destination) ||
      left.guardianId.localeCompare(right.guardianId),
    )
    .filter((recipient) => {
      if (seen.has(recipient.householdId)) return false;
      seen.add(recipient.householdId);
      return true;
    });
}

export function buildWeeklyDigest(input: {
  organisationName: string;
  householdName: string;
  eventSummaries: readonly string[];
  actionSummaries: readonly string[];
}): { subject: string; body: string } {
  const events = input.eventSummaries.length > 0
    ? input.eventSummaries.map((summary) => `• ${summary}`).join("\n")
    : "• No football commitments are scheduled.";
  const actions = input.actionSummaries.length > 0
    ? input.actionSummaries.map((summary) => `• ${summary}`).join("\n")
    : "• No responses are due.";
  return {
    subject: `${input.organisationName}: your football week`,
    body: `${input.householdName}\n\nComing up\n${events}\n\nActions\n${actions}`,
  };
}

export function nextAllowedDeliveryTime(
  requestedAt: string,
  preferences: { timeZone: string; quietFromHour: number; quietUntilHour: number },
): string {
  const requested = new Date(requestedAt);
  const local = partsInTimeZone(requested, preferences.timeZone);
  const quietOvernight = preferences.quietFromHour > preferences.quietUntilHour;
  const inQuietHours = quietOvernight
    ? local.hour >= preferences.quietFromHour || local.hour < preferences.quietUntilHour
    : local.hour >= preferences.quietFromHour && local.hour < preferences.quietUntilHour;
  if (!inQuietHours) return requested.toISOString();
  const nextDay = local.hour >= preferences.quietFromHour ? addLocalDays(local, 1) : local;
  return localPartsToUtc({ ...nextDay, hour: preferences.quietUntilHour, minute: 0, second: 0 }, preferences.timeZone).toISOString();
}

export function notificationDedupeKey(input: {
  organisationId: string;
  householdId: string;
  eventId: string;
  template: string;
}) {
  return createHash("sha256")
    .update([input.organisationId, input.householdId, input.eventId, input.template].join("|"), "utf8")
    .digest("hex");
}
