# Task 12 handoff: announcements and automatic change notices

**Written 2026-07-30**, after Task 11 completed at `ef64f8a`. Read this first, then
`2026-07-30-phase-1-handoff.md` section 5 for the original framing. Where they
disagree, **this document wins**: section 5 contains an authorisation assumption that
is wrong, and building on it would waste a session.

## Marking convention

Every schema claim below is tagged:

- **[VERIFIED]** — read from the file and line cited, in the session that wrote this.
- **[INHERITED]** — carried from an earlier plan and **not** re-checked. Treat as a
  lead, not a fact.

This convention exists because two of the most specific claims in the previous
handoff were wrong, and both were inherited rather than verified.

---

## 1. Where to work

Branch `claude/grassroots-website-build-f6feed`, worktree
`.claude/worktrees/grassroots-website-build-f6feed`, HEAD `c56eab6`.

**[VERIFIED]** This branch contains everything on `main` plus all of Tasks 6 to 11.
`main` and `origin/main` are both at `ea855c4` and have **zero** commits absent from
HEAD. The working line is already unified; `main` is simply stale.

**Verification at HEAD.** Reproduce before changing anything; stop and report if it
differs.

| Check | Expected |
|---|---|
| `npm run test:db` | **489** pgTAP across 13 files |
| `npx vitest run` | **519** across 105 files |
| `npm run typecheck` | clean |
| `npm run lint` | clean repo-wide |

Migrations **0023 to 0028 are undeployed**; production is at 0022. Task 12 will add
0029. Deploy the batch at Task 13 after a browser pass, in filename order, never
cherry-picked.

---

## 2. The blocker: a coach cannot publish an announcement

**Read this before writing any UI.** The Phase 1 handoff says `announcements:manage`
is granted to manager, coach, club-admin and owner by migration 0020, and implies
that is enough. It is not. Three separate gates disagree:

**[VERIFIED] The RPC** (`0006_comms_finance.sql:178`):

```sql
if not public.has_capability(
  requested_organisation_id,'messages:manage','organisation',requested_organisation_id,null
) then raise exception 'not authorised' using errcode='42501'; end if;
```

It checks **`messages:manage` at organisation scope**, not `announcements:manage`.

**[VERIFIED] Who holds `messages:manage`** (`0006_comms_finance.sql:31` and `:47`):
only `owner` and `club-admin`. The permission's own description is "Moderate adult
group conversations" (`0006_comms_finance.sql:4`), so it was never meant to gate
publishing.

**[VERIFIED] The table policy** (`0006_comms_finance.sql:537`),
`announcements_manage`, requires organisation-scoped `announcements:manage` **or**
organisation-scoped `messages:manage`. A coach's `announcements:manage` is
**team-scoped** (`0020_role_model.sql:46-52`, the `team_staff` array), so it satisfies
neither arm.

**Consequence.** A coach or manager cannot publish an announcement by any route
today. The composer screen Task 12 is supposed to build would render, submit, and
raise `42501`. This is the fifth instance of the family that produced migrations 0023
to 0026: a capability granted without checking it against the code that consumes it.

### What migration 0029 has to do

Widen `publish_announcement` so team staff can publish **to their own team only**,
while club-wide publishing stays with owner and club-admin. Sketch, not final:

- `requested_team_id is null` → keep the existing organisation-scoped check
- `requested_team_id is not null` → accept
  `can_access_team(requested_organisation_id, requested_team_id, 'announcements:manage')`

Do the same for the `announcements_manage` policy, or a coach still cannot read back
what they published through the manage arm. **[VERIFIED]** They can read it via
`announcements_read` (`0006_comms_finance.sql:536`), whose second arm is published +
active membership + `is_team_audience`, so the parent-facing and coach-facing reads
already work. Only the write path is blocked.

**Assertions first, per the standing rule.** Add to
`supabase/tests/role_read_access.sql` or a new file: a coach can publish to their own
team, a coach cannot publish club-wide, a coach cannot publish to a team they do not
staff, and a club-admin can still do all three. Write the refusals as INSERTs or RPC
calls asserting exact SQLSTATE `42501` via `probe_sqlstate` — an UPDATE-based
assertion passes whether or not the policy holds.

---

## 3. Extending `publishAnnouncement`

**[VERIFIED]** `features/communications/actions.ts:58-66`. Line 63 reads:

```ts
const { error } = await db.rpc("publish_announcement", {
  requested_organisation_id: input.organisationId,
  requested_title: input.title,
  requested_body: input.body,
  requested_team_id: null,   // <- hardcoded
});
```

**[VERIFIED]** The RPC already accepts a fourth argument with a default
(`0006_comms_finance.sql:174`, `requested_team_id uuid default null`), and execute is
granted to `authenticated` (`:581`). So no signature change is needed, only the
caller and the authorisation check.

Add an optional `teamId` to the schema at line 59.

**[VERIFIED] Zod idiom is mixed in this file.** Line 69 uses `z.string().uuid()`,
while newer code uses `z.uuid()`. The earlier handoff stated the repo uses v4 idiom
as a blanket rule; that is not true file by file. **Match the file you are editing.**

`formData.get()` returns `null` for a field the form did not render and Zod
`.optional()` accepts only `undefined`, so a genuinely optional field wants
`.optional().nullable()`.

---

## 4. The automatic reschedule notice

**[INHERITED, not re-checked]** from Phase 1 handoff section 5:

- `rescheduleEventInstance` already writes the `event_change_summaries` row as a JSON
  array (Task 6). Task 12 adds **only** the announcement call. Do not rebuild the
  summary logic.
- The notice must call the **same RPC**, team-scoped to the event's team, rather than
  inserting an `announcements` row directly, because the RPC is where
  `authored_by_membership_id` and publish semantics are enforced.

**[VERIFIED]** The second point is sound: the RPC sets `authored_by_membership_id`
from `auth.uid()` at `0006_comms_finance.sql:179-182`, so a direct insert would have
to duplicate that and would bypass the capability check.

**[VERIFIED]** Task 11 already renders these summaries. `sections/event.tsx` reads
the latest `event_change_summaries` row and expects `summary` to be a JSON array of
`{field, from, to, reason?}` objects, the shape written at
`0004_facilities.sql:632`. If Task 12 changes that shape, the parent event screen
breaks silently — it skips entries it does not recognise rather than throwing.

---

## 5. The coach composer

**[INHERITED]** Create `features/screens/coach/production-compose.tsx`: title, body
textarea, and a team select whose blank option means club-wide. Route coach
`compose`, which currently falls through to the Phase 4 coaching screen.

**[VERIFIED]** `compose` is in both `coachCoreSections` and `phase4CoachSections` at
`app/app/[workspace]/[section]/page.tsx:137-138`, so it currently renders
`ProductionCoachingScreen` via the branch at `:177`. A new branch is needed **above**
that one, or the composer will never be reached.

The team select must only offer teams the coach actually staffs, and the blank
club-wide option must be hidden unless they hold organisation-scoped rights.
Otherwise the form offers an action the database will refuse, which is the same class
of problem as the empty dropdowns 0026 fixed.

---

## 6. What is already done, so it is not rebuilt

**[VERIFIED, migration 0028]** `announcement_recipients_publisher` lets whoever may
publish an announcement read its delivery rows: organisation-wide for club
administrators and the communications role, team-scoped for a coach. This answered
the question Phase 1 said to check before building. Note the asymmetry it creates
with section 2 above: **0028 already anticipated team-scoped publishing that the RPC
does not yet permit.**

**[VERIFIED]** Recipients are fanned out by the AFTER trigger
`enqueue_published_announcement_deliveries` (`0008_release_hardening.sql:516`), which
already branches on `new.team_id is null` and resolves the audience through
`team_audience_members`. A team-scoped announcement therefore gets its recipient rows
and its `communication_deliveries` rows for free. **Do not rebuild either.**

**[VERIFIED]** `sections/announcements.tsx` (Task 11) already renders read state from
`announcement_recipients.read_at`. It cannot **set** it — marking an announcement read
is an outstanding write path, noted in the Task 11 handoff section 9.

---

## 7. Standing rules

Assumptions become pgTAP assertions before they become code. Never authorise a write
from the `capabilities` array; use `requireCapability` from
`features/tenancy/authorise.ts`, always at team scope, and compare the form's
`organisationId` against the resolved one. Write-refusal assertions are INSERTs, since
RLS filters an UPDATE rather than refusing it. Assert exact SQLSTATE via
`probe_sqlstate`. One task at a time, stopping between tasks.

**Environment.** `npx supabase start` before database work; Docker is not on the tool
shells' PATH, so prefix with
`$env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"`. Never
`supabase db reset` against production. `gh` is installed and authenticated as
`AKLondon1`. A GateGuard hook denies the first Bash/Edit/Write per file: state the
four facts and retry the identical call. **Stray zero-byte files appear in the repo
root** — two did during Task 11 — so check `git status` and
`Get-ChildItem -File | Where-Object { $_.Length -eq 0 }` before every commit. Lint
changed files during work, and the whole repo before committing.

---

## 8. Suggested order

1. Reproduce the baseline.
2. Write the publishing-authorisation assertions. Watch them fail.
3. Migration 0029 widening `publish_announcement` and `announcements_manage`. Watch
   them pass.
4. Extend `publishAnnouncement` with `teamId`, with a unit test asserting the RPC
   receives it.
5. The coach composer, routed above the Phase 4 branch.
6. The automatic reschedule notice, calling the same RPC.

Steps 2 and 3 are the ones that make the rest possible. Doing them last would mean
building a screen against an action that cannot succeed.

---

## 9. After Task 12

**12b, season rollover.** Club-admin flow on the club operations `seasons` screen.
`teams` carries `season_id`, so rollover means cloning last season's teams into the
new one with an optional age-group advance, then one team-scoped announcement per
team through the extension above. Depends on Task 12. **[INHERITED]** zero migrations
expected — verify the read access first, given the pattern this document opens with.

**13, the Phase 1 gate.** Nothing built since the baseline has been seen in a browser.
Deploy 0023 to 0029 in order, e2e with `NEXT_PUBLIC_DATA_MODE=demo` and
`--workers=2`, and a signed-in browser pass per role tier against local Supabase,
never production.
