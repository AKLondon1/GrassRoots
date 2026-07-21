import { z } from "zod";

export const eventPatchSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().optional(),
  locationName: z.string().trim().max(160).nullable().optional(),
  status: z.enum(["scheduled", "cancelled", "completed"]).optional(),
}).refine((value) => !value.startsAt || !value.endsAt || value.endsAt > value.startsAt, {
  message: "The event must end after it starts.",
  path: ["endsAt"],
});

export const recurrenceEditSchema = z.object({
  seriesId: z.string().min(1),
  occurrenceStartsAt: z.iso.datetime(),
  scope: z.enum(["this", "this-and-future", "all"]),
  patch: eventPatchSchema,
});
