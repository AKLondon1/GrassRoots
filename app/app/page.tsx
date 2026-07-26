import { redirect } from "next/navigation";

import { DeniedState } from "@/components/ui/denied-state";
import { SignOutForm } from "@/components/auth/sign-out-form";
import {
  createSupabaseAuthenticatedHomeReader,
  resolveAuthenticatedHome,
} from "@/features/tenancy/authenticated-home";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AuthenticatedHomePage() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/sign-in");

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/sign-in?next=%2Fapp");

  const target = await resolveAuthenticatedHome(
    createSupabaseAuthenticatedHomeReader(supabase),
    data.user.id,
  );
  if (target.status === "allowed") redirect(target.href);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <DeniedState
        action={<SignOutForm />}
        className="bg-background"
        title="A club invitation is required"
        description="You are signed in securely, but this account does not have an active GrassRoots organisation membership. Ask your club administrator for an invitation link."
      />
    </main>
  );
}
