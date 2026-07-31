# Phase 14: authentication and testability

**Written 2026-07-31**, after Task 13 closed the Phase 1 gate at `ac32779` and found
three blockers it could not fix. This phase exists to remove them. **Phase 15 cannot
start until 14a and 14b are done**, because without them nobody can sign in to test.

## Marking convention

- **[VERIFIED]** — read from the file and line cited, this session.
- **[INHERITED]** — carried forward, not re-checked. A lead, not a fact.
- **[DECISION]** — genuinely ambiguous. Ask, or state your assumption loudly.

Three inherited claims have been proven wrong across this project so far. Assume this
document contains at least one more.

---

## 0. Where to start

**[VERIFIED]** `main`, `origin/main` and `claude/grassroots-website-build-f6feed` are
all at `ac32779`. Everything is on one line and pushed.

Baseline at `ac32779`, reproduce before changing anything:

| Check | Expected |
|---|---|
| `npm run test:db` | **522** pgTAP across **15** files |
| `npx vitest run` | **541** across **107** files |
| `npm run typecheck` | clean |
| `npm run lint` | clean repo-wide |
| `npm run build` | **fails without env** — see 14c |

Migrations **0023 to 0030 are undeployed**. Production is at 0022.

---

## 1. The three blockers, restated precisely

**[VERIFIED] Blocker 1: sign-in is Google-only.** `lib/supabase/oauth.ts:8` exports
`buildGoogleOAuthRequest` and it is the only authentication path in the tree. A
tree-wide grep for `signInWithOtp`, `signInWithPassword` and `magiclink` across
`**/*.{ts,tsx}` returns nothing.

**[VERIFIED, from Task 13] Blocker 2: seeded users cannot authenticate.** Every
`auth.users` row in `supabase/seed.sql` is skeletal — no password, unconfirmed email,
no `aud`, no `role`. They exist to satisfy foreign keys. Combined with blocker 1,
none of the four role-tier identities can sign in, so the browser pass is impossible
rather than merely undone.

**[VERIFIED] Blocker 3: `npm run build` needs env the repo does not document.**
`lib/env.ts:56` requires `NEXT_PUBLIC_DATA_MODE` in production, and `lib/env.ts:62-67`
requires `APP_ORIGIN` to be a canonical HTTPS origin. `.env.example` ships
`http://localhost:3000`, which the guard correctly refuses. **The guard is right and
the documentation was wrong.** Do not weaken the guard.

---

## Task 14a: email sign-in

Add a second authentication route so a human, and a test, can get in without Google.

### DECIDED: magic links only

**`signInWithOtp` with an email link. No passwords, now or later.**

The consequence to hold on to: **this codebase never stores a password**, so it never
owns a reset flow, a strength policy, a breach-check integration or a credential
stuffing surface. Every one of those is a thing a small club app would otherwise have
to get right forever. Supabase owns the token lifecycle instead.

Two things follow from the decision:

- **Do not add `signInWithPassword` anywhere, including for tests.** The moment it
  exists for a test it exists for an attacker. 14b solves test authentication without
  it, and 14f adds a Supabase-side setting that makes the decision enforceable rather
  than merely intended.
- **The mail leg is now load-bearing.** If mail does not arrive, nobody signs in at
  all — there is no fallback route. That raises SMTP from a nice-to-have to part of
  the auth path, which is why 14f configures it in both environments and why staging
  is permanent.

### What to build

- `lib/supabase/email-auth.ts`, mirroring the shape and defensive posture of
  `buildGoogleOAuthRequest`. **[VERIFIED]** That helper already enforces a canonical
  HTTPS origin in production and rejects an origin mismatch
  (`lib/supabase/oauth.ts:20-27`). The email path must reuse the same guard, not
  reimplement it — extract it if that is cleaner.
- An email field and submit on `components/auth/sign-in-screen.tsx`, reached from
  `app/(auth)/sign-in/page.tsx:31`.
- Reuse `normaliseInternalPath` for the `next` parameter. It already exists and is
  already the redirect allowlist.
- **[VERIFIED]** `app/(auth)/sign-in/page.tsx:24-29` accepts exactly three error
  codes: `callback`, `provider`, `session-revoked`. Add email-specific codes there
  deliberately; do not widen it to arbitrary strings.

### Tests

- Unit: the origin guard rejects `http://` in production, rejects an origin mismatch,
  accepts a matching canonical HTTPS origin, and normalises `next`.
- Unit: an unknown error code does not render as an error message.
- A static test asserting the email path cannot be called with an unvalidated
  `redirectTo`, in the style of the existing static-safety tests.

---

## Task 14b: identities that can actually sign in, without shipping credentials

**This is the security-sensitive one.** Task 13 stopped here deliberately and was
right to. A password or a long-lived token committed to `supabase/seed.sql` ends up in
staging, in forks, and in every developer's shell history.

### The rule

**No credential, token or password may appear in any file tracked by git.** Not in
`seed.sql`, not in a fixture, not in a test.

### [DECISION] How to get authenticated identities anyway

Three approaches, in order of preference:

**1. A local-only seeding script driven by the service role.** A `scripts/` entry that
calls the Supabase admin API to create confirmed users and, if magic-link testing
needs it, mint a link. **[VERIFIED]** `SUPABASE_SERVICE_ROLE_KEY` is already in the
environment schema at `lib/env.ts:19`. The script reads it from the environment and is
never given a default. Run it after `supabase db reset`. Nothing secret is committed;
the script is committed, the key is not.

**2. Read the local mailbox.** Supabase's local stack ships an SMTP catcher. If magic
links are the only route, an e2e helper can request a link and read it out of that
mailbox. Deterministic, no credentials anywhere, and it exercises the real flow
end to end rather than a shortcut around it.

**3. Admin `generateLink` at test time.** Mints a one-time link via the service role
without sending mail. Fastest and fully deterministic, but skips the mail leg, so it
proves less than option 2.

**Recommend 1 plus 2**: the script makes identities usable by a human in a browser;
the mailbox read makes them usable by Playwright, exercising the real path.

### What the identities must be

**[VERIFIED]** The four the role-tier pass needs, all already present as skeletal rows:

| Email | Role | Why it matters |
|---|---|---|
| `alex.morgan@example.test` | guardian, **two** children | The only identity that renders the child selector |
| `sam.taylor@example.test` | coach of Under 11s **and** a guardian | The dual-identity case behind trap 1 |
| `priya.shah@example.test` | club-admin, pitch, facilities, fixtures | The fixture dropdowns 0026 fixed |
| `morgan.lee@example.test` | platform-operator | Must see **no** club data |

The script should upgrade these existing rows rather than create parallel ones, or the
foreign keys in `seed.sql` will point at the wrong users.

### Tests

- A static test scanning `supabase/seed.sql` and every other tracked file for anything
  resembling a credential: Supabase's password column, an assigned password literal, a
  bcrypt prefix, a JWT shape, a project key, a hosted project URL. **This test is the
  point of the task** — it is what stops a future session taking the shortcut Task 13
  refused to take.

  Note this document deliberately names those patterns in prose rather than quoting
  the literal tokens. The scanner reads every tracked file, so a plan that spelled its
  own patterns out would fail the check it describes. Prose is the fix; adding this
  file to the scanner's allowlist is not, because that would exempt it from every
  other rule as well.
- The seeding script refuses to run when `NODE_ENV=production`.
- The script refuses to run against a non-local Supabase URL unless explicitly forced.

---

## Task 14c: make the build command honest

**[VERIFIED]** The guard at `lib/env.ts:62-67` is correct and stays. What is wrong is
that no committed file shows a working production build invocation.

- Add `.env.production.example` with `NEXT_PUBLIC_DATA_MODE=supabase` and a canonical
  HTTPS `APP_ORIGIN`, clearly marked as an example.
- Leave `.env.example` alone for local development, but comment why its
  `http://localhost:3000` is deliberately not production-valid.
- Document the exact working command in `README` or `HANDOFF.md`.
- **[DECISION]** Consider a `npm run build:local` that sets the two variables inline,
  so the production build is runnable by anybody without ceremony. Weigh against the
  risk of someone shipping a build made with an example origin.

### Test

A unit test asserting `.env.production.example` parses cleanly through the same schema
`lib/env.ts` uses. That makes the example self-verifying rather than decorative.

---

## Task 14d: bulletproofing the auth surface

The "anything else" you asked for. These are the things that turn a working sign-in
into one you can leave running.

**Rate limiting.** An OTP endpoint with no limit is a free email cannon pointed at
arbitrary addresses. Supabase applies its own limits; confirm what they are and
whether they are adequate, and add application-level throttling if not. Assert the
behaviour rather than assuming the platform handles it.

**Email enumeration.** The response to "email not registered" must be indistinguishable
from "link sent". Otherwise the sign-in form becomes a tool for discovering which
parents at a club have accounts.

**Redirect safety.** **[VERIFIED]** `normaliseInternalPath` plus the canonical-origin
check in `oauth.ts:20-27` already handle this for Google. Prove by test that the email
path inherits both, because an open redirect on a sign-in callback is the classic way
these get exploited.

**Session revocation.** The `session-revoked` error code already exists at
`app/(auth)/sign-in/page.tsx:27`. Confirm what actually raises it and that a revoked
session cannot be replayed.

**PKCE and cookie handling.** Two OAuth cookie bugs were already fixed in PRs #2 and
#3 (`fix/oauth-callback-cookie-propagation`, `fix/oauth-duplicate-flow-state`). The
email flow uses the same callback route, so re-test those specific regressions against
it — they are the known-weak part of this code.

**Audit trail.** `audit_log` exists. **[DECISION]** Decide whether sign-in events
belong in it. For an app holding children's data, "who accessed this and when" is a
question a club will eventually be asked by a parent or a governing body.

**Membership status.** A suspended membership must not authenticate into a workspace.
**[VERIFIED]** `resolveActingGuardian` checks `status = 'active'`
(`features/people/acting-guardian.ts:44`), but that is per-action. Confirm the same is
true at the session and workspace-resolution layer.

---

## Task 14e: close the loop that let blocker 2 hide

Task 13 found an e2e assertion that had been failing since the baseline commit,
unnoticed because Playwright was never re-run for an entire phase. **[VERIFIED, from
Task 13]** The same report notes Playwright does not reach the production screens at
all, because demo mode renders the demo ones — so a green Playwright run currently
proves less than it appears to.

- Add `npx playwright test` to whatever counts as the standing check, so it cannot go
  a phase without running again.
- Make the demo-versus-production coverage gap visible in the test names themselves,
  not only in a comment, so a green run cannot be mistaken for coverage it lacks.

---

## Task 14f: configure the Supabase projects themselves

Code alone does not enable magic links. The provider is a **project setting**, and
until it is switched on, `signInWithOtp` returns an error no amount of correct
TypeScript will fix. This task changes the actual databases.

### DECIDED: staging is permanent

A standing `staging` Supabase project, not a throwaway. Three reasons that hold beyond
this phase:

- Magic links cannot be proven without real SMTP. Local catchers prove the code path;
  only a deployed project proves deliverability, link expiry and the redirect
  allowlist together.
- Phase 15 loops against it, and Phase 1b will loop against it again. Rebuilding it
  each time means re-deciding all of this each time.
- It is the only safe place to rehearse a migration deploy. **[VERIFIED]** Seven
  migrations, `0023` to `0030`, are still undeployed with production at 0022, and that
  deploy should happen somewhere reversible first.

Provision it **here**, in 14, not in 15. Phase 15 then verifies rather than creates.

### Tooling: MCP if you have it, dashboard if you do not

**[VERIFIED, 2026-07-31]** No Supabase MCP was connected when this plan was written —
a tool search returned nothing Supabase-related. Connect one with `claude mcp add` in
an interactive session if you want an agent to make these changes directly. There is a
`sparc:supabase-admin` skill in the skill list, but that is a prompt template, not a
connection to a project.

Either route is fine. What matters is that **every change below is also expressed as
an assertion in the Phase 15 preflight script**, so a setting changed by hand in a
dashboard at 11pm cannot silently drift. Configure it however you like; prove it in
code.

### What to change, in both local and staging

**Auth providers**

- [ ] Email provider **enabled**
- [ ] "Confirm email" behaviour set so a magic link signs the user in
- [ ] **Password sign-in disabled at the project level.** This is what turns the
      "magic links only" decision into something enforced rather than merely
      documented. If the setting exists, use it
- [ ] Google provider left exactly as it is — this phase adds a route, it does not
      replace one

**Redirect and origin**

- [ ] Site URL set to the environment's canonical HTTPS origin
- [ ] Redirect allowlist contains that origin's `/auth/callback` and **nothing else**.
      **[VERIFIED]** The app already refuses a mismatched origin
      (`lib/supabase/oauth.ts:20-27`), but this is the second gate and a wildcard here
      undoes it
- [ ] Local project points at `http://localhost:3000`; staging at its real HTTPS origin

**Mail**

- [ ] Staging SMTP points at a **catcher**, never a real sender. Staging will publish
      test announcements, and **[VERIFIED]**
      `enqueue_published_announcement_deliveries` (`0008_release_hardening.sql:516`)
      fans every published announcement out to its whole audience
- [ ] The magic-link email template says who it is from and what it does. This is the
      only email a parent gets before they have an account, so it is the one most
      likely to be read as phishing
- [ ] Link expiry set deliberately. Long enough for a parent to find the email on a
      phone, short enough to matter

**Rate limits**

- [ ] Read what the project's OTP rate limits actually are and write them down. 14d
      asks you to assert this behaviour; you cannot assert a number you have not read

**Migrations**

- [ ] Apply `0023` to `0030` to staging, in filename order, all of them. This is the
      rehearsal for production

**Keys**

- [ ] `SUPABASE_SERVICE_ROLE_KEY` for staging stored where the 14b seeding script can
      read it, and in **no** `NEXT_PUBLIC_*` variable

### Test

Extend the credential-scanning static test from 14b to also fail if a Supabase URL or
key for **any** project appears in a tracked file. Environment names in a document are
fine; values are not.

---

## Suggested order

1. Reproduce the baseline. Record the real numbers.
2. **14c** first — it is small, and you want a working production build before you
   change auth.
3. **14f** provision staging and configure both projects. Do this before writing the
   client code, so 14a can be tested against a real provider from its first commit
   rather than mocked and hoped for.
4. **14a** email sign-in, with its unit tests.
5. **14b** the seeding script and the credential-scanning static test.
6. **14d** hardening, one item per commit, each with an assertion.
7. **14e** wire Playwright back into the standing check.
8. Confirm all four identities can sign in **locally and on staging**, in a real
   browser, by magic link. **That is the exit condition for this phase**, and it is
   what unblocks Phase 15.

## Standing rules

Assumptions become assertions before they become code. Never authorise a write from
the `capabilities` array; use `requireCapability`, at team scope, comparing the form's
`organisationId` against the resolved one. Write-refusal assertions are INSERTs, since
RLS filters an UPDATE rather than refusing it. Assert exact SQLSTATE via
`probe_sqlstate`. One task at a time, stopping between them.

**Environment.** `npx supabase start` first; Docker is not on the tool shells' PATH,
so prefix with
`$env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"`. Never
`supabase db reset` against a remote project. A GateGuard hook denies the first
Bash/Edit/Write per file: state the four facts and retry. **Stray zero-byte files
appear in the repo root** — check `git status` and
`Get-ChildItem -File | Where-Object { $_.Length -eq 0 }` before every commit. Zod idiom
is mixed: match the file you are editing.
