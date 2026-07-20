import { MailCheck } from "lucide-react";
import Link from "next/link";

import { InvitationForm } from "@/components/auth/invitation-form";
import { Button } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import type { DataMode } from "@/lib/supabase/types";

interface InvitationScreenProps {
  authenticated: boolean;
  mode: DataMode;
  token: string;
}

export function InvitationScreen({
  authenticated,
  mode,
  token,
}: InvitationScreenProps) {
  const next = encodeURIComponent(`/invite/${token}`);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <section
        aria-labelledby="invitation-title"
        className="w-full max-w-lg rounded-2xl border border-border-strong bg-background p-6 sm:p-9"
      >
        <Link
          className="inline-flex min-h-11 items-center gap-2.5 rounded-lg pr-2 font-semibold text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
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
        <MailCheck className="mt-8 size-8 text-primary-strong" aria-hidden="true" />
        <h1
          className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-ink"
          id="invitation-title"
        >
          Club invitation
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted">
          Invitations are for adult accounts and grant access only to the named
          organisation and assigned responsibilities.
        </p>

        {mode === "demo" ? (
          <p
            className="mt-6 rounded-[10px] bg-info-soft px-4 py-3 text-sm font-medium text-info-strong"
            role="alert"
          >
            Invitations are unavailable in demo mode. No membership has been changed.
          </p>
        ) : authenticated ? (
          <InvitationForm token={token} />
        ) : (
          <div className="mt-7">
            <Button asChild className="w-full">
              <Link href={`/sign-in?next=${next}`}>Sign in to continue</Link>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
