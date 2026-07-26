"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  createClubAction,
  type ClubRegistrationState,
} from "@/app/(marketing)/register-club/actions";

const initialClubRegistrationState: ClubRegistrationState = { status: "idle" };

export function RegisterClubForm() {
  const [state, action, pending] = useActionState(createClubAction, initialClubRegistrationState);
  if (state.status === "created" && state.workspace) return <section className="rounded-xl bg-success-soft p-5" role="status"><h2 className="text-xl font-semibold text-success-strong">Club created</h2><p className="mt-2 text-sm text-success-strong">Your private workspace is ready for guided setup.</p><Button asChild className="mt-5"><Link href={`/app/${encodeURIComponent(state.workspace)}/overview`}>Open club setup</Link></Button></section>;
  return <form action={action} className="space-y-5" noValidate><label className="block text-sm font-semibold">Club name<input className="mt-2 min-h-12 w-full rounded-[10px] border border-border-strong bg-background px-3" name="name" required maxLength={120} aria-describedby={state.fieldErrors?.name ? "club-name-error" : undefined}/>{state.fieldErrors?.name ? <span className="mt-2 block text-sm text-danger-strong" id="club-name-error">{state.fieldErrors.name}</span> : null}</label><label className="block text-sm font-semibold">Workspace address<input className="mt-2 min-h-12 w-full rounded-[10px] border border-border-strong bg-background px-3" name="slug" required maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="riverside-juniors" aria-describedby="slug-hint"/><span className="mt-2 block text-sm text-muted" id="slug-hint">Lowercase letters, numbers and hyphens.</span>{state.fieldErrors?.slug ? <span className="mt-2 block text-sm text-danger-strong">{state.fieldErrors.slug}</span> : null}</label>{state.status === "error" ? <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm font-semibold text-danger-strong">{state.message}</p> : null}<Button type="submit" disabled={pending}>{pending ? "Creating club…" : "Create club"}</Button></form>;
}
