# Roles and Permissions

**Status: built and verified, R1 to R6 complete.** Sat between Phase 0 and Phase 1, because Task 11 ports the parent journey onto a screen no role could open.

Two findings emerged during the build that were not in the original plan, and both are recorded in section 3.4.

**Goal:** every member who signs in lands on a view they can use, sees only what their role should see, and every write is refused unless their role genuinely allows it.

---

## 1. Decisions taken

| Decision | Choice | Consequence |
|---|---|---|
| Manager vs coach | Two roles, **identical permissions** | The manager does the heavy lifting and may delegate to the coach. **A coach can therefore add parents too.** This widens the original "managers only" rule; it is deliberate. |
| Pitch booking | **Book slots only** | Club admin owns the pitch inventory. Needs one new capability, `pitches:book`, because today's `pitches:manage` also permits deleting pitches. |
| Adding parents | **Team-scoped, club admin can move** | Team staff add people only for their own teams. Requires team-scoped enforcement, which does not exist today. |
| Extra six roles | **Keep, unassigned** | `owner`, `treasurer`, `welfare-officer`, `pitch-admin`, `facilities-admin`, `fixture-secretary` stay defined and granted to nobody. No work now, no capability lost later. |

---

## 2. The model

Two layers, both already in the codebase. Neither is being re-architected.

**Navigation tiers** (`AppRole`, drives menus): `platform` → `club` → `coach` → `parent`.

**Database roles** (carry permissions, assignable at organisation or team scope):

| Tier | Role | Who | Scope |
|---|---|---|---|
| platform | `platform-operator` | You | organisation (the platform itself) |
| club | `club-admin` | Club owner or administrator | organisation |
| coach | `manager`, `coach` | Team staff, identical permissions | **team** |
| parent | `guardian` | Parents and carers | organisation, narrowed by child links |

A person may hold several roles; that already works and is exercised by the Phase 0 switcher.

---

## 3. What changes

### 3.1 Seven permissions that do not exist

Eight screens are gated on capability strings absent from `public.permissions`, so they are unreachable for everyone.

| Permission | Screens it unlocks | Granted to |
|---|---|---|
| `family:view` | `parent/home`, `parent/child` | `guardian` |
| `family:respond` | `parent/actions` | `guardian` |
| `messages:view` | `parent/messages` | `guardian` |
| `help:view` | `parent/help` | `guardian` |
| `club:view` | `club/overview` | `club-admin`, `owner` |
| `announcements:manage` | `coach/compose` | `manager`, `coach`, `club-admin`, `owner` |
| `fixtures:manage` | `club/fixtures` | `manager`, `coach`, `club-admin`, `owner`, `fixture-secretary` |

`parent/home` is Task 11's target and `coach/compose` is Task 12's. Without this, both phases build screens nobody can open.

### 3.2 One new permission

`pitches:book` — reserve an existing slot, without the power to create, edit or delete pitches. Granted to `manager`, `coach`, `club-admin`, `owner`, `pitch-admin`.

### 3.3 Corrections to existing grants

| Role | Change | Why |
|---|---|---|
| `manager` | **Remove** `teams:manage` | Only club admins create teams. Managers currently can. |
| `coach` | **Add** `invitations:manage` | Parity with manager, per the delegation decision. |
| `manager`, `coach` | **Add** `people:manage` at **team scope** | So team staff can add parents and players for their own team. |
| `manager`, `coach` | **Add** `pitches:book`, `announcements:manage`, `fixtures:manage` | Booking slots, sending updates, arranging fixtures. |
| `guardian` | **Add** `family:view`, `family:respond`, `messages:view`, `help:view` | Makes the parent journey reachable. |
| `club-admin`, `owner` | **Add** `club:view` | Makes the club landing screen reachable. |

### 3.4 Found during the build, not in the original plan

**New clubs had no roles at all.** `create_organisation` provisioned a single `owner`
role holding eight permissions, and nothing else. `club-admin`, `manager`, `coach` and
`guardian` existed only in `seed.sql`, for the demo organisation. A real club could not
appoint a coach or a parent, because there was no role to assign. The role model now
lives in `apply_standard_role_model()`, called both by the migration backfill and by
`create_organisation`, so existing and future clubs cannot drift apart. `owner` now
carries the full club set, which also settles the `owner` versus `club-admin`
discrepancy noted in section 7.

**Team staff had to be prevented from holding club-wide scope.** `people:manage` is what
lets team staff add parents, and the table policies check it at organisation scope. A
`manager` or `coach` assigned across the organisation would therefore have reached every
family in the club, which is the opposite of the intent. A trigger now refuses those two
roles at organisation scope. Resource and team scope are unaffected.

---

## 4. Enforcing team scope

`people:manage` is checked org-wide in RLS today (`players_manage_scoped`, `guardians_manage_scoped`, `player_guardians_manage_scoped`). Team scope cannot be enforced on a bare `INSERT`, because a new player belongs to no team at the moment it is written.

Follow the pattern already used by `create_match_day` and `edit_recurring_event`: `SECURITY DEFINER` RPCs that take the team as an argument and check access against it.

| RPC | Checks | Does |
|---|---|---|
| `add_player_to_team(team_id, first_name, last_name, date_of_birth)` | `can_access_team(org, team_id, 'people:manage')` | Inserts `players` + `team_memberships` atomically |
| `add_guardian_for_player(player_id, display_name, email, relationship)` | team access derived from the player's current team | Inserts `guardians` + `player_guardians` |
| `move_player_to_team(player_id, team_id)` | **organisation-scoped** `people:manage` | Club admin only, reassigns a player |

Direct-table policies keep the existing org-scoped rule, so a club admin retains full control and team staff go through the RPCs. That gives least privilege over children's records without loosening anything that exists.

---

## 5. Closing the write-path gap

`createSeason`, `createAgeGroup`, `createTeam`, `createPlayer` and `createOppositionContact` in `features/people/production-actions.ts` perform **no authorisation check**. They insert directly and survive only because RLS refuses underneath.

That is one policy edit away from silently breaking, with no test to catch it, and it contradicts the standing rule that every mutation verifies against `scopedGrants` rather than the navigation `capabilities` array.

Add an explicit check to each, mirroring the capability its RLS policy enforces. This is defence in depth: RLS stays the backstop.

---

## 6. Work breakdown

Each item ends at something independently testable.

- [x] **R1 — Migration: permission catalogue.** Insert the seven missing permissions plus `pitches:book`. Map all eight to roles, apply the section 3.3 corrections. Idempotent, matching the seed's `on conflict do nothing` style.
- [x] **R2 — Migration: `pitches:book` policy.** Let a holder insert and view `facility_bookings` for their own team, without touching pitch definitions.
- [x] **R3 — Migration: team-scoped people RPCs.** The three functions in section 4, with `revoke all ... from public` in line with `0017_service_function_privilege_hardening`.
- [x] **R4 — Capability checks on write paths.** Section 5, with unit tests proving each refuses a member who lacks the capability.
- [x] **R5 — Extend `weekly_loop_rls.sql`.** Assertions that: every capability referenced by the screen registry exists as a permission; a coach can add a parent to their own team but not another team; a manager cannot create a team; a club admin can move a player; a guardian cannot write any of these.
- [x] **R6 — Gate.** `npm run test:db`, `npm run typecheck`, `npm run test:unit`, e2e, production build, plus a signed-in browser pass per tier confirming nobody meets a denial wall.

R5 deserves emphasis: a pgTAP assertion that **no screen is gated on a non-existent permission** would have caught this class of bug before Phase 0 shipped, and stops it recurring.

---

## 7. Risks and open points

**A coach can add parents.** Stated again because it is the one place this model is broader than the original instruction. Reversing it later means splitting the manager and coach permission sets, which is a data change, not a code change.

**`club-admin` currently holds 47 permissions and `owner` 34.** The nominally senior role has fewer. Not addressed here because nothing is assigned to `owner` yet; worth resolving before a real club is onboarded.

**Platform access to club data is unchanged.** `platform-operator` holds 8 platform-level permissions and no club data access. If you want to support a club by seeing their screens, that is a separate decision with a safeguarding dimension, and it should be audited. Not in this plan.

**Seed vs live data.** These migrations grant permissions to roles inside each organisation. Confirm the intended behaviour for organisations created *after* the migration, since roles are seeded per organisation at bootstrap (`0016_organisation_bootstrap_idempotency.sql`).
