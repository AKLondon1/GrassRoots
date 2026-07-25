# GrassRoots Shareable Beta Release Design

## Objective

Release GrassRoots as a publicly reachable, non-commercial beta at no recurring
hosting or email cost. The beta must use the real Supabase database and
authorisation model, never fictional demo mode. Invited testers must be able to
authenticate without relying on a custom email-sending domain.

## Release Boundary

The beta uses:

- Vercel Hobby for a public `*.vercel.app` deployment;
- the existing GrassRoots Supabase project for database, storage and auth;
- Google OAuth through Supabase Auth for adult authentication;
- the existing invitation and organisation-membership controls for application
  access.

The beta does not use:

- demo data mode;
- Resend or Supabase's non-production default email sender;
- Stripe, paid subscriptions or other commercial transactions;
- a custom domain;
- public self-service access to private organisation workspaces.

The Vercel Hobby deployment remains non-commercial. Moving to paid plans,
charging clubs or taking live payments requires a separate production launch
review.

## Authentication and Access Flow

1. A visitor opens the Vercel production URL and chooses **Continue with Google**.
2. GrassRoots validates any requested return path and starts Supabase Google
   OAuth with a callback on the current canonical application origin.
3. Google authenticates the adult. Supabase returns the user to
   `/auth/callback`.
4. The callback exchanges the OAuth code for a server-side Supabase session.
5. GrassRoots resolves active organisation memberships for the authenticated
   user:
   - a user with an active membership continues to the requested authorised
     screen or their default workspace;
   - an authenticated user without a membership sees a truthful
     invitation-required state and receives no organisation data;
   - a user following a valid invitation can accept it only after
     authenticating, after which existing RLS and membership checks grant the
     intended scoped access.
6. Invalid, expired or already-used invitations fail safely without revealing
   organisation or membership details.

Children never authenticate. Google identity proves the adult session but does
not itself grant any GrassRoots role or organisation access.

## Interface Changes

The production sign-in screen presents one primary action: **Continue with
Google**. It explains that GrassRoots uses the adult's Google account only for
secure sign-in and that club access still requires an invitation.

Email magic-link sign-in is not shown while production email is unconfigured.
The underlying magic-link implementation remains available for a later custom
domain release. Demo role shortcuts remain available only when the explicit
data mode is `demo`; the deployed beta uses `supabase`.

Authentication failures return to the sign-in screen with concise, non-sensitive
copy. Authenticated adults without membership see an invitation-required page
rather than a broken dashboard or a simulated account.

## Configuration

### Vercel

The Vercel project is connected to the existing GitHub repository and deploys
the `main` branch. Production environment variables are configured in the
Vercel dashboard or CLI:

- `NEXT_PUBLIC_DATA_MODE=supabase`
- `APP_ORIGIN` set to the final HTTPS Vercel production URL
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

Optional provider variables remain unset unless their adapters are deliberately
enabled. Preview deployments must not be treated as production auth origins.

### Supabase

Google is enabled as an Auth provider using a dedicated Google OAuth client.
The Google OAuth client permits only the callback URI supplied by Supabase.
Supabase Auth URL configuration permits:

- the exact Vercel production origin and its `/auth/callback` route;
- localhost callback URLs required for development.

Wildcards are not used for the production origin. Existing migrations and RLS
policies remain the authority for data access.

### Resend

Resend remains disabled for this beta because no custom sending domain is
available. The API key previously shared in conversation is revoked. A new key
is created only when a verified custom domain is introduced, and it is stored
only as a server-side deployment secret.

## Security and Privacy

- OAuth return paths are normalised to same-origin internal paths.
- Organisation access is derived from authenticated memberships, never Google
  profile claims or client input.
- Uninvited users cannot enumerate organisations, people or invitations.
- Server-only Supabase and cron secrets never use `NEXT_PUBLIC_*` names and
  never enter Git.
- Private pages retain no-store behaviour and existing RLS enforcement.
- Authentication errors and health responses expose no credentials or
  sensitive provider detail.
- The beta carries no claim of full commercial, legal or safeguarding launch
  readiness.

## Failure Handling

- OAuth cancellation or provider failure returns a recoverable sign-in error.
- A missing or malformed OAuth code fails closed.
- A valid login without GrassRoots membership shows the invitation-required
  state.
- An invalid invitation remains unusable and reveals no private club data.
- Missing Google provider configuration causes a clear unavailable state rather
  than silently offering a broken action.
- Provider and database health remain observable through the existing coarse
  health endpoint and Vercel logs.

## Verification

Before deployment:

1. Run lint, TypeScript, Vitest, permission/security suites and the production
   build.
2. Verify server-action export rules and Supabase-mode environment validation.
3. Test OAuth initiation, callback validation, safe return paths, sign-out and
   uninvited-user handling.
4. Run Playwright critical journeys across mobile, tablet and desktop using a
   controlled authenticated test boundary where live Google automation is not
   appropriate.
5. Confirm the Git working tree contains no deployment credentials.

After deployment:

1. Verify the public landing page, sign-in page and health endpoint at the
   Vercel production URL.
2. Complete one real Google sign-in using an invited adult test account.
3. Confirm an uninvited Google account receives no workspace access.
4. Confirm sign-out ends the session and protected routes redirect safely.
5. Record the deployed URL and provider configuration in release documentation.

## Rollout and Future Upgrade

The first release is labelled beta and shared with a small, invited group. No
fees are charged and no Stripe production credentials are enabled.

The later full production release will purchase a custom domain, upgrade hosting
when commercial use begins, verify the domain with Resend, configure Resend SMTP
for Supabase Auth, restore email magic links, and complete the documented legal,
data-protection, safeguarding, backup and incident-response launch gates.
