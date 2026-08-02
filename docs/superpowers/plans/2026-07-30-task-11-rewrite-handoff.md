# Task 11 handoff: the parent journey rewrite

> ## STATUS: COMPLETE at `ef64f8a`
>
> Task 11 is finished. All eight sections are ported and live in
> `features/screens/parent/sections/`, and `production-core-football.tsx` is dispatch
> only. **Sections 2, 3, 4 and 6 below describe work that is now done** and are kept
> for the reasoning, not as instructions.
>
> **Verification at `ef64f8a`:** 489 pgTAP across 13 files, 519 vitest across 105
> files, typecheck clean, `npm run lint` clean repo-wide.
>
> **What is genuinely outstanding** is in section 9 at the end. Read that and section
> 5 first; treat everything between as history.

**Written 2026-07-30**, after the Task 11 foundation and migrations 0027 and 0028
shipped. Read this, then `2026-07-30-phase-1-handoff.md` for anything it does not
cover. Where they disagree, **this document wins** for Task 11 specifically.

Everything below was verified against the running database in the session that wrote
it. Nothing here is inferred from the plan.

**Marking convention, learned the hard way.** Two claims in the first version of this
document were wrong, and both were among its most specific: a named column and a
named seed row. The lesson is not to write vaguer handoffs. It is that "I ran this
and saw it" and "the plan says so" are different kinds of statement, and prose
flattens them into one confident register. Anything asserted about the schema from
here on either cites the file and line it was read from, or says plainly that it was
inherited and unchecked.

---

## 1. Where to work

Branch `claude/grassroots-website-build-f6feed`, worktree
`.claude/worktrees/grassroots-website-build-f6feed`, three commits ahead of the Phase 1
handoff commit:

```
9a4a0cf  feat: hide draft squads from families, and show authors their deliveries
c743bfc  feat: resolve a guardian own children, and let them switch between them
ee60c0a  test: enumerate which tables each role can read
```

**Verification at HEAD.** Reproduce before changing anything; stop and report if it
differs.

| Check | Expected |
|---|---|
| `npm run test:db` | **489** pgTAP across 13 files |
| `npm run typecheck` | clean |
| `npx eslint <changed files> --max-warnings=0` | clean |

Migrations **0023 to 0028 are undeployed**; production is at 0022. Deploy them as one
batch at Task 13, after a browser pass. Do not cherry-pick: the CLI applies migrations
in filename order and skipping any desynchronises `supabase_migrations.schema_migrations`.

---

## 2. The job

Rewrite `features/screens/parent/production-core-football.tsx` (108 lines) against
live data, per child. **A port, not a redesign.**
`features/screens/parent/core-football.tsx` is the design specification: keep its
markup, copy, card shape and the safeguarding note at **line 139** verbatim.

**One commit per section.** Eight sections: `home`, `actions`, `schedule`, `event`,
`availability`, `polls`, `squad`, `announcements`. (`child` is Phase 4 development
and routes elsewhere, at `page.tsx:183`.)

### Do the scaffold first

The sections are not independent. They share one function body, one header and one
child resolution, so the first commit necessarily restructures the whole screen and
every later commit must still compile and pass. Budget accordingly.

```
const children = await loadLinkedChildren(db, organisationId);
const child = selectLinkedChild(children, requestedChildId);
// render <ChildSelector linkedChildren={children} selectedPlayerId={child.playerId}
//                       section={section} workspace={workspace} />
// in a shared header for all eight sections
```

Both helpers are in `features/screens/parent/linked-children.ts`, committed and tested
(`tests/unit/parent-linked-children.test.tsx`, 10 assertions).

### Three things that will bite

1. **`teamIds` is a list, not an id.** `team_memberships` has no per-player uniqueness
   and a child moved up an age group mid-season is ordinary. Filter events with
   `.in("team_id", child.teamIds)`, never equality.
2. **Never filter on `organisation_id` alone.** The existing line 60 does, and leans on
   RLS. That is trap 1: `player_guardians_select_own_or_scoped` has a `people:manage`
   arm, so a club administrator who is also a parent loads every child in the club.
   `loadLinkedChildren` already closes this; do not reintroduce it elsewhere.
3. **A nested async server component must be awaited inline**
   (`return await Child({...})`), not returned as `<Child/>`, or a test rendering
   `await Screen(...)` gets an unresolved element.

---

## 3. Section mapping

| Section | Live data |
|---|---|
| `home` | Next `event_instances` row for the child's teams, plus outstanding replies. Apply `glowing-effect` to the single outstanding action here and **nowhere else** |
| `actions` | Instances with no reply from this player and a future `response_deadline`, plus open `polls` |
| `schedule` | Upcoming instances, real token from `private_calendar_tokens` |
| `event` | Instance plus its latest `event_change_summaries.summary` array |
| `availability` | Posts to `saveProductionAvailability`, already correct since Task 9 |
| `polls` | See section 4. This is the one with a trap |
| `squad` | `squad_members` for this player where the squad is published |
| `announcements` | `announcements` with `status: 'published'` joined to `announcement_recipients` |

### Rules

1. Remove every `DemoFeedback` block. Replies now save.
2. Preserve the neutral-wording note at `core-football.tsx:139` verbatim. It is a
   safeguarding decision, not copy.
3. Keep the published-only filter on `squad`. See section 5.
4. `ChildSelector` in the header of all eight sections. It renders nothing below two
   children, so single-child families see no change.
5. Add a route-level `loading.tsx` built from `components/ui/skeleton.tsx`. There is
   currently only one, at the workspace root.

---

## 4. The polls trap ✅ HANDLED at `f798b90`

**Done.** `sections/polls.tsx` drops the deadline filter, renders a closed poll as
closed, and fetches options and respondents only for polls still open.
`isStillOpen` mirrors `can_access_poll_respondent` exactly and compares instants
rather than strings. `assertOwnsPollRespondent` closes the `respondentId` hole, with
five assertions in `tests/security/poll-attribution.test.ts`. The description below
is why, kept for the reasoning.

A poll can be **visible while its respondent rows are not**:

- `polls_view_team` (`0003_events_polls_squads.sql:1176`) applies **no deadline**.
- `can_access_poll_respondent` (`0003_events_polls_squads.sql:942`) requires
  `poll.status = 'open' and poll.closes_at >= now()`.

So after a poll closes, the poll still reads and every respondent row vanishes. The
section must render a closed poll **as closed**, not treat zero respondents as "no
polls".

Current line 77 filters `.eq("status","open").gte("closes_at", now)`, which hides the
poll entirely. That is the line to change.

**Your live test case is in the seed.** Poll `…1301` closed on **2026-07-24**, so it is
already in the past. Against a fresh `db reset` the polls section will look empty, and
**that is not a bug**. Assertions 19 and 20 in `supabase/tests/role_read_access.sql`
pin both halves: a guardian reads the respondent row of an open poll and cannot read
one of a closed poll.

Also still true from the Phase 1 handoff: **poll attribution is not the Task 9
pattern.** `poll_responses.respondent_id` references `poll_respondents`, which carries
`player_id` **xor** `membership_id`. Load the respondent row and accept only if its
`player_id` is among the caller's linked players **or** its `membership_id` is the
caller's own. `saveProductionPollResponse` currently trusts a client-supplied
`respondentId`; fixing that belongs here, with a security test.

---

## 5. What migrations 0027 and 0028 changed

Both landed in `9a4a0cf` and both change what the screens must do.

**0027, `squads` and `squad_members`.** The guardian arm of both view policies now
requires the squad to be published. A family can no longer reach a draft team sheet
through RLS. The **application filter stays** — it is now defence in depth rather than
the only guard. Team staff keep draft access through the `squads:manage` arm, which is
asserted, because narrowing that by accident would break squad selection for the coach.

**0028, `announcement_recipients`.** New policy `announcement_recipients_publisher`.
Whoever may publish an announcement may now see who it was delivered to:
organisation-wide for club administrators and the communications role, team-scoped for
a coach. This answers the question Task 12 was blocked on. A delivery row is a
membership id and a `read_at`; it reaches no child record and no other family.

**For Task 12, already established:** recipients are fanned out by the AFTER trigger
`enqueue_published_announcement_deliveries` (`0008_release_hardening.sql:516`), which
already branches on `new.team_id is null`. Extending `publishAnnouncement` with an
optional `teamId` therefore gets the fan-out and the `communication_deliveries` rows
free. Do not rebuild either.

---

## 6. Route wiring

`app/app/[workspace]/[section]/page.tsx`:

- Add `child?: string` to the `searchParams` type at **line 48**.
- Thread it into `ProductionParentCoreFootballScreen` at **line 186**.

`query` is already destructured at line 56, so this is two small edits.

---

## 7. Environment

- `npx supabase start` before database work. Docker is not on the tool shells' PATH:
  prefix with `$env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"`
- Never `supabase db reset` against production
- `gh` is installed **and authenticated** as `AKLondon1`
- A GateGuard hook denies the first Bash/Edit/Write per file. State the four facts and
  retry the identical call
- Check `git status` and `find . -maxdepth 1 -type f -size 0` before every commit
- Lint changed files only
- Zod v4 idiom (`z.uuid()`, `z.iso.date()`); `.optional().nullable()` for genuinely
  optional text fields, because `formData.get()` returns `null` and Zod `.optional()`
  accepts only `undefined`
- `sv-SE` formats a date as `YYYY-MM-DD HH:mm` for `datetime-local` inputs

**Standing rules.** Assumptions become pgTAP assertions before they become code. Never
authorise a write from the `capabilities` array; use `requireCapability` from
`features/tenancy/authorise.ts`, always at team scope, and compare the form's
`organisationId` against the resolved one. Write-refusal assertions are INSERTs, since
RLS filters an UPDATE rather than refusing it. Assert the exact SQLSTATE via
`probe_sqlstate`. One task at a time, stop for approval between tasks.

---

## 9. What is actually outstanding

Everything above section 5 is history. This is the live list.

### The private calendar feed, deliberately not built

`schedule` renders the agenda but carries **no "Private calendar feed" link**, and
that is a decision rather than an omission.

The original Phase 1 handoff said this section should show a "real token from
`private_calendar_tokens`". It cannot. That table stores `token_digest` and nothing
else (`0003_events_polls_squads.sql:339`, constrained to `^[0-9a-f]{64}$`), the
plaintext is never persisted, and the seeded digest is sixty-four `b` characters that
hash nothing. **There is no token to read, only a token to issue.**

Issuing one is the magic-link pattern already used for availability:

- generate a secret, hash it with `digestOneTimeToken` (`lib/security/one-time-token.ts`)
- insert `organisation_id`, `membership_id`, `token_digest`, `label` into `private_calendar_tokens`
- return the plaintext **exactly once**, which means an API route plus a client
  component, because a server component can never show it again

`app/api/availability/magic-links/route.ts` and
`components/availability/magic-link-issuer.tsx` are the working precedent. Before
building it, check whether a guardian can INSERT into `private_calendar_tokens` at
all: `role_read_access.sql` asserts the read, not the write, and that is exactly the
gap that produced migrations 0023 to 0026.

A link producing a broken feed would be worse than no link, because a parent would
trust it and stop checking the app.

### Marking an announcement read

`sections/announcements.tsx` shows New/Read from `announcement_recipients.read_at`
but cannot set it. The demo's "Mark as read in preview" button was removed with its
`DemoFeedback` block. Setting `read_at` is a write path and belongs with the
notification work, not smuggled into a port.

### Still true from before

Migrations **0023 to 0028 are undeployed**; production is at 0022. Deploy as one
batch at Task 13, after a browser pass. Do not cherry-pick — the CLI applies
migrations in filename order and skipping any desynchronises
`supabase_migrations.schema_migrations`.

Nothing in Task 11 has been seen in a browser. That remains the largest carried risk
and is what Task 13 exists for.

`gh` is installed **and authenticated** as `AKLondon1`.

---

## 8. After the rewrite

Task 12 (announcements plus automatic change notices, now unblocked by 0028), then 12b
(season rollover by cloning teams), then 13 (the Phase 1 gate: browser pass per role
tier against local Supabase, e2e with `NEXT_PUBLIC_DATA_MODE=demo` and `--workers=2`,
and deploying 0023 to 0028 in order).

---

## 9. Addendum, written after the scaffold landed

**Scaffold commit `86fb6e1`, "feat: give the parent journey one child at a time".**
Sections 1 to 8 above still stand except where corrected here.

### Where the work actually is

Not the worktree section 1 names. Branch `claude/task-11-handoff-rewrite-5ebb26`,
worktree `.claude/worktrees/task-11-handoff-rewrite-1261b4`, fast-forwarded from
`ebadd60`. `ea855c4` was an ancestor, so no history was rewritten and the
`grassroots-website-build-f6feed` worktree was not touched.

**Verification at `86fb6e1`**, all reproduced, not inferred:

| Check | Result |
|---|---|
| `npm run test:db` | 489 pgTAP, 13 files |
| `npx vitest run` | 514 across 104 files |
| `npm run typecheck` | clean |
| `npx eslint <changed files>` | clean |

`npm run lint` repo-wide fails on **two pre-existing warnings** in
`components/shell/role-switcher.tsx` (`getDefaultScreen`, `getScreenHref` imported and
unused). They are present at `ebadd60`, before any of this work. Lint changed files only,
or fix those two separately.

### Correction 1: the schedule section cannot read a real calendar token

Section 3 says `schedule` uses a "real token from `private_calendar_tokens`". It cannot.
That table stores `token_digest` only (`0003_events_polls_squads.sql:339`, constrained to
`^[0-9a-f]{64}$`), the plaintext is never persisted, and the seeded row at `seed.sql:449`
carries a placeholder digest of sixty-four `b` characters that is not the hash of anything.

**No code path in the repository issues one.** `resolve_private_calendar_token` only
resolves a digest that already exists.

So `schedule` has to *issue* a token, not read one: `randomBytes(32).toString("base64url")`,
store `sha256(token)` as the digest, render the URL once. The `calendar_tokens_own` policy
(`0003:1224`) already grants a member insert and select on their own row, so this needs no
admin client. The working pattern is `app/api/availability/magic-links/route.ts:33-37`.

### Correction 2: the seed has no poll respondents at all

Section 4 says assertions 19 and 20 pin both halves against seeded rows. They pin both
halves, but against rows **the test creates itself** (`…3002` open, `…3007` closed).
`select * from poll_respondents` against a fresh `db reset` returns **zero rows**.

Poll `…1301` is also still `status = 'open'` with `closes_at` of 2026-07-24, so it is past
its deadline rather than closed by status. Any fix must treat *either* condition as closed.

The practical consequence for whoever writes the polls section: after correcting the
deadline filter the seeded poll will render, and it will render **with no respondent row
and therefore no form**. That is the correct output for the seed, not a bug in the fix.

### What is left

Eight section commits, and the `saveProductionPollResponse` respondent-ownership fix from
section 4, which is still unaddressed. The line to change for the polls trap now lives in
`PollsSection` in `production-core-football.tsx`, not at the old line 77.
