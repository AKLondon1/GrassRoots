"use client";

import { Activity, Building2, Flag, Gauge, Headphones, KeyRound, LineChart, ReceiptPoundSterling } from "lucide-react";

import { Status } from "@/components/ui/status";

const cards: Record<string, { title: string; description: string; icon: typeof Activity; metrics: readonly [string, string, string][] }> = {
  organisations: { title: "Organisation lifecycle", description: "Trials, founding entitlements, ownership and scheduled deletion across tenant organisations.", icon: Building2, metrics: [["Active clubs", "42", "Stable"], ["Trials", "7", "2 ending soon"], ["Deletion queue", "1", "30-day hold"]] },
  plans: { title: "Platform subscription plans", description: "GrassRoots subscriptions are a separate ledger from club member invoices and payments.", icon: ReceiptPoundSterling, metrics: [["Founding", "18", "Locked"], ["Standard", "24", "Monthly"], ["Past due", "1", "Action needed"]] },
  "feature-flags": { title: "Feature flags", description: "Tenant-scoped rollouts with an owner, rationale and expiry date.", icon: Flag, metrics: [["Active", "6", "Scoped"], ["Expiring", "1", "This week"], ["Global", "0", "Safer default"]] },
  "provider-usage": { title: "Provider metering", description: "Operational counts only. Message bodies, medical notes and safeguarding detail are never included.", icon: Gauge, metrics: [["Email", "1,284", "July"], ["Push", "846", "July"], ["AI suggestions", "38", "Non-sensitive"]] },
  health: { title: "System health", description: "Readiness for authentication, database, delivery queues and configured providers.", icon: Activity, metrics: [["Database", "Healthy", "36 ms"], ["Outbox", "Healthy", "0 delayed"], ["Stripe", "Not configured", "No live claims"]] },
  support: { title: "Support cases", description: "Access must be requested, club-approved, reason-bound, time-limited and fully audited.", icon: Headphones, metrics: [["Open", "3", "In triage"], ["Access sessions", "1", "18 min left"], ["Expired", "12", "Locked"]] },
  "audited-access": { title: "Audited access", description: "Time-limited support access records metadata only and cannot bypass safeguarding restrictions.", icon: KeyRound, metrics: [["Allowed", "8", "This month"], ["Denied", "2", "Reviewed"], ["Body fields", "0", "Redacted"]] },
  analytics: { title: "Privacy-safe analytics", description: "Aggregated product health and organisation adoption without message or sensitive case content.", icon: LineChart, metrics: [["Weekly clubs", "37", "+8%"], ["Availability replies", "92%", "7 days"], ["Consent current", "88%", "Club aggregate"]] },
};

export function PlatformOperationsScreen({ section }: { section: string }) {
  const data = cards[section] ?? cards.health!;
  const Icon = data.icon;
  return <section data-testid={`platform-${section}`} className="space-y-5" aria-labelledby="platform-title"><div className="rounded-2xl bg-ink p-5 text-white sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Platform operations</p><h2 id="platform-title" className="mt-3 text-2xl font-semibold">{data.title}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">{data.description}</p></div><Icon className="size-7 text-lime-300" aria-hidden="true"/></div></div><div className="grid gap-4 sm:grid-cols-3">{data.metrics.map(([label, value, detail]) => <article key={label} className="rounded-2xl border border-border-strong bg-background p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</p><p className="mt-3 text-2xl font-semibold">{value}</p><Status className="mt-4" tone={detail.includes("Action") || detail.includes("ending") ? "warning" : "neutral"}>{detail}</Status></article>)}</div></section>;
}
