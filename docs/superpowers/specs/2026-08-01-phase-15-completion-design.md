# Phase 15 completion design

**Date:** 2026-08-01  
**Status:** approved by the user after the cold audit  
**Baseline:** `d9055b9` on `claude/phase-15-test-commit-83a3ca`

## Goal

Close Phase 15 with evidence: remove the real role-switch hydration race, exercise the persistent weekly journey through passwordless browser sessions, automate three fresh local resets and full green gates, then rehearse migrations `0023`–`0030` on the designated staging project without resetting any remote database or merging PR #8.

## Ordering

1. Fix the role-switch hydration race.
2. Build the signed-in journey and four-identity role-tier pass.
3. Build and run the local-only three-green loop.
4. Confirm hosted catcher SMTP, link staging, push the complete migration batch, and run the read-only linked preflight.

The cold audit changed the handoff's ordering. A one-way hosted migration push cannot be the way a red local gate discovers its next defect.

## Role-switch hydration boundary

The race is reachable by a real user: server-rendered HTML exposes an enabled role selector before React has attached its `router.push` change handler. Under load the browser can change the visible option while the URL and screen remain on the previous role.

The product will render the selector disabled on the server and during the first client render, then enable it from a client effect. This keeps server and hydration markup identical and makes “enabled” the explicit signal that the handler is live. Playwright already waits for enabled controls, and a person on a slow phone cannot create the misleading half-switched state.

The two-worker local cap remains because the earlier cold-cache saturation evidence still exists. The fix is proved separately by repeated uncapped runs of the failing shell test and by at least one uncapped full suite.

## Signed-in Supabase suite

The persistent suite is separate from the demo suite:

- `playwright.supabase.config.ts` runs one desktop project, one worker, against a managed app at `http://localhost:3000`, matching the exact local Supabase redirect allowlist.
- `tests/e2e/support/mailpit.ts` polls Mailpit's HTTP API for a new message addressed to the requested identity, loads its body, and extracts the one-time confirmation URL.
- Sign-in starts at the actual GrassRoots form, submits the address, reads the caught message, follows the confirmation URL through Supabase Auth and `/auth/callback`, and only then enters the app.
- The suite is serial because the weekly journey deliberately persists state across coach and parent sessions.
- Every identity switch clears browser cookies and obtains a fresh magic link. No password, session token, service-role key, or storage state file is committed.

The journey uses a unique fixture title and future times:

1. Sam signs in as coach and creates an Under-11 fixture.
2. Alex signs in as parent, selects Jamie, and saves “available”.
3. Sam starts a squad, selects Jamie, saves, and publishes.
4. Alex sees Jamie's confirmed place and no other child's selection history.
5. Sam reschedules and changes the location.
6. Alex sees the updated event and its “What changed” summary.

The role-tier pass uses the same real sessions:

- Alex sees the Jamie/Maya child selector.
- Sam forces `?role=parent`, sees Rowan only, and gets no child selector.
- Priya opens the club fixture allocation screen and sees a populated fixture selector.
- Morgan cannot open a parent club-data screen and sees no player or fixture content.

## Three-green loop

`scripts/run-phase-15-loop.mjs` is deliberately local-only. It has no linked or database-URL option and invokes every Supabase operation with `--local`.

Each of three iterations:

1. Resets the disposable local database.
2. Reads local Supabase status and constructs process-only application variables.
3. Runs auth and database preflights.
4. Runs 522 pgTAP checks, Vitest, typecheck, lint, and a production Supabase-mode build.
5. Runs the demo Playwright suite at its controlled local worker count.
6. Runs the serial signed-in Supabase suite.
7. Writes a JSON evidence record under ignored `test-results/phase-15/` with commit, commands, exit codes, durations, and consecutive-green count.

The loop aborts on the first red result. It does not rerun a failure until somebody diagnoses and changes it, and it never loosens RLS or safeguarding behaviour. Three complete green iterations in one invocation are the success condition.

## Staging rehearsal

Hosted work starts only after the local three-green result.

1. Confirm in the Supabase dashboard that SMTP points to the designated catcher and that redirect/Site URL/Google settings match the intended staging deployment.
2. Link project `mxpuicrkfnyychmwqhus`.
3. Inspect the migration plan and push the whole pending batch in filename order.
4. Run the database preflight against `--linked` read-only.

No command may run `supabase db reset` against staging. No production project is created or modified. PR #8 stays unmerged until the resulting verdict is reviewed.

## Failure handling

- A missing or late Mailpit message fails with the recipient and timeout, never with secret values.
- A consumed or invalid magic link fails at the callback destination and is not retried with the same link.
- A server-action error fails the browser assertion at the step that caused it.
- The loop stops at the first failing command and preserves its evidence record.
- Any required RLS or safeguarding change is a hard stop for human review.
- Missing Supabase authentication or unconfirmed hosted SMTP blocks the staging step without weakening earlier local evidence.

## Non-goals

- No remote database reset.
- No direct push to `main` and no merge of PR #8.
- No password-based test login.
- No attempt to make repository SQL prove dashboard-only hosted configuration.
- No unrelated preflight refactor beyond what is needed by the ordered remaining work.
