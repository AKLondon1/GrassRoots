# Architecture

GrassRoots uses a Next.js App Router application and a Supabase backend. Server components render role-aware workspaces; client components are limited to interactions such as timers, planners and forms. Server actions and route handlers authenticate with Supabase, resolve an active organisation membership, then authorise the exact capability and resource scope. The browser never receives service-role credentials.

## Boundaries

1. `app/` owns routing, metadata, request handlers and render composition.
2. `features/` owns domain rules and provider-neutral services.
3. `components/` owns reusable UI and role-aware navigation.
4. `lib/` owns cross-cutting tenancy, Supabase, security, PWA and observability boundaries.
5. `supabase/migrations/` is the authoritative schema; every tenant-owned row carries `organisation_id` and composite foreign keys where cross-tenant confusion is possible.
6. `tests/` separates unit, integration, security-static, browser and pgTAP checks.

Canonical `events` and `event_instances` anchor availability, polls, squads, facilities, communications, attendance and finance references. Sensitive medical and safeguarding bodies are separated from ordinary operational records and ordinary audit payloads.

Demo repositories are deterministic, fictional and non-persistent. Production screens resolve real membership and capability grants and do not silently fall back to demo data.

## Trust boundaries

Browser → nonce-CSP Next.js edge → authenticated server boundary → RLS-protected Supabase. Service-role access is restricted to server-only job, export, webhook and quarantine workflows. External providers receive only adapter-specific allowlisted data. See the threat model and provider guide.
