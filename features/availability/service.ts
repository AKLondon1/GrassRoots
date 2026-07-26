import { availabilityResponseSchema, type AvailabilityResponseInput } from "@/features/availability/schema";
import { requireEventCapability } from "@/features/events/service";
import type { AuthorisationContext } from "@/features/tenancy/types";

interface AvailabilityRepository {
  findEvent(organisationId: string, eventId: string): Promise<{
    id: string;
    organisationId: string;
    teamId: string;
    responseDeadline: string | null;
  } | null>;
  findGuardianForPlayer(organisationId: string, teamId: string, playerId: string, membershipId: string): Promise<string | null>;
  upsertResponse(value: AvailabilityResponseInput & { guardianId: string; respondedAt: string }): Promise<unknown>;
}

const idempotentResponses = new WeakMap<object, Map<string, { fingerprint: string; value: unknown }>>();

export async function submitAvailability(
  repository: AvailabilityRepository,
  actor: AuthorisationContext,
  rawInput: AvailabilityResponseInput,
  now = new Date(),
) {
  const input = availabilityResponseSchema.parse(rawInput);
  const event = await repository.findEvent(input.organisationId, input.eventId);
  if (!event || event.organisationId !== input.organisationId || event.teamId !== input.teamId) {
    throw new Error("This event is not available in the selected team.");
  }
  requireEventCapability(actor, "availability:respond", {
    organisationId: event.organisationId,
    teamId: event.teamId,
    eventId: event.id,
  });
  const guardianId = await repository.findGuardianForPlayer(
    event.organisationId,
    event.teamId,
    input.playerId,
    actor.membership.id,
  );
  if (!guardianId) {
    throw new Error("Availability can only be submitted for a linked player.");
  }
  if (input.guardianId && input.guardianId !== guardianId) {
    throw new Error("The guardian attribution does not match the signed-in membership.");
  }
  if (event.responseDeadline && now > new Date(event.responseDeadline)) {
    throw new Error("The availability response deadline has passed.");
  }
  const fingerprint = JSON.stringify([
    input.organisationId,
    input.eventId,
    input.playerId,
    guardianId,
    input.status,
    input.note ?? null,
    input.transportSeats ?? null,
  ]);
  const stored = idempotentResponses.get(repository)?.get(input.idempotencyKey);
  if (stored) {
    if (stored.fingerprint !== fingerprint) throw new Error("This response key has already been used for different availability data.");
    return stored.value;
  }
  const result = await repository.upsertResponse({ ...input, guardianId, respondedAt: now.toISOString() });
  const cache = idempotentResponses.get(repository) ?? new Map<string, { fingerprint: string; value: unknown }>();
  cache.set(input.idempotencyKey, { fingerprint, value: result });
  idempotentResponses.set(repository, cache);
  return result;
}
