"use client";

import { useFormStatus } from "react-dom";

import { signInWithGoogle } from "@/app/(auth)/sign-in/actions";
import { Button } from "@/components/ui/button";

function GoogleButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      className="w-full"
      loading={pending}
      loadingLabel="Opening secure Google sign-in"
      type="submit"
    >
      Continue with Google
    </Button>
  );
}

export function GoogleSignInForm({ nextPath }: { nextPath: string }) {
  return (
    <form action={signInWithGoogle} className="mt-8">
      <input name="next" type="hidden" value={nextPath} />
      <GoogleButton />
    </form>
  );
}
