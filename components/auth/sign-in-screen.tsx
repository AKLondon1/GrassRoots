import { ShieldCheck } from "lucide-react";
import Link from "next/link";

import { GoogleSignInForm } from "@/components/auth/google-sign-in-form";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { Button } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { listDemoSessions } from "@/lib/demo/session";
import {
  getDefaultScreen,
  getScreenHref,
  type AppRole,
} from "@/lib/navigation/screen-registry";
import type { DataMode } from "@/lib/supabase/types";

const demoLabels: Record<AppRole, string> = {
  parent: "Parent demo",
  coach: "Coach demo",
  club: "Club admin demo",
  platform: "Platform demo",
};

interface SignInScreenProps {
  authError?: "callback" | "provider" | "session-revoked";
  mode: DataMode;
  nextPath?: string;
}

export function SignInScreen({
  authError,
  mode,
  nextPath = "/",
}: SignInScreenProps) {
  const authErrorMessage =
    authError === "provider"
      ? "Google sign-in could not be started. Try again in a moment."
      : authError === "session-revoked"
        ? "Your session ended securely. Sign in again to continue."
        : authError === "callback"
          ? "That sign-in could not be completed. Start again and try once more."
          : null;

  return (
    <main className="min-h-dvh bg-surface px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col">
        <Link
          aria-label={`${brand.name} home`}
          className="inline-flex min-h-11 w-fit items-center gap-2.5 rounded-lg pr-2 font-semibold tracking-[-0.02em] text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
          href="/"
        >
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-[10px] bg-primary-strong text-xs font-bold text-primary-foreground"
          >
            {brand.identity.mark}
          </span>
          {brand.name}
        </Link>

        <div className="mt-10 grid overflow-hidden rounded-2xl border border-border-strong bg-background lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)]">
          <section className="bg-ink px-6 py-9 text-background sm:px-10 sm:py-12">
            <div className="flex size-10 items-center justify-center rounded-[10px] bg-primary-light text-ink">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <h2 className="mt-7 text-2xl font-semibold tracking-[-0.03em]">
              One secure adult account
            </h2>
            <p className="mt-4 max-w-[38ch] text-base leading-7 text-ink-on-dark-muted">
              Children do not sign in. Parents, coaches and volunteers use their own
              account, with access limited to their organisation and responsibilities.
            </p>
          </section>

          <section className="px-6 py-9 sm:px-10 sm:py-12" aria-labelledby="sign-in-title">
            <p className="text-sm font-semibold text-primary-strong">
              Welcome back
            </p>
            <h1
              className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-ink sm:text-4xl"
              id="sign-in-title"
            >
              Sign in to {brand.name}
            </h1>

            {authErrorMessage ? (
              <p
                className="mt-5 rounded-[10px] bg-danger-soft px-4 py-3 text-sm font-medium text-danger-strong"
                role="alert"
              >
                {authErrorMessage}
              </p>
            ) : null}

            {mode === "supabase" ? (
              <>
                <p className="mt-4 max-w-[55ch] text-sm leading-6 text-muted">
                  Continue with your adult Google account, or have a sign-in link
                  emailed to you. This private beta requires prior approval or a valid
                  GrassRoots club invitation. A club invitation is still required
                  before you can access an organisation workspace.
                </p>
                <GoogleSignInForm nextPath={nextPath} />
                {/*
                  The email route is second, not first, because Google is the path
                  most members already have. It is not a fallback though: it is the
                  only route that works without a Google account, and the only one a
                  test can drive, which is why Phase 14 exposes it.

                  No password field, now or later. The action behind this form calls
                  signInWithOtp only, so this codebase never stores a password and so
                  never owns a reset flow, a strength policy or a credential-stuffing
                  surface.
                */}
                <div className="mt-8 flex items-center gap-3">
                  <span aria-hidden="true" className="h-px flex-1 bg-border" />
                  <span className="text-sm font-medium text-muted">or</span>
                  <span aria-hidden="true" className="h-px flex-1 bg-border" />
                </div>
                <MagicLinkForm nextPath={nextPath} />
              </>
            ) : (
              <>
                <p className="mt-4 max-w-[55ch] text-sm leading-6 text-muted">
                  Supabase is not configured. Explore with fictional adult accounts;
                  this demo is not connected and changes are not saved.
                </p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {listDemoSessions().map((session) => (
                    <Button asChild key={session.id} variant="secondary">
                      <Link
                        href={getScreenHref(
                          session.organisation.slug,
                          getDefaultScreen(session.role),
                          session.role,
                        )}
                      >
                        {demoLabels[session.role]}
                      </Link>
                    </Button>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
