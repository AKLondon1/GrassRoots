# GrassRoots

GrassRoots is a multi-tenant, mobile-first operations platform for junior football clubs. It connects households, events, availability, squads, pitches, coaching, communications, payments, consent and safeguarding around one canonical event model. Demo mode uses explicit fictional data and never presents provider simulations as production success.

## Technology

- Next.js App Router, React and strict TypeScript
- Tailwind CSS and accessible reusable components
- Supabase Auth, PostgreSQL, row-level security and private Storage
- Vitest for unit/integration/security checks; Playwright and axe for browser journeys
- Installable PWA with an allowlist-only public cache

## Run locally

Requirements: Node.js 20+, npm, and optionally a Supabase project or local Supabase stack.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The example configuration starts in labelled, non-persistent demo mode. Use the role links on the sign-in page to inspect parent, coach, club and platform experiences.

For production-backed development, set `NEXT_PUBLIC_DATA_MODE=supabase`, configure the Supabase URL, anon key and server-only service-role key in `.env.local`, apply migrations `0001` through `0008` in order, and load `supabase/seed.sql` only into a non-production environment.

## Quality commands

```powershell
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:permissions
npm run build
npm run test:e2e
```

The SQL checks in `supabase/tests` are pgTAP tests. Run them against a freshly reset disposable database, never production. Browser tests start their own development server unless `PLAYWRIGHT_BASE_URL` is supplied.

## Configuration

Copy `.env.example`; never commit `.env.local` or service credentials. Core demo use needs no external account. Supabase is required for persistent multi-user operation. Stripe and OpenAI have explicit server configuration boundaries. Transactional email uses Resend; web push and malware scanning use authenticated HTTPS adapter contracts. SMS, WhatsApp, maps, weather and vendor error monitoring remain unavailable rather than being reported as delivered.

Coaching AI stays off unless the server-side privacy gate is deliberately enabled. See [coaching AI](docs/coaching-ai.md), [providers](docs/PROVIDERS.md) and [payments](docs/PAYMENTS.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md) and [ERD](docs/ERD.md)
- [Authorisation](docs/AUTHORIZATION.md) and [RLS](docs/RLS.md)
- [Security threat model](docs/SECURITY-THREAT-MODEL.md)
- [PWA and offline rules](docs/PWA-OFFLINE.md)
- [Deployment](docs/DEPLOYMENT.md), [backup and restore](docs/BACKUP-RESTORE.md), and [providers](docs/PROVIDERS.md)
- [Safeguarding](docs/SAFEGUARDING.md), [GDPR readiness](docs/GDPR-READINESS.md), [processor register](docs/PROCESSOR-REGISTER.md), and [data-breach response](docs/DATA-BREACH-RESPONSE.md)
- [Known limitations](docs/KNOWN-LIMITATIONS.md)

## Important governance note

This repository provides technical controls, not legal, safeguarding or football-governance approval. Before production use, the deploying club must obtain UK data-protection/legal review, approval from its designated safeguarding lead, and review against current FA and County FA rules and guidance. Competition and age-group rules are configurable and must be verified by the club.
