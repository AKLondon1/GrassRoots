import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { brand } from "@/lib/brand";

export const metadata: Metadata = { title: `Response recorded | ${brand.name}`, robots: { index: false, follow: false } };

export default function AvailabilityResponseCompletePage() {
  return <main className="flex min-h-dvh items-center justify-center bg-surface p-4"><section className="max-w-lg rounded-2xl border border-border-strong bg-background p-6 sm:p-8" aria-labelledby="response-complete-title"><span className="flex size-11 items-center justify-center rounded-xl bg-success-soft text-success-strong"><CheckCircle2 className="size-6" aria-hidden="true"/></span><h1 className="mt-5 text-2xl font-semibold text-ink" id="response-complete-title">Availability recorded</h1><p className="mt-3 text-sm leading-6 text-muted">Your team organiser can now see the response. This one-time link can no longer be used.</p><Button asChild className="mt-6" variant="secondary"><Link href="/">Return to {brand.name}</Link></Button></section></main>;
}
