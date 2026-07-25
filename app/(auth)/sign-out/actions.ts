"use server";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signOutCurrentSession(): Promise<void> {
  const client = await createServerSupabaseClient();
  if (!client) redirect("/sign-in");
  const { data, error } = await client.auth.getClaims();
  const sessionId = data?.claims && typeof data.claims.session_id === "string" ? data.claims.session_id : null;
  if (error || !sessionId) throw new Error("The current session could not be verified for sign out.");
  const sessionDigest = createHash("sha256").update(sessionId, "utf8").digest("hex");
  const revocationExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString();
  const db = client as unknown as SupabaseClient;
  const { error: revocationError } = await db.rpc("revoke_current_session", {
    requested_session_digest: sessionDigest,
    requested_expires_at: revocationExpiry,
    requested_reason_code: "current-user-sign-out",
  });
  if (revocationError) throw new Error("The current session could not be revoked safely.");
  await client.auth.signOut({ scope: "local" });
  redirect("/sign-in?signedOut=1");
}
