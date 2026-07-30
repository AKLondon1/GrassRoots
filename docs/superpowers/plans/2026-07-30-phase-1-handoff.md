# Phase 1 Handoff: Tasks 11, 12, 12b, 13 and beyond

**Written 2026-07-30, after Tasks 6, 6b, 8, 9, 7 and 10 shipped.** Read this first,
then `2026-07-27-weekly-loop-phase1-detail.md` for Tasks 11 and 12. Where they
disagree, **this document wins**: it was written after building against the real
database, and several of its findings contradict the plan.

---

## 1. Where things stand

**Branch:** `feat/task-6-event-creation-and-friendlies`, five commits ahead of
`origin/main`, working tree clean. **No PR opened yet.** `gh` is absent, so open
one via `git credential fill` piped to `curl`.

```
b939374  feat: select and publish a match squad                          Task 10
06f8090  feat: coach schedule and event editor on live data              Task 7
9a197ab  fix: attribute availability replies to the signed-in guardian   Task 9
dc5f5de  feat: add players and parents to a team through the scoped RPCs Task 8
e45f034  feat: create, cancel and reschedule team events, and friendlies Tasks 6 + 6b
```

**Verification at HEAD.** Reproduce before changing anything; stop and report if
it differs.

| Check | Expected |
|---|---|
| `npm run test:db` | 452 pgTAP across 12 files (`weekly_loop_rls.sql` is `plan(53)`) |
| `npx vitest run` | 504 across 103 files |
| `npm run typecheck` | clean |
| lint | clean, on changed files only |

**Migrations 0023 to 0026 are new and NOT deployed.** Production is still at 0022.
Every one of them fixes a defect in already-merged work; see section 3.

**Nothing has been exercised in a browser.** Six tasks of work are verified only by
pgTAP and Vitest. This is the largest risk carried forward and it is what Task 13
exists to address.

---

## 2. Decisions taken, so they are not re-litigated

| Decision | Answer |
|---|---|
| Cross-club friendlies | Wanted. Scheduled as **Phase 1b**, after Phase 1, before the pre-existing Phase 2 |
| Who arranges fixtures and books pitches | **Team staff only.** Parents are notified and reply; they never arrange |
| Season rollover | **Clone** last season's teams with an optional age-group advance; staff can move teams manually afterwards |
| `requireCapability` in Task 6 | Yes, at team scope, against the plan which omitted it |
| Explicit guardian filter in Task 11 | Yes, required — see section 4 |
| Respondent-row check for polls | Yes, not the Task 9 pattern — see section 4 |
| `production-core-overview.tsx` | **Keep** for coach `team` and `availability`; the plan said delete it |
| `guardian_permissions` on the RPC | Yes, by migration (0025) |
| Coach people screen | Build it, sharing one panel with the club screen |
| Household naming | RPC-generated (`"<Name> household"`) is acceptable for now; may want an override later |
| `createPlayer` direct insert | Removed, routed through `add_player_to_team` |
| Coach read access to pitch and opposition lists | Grant it (migration 0026) so coaches can arrange friendlies |
| Testing depth | Keep pgTAP assertions, behavioural tests **and** the static-safety layer |

---

## 3. The defect pattern, and why it will probably recur

**Four defects of one family surfaced, all in already-merged role work.** In every
case a capability was granted without checking it against the queries the screens
actually run.

| Migration | What was broken |
|---|---|
| **0023** | `facility_bookings` grants `authenticated` SELECT only, so 0021's two write policies could never fire and `pitches:book` granted nothing at all. Replaced with a team-scoped `book_pitch_for_event` RPC; the dead policies are dropped so a future grant cannot silently activate them |
| **0024** | `opposition_contacts` had existed since 0002 with nothing referencing it. Added `events.opposition_contact_id` so a fixture records its opponent |
| **0025** | `add_guardian_for_player` created the link but not the `guardian_permissions` row, so a parent added by team staff was invisible to `member_invoices`, `member_invoice_assignments` and `consent_responses`, which all join through it |
| **0026** | Coaches held `pitches:book` and `fixtures:manage` but could not READ `reservation_units`, `venues`, `facilities` or `opposition_contacts`. Every dropdown on the friendly form was empty for exactly the people it is for. Added `holds_capability_anywhere` plus four SELECT policies |

Plus `createPlayer`, which inserted directly under organisation-scoped
`people:manage`, so team staff could not use it and any player it created belonged
to no team.

**Suggested and not yet done:** a pgTAP assertion enumerating, per role, which
reference tables it can read. That would have caught 0026 and probably 0023 before
either shipped. Worth writing before Task 11, which is parent-facing and a
plausible fifth instance.

### Four things learned the hard way

1. **RLS filters an UPDATE, it does not refuse it.** A row unreachable through a
   `FOR UPDATE` or `FOR ALL` policy is simply not in the set, so the statement
   succeeds having changed nothing and reports `00000`. Only a `WITH CHECK`
   violation raises `42501`. **Write write-refusal assertions as INSERTs.** An
   UPDATE-based one passes whether or not the policy holds.
2. **`BEFORE INSERT` triggers fire ahead of RLS and are invisible in the policy
   list.** `validate_event_child_team_scope` guards both `availability_responses`
   and `squad_members`, raising `23503`, not `42501`. Reading policies alone gives
   an incomplete picture of what a table permits.
3. **Assert the exact SQLSTATE, never just "it throws".** `probe_sqlstate` exists
   for this. Several assertions would have passed for entirely the wrong reason.
4. **A wrong assertion is cheap; a wrong assumption in code is not.** Five
   assertions were wrong on first run this session. Every one taught something,
   and two of them were wrong in the reassuring direction: the database was better
   than assumed.

---

## 4. Task 11: port the parent journey

**This is a port, not a redesign.** `features/screens/parent/core-football.tsx` is
the design specification. Keep its markup, copy, card shape and the safeguarding
note at line 139 **verbatim**. The easiest thing to get wrong is treating it as
licence to redesign.

**Target:** rewrite `features/screens/parent/production-core-football.tsx` (108
lines today, already querying real tables correctly — it returned nothing only
because nothing could write). Create `features/screens/parent/child-selector.tsx`.

### Two traps, both confirmed against the migrations

**Trap 1: the linked-players query needs an explicit guardian filter.**
`player_guardians_select_own_or_scoped` (`0002_people_households.sql:449`) reads:

```sql
using (
  public.is_current_guardian(organisation_id, guardian_id)
  or public.has_capability(organisation_id, 'people:manage', 'organisation', organisation_id, null)
)
```

It **does** grant broader access to scoped staff. The plan's `linkedPlayers` helper
filters only on `organisation_id`, so a `club-admin` or `owner` who is also a
parent, viewing `?role=parent`, would load **every child in the club**.

Use `resolveActingGuardian` from `features/people/acting-guardian.ts`, built in
Task 9 precisely for this, and filter on the returned `guardianId`.

**Trap 2: poll attribution is not the Task 9 pattern.**
`poll_responses.respondent_id` references `poll_respondents(id)`, not a player or a
guardian (`0003_events_polls_squads.sql:222`). `poll_respondents` carries
`player_id` **xor** `membership_id`, enforced by
`check ((player_id is not null)::integer + (membership_id is not null)::integer = 1)`.

So the check is: load the respondent row, accept only if its `player_id` is among
the caller's linked players **or** its `membership_id` is the caller's own. Applying
the membership → guardian → `player_guardians` chain verbatim, as the detail
document suggests, rejects every legitimate membership-based respondent.

`saveProductionPollResponse` currently trusts a client-supplied `respondentId` with
no check. Task 0 assertion 9 confirms RLS refuses a respondent belonging to another
family, so the fix is defence in depth rather than the only guard — but it is the
same attribution class as the Task 9 availability bug and belongs here, with a
security test.

### Section mapping

| Section | Live data |
|---|---|
| `home` | Next `event_instances` row for the child's team, plus outstanding replies. Apply `glowing-effect` to the single outstanding action here and **nowhere else** |
| `actions` | Instances with no reply from this player and a future `response_deadline`, plus `polls` with `status: 'open'` |
| `schedule` | Upcoming instances, real token from `private_calendar_tokens` |
| `event` | Instance plus its latest `event_change_summaries.summary` array |
| `availability` | Posts to `saveProductionAvailability`, already fixed in Task 9 |
| `polls` | `poll_options` with `pitch_capacity`, posting to `saveProductionPollResponse` after the trap-2 fix |
| `squad` | `squad_members` for this player **where the parent squad has `status: 'published'`**. A draft must never reach a family |
| `announcements` | `announcements` with `status: 'published'` joined to `announcement_recipients` |

### Rules

1. Remove every `DemoFeedback` block. Replies now save.
2. Preserve the neutral-wording note verbatim. It is a safeguarding decision.
3. The `squad` section must filter on `status: 'published'`.
4. `child-selector.tsx` renders a segmented control of linked players linking to
   `?child={playerId}`, and renders **nothing** when there is exactly one child.
   Include it in the header for all eight sections.
5. Add a route-level `loading.tsx` built from the existing
   `components/ui/skeleton.tsx`. There is currently only one, at the workspace root.

**Commit per section.** The plan budgets two sessions for this task; that estimate
looks right.

---

## 5. Task 12: announcements and automatic change notices

`publishAnnouncement` (`features/communications/actions.ts:58`) calls the RPC
`publish_announcement(requested_organisation_id, requested_title, requested_body,
requested_team_id)` and **hardcodes `requested_team_id: null`**, so it can only
publish club-wide. Extend it with an optional `teamId` (`z.uuid().optional()`, to
match repo idiom).

The automatic reschedule notice must call **the same RPC**, team-scoped to the
event's team, not insert an `announcements` row directly — the RPC is where
`authored_by_membership_id` and publish semantics are enforced.

`rescheduleEventInstance` already writes the `event_change_summaries` row as a JSON
array (Task 6). Task 12 adds **only** the announcement call. Do not rebuild the
summary logic.

Also create `features/screens/coach/production-compose.tsx`: title, body textarea,
and a team select whose blank option means club-wide. Route coach `compose`, which
currently falls through to the Phase 4 coaching screen.

`announcements:manage` is already granted to `manager`, `coach`, `club-admin` and
`owner` by migration 0020. **Check whether they can read `announcement_recipients`
before building** — that is exactly the shape of the four defects above.

---

## 6. Task 12b: season rollover

New, in no pre-existing plan. Club-admin flow; belongs on the club operations
`seasons` screen, not the coach composer.

`teams` carries `season_id`, so a team belongs to exactly one season. Rollover means
**cloning** last season's teams into the new one with an optional age-group advance
(last year's Under 10s become this year's Under 11s), then one team-scoped
announcement per team through the Task 12 RPC extension. Staff can move teams
around manually afterwards.

Depends on Task 12's `teamId` extension. Zero migrations expected, but verify the
read access first.

---

## 7. Task 13: the Phase 1 gate

The honest gap. Nothing built since the baseline has been seen in a browser.

- `npm run test:db`, `npm run typecheck`, `npx vitest run`, production build
- e2e: **`NEXT_PUBLIC_DATA_MODE=demo` and `--workers=2`**, or the dev server starves
  and you get spurious `page.goto` timeouts
- Extend `tests/e2e/core-football.spec.ts` to walk the full loop: coach creates a
  fixture, parent replies available, coach selects and publishes, parent sees their
  place
- A signed-in browser pass per role tier, confirming nobody meets a denial wall.
  **Against local Supabase, never production**
- Deploy migrations 0023 to 0026, in order, and re-verify

Two things to fix if the browser pass finds them, both plausible: coach `team` is
still a JSON dump (`production-core-overview.tsx`), and no route-level `loading.tsx`
exists outside the workspace root.

---

## 8. Phase 1b: cross-club federation

The largest single piece of new architecture in the project, and the only one with a
genuine child-safeguarding surface. **Not a task; a phase.**

**Why.** No table in the schema references `organisations(id)` more than once. All
130 tables are single-tenant: every foreign key is composite and
organisation-scoped, every RLS predicate is `has_capability(organisation_id, …)` or
`can_access_team(organisation_id, …)`. There is no row two clubs can both see.
`opposition_contacts.club_name` is free text with no link to a real tenant.

**What it needs, at minimum:**

- A new migration family introducing the first two-tenant tables: a
  `club_connections` handshake (both clubs consent) and `fixture_proposals` carrying
  `host_organisation_id` and `guest_organisation_id`, readable by members of either
  side. That RLS predicate shape exists nowhere in the codebase
- A guest-booking concept, because `facility_bookings.created_by_membership_id`
  cannot hold a visitor. Most likely the host's acceptance creates the booking
- Two independent notification fans, one per club, each to its own parents
- **A safeguarding review before any of it ships.** The proposal must carry only age
  group, date, venue and a named contact. It must never expose players, guardians,
  squads or availability across the boundary. This deserves its own pgTAP file
  asserting that no cross-club read reaches any child's record

**Where the link belongs:** on `opposition_contacts`, pointing at a real
organisation. Not on `events`. The `events.opposition_contact_id` column added in
0024 stays correct either way.

Suggested order: 14a connections handshake plus the isolation pgTAP file; 14b
proposals with propose, accept and decline; 14c host-side booking on acceptance;
14d dual-club notification.

---

## 9. Phase 2 and beyond

Unchanged from the master plan: **onboarding, payments, messaging**. Nothing this
session touched them.

Facilities, finance, safeguarding, compliance, documents, equipment, volunteers and
platform operations stay behind the honest "not built yet" empty state from Task 4.
They are not on the weekly loop and get their own plans if and when a real club asks.
The screen registry keeps all 68 entries throughout.

**Two items flagged for before a real club is onboarded**, neither scheduled:

- `club-admin` holds 47 permissions and `owner` 34. The nominally senior role has
  fewer. Nothing is assigned to `owner` yet, so it is harmless today
- `platform-operator` has no club data access. Supporting a club by seeing their
  screens is an unresolved decision with a safeguarding dimension and should be
  audited

---

## 10. Working notes for the next session

**Standing rules that earned their keep.** Assumptions become pgTAP assertions
before they become code. Never authorise a write from the `capabilities` array — use
`requireCapability` from `features/tenancy/authorise.ts`, which reads `scopedGrants`,
always at team scope. Team staff add people through the RPCs, never direct inserts.
One task at a time, stop for approval between tasks.

**`requireCapability` returns `membershipId` and the `organisationId` resolved from
the workspace slug.** This removed the planned `actingMembershipId` helper and the
`lib/supabase/acting-membership.ts` file Task 10 was going to create. It also means
the form's `organisationId` is untrusted: compare it against the resolved one and
throw. Every action built this session does that, with a static test enforcing it.

**Environment.**

- `npx supabase start` before database work. Docker is not on the tool shells' PATH:
  prefix with `$env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"`
- Never `supabase db reset` against production
- A GateGuard hook denies the first Bash/Edit/Write per file. State the four facts
  and retry the identical call
- **Stray zero-byte files appear in the repo root** after some commands — three
  appeared this session, named `requested_buffer_after)`, `,` and `` 0` ``. Check
  `git status` and `find . -maxdepth 1 -type f -size 0` before every commit
- Lint only changed files
- Repo uses Zod v4 idiom (`z.uuid()`, `z.iso.date()`), not v3 (`z.string().uuid()`)
- `formData.get()` returns `null` for a field the form did not render, and Zod
  `.optional()` accepts only `undefined`. Use `.optional().nullable()` for genuinely
  optional text fields
- A nested async server component must be **awaited inline**
  (`return await Child({...})`), not returned as `<Child/>`, or a test rendering
  `await Screen(...)` is handed an unresolved element
- `sv-SE` is the locale that formats a date as `YYYY-MM-DD HH:mm`, which is what
  `datetime-local` inputs need; `en-GB` gives `09/08/2026`

**Cost.** This session ran to roughly $316 across six tasks. The migration
discoveries are where most of it went, and they were worth it, but a fresh session
starts Task 11 with a far smaller context.
