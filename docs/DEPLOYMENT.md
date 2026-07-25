# Deployment

## Environments

Use separate Supabase and Vercel projects for preview/staging/production. Set `NEXT_PUBLIC_DATA_MODE=supabase`, `APP_ORIGIN` to the canonical HTTPS origin, public Supabase URL/anon key, and server-only secrets in the deployment dashboard. Never expose the service role, cron, Stripe or OpenAI secrets as public variables. Production Supabase mode fails fast unless the service-role key and a 32-character-or-longer cron secret are set.

## Release gate

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`, integration and permission suites
5. Reset a disposable database, apply migrations `0001`–`0008`, load synthetic seed if wanted, then run all pgTAP files. Never run destructive reset or pgTAP setup on production.
6. `npm run build`
7. Run Playwright mobile/tablet/desktop critical flows against staging.
8. Verify CSP, no-store private pages, signed webhooks, private buckets, scheduled job auth, health monitoring, backup and alert routing.

Migrations are forward-only. Take/verify a backup and rehearse restore for destructive schema changes. Deploy database-compatible changes before application code that requires them. Configure `/api/internal/jobs` with a long random bearer secret from the scheduler. `/api/health` performs a short, bounded database readiness probe and reports only coarse provider readiness, never secrets.

Production launch additionally requires legal/data-protection review, safeguarding-lead approval, current FA/County FA review, provider agreements, DPIA, incident contacts and a tested restore.
