import Link from "next/link";

import { brand } from "@/lib/brand";

export function PublicInformationPage({ title, intro, sections, reviewNote }: {
  title: string;
  intro: string;
  sections: readonly { title: string; body: string }[];
  reviewNote?: string;
}) {
  return <><header className="border-b border-border bg-background"><nav aria-label="Public" className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6"><Link className="font-bold text-ink" href="/">{brand.name}</Link><div className="flex items-center gap-3"><Link className="min-h-11 py-3 text-sm font-semibold text-primary-strong" href="/register-club">Register club</Link><Link className="min-h-11 py-3 text-sm font-semibold text-primary-strong" href="/sign-in">Sign in</Link></div></nav></header><main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16"><h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.035em] text-ink sm:text-5xl">{title}</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-muted">{intro}</p>{reviewNote ? <p className="mt-6 max-w-3xl rounded-xl bg-warning-soft p-4 text-sm font-semibold leading-6 text-warning-strong" role="note">{reviewNote}</p> : null}<div className="mt-12 divide-y divide-border">{sections.map((section) => <section className="grid gap-3 py-7 sm:grid-cols-[0.36fr_0.64fr]" key={section.title}><h2 className="text-xl font-semibold text-ink">{section.title}</h2><p className="max-w-2xl leading-7 text-muted">{section.body}</p></section>)}</div></main></>;
}
