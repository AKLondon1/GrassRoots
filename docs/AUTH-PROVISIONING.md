# Auth provisioning

What Phase 14f changed, what it could not change, and where the line falls.

Sign-in is **magic links only**. No password is stored, checked or reset anywhere in this
system, which is why there is no reset flow, no strength policy and no credential-stuffing
surface to defend. The cost of that decision is that **mail is part of the auth path**: if
mail does not arrive, nobody signs in at all. There is no fallback route.

## The split

`supabase/config.toml` is the local project's configuration, and it is code: it is reviewed,
diffed and asserted. A hosted project's equivalent settings live in a dashboard that no file
in this repository can see.

That asymmetry is the whole problem. A dashboard setting changed at 11pm and never written
down is not a configuration, it is a rumour. So the rule is: **configure it however you
like, but prove it in code.**

```bash
npm run preflight:auth
```

Eight assertions, and it runs inside `npm run verify` before the test suites. It also prints
what it *cannot* check, so the manual half stays visible rather than being quietly forgotten.

## Asserted automatically

| Setting | Value | Why it is that value |
|---|---|---|
| `site_url` | `http://localhost:3000` | Must equal `APP_ORIGIN` exactly. See the bug below. |
| `additional_redirect_urls` | `.../auth/callback` only | Second gate behind the app's own origin check. No wildcard. |
| `otp_expiry` | 1800s (30 min) | Long enough to find the mail on a phone; short enough that a link in a shared mailbox goes stale. |
| `email_sent` | 30/hour (local) | The ceiling on signing in at all. Two would not serve four test identities. |
| Magic-link template | `supabase/templates/magic_link.html` | The only mail a parent gets before they have an account. |
| Password sign-in | No call sites | See "the setting that does not exist". |

### The bug this found

`site_url` was `http://127.0.0.1:3000` while the application ran on `http://localhost:3000`,
and `additional_redirect_urls` was `https://127.0.0.1:3000` — wrong scheme, wrong host, not a
callback path. Those are **different origins** to a browser and to the check at
`lib/supabase/oauth.ts:20-27`, so every magic link was built against an origin the
application would then refuse. `localhost` and `127.0.0.1` are not interchangeable here.

The preflight script fails on both of those values. That was verified by putting them back
and watching it fail, not by assuming.

### The setting that does not exist

14f's checklist asks for "password sign-in disabled at the project level". **There is no such
key in the Supabase CLI config schema**, and no MCP tool reaches it. Rather than record a box
that cannot be ticked, enforcement is two assertions:

- No tracked source file calls `signInWithPassword` — asserted in `preflight-auth.mjs`.
- No `auth.users` row carries a password hash — belongs in pgTAP against the local database.
  **Not yet written.** This is the one gap in the enforcement story.

A check that fails the build is stronger than a toggle nobody looks at, so this is not purely
a downgrade — but the second assertion is still owed.

## Must be done by hand

The Supabase MCP server exposes reads, SQL and migrations, and project lifecycle. It has **no
tool for auth configuration** — not providers, redirect URLs, SMTP, or rate limits. For a
hosted project these are dashboard-only unless a Management API token is added.

- [ ] Email provider enabled; confirm-email set so a magic link signs the user in
- [ ] Site URL = the environment's canonical HTTPS origin
- [ ] Redirect allowlist = that origin's `/auth/callback`, and nothing else
- [ ] SMTP points at a **catcher**, never a real sender. Staging publishes test
      announcements, and `enqueue_published_announcement_deliveries`
      (`0008_release_hardening.sql:516`) fans every published announcement out to its whole
      audience
- [ ] Google provider left exactly as it is — this phase added a route, it did not replace one
- [ ] Link expiry set to match `otp_expiry` above, and the email template's stated duration
- [ ] **Record the project's real OTP rate limits in the table below.** 14d asks for an
      asserted number; a number nobody has read cannot be asserted
- [ ] `SUPABASE_SERVICE_ROLE_KEY` stored where `scripts/seed-auth-identities.mjs` can read it,
      and in no `NEXT_PUBLIC_*` variable

### Hosted rate limits, as read from the dashboard

| Project | Emails/hour | OTP verifications / 5 min | Sign-ins / 5 min | Read on |
|---|---|---|---|---|
| GrassRoots (production) | _not yet read_ | | | |
| staging | _project not yet created_ | | | |

## Do sign-in events belong in `audit_log`? No. Workspace entry does.

14d left this open. It is settled by the table's own shape rather than by preference:

```sql
organisation_id uuid not null references public.organisations(id) on delete cascade,
actor_membership_id uuid,
foreign key (actor_membership_id, organisation_id) references public.memberships(id, organisation_id)
```

`audit_log` is **organisation-scoped by construction** (`0004_facilities.sql:416-428`). A
sign-in has no organisation: the user has authenticated but not yet resolved a workspace, and
may belong to several clubs or to none. There is no honest value for a not-null
`organisation_id` at that moment. Writing one would mean either inventing an organisation or
picking one arbitrarily, and an audit trail that guesses is worse than none.

So the auditable event is **workspace entry** — the first authenticated access to a specific
organisation — where both `organisation_id` and `actor_membership_id` exist and are true.

That is also the better answer to the question a club will actually be asked. A parent or a
governing body does not ask "did someone log in". They ask **"who opened my child's record,
and when"**, and that question is answered at workspace entry, not at the door.

**Not yet implemented.** The decision is made and the shape is known; the insert belongs at
the `resolveProductionWorkspaceAccess` boundary in `features/tenancy/service.ts`, on the
allowed path. Left as follow-up rather than smuggled into this phase, because it is a schema
and a write path, not a setting.

## Staging

**Not created.** `create_project` was attempted and refused: the organisation is at its
free-tier limit of two active projects (JetBrains and GrassRoots). The options are to pause
an existing project, repurpose one of the two paused ones, run a branch at roughly
$9.80/month, or upgrade the organisation.

Until staging exists:

- Migrations `0023`–`0030` remain undeployed everywhere. Production is at `0022`. There is
  nowhere reversible to rehearse that deploy, which is the reason not to do it in a hurry.
- Deliverability, real link expiry and the hosted redirect allowlist are unproven. The local
  stack proves the code path only; its SMTP catcher does not prove that mail arrives.

## Local identities

```bash
npx supabase start
npx supabase db reset          # recreates the skeletal auth.users rows
npm run seed:auth              # confirms them; --links mints sign-in links
```

Mail is caught locally at <http://localhost:54324>. Nothing secret is committed: the script
is in git, the service-role key is in the environment, and
`tests/unit/no-committed-credentials.test.ts` fails the build if the two ever meet.
