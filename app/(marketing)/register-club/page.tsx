import Link from "next/link";

import { RegisterClubForm } from "@/app/(marketing)/register-club/form";
import { environment } from "@/lib/env";

export const metadata = { title: "Register a club | GrassRoots" };
export default function RegisterClubPage() { return <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16"><Link className="font-bold text-ink" href="/">GrassRoots</Link><h1 className="mt-10 text-4xl font-semibold tracking-[-0.035em]">Register your club</h1><p className="mt-4 max-w-xl leading-7 text-muted">An authorised adult creates the club workspace, then adds seasons, teams, venues and role holders through guided setup.</p><div className="mt-10 rounded-2xl border border-border-strong bg-background p-5 sm:p-7">{environment.dataMode === "demo" ? <div role="note"><h2 className="text-xl font-semibold">Demo mode is non-persistent</h2><p className="mt-3 text-sm leading-6 text-muted">Switch to a configured Supabase environment and sign in with an authorised adult account to create a real club. You can inspect fictional role journeys now.</p><ButtonLink/></div> : <RegisterClubForm/>}</div></main>; }
function ButtonLink() { return <Link className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary-strong underline decoration-2 underline-offset-4" href="/sign-in">Open role previews</Link>; }
