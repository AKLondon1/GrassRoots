import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { digestOneTimeToken } from "@/lib/security/one-time-token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface MagicAvailabilityContext {
  organisationName: string;
  eventTitle: string;
  playerName: string;
  startsAt: string;
  endsAt: string;
  responseDeadline: string | null;
  locationName: string | null;
  currentStatus: "available" | "unavailable" | "unsure" | null;
}

interface MagicAvailabilityContextRow {
  organisation_name: string;
  event_title: string;
  player_name: string;
  starts_at: string;
  ends_at: string;
  response_deadline: string | null;
  location_name: string | null;
  current_status: MagicAvailabilityContext["currentStatus"];
}

function validRawToken(rawToken: string): boolean {
  return rawToken.length >= 32 && rawToken.length <= 256 && /^[A-Za-z0-9_-]+$/.test(rawToken);
}

export async function loadMagicAvailabilityContext(rawToken: string): Promise<MagicAvailabilityContext | null> {
  if (!validRawToken(rawToken)) return null;
  const client = createSupabaseAdminClient();
  if (!client) return null;
  const db = client as unknown as SupabaseClient;
  const tokenDigest = await digestOneTimeToken(rawToken);
  const { data, error } = await db.rpc("get_magic_availability_context", { requested_token_digest: tokenDigest });
  const row = (data as MagicAvailabilityContextRow[] | null)?.[0];
  if (error || !row) return null;
  return {
    organisationName: row.organisation_name,
    eventTitle: row.event_title,
    playerName: row.player_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    responseDeadline: row.response_deadline,
    locationName: row.location_name,
    currentStatus: row.current_status,
  };
}

export async function consumeMagicAvailabilityResponse(input: {
  rawToken: string;
  status: "available" | "unavailable" | "unsure";
  note?: string;
  transportSeats?: number;
}): Promise<boolean> {
  if (!validRawToken(input.rawToken)) return false;
  const client = createSupabaseAdminClient();
  if (!client) return false;
  const db = client as unknown as SupabaseClient;
  const tokenDigest = await digestOneTimeToken(input.rawToken);
  const { data, error } = await db.rpc("submit_magic_availability_response", {
    requested_token_digest: tokenDigest,
    requested_status: input.status,
    requested_note: input.note?.trim() || null,
    requested_transport_seats: input.transportSeats ?? null,
  });
  return !error && Array.isArray(data) && data.length === 1;
}
