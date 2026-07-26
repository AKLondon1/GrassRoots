# Deployment

## Shareable beta configuration

The first shareable release is a non-commercial Vercel Hobby beta. It uses real
Supabase data mode and Google OAuth for adult sign-in; it is not a demo-mode
deployment. This section is a pre-deployment checklist and does not claim that
the provider configuration or deployment has already happened.

### Vercel

Connect the Vercel project to the `main` branch of this repository. In Vercel's
Production environment, set:

```text
NEXT_PUBLIC_DATA_MODE=supabase
APP_ORIGIN=https://<the-exact-production-project>.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://mxpuicrkfnyychmwqhus.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
CRON_SECRET=<32-or-more-random-server-only-characters>
```

Replace the `APP_ORIGIN` example with the exact HTTPS URL returned by the
production Vercel deployment. It must be one canonical origin, with no wildcard,
preview URL, path or trailing slash. Use the same exact origin in Supabase Site
URL and redirect settings. `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are
server-only secrets: never put them in Git, `NEXT_PUBLIC_*` variables, browser
code or terminal output. Keep `RESEND_API_KEY`, `EMAIL_FROM`, Stripe, OpenAI,
push and scanner variables unset for this beta.

### Supabase and Google OAuth

1. In Google Cloud, create a Web application OAuth client for the beta.
2. Set its only authorised redirect URI to `https://mxpuicrkfnyychmwqhus.supabase.co/auth/v1/callback`.
3. In the Supabase project's Google provider settings, enable Google and enter the Google client ID and secret. The client secret stays in Google/Supabase configuration, not this repository or Vercel browser-readable variables.
4. In Supabase Auth URL configuration, set Site URL to the exact `APP_ORIGIN` from Vercel. Add the exact production callback URL, `https://<the-exact-production-project>.vercel.app/auth/callback`, and retain `http://localhost:3000/auth/callback` for local development. Do not configure a production wildcard callback.
5. Enable the hosted Supabase **Before User Created** hook with the function `public.hook_restrict_beta_signup`. This database function is supplied by migration `0018_beta_auth_allowlist.sql`; applying the migration does not by itself enable the hosted Auth hook.
6. Before the first sign-in, use the protected Supabase administration path to insert the initial owner's normalised email in `beta_auth_allowlist` with a future expiry. Do not put that address in Git, this documentation, an environment variable or browser code. A private SQL-editor session can use this shape, replacing the placeholder only in that protected session:

```sql
insert into public.beta_auth_allowlist (email, expires_at, operator_note)
values (
  lower(btrim('<enter-owner-email-only-in-the-protected-session>')),
  now() + interval '90 days',
  'initial beta owner'
);
```

The hook is Google-only and fail-closed for new accounts: it permits an
unexpired private allowlist entry or a pending, unexpired invitation, then
returns a generic refusal for every other new identity. It does not give a
Google identity a GrassRoots membership or bypass RLS.

### Resend

Resend is intentionally disabled for the beta because a custom sending domain
has not been verified. Leave both `RESEND_API_KEY` and `EMAIL_FROM` unset, and
revoke the Resend credential that was previously disclosed before sharing the
beta. Create and store a new server-side key only after a verified custom
sending domain is available.

## Environments

Use separate Supabase and Vercel projects for preview/staging/production where
the deployment model requires them. Production Supabase mode fails fast unless
the service-role key and a 32-character-or-longer cron secret are set.

## Release gate

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`, integration and permission suites
5. Reset a disposable database, apply migrations `0001`–`0018`, load synthetic seed if wanted, then run all pgTAP files. Never run destructive reset or pgTAP setup on production.
6. `npm run build`
7. Run Playwright mobile/tablet/desktop critical flows against staging.
8. Verify CSP, no-store private pages, signed webhooks, private buckets, scheduled job auth, health monitoring, backup and alert routing.

Migrations are forward-only. Take/verify a backup and rehearse restore for destructive schema changes. Deploy database-compatible changes before application code that requires them. Configure `/api/internal/jobs` with a long random bearer secret from the scheduler. `/api/health` performs a short, bounded database readiness probe and reports only coarse provider readiness, never secrets.

The public beta additionally requires verification of the exact Vercel origin,
Google sign-in with an invited adult, denial of a brand-new unapproved Google
identity before Auth-user creation, and sign-out/private-route behaviour.

Commercial production launch additionally requires legal/data-protection review,
safeguarding-lead approval, current FA/County FA review, provider agreements,
DPIA, incident contacts and a tested restore.
