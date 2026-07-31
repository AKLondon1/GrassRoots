# Phase 15: the production-equivalent gate

**Written 2026-07-31.** The full signed-in end-to-end test, run against an environment
identical to production in every way that can break and isolated in every way that can
harm, looped until it passes cleanly.

**Entry condition: Phase 14 must be complete.** All four seeded identities must sign
in through a real browser locally. Without that this phase cannot start, which is
exactly where Task 13 stopped.

## Marking convention

- **[VERIFIED]** — read from the file and line cited, this session.
- **[INHERITED]** — carried forward, not re-checked.
- **[DECISION]** — genuinely ambiguous. Ask.

---

## 0. READ THIS FIRST: do not run this against production

The brief said "loop until the full test works in a production environment". Taken
literally that is dangerous, and this document deliberately does not do it.

**[VERIFIED]** `enqueue_published_announcement_deliveries`
(`0008_release_hardening.sql:516`) fires on every published announcement and fans it
out into `announcement_recipients` and `communication_deliveries`, one row per member
of the audience, resolved through `team_audience_members`. The weekly-loop test
publishes announcements. **A loop against production would generate real delivery jobs
to real parents, about fixtures that do not exist, once per iteration.** If email or
push providers are wired, those actually send.

On an app holding children's data, that is a safeguarding incident rather than a
flaky test. Add to it that migrations are one-way and that a failing iteration may
leave half-written rows in a live club's data.

**So the target is a production-EQUIVALENT environment:**

| Identical to production | Isolated from production |
|---|---|
| Same migrations, same order | Its own Supabase project |
| Same `NEXT_PUBLIC_DATA_MODE=supabase` | Its own database, own auth users |
| Same canonical HTTPS `APP_ORIGIN` | Providers stubbed or pointed at a catcher |
| Same auth providers configured | Its own storage buckets |
| Same RLS, same policies | No real club, no real parent, ever |

**[DECISION]** Name it and treat it as permanent: a `staging` Supabase project plus a
preview deployment. It costs one project and it is the thing that lets you run this
loop again for Phase 1b without re-litigating any of the above.

If you genuinely want a smoke test against live production later, that is a separate,
much smaller, read-only exercise. It is not this.

---

## Task 15a: provision the environment

Stand up the Supabase project and the deployment, once.

- A new Supabase project, separate from production
- Apply migrations `0023` to `0030` **in filename order, all of them**. The CLI records
  them in `supabase_migrations.schema_migrations`; cherry-picking desynchronises that
  ledger against the real schema and breaks every future push. Every pgTAP run has
  only ever exercised the complete sequence.
- Deploy the app against it with `NEXT_PUBLIC_DATA_MODE=supabase` and a canonical HTTPS
  `APP_ORIGIN` matching the deployment. **[VERIFIED]** Both are required by
  `lib/env.ts:56` and `lib/env.ts:62-67`.
- Run the Phase 14 identity-seeding script against it.

---

## Task 15b: the Supabase preflight, which is the "everything it should have" check

**Write this as a script, not a checklist.** A checklist gets skimmed; a script fails.
It runs before every loop iteration and refuses to proceed if the environment has
drifted. Suggested home: `scripts/preflight-supabase.ts`.

### Schema and migrations

- [ ] `supabase_migrations.schema_migrations` contains every migration through `0030`,
      in order, with none missing and none extra
- [ ] Row level security is **enabled** on every table in `public`. Assert the count of
      tables with `rowsecurity = false` is zero — a table that quietly ships without
      RLS is the single highest-impact failure this project can have
- [ ] Every policy the app depends on exists by name. At minimum the ones this phase's
      migrations created: `holds_capability_anywhere`'s four SELECT policies,
      `squads_view_team`, `squad_members_view_linked_or_manage`,
      `announcement_recipients_publisher`
- [ ] The trigger `enqueue_published_announcement_deliveries` exists and is enabled
- [ ] `probe_sqlstate` and `probe_read` are **absent** — they are test helpers created
      inside a rolled-back transaction and must never exist in a deployed database

### Auth

- [ ] Google provider enabled and configured
- [ ] Email provider enabled (Phase 14a)
- [ ] Redirect allowlist contains exactly the deployment's `/auth/callback` and
      nothing else. **[VERIFIED]** The app already refuses a mismatched origin
      (`lib/supabase/oauth.ts:20-27`), but the Supabase-side allowlist is a second
      gate and must not be a wildcard
- [ ] Site URL matches `APP_ORIGIN`
- [ ] SMTP points at a catcher, not a real sender. **This is the isolation guarantee**
      — assert it explicitly rather than assuming
- [ ] The four test identities exist and are confirmed

### Storage

**[VERIFIED]** Three buckets are created by `0008_release_hardening.sql:504-512`:

- [ ] `grassroots-private-quarantine` — private, 10 MB limit, png/jpeg/pdf only
- [ ] `grassroots-private-files` — private, 10 MB limit, png/jpeg/pdf only
- [ ] `grassroots-private-exports` — private, 50 MB limit, `application/json`
- [ ] **None of the three is public.** A public bucket on this app means children's
      documents on the open internet

### Keys and secrets

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set server-side only and appears in **no**
      `NEXT_PUBLIC_*` variable and no client bundle
- [ ] The deployed bundle contains no service-role key. Grep the built output; do not
      take this on trust
- [ ] `CRON_SECRET` set if any scheduled job is enabled

### Operational

- [ ] Backups or point-in-time recovery on, even for staging — you will want to reset
      to a known state between loop iterations
- [ ] **[DECISION]** Decide the reset strategy now: does each loop iteration start
      from a freshly seeded database, or does it accumulate? Fresh is far easier to
      reason about and makes failures reproducible. Accumulating is more realistic but
      makes a failing iteration hard to interpret

---

## Task 15c: the test itself

The full weekly loop, signed in, against `NEXT_PUBLIC_DATA_MODE=supabase`.

**[VERIFIED, from Task 13]** Playwright currently does not reach the production
screens at all, because demo mode renders the demo ones. So this is a new suite, not
an extension of the existing one, and the existing demo suite keeps its own job.

### The journey

1. Coach signs in, creates a fixture for their team
2. Parent signs in, sees it, replies available
3. Coach selects and publishes a squad
4. Parent sees their child's place
5. Coach reschedules; the automatic notice publishes
6. Parent sees what changed on the event screen

### The role-tier pass

**[VERIFIED]** Four identities, each proving something different:

| Identity | Proves |
|---|---|
| `alex.morgan@example.test` | Two children, so the **child selector renders** — the only identity that exercises it |
| `sam.taylor@example.test` | Coach **and** guardian, so `?role=parent` must show only their own child |
| `priya.shah@example.test` | Club-admin: the fixture dropdowns are populated, which is what 0026 fixed |
| `morgan.lee@example.test` | Platform-operator sees **no** club data |

### Three things that are correct and look broken

Carry these forward so nobody debugs them. **[VERIFIED]**

- **The polls section shows a card marked "Closed" with no form.** The seeded poll
  closed on 2026-07-24; Task 11 renders closed polls as closed rather than hiding
  them. Seeing *nothing at all* is the regression.
- **No calendar feed link** on the parent schedule. `private_calendar_tokens` stores
  only a digest, so the feed needs a token-issuing path that was deliberately not
  built.
- **No "mark as read" control** on parent announcements. Read state renders from
  `announcement_recipients.read_at`; setting it is an outstanding write path.

---

## Task 15d: the loop, with a stop condition

A loop without a termination rule is not a plan. This one has three exits.

### One iteration

1. Reset the environment to its known state (per the 15b decision)
2. `scripts/preflight-supabase.ts` — **abort the iteration if it fails.** A test run
   against a drifted environment tells you nothing
3. Full automated suite: `npm run test:db`, `npx vitest run`, `npm run typecheck`,
   `npm run lint`, `npm run build`
4. The signed-in e2e suite from 15c
5. If red: diagnose, make the smallest fix, **commit it**, iterate
6. If green: go to the exit rule

### Exit rules

- **Success:** three consecutive green runs from a fresh reset. Not one. A single
  green run cannot distinguish "fixed" from "got lucky", and this suite involves
  timing, email and a database
- **Escalate:** the same test fails three iterations running, or ten iterations pass
  without reaching green. **Stop and report.** Repeatedly re-running a test that keeps
  failing the same way is not progress, and by iteration four the problem is usually
  the plan rather than the code
- **Hard stop:** any iteration that would need a change to an RLS policy or a
  safeguarding-relevant behaviour to go green. **Stop and ask a human.** Making a
  security boundary looser so a test passes is exactly the failure this whole project
  has been guarding against, and a loop is precisely the context where it would seem
  reasonable at 2am

### Discipline inside the loop

- Every iteration ends in a commit or an explicit "no change needed" note
- Never edit a test to match broken behaviour without saying so out loud. Task 13
  found a stale assertion and was right to fix the *test* — but it proved the product
  was right first
- Record what each iteration changed. Ten commits saying "fix e2e" are worthless in a
  month

---

## Task 15e: only then, GitHub

The brief was "before we commit it to github". Precisely:

**[VERIFIED]** The code is already pushed —
`origin/claude/grassroots-website-build-f6feed` is level with local at `ac32779`.
What has not happened is `main` moving. Local `main` is now at `ac32779` too, 28
commits ahead of `origin/main`.

After three consecutive green runs:

1. Push the phase's own commits
2. Open a PR from the working branch to `main`, or push `main` directly if you are
   not reviewing
3. **[DECISION]** Deploy the migrations to real production, `0023` to `0030` in order.
   This is the genuinely irreversible step in the whole project and deserves its own
   moment of attention rather than being the last line of a checklist
4. Verify production after deploying: re-run the preflight against it, read-only

---

## Standing rules

Assumptions become assertions before they become code. Never authorise a write from
the `capabilities` array; use `requireCapability`, at team scope, comparing the form's
`organisationId` against the resolved one. Write-refusal assertions are INSERTs, since
RLS filters an UPDATE rather than refusing it. Assert exact SQLSTATE via
`probe_sqlstate`. One task at a time.

**Environment.** `npx supabase start` for local work; Docker is not on the tool
shells' PATH, so prefix with
`$env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"`. **Never
`supabase db reset` against a remote project** — this phase makes that mistake much
easier to make, because a remote project is now linked. A GateGuard hook denies the
first Bash/Edit/Write per file: state the four facts and retry. Check `git status` and
`Get-ChildItem -File | Where-Object { $_.Length -eq 0 }` before every commit.

## After Phase 15

Phase 1 is genuinely closed, with evidence rather than assertion. Next is **Phase 1b,
cross-club federation** — the largest new architecture in the project and the only
part with a genuine child-safeguarding surface across a tenant boundary. It needs a
safeguarding review before any of it ships. See Phase 1 handoff section 8.
