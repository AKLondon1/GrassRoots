import { z } from "zod";

export const pollResponseSchema = z.object({
  organisationId: z.string().min(1),
  pollId: z.string().min(1),
  optionId: z.string().min(1),
  respondentId: z.string().min(1),
  response: z.enum(["available", "unavailable", "maybe"]),
});

export const pollConversionSchema = z.object({
  organisationId: z.string().min(1),
  teamId: z.string().min(1),
  pollId: z.string().min(1),
  optionId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(120),
});
