# Phase 15, session 1: what ran, what changed, what is left

**Written 2026-07-31 at `54c41a3`.** Read this with
`2026-07-31-phase-15-production-equivalent-gate.md`, which it does not replace. It records
the automated half of the gate, three defects that half found, and two decisions that
change how the rest of the phase runs.

## Marking convention

- **[VERIFIED]** — measured or read from the cited file and line, this session.
- **[DECIDED]** — settled by the human partner this session. Do not re-litigate.

---

## 1. Two decisions that supersede the plan

**[DECIDED] The GrassRoots Supabase project is staging, not production.** Its contents are
fake and disposable, and any mail it sends reaches the project owner only. This was
confirmed explicitly when the account's free-tier limit of two active projects blocked
provisioning a separate one.

This inverts task 14f rather than completing it. **Do not create a `staging` project.** Use
`mxpuicrkfnyychmwqhus`, wipe it freely, and provision a *new* project as production later —
after `0023` to `0030` have been proven somewhere disposable. The whole argument for a
standing staging project was "the only safe place to rehearse a migration deploy"; a
disposable project you already own satisfies it without spending anything.

**Consequently the safeguarding argument in section 0 of the plan does not apply here.** It
was never about data volume — it was about real parents receiving real mail about fictional
fixtures. There are none. What *does* still apply, and is the reason this is not a licence
to be careless:

- **Migrations remain one-way.** `0023` to `0030` have been applied to no hosted project.
  A failure partway through desynchronises `supabase_migrations.schema_migrations` against
  the real schema, and by Phase 1's own handoff that breaks every future push.
- **The loop resets between iterations.** That is a wipe. It is now an *approved* wipe,
  which is a different thing from a safe one to run by reflex.

**[DECIDED] `main` moves by PR, not by direct push.** [PR #8](https://github.com/AKLondon1/GrassRoots/pull/8)
is open from `claude/phase-15-test-commit-83a3ca` and deliberately unmerged.

---

## 2. Status of the automated half

**[VERIFIED]** All green on `54c41a3`, local stack:

| Check | Result |
|---|---|
| `npm run test:db` | **522** pgTAP across 15 files |
| `npx vitest run` | **567** across 110 files |
| `npx playwright test` | **102** passed |
| `npm run preflight` | auth **8** passed, db **18** passed |
| `typecheck` / `lint` / `build` | clean |

The build needs four variables set: `NEXT_PUBLIC_DATA_MODE`, `APP_ORIGIN`,
`SUPABASE_SERVICE_ROLE_KEY` (≥32 chars) and `CRON_SECRET` (≥32). **[VERIFIED]** That is
`lib/env.ts:79` and `lib/env.ts:82` working, not a defect.

---

## 3. Task 15b is done: `scripts/preflight-supabase.mjs`

Run via `npm run preflight` (both halves) or `npm run preflight:db`. Targets
`--local` by default, `--linked`, or `--db-url`. **Every statement is read-only**, so it is
safe against any project, which is what 15e step 4 needs.

**Thirteen unconditional checks**, rising to fifteen in a shell that has a service-role key
and a built client bundle. An earlier version of this document said "eighteen" without that
qualification; a cold audit was right to call that out, and the number has since dropped
again as vacuous checks were removed. Prefer the script's own output over any number
written here.

Covered: the migrations ledger compared against the filenames on disk rather than a
hard-coded `0030`; RLS enabled on every table in `public`; the seven named policies `0026`
to `0028` created; the delivery trigger; absence of the pgTAP probe helpers; the three
private buckets with their exact limits and MIME types; and the five sign-in identities
**by address**, not by count — `seed.sql` carries six `@example.test` addresses and only
some are identities, so a count passed on the wrong four.

Everything the script cannot see is printed on every run under "Not assertable from SQL"
rather than filed in a document. That list is part of the output, not an apology for it.

**It is `.mjs`, not the plan's suggested `.ts`.** The repo has no `pg` and no `tsx`, and a
preflight that needs an install step is useless at the moment you want it — the same reason
`preflight-auth.mjs` parses TOML with regexes. SQL goes through `supabase db query`, which
behaves identically local and remote.

**Two corrections to the plan, now asserted correctly:**

- 15b names the trigger `enqueue_published_announcement_deliveries`. **[VERIFIED]** That is
  the *function* (`0007_consent_safeguarding_ops.sql:252`); the trigger is
  `announcements_enqueue_deliveries` (`0007:275`). Asserting only the function passes with
  the trigger dropped — a database where publishing an announcement silently reaches nobody.
- `CRON_SECRET` describes the deployment's shell, not the database. It is asserted only when
  that shell has declared `NEXT_PUBLIC_DATA_MODE=supabase`. Unconditionally it is red on
  every local run, and a permanently red check gets commented out of the loop.

---

## 4. Three defects this session found

**An assertion had been inverted, in the tree, green, for a whole phase.**
`tests/e2e/sign-in-supabase.spec.ts` asserted the sign-in screen had **no** email field —
while Phase 14a's entire deliverable was adding one. It is `test.skip`-ed unless
`NEXT_PUBLIC_DATA_MODE=supabase`, and the demo Playwright run never sets that, so it had not
executed since Phase 14 landed. **[VERIFIED]** The product was checked first
(`sign-in-screen.tsx:119` renders `MagicLinkForm`, labelled at `magic-link-form.tsx:39-41`);
the test was fixed, not the product.

**Carry this forward as a rule, because it will happen again:** before trusting any new
suite, confirm it actually executes. A `test.skip` on an environment variable is how the
last one hid for a phase.

**The e2e suite was failing 90% of itself — and a second, real defect hid underneath.**
**[VERIFIED]** On a cold Turbopack cache with Docker running, the uncapped suite gave
**96 failed in 8.9m**, and 2 workers gave **102 passed in 6.0m** — faster *and* green.
`playwright.config.ts` caps local workers at 2 on that evidence.

**[VERIFIED, by cold audit] That diagnosis was right but incomplete, and the correction
matters more than the original finding.** The default here is **16** workers, not the 6 the
first write-up claimed. And once the cache is warm, uncapped runs do *not* fail broadly —
they fail **1–2 tests, the same role-switch test both times**. The select moves to Coach
while the URL and screen stay on the parent view: an interaction landing on server-rendered
HTML before the client-side `router.push` handler hydrates.

**So the worker cap fixes the environmental effect and masks a real one.** CI is uncapped
and will surface it. **A green local e2e run is not evidence this is gone.** Fixing it is
outstanding work — see section 5.

**Two more stray zero-byte files** (`0`, `bucket.id`) appeared in the repo root and were
cleared before commit. That is the third and fourth instance. The standing check before
every commit is real: `Get-ChildItem -File | Where-Object { $_.Length -eq 0 }`.

---

## 4b. What the cold audit found that this document had wrong

A Codex audit read the plan and the repository, deliberately not this document, and its
verdict was **Phase 15 not accepted**. That is correct. Three corrections, all now applied:

- **The vitest suite was red and this document called it green.** `preflight-supabase.mjs`
  queried the password-hash column on `auth.users`, and
  `tests/unit/no-committed-credentials.test.ts` bans any tracked mention of that column's
  name — writing it is how a seed starts shipping a password, and the rule cannot
  distinguish a read from a write. *(This paragraph originally spelled the column out and
  turned the suite red a second time. The guard is blunt on purpose; describe it, do not
  name it.)* **Cause: vitest was run
  before the script was written and never again.** Typecheck and lint were re-run; the
  suite was not. That is the exact failure section 4 of this document warns about, made by
  the document's own author, one file away from the warning. The check was removed rather
  than allowlisted — an allowlist entry would exempt the file from every credential rule.
- **"Eighteen checks" was conditional.** Thirteen are unconditional. Corrected in section 3.
- **The worker-cap diagnosis was overstated.** Corrected in section 4.

Two further weaknesses it found in the preflight, both now fixed: an "applied ledger is in
ascending order" check that asserted Postgres can sort (the query already ordered the rows),
and a service-role-key leak check that compared against an empty string when no key was set,
passing for every environment including a leaking one. **Both were checks that could not
fail.** That is worse than no check, because it reports a safety nobody verified — the same
shape as the four capability defects in Phase 1.

## 5. What is left, in order

**15a — point at the designated staging project.** `npx supabase link --project-ref
mxpuicrkfnyychmwqhus`. Confirm SMTP first: mail is load-bearing because magic links are the
only way in, and this is the setting between a test run and real email leaving.

**15e step 3, brought forward — push `0023` to `0030`.** `npx supabase db push`, the whole
batch, filename order, never cherry-picked. This is now the *rehearsal* rather than the
irreversible act, which is the entire benefit of the relabel decision. Then
`npm run preflight:db -- --linked` and expect 18 green.

**Fix the role-switch hydration race.** Reproducible uncapped, twice, same test. It will be
red in CI, which is uncapped. Either the app must not accept the interaction before the
handler is live, or the test must wait for hydration rather than for the element. Prefer the
first if the race is reachable by a real user on a slow phone — that is a product defect,
not a test defect, and the worker cap is currently hiding it.

**15c — build the signed-in journey suite. This is the largest remaining piece and it does
not exist.** New suite, not an extension of the demo one, because demo mode renders the demo
screens. Six steps: coach creates a fixture → parent replies available → coach publishes a
squad → parent sees their child's place → coach reschedules → parent sees what changed.
Then the role-tier pass across the four identities, each proving something different — see
the plan's table.

Magic links are the only sign-in route, so the suite must intercept mail. Locally that is
Mailpit on `:54324`; against the hosted project it is whatever catcher SMTP points at.
**[VERIFIED]** The four identities exist and are confirmed on the local stack.

**15d — loop to three consecutive green from a fresh reset.** Escalate on the same test
failing three iterations running. **Hard stop if going green would need an RLS or
safeguarding change** — that rule survives the staging decision entirely and is the one
thing here that is not negotiable.

## 6. Three things that are correct and look broken

Unchanged from the plan, repeated because they cost sessions: the polls card marked
**"Closed"** with no form is right (seeing *nothing* is the regression); there is **no
calendar feed link** on the parent schedule; there is **no "mark as read"** control on parent
announcements. All three are deliberate.
