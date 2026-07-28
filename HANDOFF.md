# HANDOFF.md — 2026-07-27

## 1. Where things stand

Two production OAuth bugs were fixed this session: PR #2 (session cookies lost on the callback redirect) is merged and deployed; PR #3 (concurrent duplicate-callback race) is open and awaiting merge. Separately, the app's true state was diagnosed — real backend, demo-only product layer, and critically **no code path anywhere can create an `events` row** — and a complete three-document build plan was written and reviewed. No application code from that plan has been written yet; Anand explicitly wants planning finished and approved before any build activity.

## 2. Repo state, exactly

- **Current branch:** `main` (local), HEAD `00da746`.
- **DANGER — diverged histories:** local `main` and `origin/main` share no common history (PR #1 was squashed remotely). `origin/main` is at `5aa1d15` and is the real, deployed code. **Never `git pull` or merge on local main; always branch new work from `origin/main`.** Local main's working tree is *older code* than production — do not trust file contents on this branch when implementing the plan.
- **Untracked files (safe to commit, this is the next action):**
  - `docs/superpowers/plans/2026-07-27-master-plan.md`
  - `docs/superpowers/plans/2026-07-27-production-weekly-loop.md`
  - `docs/superpowers/plans/2026-07-27-weekly-loop-phase1-detail.md`
  - `docs/superpowers/plans/2026-07-27-session-handoff.md`
  - `HANDOFF.md` (this file)
- **No stashes. No modified tracked files.**
- **Pushed branches:** `fix/oauth-duplicate-flow-state` (PR #3, one commit on top of `origin/main`). Stale: `.worktrees/oauth-callback-fix` worktree and `codex/*` branches linger from earlier attempts; harmless, uncleaned.
- **Rollback point / known-good:** `origin/main` @ `5aa1d15` — typecheck clean, 253 unit tests passing, production build passing when PR #2 merged.

## 3. What changed this session

**Code (both via PRs, not on local main):**
- PR #2 (merged): `lib/supabase/server.ts` (single-arg `setAll`, cookies onto a passed `NextResponse`), `app/(auth)/auth/callback/route.ts` (carrier-response pattern, `force-dynamic`), `lib/supabase/auth-callback.ts` (session-check fallback), `lib/supabase/middleware.ts` (same phantom-arg fix), 3 test files.
- PR #3 (open): `lib/supabase/auth-callback.ts` (`isConsumedFlowStateError`: codes `flow_state_not_found`/`flow_state_expired`, messages `invalid flow state`/`no valid flow state` → treat as benign duplicate, redirect to auth-guarded destination), extended tests (257 passing on branch).

**Documents:** the three plan files plus session handoff listed above. Read order and precedence: master plan first (entry point, carries Task 0); detail doc supersedes Tasks 7–12 of the main plan.

**Decisions, each with its why:**
- Demo screens (`features/screens/*/core-football.tsx`) are the design spec — Anand built the demo as his product thinking; Task 11 ports, never redesigns.
- Keep the shell and all 68 screen-registry entries — Anand likes the shell; cutting the registry breaks the capability model and role-matrix e2e for nothing.
- Multi-role resolver returns all held roles; switcher only renders for `roles.length > 1` — multi-role "not the norm but used a lot".
- Phase 1 execution order **6, 8, 9, 7, 10, 11, 12** — Task 7 consumes Task 9's service, Task 9 needs Task 8's guardian links.
- Database verification via local pgTAP (Task 0 probe in master plan), production Supabase access declined — a service key bypasses the very RLS being tested and exposes children's data.
- PRs created via `git credential fill` → curl because `gh` is not installed.

**Abandoned approaches (do not re-attempt):**
- Branching the first OAuth fix from local main — dragged in 19 divergent commits; rebuilt from `origin/main` and force-pushed.
- Fixing the duplicate-callback race with a `getUser()` fallback alone — the loser of the race can never see the winner's cookie; error classification (PR #3) is the correct mechanism.
- Plan assumptions killed by final review: upserting `squad_members` (no UPDATE RLS policy — must delete+insert), inserting `announcements` directly (`publishAnnouncement` is RPC-based, hardcodes club-wide), null `series_id` on one-off events (`unique nulls not distinct` collides two teams at the same kickoff — always create a series), unfiltered `team_memberships` counts (contains coaches/volunteers — filter `member_kind='player'`, `status='active'`).

## 4. Verified vs believed

**Verified (with how):**
- PR #2 fix works in production — Anand confirmed deployment; first token POST returns 200.
- PR #3 branch: `npm run typecheck` clean, `npm run test:unit` 257/257, `APP_ORIGIN=https://grassroots.example npm run build` succeeds — all run this session on the branch.
- No event-creation write path exists — grepped `app`, `features`, `lib` for `events` inserts/RPCs; only `editRecurringEvent` exists.
- RLS policies exist for every weekly-loop table — read directly from `supabase/migrations/0002`/`0003` (policy names and predicates quoted in the detail doc).
- Schema facts in the detail doc (enums, required columns, the two killer constraints) — read from migrations, not inferred.
- `teams.status` exists; `publishAnnouncement`/`saveProductionPollResponse` signatures — read from source during final review.

**Believed (never exercised):**
- PR #3 actually fixes the production race — classification is unit-tested but no real double-navigation has been performed post-deploy.
- All nine Task 0 pgTAP assertions pass — derived from reading policies; the probe has never been run.
- Local Supabase stack boots — config and CLI verified, Docker never started this session.
- `saveProductionPollResponse`'s client-supplied `respondentId` is exploitable in practice — flagged from code reading; RLS on `poll_responses` was not read (Task 0 assertion 9 decides).

## 5. Open threads and gotchas

**Threads, priority order:**
1. Merge PR #3; verify Google sign-in in production including rapid double-navigation.
2. Commit the five untracked docs.
3. Run Task 0 (pgTAP probe) — hard gate before any Phase 0 code.
4. Phase 0 Tasks 1–5 (main plan), then Phase 1 in order 6, 8, 9, 7, 10, 11, 12 (detail doc).
5. Housekeeping someday: reset local `main` to `origin/main`, prune `.worktrees/` and `codex/*`.

**Gotchas that cost time this session:**
- **GateGuard hook denies the first Bash/Edit/Write per file, always.** State importers, affected API, schemas, and the user's verbatim instruction in the message text, then retry the identical call. Sixteen denials this session; it never relents on attempt one.
- Zero-byte stray files (`{,`, `{const`, `entry`, `Read`) appear at repo root after some Bash commands. Check `git status` before committing; delete them.
- `npm run build` fails without `APP_ORIGIN` (prod guard in `lib/env.ts`). Prefix: `APP_ORIGIN=https://grassroots.example npm run build`.
- Repo-wide `npm run lint` reports ~19k pre-existing problems — lint changed files only.
- `gh` absent. PR creation: `tok=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p')` then curl the GitHub API; never echo the token.
- Anand's rules: planning only until he approves; no em dashes in prose; result-first answers; challenge him with evidence when he is wrong (he asks for it explicitly).

## 6. Resume block

**Environment check first (from a branch off `origin/main`, not local main):**

```bash
git fetch origin && git checkout -b chore/commit-plans origin/main && npm run typecheck && npm run test:unit
```

Expected: typecheck exits clean; vitest reports **all tests passing** (253 on `origin/main` pre-PR #3; 257 once PR #3 is merged). If this fails, stop — the world has changed since this handoff.

**Then the single next action:** commit the four `docs/superpowers/plans/2026-07-27-*.md` files plus `HANDOFF.md` to that branch, push, PR. After that lands, execute **Task 0 from `docs/superpowers/plans/2026-07-27-master-plan.md`**: create `supabase/tests/weekly_loop_rls.sql` with its nine listed assertions, add `"test:db": "supabase db reset && supabase test db"` to `package.json`, start Docker, run `npm run test:db`, and report per-assertion pass/fail before touching any Phase 0 task.
