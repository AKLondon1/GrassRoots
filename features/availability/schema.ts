import { z } from "zod";

export const availabilityResponseSchema = z.object({
  organisationId: z.string().min(1),
  eventId: z.string().min(1),
  teamId: z.string().min(1),
  playerId: z.string().min(1),
  guardianId: z.string().min(1).optional(),
  status: z.enum(["available", "unavailable", "unsure"]),
  note: z.string().trim().max(240).optional(),
  transportSeats: z.number().int().min(0).max(8).optional(),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export type AvailabilityResponseInput = z.infer<typeof availabilityResponseSchema>;
