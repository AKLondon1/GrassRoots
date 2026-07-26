"use client";

import { useFormStatus } from "react-dom";

import { signOutCurrentSession } from "@/app/(auth)/sign-out/actions";
import { Button } from "@/components/ui/button";

function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      loading={pending}
      loadingLabel="Signing out"
      type="submit"
      variant="secondary"
    >
      Sign out and switch account
    </Button>
  );
}

export function SignOutForm() {
  return (
    <form action={signOutCurrentSession}>
      <SignOutButton />
    </form>
  );
}
