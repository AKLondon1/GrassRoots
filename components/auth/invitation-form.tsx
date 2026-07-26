"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import { acceptInvitationAction } from "@/app/(auth)/invite/[token]/actions";
import { Button } from "@/components/ui/button";
import type { InvitationAcceptanceState } from "@/features/tenancy/invitations";

const initialInvitationState: InvitationAcceptanceState = {
  status: "error",
  message: "",
};

function AcceptButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      className="w-full"
      loading={pending}
      loadingLabel="Accepting invitation"
      type="submit"
    >
      Accept club invitation
    </Button>
  );
}

export function InvitationForm({ token }: { token: string }) {
  const [state, action] = useActionState(
    acceptInvitationAction,
    initialInvitationState,
  );

  return (
    <form action={action} className="mt-7">
      <input name="token" type="hidden" value={token} />
      {state.message ? (
        <p
          className={`mb-4 rounded-[10px] px-4 py-3 text-sm font-medium ${
            state.status === "accepted"
              ? "bg-success-soft text-success-strong"
              : "bg-danger-soft text-danger-strong"
          }`}
          role={state.status === "accepted" ? "status" : "alert"}
        >
          {state.message}
        </p>
      ) : null}
      {state.status !== "accepted" ? <AcceptButton /> : null}
      {state.status === "accepted" ? (
        <Button asChild className="w-full" type="button">
          <Link href="/app">Continue to club</Link>
        </Button>
      ) : null}
    </form>
  );
}
