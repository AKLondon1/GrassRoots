"use server";

import { z } from "zod";
import { headers } from "next/headers";

import { environment } from "@/lib/env";
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
  const origin = (await headers()).get("origin");
  const nextPath = normaliseInternalPath(
    typeof formData.get("next") === "string"
      ? String(formData.get("next"))
      : "/",
  );
  let emailRedirectTo: string | undefined;
  try {
    emailRedirectTo = origin
      ? new URL(
          `/auth/callback?next=${encodeURIComponent(nextPath)}`,
          origin,
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
