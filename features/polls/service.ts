import { createHash } from "node:crypto";

import { pollConversionSchema } from "@/features/polls/schema";
import { requireEventCapability } from "@/features/events/service";
import type { AuthorisationContext } from "@/features/tenancy/types";

interface PollRepository {
  findConversion(organisationId: string, idempotencyKey: string): Promise<{
    organisationId: string;
    teamId: string;
    pollId: string;
    optionId: string;
    result: unknown;
  } | null>;
  findPoll(organisationId: string, pollId: string): Promise<{ id: string; organisationId: string; teamId: string; status: "open" | "closed" | "converted"; title: string } | null>;
  findOption(pollId: string, optionId: string): Promise<{ id: string; pollId: string; startsAt: string; endsAt: string } | null>;
  convert(input: { organisationId: string; teamId: string; pollId: string; optionId: string; idempotencyKey: string; seriesId: string; title: string; startsAt: string; endsAt: string }): Promise<unknown>;
}

function conversionSeriesId(idempotencyKey: string): string {
  const hex = createHash("sha256").update(idempotencyKey, "utf8").digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export async function convertPollToSeries(
  repository: PollRepository,
  actor: AuthorisationContext,
  rawInput: { organisationId: string; teamId: string; pollId: string; optionId: string; idempotencyKey: string },
) {
  const input = pollConversionSchema.parse(rawInput);
  const existing = await repository.findConversion(input.organisationId, input.idempotencyKey);
  if (existing) {
    requireEventCapability(actor, "polls:manage", {
      organisationId: existing.organisationId,
      teamId: existing.teamId,
    });
    if (existing.pollId !== input.pollId || existing.optionId !== input.optionId || existing.teamId !== input.teamId) {
      throw new Error("This conversion key has already been used for another poll option.");
    }
    return existing.result;
  }
  const poll = await repository.findPoll(input.organisationId, input.pollId);
  const option = await repository.findOption(input.pollId, input.optionId);
  if (!poll || !option || poll.organisationId !== input.organisationId || poll.teamId !== input.teamId || option.pollId !== poll.id) {
    throw new Error("The poll option is not available in this team.");
  }
  requireEventCapability(actor, "polls:manage", {
    organisationId: poll.organisationId,
    teamId: poll.teamId,
  });
  if (poll.status !== "open") throw new Error("Only an open poll can be converted.");
  const result = await repository.convert({
    organisationId: poll.organisationId,
    teamId: poll.teamId,
    pollId: poll.id,
    optionId: option.id,
    idempotencyKey: input.idempotencyKey,
    seriesId: conversionSeriesId(input.idempotencyKey),
    title: poll.title,
    startsAt: option.startsAt,
    endsAt: option.endsAt,
  });
  return result;
}
