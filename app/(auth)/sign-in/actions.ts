"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { environment } from "@/lib/env";
import { trustedClientIdentifier } from "@/lib/security/request";
import { consumeDistributedRateLimit } from "@/lib/security/server-rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseInternalPath } from "@/lib/supabase/auth-callback";
import { buildGoogleOAuthRequest } from "@/lib/supabase/oauth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { DataMode } from "@/lib/supabase/types";

const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.")),
});

/**
 * The single response every address gets, whether or not it has an account.
 *
 * Shared as one constant rather than repeated, so the two call sites cannot drift
 * apart into distinguishable wording. Note it does not claim a link was sent; it
 * describes what the member should do next, which is true either way.
 */
const SENT_RESPONSE = {
  status: "success",
  message: "If that address has an account, a sign-in link is on its way.",
} as const satisfies MagicLinkState;

export interface MagicLinkState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: { email?: string };
}

export type MagicLinkSender = (
  email: string,
  emailRedirectTo?: string,
) => Promise<{ error: { message: string } | null }>;

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const requestHeaders = await headers();
  const request = buildGoogleOAuthRequest(
    requestHeaders.get("origin"),
    typeof formData.get("next") === "string"
      ? String(formData.get("next"))
      : "/app",
    environment.server.APP_ORIGIN,
    environment.nodeEnv,
  );
  const supabase = await createServerSupabaseClient();

  if (!request || !supabase) {
    redirect("/sign-in?error=provider");
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: request.redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    redirect("/sign-in?error=provider");
  }

  redirect(data.url);
}

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

  try {
    const result = await sendMagicLink(parsed.data.email, emailRedirectTo);
    if (result.error) {
      // DELIBERATELY REPORTED AS SUCCESS. The sender runs with
      // `shouldCreateUser: false`, so an address with no account comes back here as
      // an error while a real one does not. Saying so out loud would turn this form
      // into a way of asking "does this parent have an account at this club", one
      // address at a time, and the answer is about a named adult attached to a named
      // child's team.
      //
      // The cost is real and accepted: a genuinely broken mail provider now looks
      // identical to a link that was sent. That is an operational failure and
      // monitoring the provider is the right place to catch it, not a public form.
      // The rate limits in submitMagicLink are what stop this being probed in bulk.
      return SENT_RESPONSE;
    }
    return SENT_RESPONSE;
  } catch {
    // A thrown exception is a configuration or network fault rather than anything
    // derived from the address, so it leaks nothing and is reported honestly.
    return {
      status: "error",
      message: "We could not send the sign-in link. Try again in a moment.",
    };
  }
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
