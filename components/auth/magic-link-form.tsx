"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  initialMagicLinkState,
  submitMagicLink,
} from "@/app/(auth)/sign-in/actions";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      className="w-full"
      loading={pending}
      loadingLabel="Sending your secure link"
      type="submit"
    >
      Email me a sign-in link
    </Button>
  );
}

export function MagicLinkForm({ nextPath = "/" }: { nextPath?: string }) {
  const [state, formAction] = useActionState(
    submitMagicLink,
    initialMagicLinkState,
  );
  const emailError = state.fieldErrors?.email;

  return (
    <form action={formAction} className="mt-8" noValidate>
      <input name="next" type="hidden" value={nextPath} />
      <label className="block text-sm font-semibold text-ink" htmlFor="email">
        Email address
      </label>
      <input
        aria-describedby={emailError ? "email-error" : "email-hint"}
        aria-invalid={Boolean(emailError)}
        autoComplete="email"
        className="mt-2 min-h-12 w-full rounded-[10px] border border-border-strong bg-background px-4 text-base text-ink outline-none transition-colors duration-200 placeholder:text-muted focus:border-primary-strong focus:ring-3 focus:ring-ring/35 disabled:cursor-not-allowed disabled:bg-surface"
        id="email"
        name="email"
        placeholder="you@example.org"
        required
        type="email"
      />
      {emailError ? (
        <p className="mt-2 text-sm font-medium text-danger-strong" id="email-error">
          {emailError}
        </p>
      ) : (
        <p className="mt-2 text-sm leading-6 text-muted" id="email-hint">
          Use the adult email address your club invited.
        </p>
      )}

      {state.message ? (
        <p
          className={`mt-4 rounded-[10px] px-4 py-3 text-sm font-medium ${
            state.status === "success"
              ? "bg-success-soft text-success-strong"
              : "bg-danger-soft text-danger-strong"
          }`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}

      <div className="mt-6">
        <SubmitButton />
      </div>
    </form>
  );
}
