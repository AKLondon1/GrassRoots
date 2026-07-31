# GrassRoots: Phase 0 and Phase 1 complete

**Written 2026-07-31 at `77d4aa7`.** The single entry point for anyone picking this
project up. It replaces the five task-level handoffs in this directory as the thing to
read first; they remain for detail and for the reasoning behind specific decisions.

**Next: Phase 15**, `2026-07-31-phase-15-production-equivalent-gate.md`. Everything
below is what Phase 15 will be testing.

## Marking convention

- **[VERIFIED]** — measured or read from the cited file and line, this session.
- **[INHERITED]** — carried from an earlier plan, not re-checked. A lead, not a fact.

Four inherited claims have been proven wrong over this project: a calendar-token
column that does not exist, seed poll data that was never there, an
`announcements:manage` capability the publishing RPC never checked, and a documented
build command that could not pass. Every one was specific and confident. Assume this
document contains at least one more.

---

## 1. Status

**[VERIFIED]** Branch `claude/grassroots-website-build-f6feed`, HEAD `77d4aa7`. Local
`main` is at `ac32779` and needs moving forward. `origin/main` is at `ea855c4` — GitHub
has the feature branch but not the merged line.

| Check | Result |
|---|---|
| `npm run test:db` | **522** pgTAP across **15** files, PASS |
| `npx vitest run` | **558** across **109** files |
| `npm run typecheck` | clean |
| `npm run lint` | clean repo-wide |
| `npm run build` | needs `NEXT_PUBLIC_DATA_MODE` and a canonical HTTPS `APP_ORIGIN` — see `.env.production.example` |
| Playwright | passes, but **only reaches demo screens** — see section 6 |

**[VERIFIED]** 30 migrations exist. **`0023` to `0030` are undeployed; production is at
`0022`.** Deploy as one batch, in filename order, never cherry-picked: the CLI records
them in `supabase_migrations.schema_migrations`, and skipping any desynchronises that
ledger against the real schema and breaks every future push.

---

## 2. What the product is

A multi-tenant app for grassroots children's football clubs. One organisation is a
club; a club has seasons, age groups, teams, players, guardians and staff. The core
loop it now supports end to end:

> A coach creates a fixture → parents reply with availability → the coach picks and
> publishes a squad → parents see their child's place → the coach reschedules and an
> automatic notice goes out.

Four role tiers: **guardian** (parent), **team staff** (coach and manager, who hold an
identical permission set), **club administration** (club-admin and owner), and
**platform operator**. **[VERIFIED]** 68 screens are registered; the ones outside the
weekly loop deliberately render an honest "not built yet" empty state rather than a
fake.

---

## 3. What was built, in order

### Phase 0 — foundations

Identity and tenancy, the people and household model, events/polls/squads, facilities,
communications and finance, consent and safeguarding, release hardening. Migrations
`0001` to `0019`. A canonical role model landed in `0020`, with team-scoped people
management in `0022`.

### Phase 1 — the weekly loop

| Task | What shipped |
|---|---|
| **6, 6b** | Create, cancel and reschedule team events; arrange friendlies |
| **7** | Coach schedule and event editor on live data |
| **8** | Add players and parents to a team through scoped RPCs |
| **9** | Fixed availability replies being attributed to the wrong guardian |
| **10** | Select and publish a match squad |
| **11** | The parent journey, ported to live data, one child at a time — eight sections in `features/screens/parent/sections/` |
| **12** | A coach can publish an announcement to their own team |
| **12b** | Season rollover: clone a season's teams and rosters into the next |
| **13** | The Phase 1 gate. Found three blockers it could not fix |
| **14** | Magic-link sign-in, credential-free seeding, an honest build |

### The architecture that matters

**Everything is organisation-scoped.** **[VERIFIED]** No table references
`organisations(id)` more than once; every foreign key is composite and
organisation-scoped, and every RLS predicate is `has_capability(organisation_id, …)` or
`can_access_team(organisation_id, …)`. There is no row two clubs can both see. This is
why cross-club federation is a phase of its own and not a feature.

**Capabilities are scoped, and scope is the thing that bites.** `has_capability` takes
an explicit scope; `can_access_team` resolves team access including the guardian path
(an org-scoped guardian role plus a child on that team). `holds_capability_anywhere`
was added in `0026` for club-wide reference lists that carry no `team_id` to check
against, and is **read-only by design — never use it to authorise a write**.

**Team staff and manager are one permission set.** **[VERIFIED]** `0020` defines them
from a single `team_staff` array, with `teams:manage` deliberately excluded: only club
administrators create teams.

---

## 4. The defect family, and why it kept happening

**Eight migrations, `0023` to `0030`, all fixing one shape of mistake: a capability
granted without checking it against the queries or RPCs that consume it.**

| | What was broken |
|---|---|
| **0023** | `facility_bookings` granted SELECT only, so two write policies could never fire and `pitches:book` granted nothing. Replaced with a team-scoped RPC |
| **0024** | `opposition_contacts` had existed since `0002` with nothing referencing it. Added `events.opposition_contact_id` |
| **0025** | `add_guardian_for_player` created the link but not the permissions row, making a parent invisible to invoices and consents |
| **0026** | Coaches held `pitches:book` and `fixtures:manage` but could not READ the pitch, venue, facility or opposition lists. Every dropdown on the friendly form was empty for exactly the people it was for |
| **0027** | Squad view policies ignored publication status, so a family could read a draft team sheet |
| **0028** | No author could see who received an announcement |
| **0029** | The publishing RPC gated on organisation-scoped `messages:manage` — a permission described as "moderate adult group conversations" and held only by owner and club-admin. **A coach could not publish at all** |
| **0030** | Season rollover |

**The pattern is not carelessness.** It is a capability borrowed for a job it was not
named for, after which nobody re-read what it actually guarded. `messages:manage` in
`0029` is the clearest case.

**The countermeasure is `supabase/tests/role_read_access.sql`**, which enumerates, per
role, which tables that role can read. Reads need three outcomes, not two: a missing
GRANT raises `42501`, a missing policy returns zero rows, and only the third case
returns data. The middle case is the one that shipped four times, and `throws_ok`
cannot see it.

**Write assertions as INSERTs.** RLS *filters* an UPDATE rather than refusing it, so an
UPDATE-based refusal assertion passes whether or not the policy holds. Assert the exact
SQLSTATE via `probe_sqlstate`.

**`BEFORE INSERT` triggers fire ahead of RLS and appear in no policy list.** Reading
policies alone gives an incomplete picture of what a table permits.

---

## 5. Authentication, as of Phase 14

**[VERIFIED]** Two routes: Google OAuth (`lib/supabase/oauth.ts`) and **magic links
only** for email. **No password path exists, and none may be added — including for
tests.** The moment `signInWithPassword` exists for a test it exists for an attacker.

Consequences worth holding:

- This codebase never stores a password, so it never owns a reset flow, a strength
  policy, a breach check or a credential-stuffing surface.
- **The mail leg is load-bearing.** No mail, no sign-in — there is no fallback.
- **[VERIFIED]** `scripts/seed-auth-identities.mjs` mints what tests need using a
  service-role key read from the environment, never committed.
- **[VERIFIED]** `tests/unit/no-committed-credentials.test.ts` scans every tracked file
  on every run for credential shapes. It caught this document's own first draft. Do not
  add files to its allowlist to make it pass — that exempts them from every rule.

---

## 6. Things that look broken and are not

Carry these forward. Each one has cost, or nearly cost, a session.

- **The polls section shows a card marked "Closed" with no form.** **[VERIFIED]** The
  seeded poll closed on 2026-07-24. `polls_view_team` applies no deadline but
  `can_access_poll_respondent` requires the poll to be open, so a closed poll renders
  while its respondent rows are unreachable. Seeing *nothing at all* is the regression.
- **No calendar feed link** on the parent schedule. `private_calendar_tokens` stores a
  digest and never the plaintext, so the feed needs a token-issuing path on the
  magic-link pattern. Deliberately not built.
- **No "mark as read" control** on announcements. Read state renders from the delivery
  row; setting it is an outstanding write path.
- **Playwright does not reach the production screens.** **[VERIFIED]** Demo mode renders
  the demo ones, so a green run proves less than it appears to. Task 13 also found an
  assertion that had been failing since the baseline commit, unnoticed because
  Playwright went a whole phase without running. **A check absent from the loop is
  indistinguishable from a check that passes.**

---

## 7. What is deliberately not built

Facilities, finance, safeguarding, compliance, documents, equipment, volunteers and
platform operations keep their honest empty state. They are not on the weekly loop and
get their own plans if a real club asks.

Flagged, unscheduled: **[INHERITED]** `club-admin` holds 47 permissions and `owner` 34
— the nominally senior role has fewer, harmless today because nothing is assigned to
`owner`. And `platform-operator` has no club data access at all; whether support staff
should see a club's screens is an unresolved decision with a safeguarding dimension.

---

## 8. Environment

- `npx supabase start` before database work. **Docker is not on the tool shells'
  PATH**: prefix with
  `$env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"`
- **Never `supabase db reset` against a remote project**
- A Supabase MCP is connected as of 2026-07-31. `gh` is authenticated as `AKLondon1`
- A GateGuard hook denies the first Bash/Edit/Write per file: state the four facts and
  retry the identical call
- **Stray zero-byte files appear in the repo root** — three have appeared across these
  sessions. Check `git status` and
  `Get-ChildItem -File | Where-Object { $_.Length -eq 0 }` before every commit
- Zod idiom is **mixed**; match the file you are editing
- `formData.get()` returns `null` for a field the form did not render and Zod
  `.optional()` accepts only `undefined`, so genuinely optional text fields want
  `.optional().nullable()`
- A nested async server component must be **awaited inline**, not returned as an element
- `sv-SE` formats a date as `YYYY-MM-DD HH:mm`, which is what `datetime-local` needs
- Timestamps: `now` is `Z`-suffixed and PostgREST returns `+00:00`. **Compare instants
  via `Date.getTime()`, never strings**

---

## 9. Standing rules

Assumptions become pgTAP assertions **before** they become code. Never authorise a write
from the `capabilities` array — use `requireCapability` from
`features/tenancy/authorise.ts`, always at team scope, and compare the form's
`organisationId` against the resolved one. Team staff add people through RPCs, never
direct inserts. One task at a time, stopping for approval between tasks.

Handoffs mark every schema claim **[VERIFIED]** or **[INHERITED]**. This exists because
the four wrong claims in this project's history were all inherited and all read
identically to verified ones.

---

## 10. What Phase 15 must do

Read `2026-07-31-phase-15-production-equivalent-gate.md` in full. The short version:

1. **Do not run it against production.** Publishing an announcement fans out real
   delivery rows to every member of the audience. A looped weekly-loop test against
   production would message real parents about fixtures that do not exist, once per
   iteration. Target the permanent staging project instead.
2. Verify staging matches what Phase 14 configured, via the preflight script.
3. Run the full signed-in loop against `NEXT_PUBLIC_DATA_MODE=supabase`, per role tier.
4. Loop until **three consecutive green runs**. Escalate on repeated identical failure.
   **Hard stop if going green would need an RLS or safeguarding change** — that is the
   sixth instance of section 4's defect family waiting to happen.
5. Only then push, PR, and deploy `0023` to `0030` in order.

The largest carried risk is unchanged and worth stating plainly: **nothing built since
the baseline has been seen working signed-in in a browser.** That is what Phase 15 is
for.
