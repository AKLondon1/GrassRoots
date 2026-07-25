"use server";

import { z } from "zod";
import { headers } from "next/headers";

import { environment } from "@/lib/env";
import { trustedClientIdentifier } from "@/lib/security/request";
import { consumeDistributedRateLimit } from "@/lib/security/server-rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseInternalPath } from "@/lib/supabase/auth-callback";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { DataMode } from "@/lib/supabase/types";

const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.")),
});

export interface MagicLinkState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: { email?: string };
}

export type MagicLinkSender = (
  email: string,
  emailRedirectTo?: string,
) => Promise<{ error: { message: string } | null }>;

export const initialMagicLinkState: MagicLinkState = { status: "idle" };

export async function requestMagicLinkForMode(
  mode: DataMode,
  formData: FormData,
  sendMagicLink: MagicLinkSender,
  emailRedirectTo?: string,
): Promise<MagicLinkState> {
  if (mode !== "supabase") {
    return {
      status: "error",
      message: "Email sign-in is not available in demo mode.",
    };
  }

  const parsed = signInSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: { email: parsed.error.issues[0]?.message },
    };
  }

  let result: Awaited<ReturnType<MagicLinkSender>>;
  try {
    result = await sendMagicLink(parsed.data.email, emailRedirectTo);
  } catch {
    return {
      status: "error",
      message: "We could not send the sign-in link. Try again in a moment.",
    };
  }

  if (result.error) {
    return {
      status: "error",
      message: "We could not send the sign-in link. Try again in a moment.",
    };
  }

  return {
    status: "success",
    message: "Check your email for your secure sign-in link.",
  };
}

export async function submitMagicLink(
  _previousState: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const emailKey = String(formData.get("email") ?? "").trim().toLowerCase();
  const clientKey = trustedClientIdentifier(requestHeaders);
  if (environment.dataMode === "supabase") {
    const admin = createSupabaseAdminClient();
    if (!admin) return { status: "error", message: "Sign-in protection is temporarily unavailable." };
    try {
      const [clientLimit, accountLimit] = await Promise.all([
        consumeDistributedRateLimit(admin as unknown as SupabaseClient, `sign-in-client:${clientKey}`, { limit: 20, windowSeconds: 900 }),
        consumeDistributedRateLimit(admin as unknown as SupabaseClient, `sign-in-account:${emailKey}`, { limit: 5, windowSeconds: 900 }),
      ]);
      if (!clientLimit.allowed || !accountLimit.allowed) return { status: "error", message: "Too many sign-in links were requested. Wait 15 minutes and try again." };
    } catch { return { status: "error", message: "Sign-in protection is temporarily unavailable." }; }
  }
  const nextPath = normaliseInternalPath(
    typeof formData.get("next") === "string"
      ? String(formData.get("next"))
      : "/",
  );
  let emailRedirectTo: string | undefined;
  try {
    const trustedBase = environment.server.APP_ORIGIN ?? (environment.nodeEnv === "production" ? undefined : origin);
    if (origin && environment.server.APP_ORIGIN && new URL(origin).origin !== new URL(environment.server.APP_ORIGIN).origin) {
      throw new Error("Untrusted origin");
    }
    emailRedirectTo = trustedBase
      ? new URL(
          `/auth/callback?next=${encodeURIComponent(nextPath)}`,
          trustedBase,
        ).toString()
      : undefined;
  } catch {
    emailRedirectTo = undefined;
  }

  return requestMagicLinkForMode(environment.dataMode, formData, async (
    email,
    redirectTo,
  ) => {
    const supabase = await createServerSupabaseClient();
    if (!supabase || !redirectTo) {
      return { error: { message: "Supabase is not configured." } };
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false,
      },
    });
    return { error };
  }, emailRedirectTo);
}
