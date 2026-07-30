# Task 12b and Task 13 handoff: season rollover, then the Phase 1 gate

**Written 2026-07-30**, after Task 12 completed on
`claude/task-12-permission-blockers-d85cb6`. These two tasks are handed off together
because 12b is small and 13 gates everything: doing 12b without immediately running
13 leaves yet another task unverified in a browser.

## Marking convention

- **[VERIFIED]** — read from the file and line cited, in the session that wrote this.
- **[INHERITED]** — carried from an earlier plan and **not** re-checked. A lead, not a
  fact.
- **[DECISION]** — genuinely ambiguous. Ask, or state your assumption loudly.

Two of the most specific claims in an earlier handoff were wrong, and both were
inherited. Task 12 then found a third: the Phase 1 plan asserted `announcements:manage`
was enough to publish, when the RPC actually gated on `messages:manage`. Assume the
remaining inherited claims contain at least one more.

---

## 0. FIRST: consolidate the branches

**[VERIFIED]** Work is currently spread across three branches, all in one clean
lineage, none pushed:

```
claude/task-12-permission-blockers-d85cb6   90910f4   Task 12      (+2 on the below)
claude/grassroots-website-build-f6feed      b5b9202   Tasks 6-11   (+23 on origin/main)
main / origin/main                          ea855c4   PR #6
```

**[VERIFIED]** `b5b9202` is an ancestor of `90910f4`, and `main` has zero commits
absent from either. Nothing has diverged and nothing was lost. GitHub has seen none
of it — the working branch does not exist on origin.

Before starting 12b:

```bash
git checkout claude/grassroots-website-build-f6feed
git merge --ff-only claude/task-12-permission-blockers-d85cb6
```

That is a clean fast-forward. Then decide with the human whether to push and open a
PR, or fast-forward `main` locally. **Pushing is outward-facing — confirm first.**

### Baseline after the merge

Reproduce before changing anything; stop and report if it differs. **[VERIFIED]** at
`b5b9202`, plus whatever Task 12 added:

| Check | Expected at `b5b9202` | After the Task 12 merge |
|---|---|---|
| `npm run test:db` | 489 pgTAP / 13 files | more, and one extra file (`announcement_publishing.sql`) |
| `npx vitest run` | 519 / 105 files | more |
| `npm run typecheck` | clean | clean |
| `npm run lint` | clean repo-wide | clean repo-wide |

Record the real numbers before you touch anything. They become 13's gate.

---

# TASK 12b: SEASON ROLLOVER

A club-admin flow. It belongs on the club operations `seasons` screen, not the coach
composer.

## 1. The schema you are working with

**[VERIFIED]** `supabase/migrations/0001_identity_tenancy.sql:129`:

```sql
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default false,
  ...
  unique (organisation_id, name),
  check (ends_on >= starts_on)
);
```

**[VERIFIED]** `0002_people_households.sql:4` and `:17`:

```sql
create table public.age_groups (
  id, organisation_id, name,                    -- unique (organisation_id, name)
  minimum_age smallint check (between 3 and 18),
  maximum_age smallint check (between 3 and 18),
  check (maximum_age >= minimum_age)
);

create table public.teams (
  id, organisation_id,
  season_id uuid not null,                      -- FK (season_id, organisation_id)
  age_group_id uuid not null,                   -- FK (age_group_id, organisation_id), on delete RESTRICT
  name text not null check (length 2..100),
  status text default 'active' check (in ('active','inactive')),
  unique (organisation_id, season_id, name)
);
```

Note `unique (organisation_id, season_id, name)`. Cloning "Under 11s" into a *new*
season does not collide, because the season is part of the key. That is what makes
rollover a straight insert rather than a rename dance.

## 2. Authorisation: no RPC needed

**[VERIFIED]** `0002_people_households.sql:401-402` — `teams` carries a direct write
policy requiring **organisation-scoped `teams:manage`**:

```sql
using (public.has_capability(organisation_id, 'teams:manage', 'organisation', organisation_id, null))
with check (public.has_capability(organisation_id, 'teams:manage', 'organisation', organisation_id, null))
```

**[VERIFIED]** `0020_role_model.sql:45` states `teams:manage` is deliberately absent
from the `team_staff` array: "only club administrators create teams". So club-admin
and owner can insert teams directly and a coach cannot.

**This means 12b should need no migration.** But that is exactly what the Phase 1
plan said about Task 12, and Task 12 needed 0029. **So prove it before you build it.**

### Assertions to write first

Add to `supabase/tests/` (new file, or extend `role_read_access.sql`):

1. A club-admin can INSERT a team into a different season → `00000`
2. A coach cannot INSERT a team → `42501`
3. A club-admin cannot INSERT a team into another organisation → refused
4. A club-admin can read `seasons` and `age_groups` (they populate the form — this is
   the 0026 defect class, and the one most likely to bite)
5. Cloning a team name that already exists **in the target season** is refused by
   `unique (organisation_id, season_id, name)`

Write refusals as INSERTs asserting exact SQLSTATE via `probe_sqlstate`. An
UPDATE-based refusal assertion passes whether or not the policy holds — RLS filters
an UPDATE, it does not refuse it.

## 3. The age-group advance, which is the fiddly part

Last year's Under 10s become this year's Under 11s. There is no `next_age_group_id`
column, so the advance must be derived.

**[VERIFIED]** `age_groups` carries `minimum_age` and `maximum_age` per row, unique on
`(organisation_id, name)`. So the natural rule is: for a team in an age group with
`minimum_age = N`, find the age group in the same organisation with
`minimum_age = N + 1`.

**[DECISION] What happens when no such age group exists.** The oldest cohort has
nowhere to advance to. Three defensible answers:

- skip those teams and report them, so a human decides
- clone them into the new season at the same age group
- refuse the whole rollover until the club creates the age group

Recommend the first: it is reversible, and silently leaving an Under 18 side at Under
18 could be right or wrong depending on the club.

**[DECISION] The team name.** `teams.name` is free text ("Under 11s"). If the age
group advances, the name almost certainly should too, but deriving "Under 11s" from
"Under 10s" by string surgery is guesswork that breaks on "Juniors A" or "Colts".
Recommend: default the new name to the **new age group's name**, and show every
proposed name in a preview the club-admin can edit before committing. Never rename
silently.

**[DECISION] Do rosters come too?** The Phase 1 handoff says "cloning last season's
teams ... staff can move teams around manually afterwards", which reads as teams
only, not `team_memberships`. But a cloned team with no players is close to useless,
and a club rolling over 12 sides will not re-add 150 children by hand. **Ask the
human.** If rosters do come, `team_memberships` needs the same treatment and each
child's age must be re-checked against the new age group.

## 4. The flow

1. Club-admin picks a source season and a target season on the `seasons` screen
   (create the target if it does not exist — `seasons` needs its own insert path)
2. Show a **preview**: every team that would be created, its new age group, its new
   name, and anything that cannot advance
3. On confirm, insert the teams
4. **[VERIFIED]** Then one team-scoped announcement per team, through the
   `publishAnnouncement` extension Task 12 added. Do not insert `announcements` rows
   directly: the RPC sets `authored_by_membership_id` from `auth.uid()` and the AFTER
   trigger `enqueue_published_announcement_deliveries`
   (`0008_release_hardening.sql:516`) fans out recipients and
   `communication_deliveries` for free.

**Idempotency matters here.** A club-admin who double-clicks must not create two
seasons' worth of teams or send two announcements per team. The
`unique (organisation_id, season_id, name)` constraint gives natural protection on the
teams; the announcements have none. Consider doing the whole rollover in one RPC so it
is atomic, which also solves the "half the teams cloned then it failed" case.

**[DECISION]** Direct inserts in a server action versus one `roll_over_season` RPC.
Recommend the RPC purely for atomicity, even though authorisation does not require it.

## 5. Where it goes

**[INHERITED, not re-checked]** The club operations `seasons` screen, reached through
`clubOperationsSections` in `app/app/[workspace]/[section]/page.tsx:140-144`. Confirm
what `seasons` currently renders before adding to it.

---

# TASK 13: THE PHASE 1 GATE

The honest gap. **Nothing built since the baseline has been seen in a browser** —
Tasks 6, 6b, 7, 8, 9, 10, 11, 12 and 12b are verified only by pgTAP and Vitest. This
is the largest risk the project carries.

## 1. Automated checks

```bash
npm run test:db      # every pgTAP file
npm run typecheck
npx vitest run
npm run lint         # must be clean repo-wide, fixed in edc515e
npm run build        # production build - NOT yet run this whole phase
```

**[VERIFIED]** `npm run build` has not been run since the baseline. It is the check
most likely to surface something new, because it is the only one that exercises the
Next.js production compiler and the `APP_ORIGIN` build guard.

## 2. End to end

**[INHERITED]** Run with `NEXT_PUBLIC_DATA_MODE=demo` and `--workers=2`, or the dev
server starves and you get spurious `page.goto` timeouts. This is a specific,
expensive-to-rediscover fact; trust it until it fails.

```bash
npx playwright test --workers=2
```

**[INHERITED]** Extend `tests/e2e/core-football.spec.ts` to walk the full weekly loop:
coach creates a fixture → parent replies available → coach selects and publishes a
squad → parent sees their place.

## 3. The browser pass, per role tier

**Against local Supabase. Never production.**

Sign in as each seeded identity and walk their screens, confirming nobody meets a
denial wall:

| User | Role | Watch for |
|---|---|---|
| `alex.morgan@example.test` | guardian, 2 children | The child selector. Only Alex has two children (`…0601` on Under 11s, `…0602` on Under 7s), so Alex is the **only** identity that renders it |
| `sam.taylor@example.test` | coach of Under 11s, also a guardian | The dual identity. Check `?role=parent` shows only their own child, not the squad |
| `priya.shah@example.test` | club-admin, pitch, facilities, fixtures | The fixture form dropdowns — this is what 0026 fixed |
| `morgan.lee@example.test` | platform-operator | Should see **no** club data. Asserted in `role_read_access.sql` section E |

### Three things you will see that are not bugs

**[VERIFIED] The polls section will look sparse.** The seeded poll `…1301` closed on
2026-07-24. After Task 11 it renders as a **closed** poll rather than vanishing, so
you should see a card marked "Closed" with no form. **That is correct output.** If you
see nothing at all, that is a regression.

**[VERIFIED] There is no calendar feed link** on the parent `schedule` section.
Deliberate: `private_calendar_tokens` stores only a digest, so the feed needs a
token-issuing path. Documented in Task 11 handoff section 9.

**[VERIFIED] There is no "mark as read" control** on parent announcements. Read state
renders from `announcement_recipients.read_at`; setting it is an outstanding write
path.

**[INHERITED]** Coach `team` may still be a JSON dump
(`production-core-overview.tsx`). Fix if the browser pass confirms it.

## 4. Deploy the migrations

**[VERIFIED]** Production is at **0022**. Undeployed: **0023 to 0029**, seven
migrations.

```bash
npx supabase db push
```

**Deploy all seven, in filename order. Never cherry-pick.** The CLI applies migrations
in order and records them in `supabase_migrations.schema_migrations`; skipping any
desynchronises that ledger against the real schema and breaks every future push. Every
pgTAP run has only ever exercised the complete sequence.

What they do, so the deploy is not a black box:

| | |
|---|---|
| 0023 | Team-scoped `book_pitch_for_event` RPC; drops two dead `facility_bookings` policies |
| 0024 | `events.opposition_contact_id`, so a fixture records its opponent |
| 0025 | `add_guardian_for_player` also creates the `guardian_permissions` row |
| 0026 | `holds_capability_anywhere` plus four SELECT policies, so team staff can read the pitch, venue, facility and opposition lists |
| 0027 | Guardian arm of the squad policies narrowed to published squads |
| 0028 | `announcement_recipients_publisher`, so an author can see deliveries |
| 0029 | Team-scoped announcement publishing (Task 12) |

Re-run `npm run test:db` after deploying and confirm the count is unchanged.

## 5. Order

1. Merge the branches (section 0)
2. Full automated suite, including `npm run build` — record the numbers
3. Extend the e2e spec, run it
4. Browser pass per role tier
5. Fix anything the browser found
6. Deploy 0023 to 0029, re-verify
7. Push, PR, merge to `main`

---

## Standing rules for both tasks

Assumptions become pgTAP assertions before they become code. Never authorise a write
from the `capabilities` array; use `requireCapability` from
`features/tenancy/authorise.ts`, always at team scope, and compare the form's
`organisationId` against the resolved one. Write-refusal assertions are INSERTs.
Assert exact SQLSTATE via `probe_sqlstate`. One task at a time, stopping between them.

**Environment.** `npx supabase start` first; Docker is not on the tool shells' PATH,
so prefix with
`$env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"`. Never
`supabase db reset` against production. `gh` is authenticated as `AKLondon1`. A
GateGuard hook denies the first Bash/Edit/Write per file: state the four facts and
retry the identical call. **Stray zero-byte files appear in the repo root** — two did
during Task 11 — so check `git status` and
`Get-ChildItem -File | Where-Object { $_.Length -eq 0 }` before every commit. Zod idiom
is **mixed**: match the file you are editing rather than applying a blanket rule.

## After Task 13

Phase 1 is done. Next is **Phase 1b, cross-club federation** — the largest single
piece of new architecture in the project and the only one with a genuine
child-safeguarding surface. It is a phase, not a task, and it needs a safeguarding
review before any of it ships. See Phase 1 handoff section 8.
