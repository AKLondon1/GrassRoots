"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { consumeMagicAvailabilityResponse } from "@/features/availability/magic-response";

const responseSchema = z.object({
  token: z.string().min(32).max(256),
  status: z.enum(["available", "unavailable", "unsure"]),
  note: z.string().trim().max(240).optional(),
  transportSeats: z.preprocess(
    (value) => value === "" || value === null ? undefined : Number(value),
    z.number().int().min(0).max(8).optional(),
  ),
});

export async function submitMagicAvailabilityResponse(formData: FormData): Promise<void> {
  const parsed = responseSchema.safeParse({
    token: formData.get("token"),
    status: formData.get("status"),
    note: formData.get("note"),
    transportSeats: formData.get("transportSeats"),
  });
  if (!parsed.success) redirect(`/respond/${encodeURIComponent(String(formData.get("token") ?? "invalid"))}?status=invalid`);
  const consumed = await consumeMagicAvailabilityResponse({
    rawToken: parsed.data.token,
    status: parsed.data.status,
    note: parsed.data.note,
    transportSeats: parsed.data.transportSeats,
  });
  if (!consumed) redirect(`/respond/${encodeURIComponent(parsed.data.token)}?status=unavailable`);
  redirect("/respond/complete");
}
