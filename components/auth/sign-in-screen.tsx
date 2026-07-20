import { ShieldCheck } from "lucide-react";
import Link from "next/link";

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
  callbackError?: boolean;
  mode: DataMode;
  nextPath?: string;
}

export function SignInScreen({
  callbackError = false,
  mode,
  nextPath = "/",
}: SignInScreenProps) {
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

            {callbackError ? (
              <p
                className="mt-5 rounded-[10px] bg-danger-soft px-4 py-3 text-sm font-medium text-danger-strong"
                role="alert"
              >
                That sign-in link could not be completed. Request a fresh link and try again.
              </p>
            ) : null}

            {mode === "supabase" ? (
              <>
                <p className="mt-4 max-w-[55ch] text-sm leading-6 text-muted">
                  We will email you a single-use link. No password is needed.
                </p>
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
