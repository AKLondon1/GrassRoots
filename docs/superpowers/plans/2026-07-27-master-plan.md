# GrassRoots Master Plan

**Read this first.** It is the entry point for taking GrassRoots from a demo shell to an app a real team can use. It says which document to open when, how to verify the database without burning iterations, and which of the existing design assets to reuse.

## Document map

| Document | Read it when | Do not use it for |
|---|---|---|
| **This file** | Starting any session. Deciding what to do next. Questions about verification strategy, design reuse, or sequencing. | Task-level implementation detail. |
| `2026-07-27-production-weekly-loop.md` | Executing Phase 0 (Tasks 1 to 5) and Task 6. Understanding why the phases are ordered as they are. | Tasks 7 to 12; its versions there are superseded. |
| `2026-07-27-weekly-loop-phase1-detail.md` | Executing Tasks 6 to 12. Any question about column names, enum members, constraints or RLS. | Phase 0. Strategy. |

**Precedence:** where the detail document and the main plan disagree, the detail document wins. It was written after reading the migrations; the main plan was written before.

---

## 1. Verifying the database without iteration cycles

The concern was how many round trips against a live Supabase instance are needed to learn what the schema and RLS actually permit. The answer is **zero against production**, and probably one or two locally. Three facts make this true.

**You already have a pgTAP harness.** `supabase/tests/` contains nine SQL test files (`tenancy.sql`, `people_households.sql`, `events_polls_squads.sql`, `permissions.sql`, `coaching.sql`, `facilities.sql`, `invitations.sql`, `comms_finance_safeguarding.sql`, `release_hardening.sql`). They use `plan(n)`, `has_table`, `has_column`, `has_function` and `is(...)`. `events_polls_squads.sql` alone carries 26 policy and role assertions. This is a real database test suite and it is the right place to answer RLS questions.

**You already have local Supabase configured.** `supabase/config.toml` sets `project_id = "GrassRoots"`, API on 54321, database on 54322, migrations enabled and `seed.sql` wired in. The CLI resolves (`npx supabase --version` returns 2.110.0). Local runs need Docker.

**The migrations are the source of truth and they are in the repo.** Every fact in the detail document was read from them, not guessed. Nothing about the schema requires a live instance to discover.

### Do not give me production credentials

I do not need them, and sharing a service role key would be a bad trade regardless of convenience. It grants unrestricted read and write over every club's data including children's records, and it bypasses the RLS we are relying on for safety. Local Supabase gives unlimited free iterations with no such exposure.

If you later want a check against hosted infrastructure, use a **Supabase branch** rather than production, and even then prefer the anon key with a real signed-in test user, because that exercises RLS as a real member experiences it. A service role key would silently pass every policy check and tell us nothing.

### Task 0: one probe, all answers

Run this once, before Task 1. It converts an unknown number of debug cycles into a single run.

**Files:**
- Create: `supabase/tests/weekly_loop_rls.sql`
- Modify: `package.json` (add a `test:db` script)

- [ ] **Step 1: Add the script**

```json
"test:db": "supabase db reset && supabase test db"
```

- [ ] **Step 2: Write the probe**

Model it on the conventions already used in `supabase/tests/events_polls_squads.sql`. It must seed two organisations, a member holding `events:manage` and `squads:manage` in the first, and a guardian linked to one player. Then assert every write the weekly loop needs and every write it must refuse. Cover exactly these eight, because each is a place the plan would otherwise fail late:

1. A member with `events:manage` can insert `events`, `event_series` and `event_instances` for a team in their organisation.
2. The same member **cannot** insert an `event_instances` row for the other organisation.
3. Two teams in one organisation can each hold an event starting at the same instant **when each has its own series**, and the insert **fails** when both use a null `series_id`. This pins the `unique nulls not distinct (organisation_id, series_id, starts_at)` behaviour.
4. A linked guardian can insert and update their own `availability_responses` row, and cannot insert one for an unlinked player.
5. A member with `squads:manage` can insert and delete `squad_members`, and **cannot update** one. This pins the missing UPDATE policy.
6. Publishing a `squads` row requires `published_at` and `published_by_membership_id` together.
7. A guardian can select `player_guardians` rows for their own children only. This settles the open question about the `player_guardians_select_own_or_scoped` predicate.
8. Inserting `event_change_summaries` requires `events:manage` and a `summary` that is a JSON array.
9. What `poll_responses` permits: whether a linked guardian can upsert a response only for their own respondent, or whether RLS accepts any `respondent_id` in the organisation. The application action currently trusts client-supplied `respondent_id`, so this assertion decides whether the fix in Task 11 is defence in depth or the only line of defence.

- [ ] **Step 3: Run it**

```bash
npm run test:db
```

Expected: every assertion passes, **or** a specific named failure. A failure here is the cheapest possible outcome, because it identifies a required migration before any application code depends on the assumption.

- [ ] **Step 4: Record the result**

If any assertion fails, add a migration to `supabase/migrations/` fixing that policy, re-run, and note the change at the top of the detail document. Do not proceed to Task 1 with a failing probe.

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/weekly_loop_rls.sql package.json
git commit -m "test: assert every RLS permission the weekly loop depends on"
```

**Expected outcome:** based on reading the policies, all eight should pass and no migration should be needed. The probe exists to prove that cheaply rather than discover it expensively.

### Standing rule for the rest of the build

Any time an implementation assumes something about the database, the assumption goes into `weekly_loop_rls.sql` as an assertion **before** the application code is written. One `npm run test:db` then re-answers every question at once. That is what keeps iterations bounded.

---

## 2. Reusing the design assets you already built

I audited `components/`, `lib/brand.ts` and `app/globals.css`. Short version: **the valuable part is already in use across the app and was not wasted. The motion work is confined to the marketing page, and mostly should stay there.**

### Already load-bearing, keep using

| Asset | Where it is used |
|---|---|
| `app/globals.css`, 65 design tokens | Every production screen, via `text-ink`, `bg-surface`, `border-border-strong`, `text-primary-strong` and the rest |
| `components/ui/button.tsx` | Throughout the app and marketing |
| `components/ui/status.tsx` | Every screen that shows state, in both demo and production |
| `components/ui/empty-state.tsx`, `denied-state.tsx`, `error-state.tsx`, `state-message.tsx` | The section page and most production screens |
| `lib/brand.ts` | Shell header, metadata, marketing |

This is a genuine design system, and the new Phase 1 screens must build from it rather than introduce new patterns. Tasks 7, 10 and 11 all say so.

### Built, but currently reachable only from the marketing page

| Asset | Only consumer |
|---|---|
| `components/ui/glowing-effect.tsx` (193 lines, uses `motion`) | `components/marketing/feature-story.tsx` |
| `components/ui/container-scroll.tsx` (uses `motion`) | `components/marketing/product-showcase.tsx` |
| `components/marketing/hero.tsx`, `feature-story.tsx`, `product-showcase.tsx` | `app/page.tsx` |
| `components/ui/skeleton.tsx` | `app/app/[workspace]/loading.tsx` only |

### What to do about them

**Reuse `skeleton.tsx` widely. This is the clear win.** There is exactly one `loading.tsx`, at the workspace root. Every new Phase 1 screen is an async server component running real queries, so each deserves a route-level `loading.tsx` built from the existing skeleton. Add one per new route in Tasks 7, 10 and 11. This is free polish from an asset you already built, and on a parent's phone in a car park it is the difference between "fast" and "broken".

**Use `glowing-effect` in exactly one place: the parent's single outstanding action.** The demo's `ParentHome` already establishes one primary call to action, "Respond to availability" at `features/screens/parent/core-football.tsx:46`. Applying the glow to that one card, and nowhere else, makes the most important thing on the page unmistakable. Add it in Task 11's `home` section.

**Leave `container-scroll` on the marketing page.** It is a scroll-driven presentation device for a landing page. There is no equivalent moment inside the app.

**Resist decorating the rest.** This is the honest part: the risk is not that the effects were wasted effort, it is that retrofitting them into app screens now costs load time and attention for no benefit. Parents open this in a car park with one bar of signal to answer one question. The design tokens and state primitives are what make that feel good. Two motion effects will not, and importing `motion` into shared app components pulls a client bundle into what are currently server components.

**Net verdict:** nothing was wasted. The tokens and primitives carry the entire app. The marketing page is a real asset for selling this to clubs. One effect ports across, one loading primitive starts being used properly, and the rest stays where it belongs.

---

## 3. Sequencing and gates

```
Task 0    Database probe                      (this document)      1 run
  ↓  gate: all RLS assertions pass, or a migration is written and they pass
Tasks 1-5 Navigation and honest shell         (main plan)          ~1 session
  ↓  gate: multi-role member lands correctly, no fictional copy anywhere
Task 6    Event creation + series amendment   (main plan + detail) ~1 session
Task 8    Households, guardians, linking      (detail)
Task 9    Availability service + attribution  (detail)
Task 7    Coach schedule and event editor     (detail)
Task 10   Squad selection                     (detail)
Task 11   Parent journey port                 (detail)             ~2 sessions
Task 12   Announcements and change notices    (detail)
  ↓  gate: full weekly loop on real data, e2e green, production build passes
Phase 2+  Onboarding, payments, messaging     (future plans)
```

Execution order within Phase 1 is **6, 8, 9, 7, 10, 11, 12**, not numerical. Task 7 needs Task 9's service; Task 9 needs Task 8's guardian links.

## 4. Keeping cost and iteration bounded

Four rules, derived from what actually consumed effort so far:

1. **Assumptions become assertions before they become code.** One `npm run test:db` beats three failed deploys.
2. **Read the migration before writing the insert.** The detail document exists because doing this caught two constraints that would have failed at runtime and passed every mocked unit test.
3. **One task per session, reviewed before the next.** Each task ends at an independently testable deliverable. Batching them defeats the gates.
4. **Local Supabase, never production credentials.** Free iterations, no exposure.

## 5. Open items carried forward

1. The exact predicate of `player_guardians_select_own_or_scoped`, relied on in Task 11. **Task 0 assertion 7 settles this.**
2. What `poll_responses.respondent_id` references (player or guardian). Read its foreign key in `0003_events_polls_squads.sql` before wiring Task 11's polls section. **Task 0 assertion 9 settles what RLS permits.**

Resolved during final review (2026-07-27): `teams.status` exists (`'active' | 'inactive'`); `publishAnnouncement` is RPC-based and needs a small extension for team scoping (folded into Task 12); `saveProductionPollResponse` trusts client-supplied `respondent_id` — a real attribution defect, folded into Task 11 with the Task 9 pattern. `team_memberships` holds players, coaches and volunteers, so every expected-player count must filter `member_kind = 'player'` and `status = 'active'` (folded into Tasks 7 and 10). `tests/unit/application-shell.test.tsx` already exists, so Task 4 extends it rather than creating it, and the new `roles` prop on `ApplicationShell` should default to `[role]` so existing renders keep compiling.

## 6. What this plan does not cover

Facilities, finance, safeguarding, compliance, documents, equipment, volunteers and platform operations stay exactly as they are, behind the honest "not built yet" empty state introduced in Task 4. They are not on the weekly loop. They get their own plans if and when a real club asks. The screen registry keeps all 68 entries throughout.
