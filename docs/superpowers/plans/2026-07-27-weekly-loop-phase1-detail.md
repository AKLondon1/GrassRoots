# Phase 1 Detail: Tasks 7 to 12

> Companion to `2026-07-27-production-weekly-loop.md`. This document **supersedes** the condensed versions of Tasks 7 to 12 in that plan. Tasks 1 to 6 and 13 are unchanged there, except for the Task 6 amendment below.

> **Start at `2026-07-27-master-plan.md`.** Task 0 there is a pgTAP probe that asserts every RLS permission relied on below; it must pass before any of these tasks begin.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Execution order: 6, 8, 9, 7, 10, 11, 12.** Numbered by subject, built in dependency order.

---

## Verified schema facts

Every fact below was read from the migrations. Do not re-derive them, and do not assume anything not listed here.

**Enums** (`supabase/migrations/0003_events_polls_squads.sql:1-6`)

| Enum | Members |
|---|---|
| `event_kind` | `training`, `match`, `meeting`, `social` |
| `event_status` | `scheduled`, `cancelled`, `completed` |
| `availability_status` | `available`, `unavailable`, `unsure` |
| `poll_status` | `draft`, `open`, `closed`, `converted` |
| `squad_member_status` | `selected`, `standby`, `withdrawn` |

`squads.status` and `announcements.status` are text with check constraints, not enums: `draft, published, closed` and `draft, scheduled, published, archived` respectively.

**Required columns not obvious from the feature name**

- `availability_responses` requires `team_id`, `guardian_id` and `idempotency_key` (8 to 120 characters). Unique on `(organisation_id, event_instance_id, player_id)` and on `(organisation_id, idempotency_key)`.
- `player_guardians` requires `household_id` **and** `relationship` (2 to 60 characters). A household must exist before a guardian can be linked to a player.
- `event_change_summaries.summary` is `jsonb` constrained to `jsonb_typeof(summary) = 'array'`. Also requires `changed_by_membership_id` and `edit_scope` in `this, this-and-future, all`.
- `squads` published rows require **both** `published_at` and `published_by_membership_id` (check constraint). Unique on `(organisation_id, event_instance_id)`, so exactly one squad per event instance.
- `event_instances` cancelled rows require `cancelled_reason` (check constraint).
- `poll_options` carries `pitch_capacity`, which is the source of the demo's "capacity 10" text at `features/screens/parent/core-football.tsx:124-126`.

**Two constraints that will break naive implementations**

1. **`event_instances` has `unique nulls not distinct (organisation_id, series_id, starts_at)`.** Because nulls are *not distinct*, two standalone instances (`series_id` null) in the same organisation starting at the same moment collide. Under 11s and Under 13s both training at Saturday 09:00 is a unique violation. **Resolution: always create an `event_series` row, even for a one-off event**, with `recurrence_rule` left at its `{}` default. Each event then has a distinct non-null `series_id` and the constraint is satisfied naturally. This requires no migration. Task 6 as written in the main plan inserts a null `series_id` and **must be corrected**; see the Task 6 amendment below.

2. **`squad_members` has INSERT and DELETE policies but no UPDATE policy** (`0003_events_polls_squads.sql:1205-1206`). A Supabase `upsert` on this table fails under RLS. `setSquadMembers` must delete the squad's existing rows and insert the new set.

**Row level security: no migrations needed.** Every table on the weekly loop already has policies, all gated on `public.can_access_team(organisation_id, team_id, '<capability>')`:

| Table | Write capability |
|---|---|
| `events`, `event_series`, `event_instances` | `events:manage` |
| `event_change_summaries` | `events:manage` (insert only) |
| `availability_responses` | `availability:manage`, plus a linked-guardian insert and update policy |
| `squads`, `squad_members` | `squads:manage` |
| `players`, `guardians`, `households`, `player_guardians` | scoped manage policies |

This is the single biggest de-risking fact in the plan. The database is ready; only the application write paths are missing.

---

## Task 6 amendment: create a series for every event

Apply this to `features/events/production-actions.ts` from the main plan before proceeding.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/event-actions.test.ts
it("creates a series so two teams can start at the same time", async () => {
  const inserts = recordInserts();
  await createTeamEvent(formDataOf({
    organisationId: ORG, workspace: "riverside", teamId: TEAM_U11, kind: "training",
    title: "Under 11s training", locationName: "Riverside Pitch 2",
    startsAt: "2026-08-09T09:00", endsAt: "2026-08-09T10:30",
    responseDeadline: "2026-08-08T18:00",
  }));
  expect(inserts.tables()).toEqual(["events", "event_series", "event_instances"]);
  expect(inserts.row("event_instances").series_id).toEqual(expect.any(String));
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/unit/event-actions.test.ts` — Expected: FAIL, `series_id` is null.

- [ ] **Step 3: Implement**

Insert the series between the event and the instance:

```typescript
const { data: series, error: seriesError } = await db.from("event_series").insert({
  organisation_id: input.organisationId,
  event_id: eventId,
  team_id: input.teamId,
  time_zone: "Europe/London",
  starts_at: new Date(input.startsAt).toISOString(),
  ends_at: new Date(input.endsAt).toISOString(),
}).select("id").single();
if (seriesError || !series) throw new Error("The event schedule could not be created.");
```

Then add `series_id: (series as { id: string }).id` to the `event_instances` insert.

Note on the deadline rule: the database check is `response_deadline <= starts_at`, while the Zod refine in the main plan requires strictly before. Keep the stricter application rule; a deadline equal to kick-off is useless to a manager.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/event-actions.test.ts` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add features/events/production-actions.ts tests/unit/event-actions.test.ts
git commit -m "fix: give every event a series so concurrent team events do not collide"
```

---

## Task 8: Households, guardians and child linking

**Files:**
- Create: `features/people/guardian-actions.ts`
- Modify: `features/screens/club/production-operations.tsx` (`people` section, currently lines 127 to 131)
- Test: `tests/unit/guardian-actions.test.ts`, `tests/security/guardian-scoping.test.ts`

**Interfaces:**
- Produces:
  - `createHousehold(formData): Promise<void>` — fields `organisationId`, `workspace`, `name`.
  - `createGuardian(formData): Promise<void>` — fields `organisationId`, `workspace`, `displayName`, `email`.
  - `linkGuardianToPlayer(formData): Promise<void>` — fields `organisationId`, `workspace`, `householdId`, `playerId`, `guardianId`, `relationship`. Inserts `player_guardians`, then a `guardian_permissions` row with `communication: true` and every other flag false.
- Consumes: `createServerSupabaseClient`.

`guardians.email` has a check constraint `email = lower(email)`, so normalise with Zod `.toLowerCase()`. `guardians.status` defaults to `pending`; leave it, because the guardian becomes `active` when they accept their invitation. `guardians.membership_id` is nullable and unique per organisation, which is what allows a guardian record to exist before the parent has an account.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/guardian-actions.test.ts
it("lowercases the guardian email to satisfy the check constraint", async () => {
  const inserts = recordInserts();
  await createGuardian(formDataOf({
    organisationId: ORG, workspace: "riverside",
    displayName: "Alex Morgan", email: "Alex.Morgan@Example.ORG",
  }));
  expect(inserts.row("guardians").email).toBe("alex.morgan@example.org");
  expect(inserts.row("guardians").status).toBe("pending");
});

it("defaults a new link to communication-only permissions", async () => {
  const inserts = recordInserts();
  await linkGuardianToPlayer(formDataOf({
    organisationId: ORG, workspace: "riverside", householdId: HOUSEHOLD,
    playerId: PLAYER, guardianId: GUARDIAN, relationship: "Mother",
  }));
  expect(inserts.row("guardian_permissions")).toMatchObject({
    communication: true, payments: false, consent: false,
    emergency_contact: false, restricted_contact: false,
  });
});

it("rejects a relationship shorter than the database allows", async () => {
  await expect(linkGuardianToPlayer(formDataOf({
    organisationId: ORG, workspace: "riverside", householdId: HOUSEHOLD,
    playerId: PLAYER, guardianId: GUARDIAN, relationship: "M",
  }))).rejects.toThrow();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/unit/guardian-actions.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```typescript
"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const context = { organisationId: z.string().uuid(), workspace: z.string().min(1).max(120) };

async function database() {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("Sign in to manage families.");
  return client as unknown as SupabaseClient;
}

export async function createHousehold(formData: FormData) {
  const input = z.object({ ...context, name: z.string().trim().min(2).max(120) })
    .parse(Object.fromEntries(formData));
  const { error } = await (await database()).from("households")
    .insert({ organisation_id: input.organisationId, name: input.name });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/people`);
}

export async function createGuardian(formData: FormData) {
  const input = z.object({
    ...context,
    displayName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
  }).parse(Object.fromEntries(formData));
  const { error } = await (await database()).from("guardians").insert({
    organisation_id: input.organisationId,
    display_name: input.displayName,
    email: input.email,
    status: "pending",
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${input.workspace}/people`);
}

export async function linkGuardianToPlayer(formData: FormData) {
  const input = z.object({
    ...context,
    householdId: z.string().uuid(),
    playerId: z.string().uuid(),
    guardianId: z.string().uuid(),
    relationship: z.string().trim().min(2).max(60),
  }).parse(Object.fromEntries(formData));
  const db = await database();

  const { data: link, error: linkError } = await db.from("player_guardians").insert({
    organisation_id: input.organisationId,
    household_id: input.householdId,
    player_id: input.playerId,
    guardian_id: input.guardianId,
    relationship: input.relationship,
  }).select("id").single();
  if (linkError || !link) throw new Error("This guardian could not be linked to the player.");

  const { error: permissionError } = await db.from("guardian_permissions").insert({
    organisation_id: input.organisationId,
    player_guardian_id: (link as { id: string }).id,
    communication: true,
    payments: false,
    consent: false,
    emergency_contact: false,
    restricted_contact: false,
  });
  if (permissionError) throw new Error("The guardian permissions could not be saved.");

  revalidatePath(`/app/${input.workspace}/people`);
}
```

Cross-organisation protection comes from the composite foreign keys: `player_guardians` references `(player_id, organisation_id)` and `(guardian_id, organisation_id)`, so a mismatched pair fails at the database. The security test proves that rather than re-implementing it in application code.

- [ ] **Step 4: Add the club people panel**

Extend the `people` branch of `features/screens/club/production-operations.tsx` to load households, guardians and existing links alongside players, then render three `OperationalForm` blocks using the existing `Field` helper (line 186): create household, create guardian, link guardian to player. The link form needs three selects populated from those queries plus a relationship text input.

- [ ] **Step 5: Write the security test**

```typescript
// tests/security/guardian-scoping.test.ts
it("refuses to link a guardian to a player in another organisation", async () => {
  await expect(linkGuardianToPlayer(formDataOf({
    organisationId: OTHER_ORG, workspace: "other", householdId: OTHER_HOUSEHOLD,
    playerId: OUR_PLAYER, guardianId: OTHER_GUARDIAN, relationship: "Father",
  }))).rejects.toThrow();
});
```

- [ ] **Step 6: Run and commit**

Run: `npx vitest run tests/unit/guardian-actions.test.ts tests/security/guardian-scoping.test.ts && npm run typecheck` — Expected: PASS

```bash
git add features/people/guardian-actions.ts features/screens/club/production-operations.tsx tests/unit/guardian-actions.test.ts tests/security/guardian-scoping.test.ts
git commit -m "feat: create households and guardians and link them to players"
```

---

## Task 9: Availability collection and correct attribution

**Files:**
- Create: `features/availability/request-service.ts`
- Modify: `features/availability/actions.ts:16-30`
- Test: `tests/unit/availability-request-service.test.ts`, `tests/security/availability-attribution.test.ts`

**Interfaces:**
- Produces:

```typescript
export interface OutstandingSummary {
  eventInstanceId: string;
  expected: number;
  replied: number;
  outstanding: number;
  deadlinePassed: boolean;
}

export function outstandingResponses(
  instances: readonly { id: string; response_deadline: string | null }[],
  responses: readonly { event_instance_id: string; player_id: string }[],
  expectedByInstance: ReadonlyMap<string, number>,
  now: Date,
): OutstandingSummary[];
```

`now` is an explicit parameter so the function is deterministic under test.
- Consumed by: Task 7 (coach today count) and Task 10 (squad picker columns).

`saveProductionAvailability` at `features/availability/actions.ts:25` currently resolves the guardian with `.maybeSingle()` filtered only on `organisation_id` and `status`. In a club with more than one active guardian that selects an arbitrary family and can attribute a reply to the wrong child. It must resolve the guardian from the caller's membership and verify the `player_guardians` link.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/availability-request-service.test.ts
const NOW = new Date("2026-08-05T12:00:00Z");

it("counts outstanding replies per instance", () => {
  const [summary] = outstandingResponses(
    [{ id: "e1", response_deadline: "2026-08-06T18:00:00Z" }],
    [{ event_instance_id: "e1", player_id: "p1" }],
    new Map([["e1", 5]]),
    NOW,
  );
  expect(summary).toEqual({
    eventInstanceId: "e1", expected: 5, replied: 1,
    outstanding: 4, deadlinePassed: false,
  });
});

it("marks a passed deadline and never reports negative outstanding", () => {
  const [summary] = outstandingResponses(
    [{ id: "e1", response_deadline: "2026-08-04T18:00:00Z" }],
    [{ event_instance_id: "e1", player_id: "p1" }, { event_instance_id: "e1", player_id: "p2" }],
    new Map([["e1", 1]]),
    NOW,
  );
  expect(summary.deadlinePassed).toBe(true);
  expect(summary.outstanding).toBe(0);
});

it("treats a null deadline as never passed", () => {
  const [summary] = outstandingResponses(
    [{ id: "e1", response_deadline: null }], [], new Map([["e1", 3]]), NOW,
  );
  expect(summary.deadlinePassed).toBe(false);
  expect(summary.outstanding).toBe(3);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/unit/availability-request-service.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement the pure service**

```typescript
export function outstandingResponses(
  instances: readonly { id: string; response_deadline: string | null }[],
  responses: readonly { event_instance_id: string; player_id: string }[],
  expectedByInstance: ReadonlyMap<string, number>,
  now: Date,
): OutstandingSummary[] {
  const repliedByInstance = new Map<string, Set<string>>();
  responses.forEach(({ event_instance_id, player_id }) => {
    const players = repliedByInstance.get(event_instance_id) ?? new Set<string>();
    players.add(player_id);
    repliedByInstance.set(event_instance_id, players);
  });

  return instances.map((instance) => {
    const expected = expectedByInstance.get(instance.id) ?? 0;
    const replied = repliedByInstance.get(instance.id)?.size ?? 0;
    return {
      eventInstanceId: instance.id,
      expected,
      replied,
      outstanding: Math.max(0, expected - replied),
      deadlinePassed: instance.response_deadline
        ? new Date(instance.response_deadline) < now
        : false,
    };
  });
}
```

- [ ] **Step 4: Correct the guardian resolution**

Replace the guardian lookup in `features/availability/actions.ts`:

```typescript
const { data: auth } = await db.auth.getUser();
if (!auth.user) throw new Error("Sign in to reply.");

const { data: membership } = await db.from("memberships").select("id")
  .eq("organisation_id", input.organisationId).eq("user_id", auth.user.id)
  .eq("status", "active").maybeSingle();
if (!membership) throw new Error("You do not have access to this club.");

const { data: guardian } = await db.from("guardians").select("id")
  .eq("organisation_id", input.organisationId)
  .eq("membership_id", (membership as { id: string }).id)
  .eq("status", "active").maybeSingle();
if (!guardian) throw new Error("No guardian record is linked to your account.");

const { data: link } = await db.from("player_guardians").select("id")
  .eq("organisation_id", input.organisationId)
  .eq("guardian_id", (guardian as { id: string }).id)
  .eq("player_id", input.playerId).maybeSingle();
if (!link) throw new Error("You are not linked to this player.");
```

Keep the existing upsert, adding `team_id` and a deterministic `idempotency_key` so a double submission cannot create a second row. It must be 8 to 120 characters:

```typescript
idempotency_key: `avail:${input.eventInstanceId}:${input.playerId}`,
```

- [ ] **Step 5: Write the security test**

```typescript
// tests/security/availability-attribution.test.ts
it("refuses a reply for a player the signed-in guardian is not linked to", async () => {
  await expect(saveProductionAvailability(formDataOf({
    organisationId: ORG, workspace: "riverside",
    eventInstanceId: INSTANCE, playerId: SOMEONE_ELSES_CHILD, status: "available",
  }))).rejects.toThrow(/not linked/i);
});
```

- [ ] **Step 6: Run and commit**

Run: `npx vitest run tests/unit/availability-request-service.test.ts tests/security/ && npm run test:unit` — Expected: PASS

```bash
git add features/availability tests/unit/availability-request-service.test.ts tests/security/availability-attribution.test.ts
git commit -m "fix: attribute availability replies to the signed-in guardian"
```

---

## Task 7: Coach schedule and event editor

**Files:**
- Create: `features/screens/coach/production-schedule.tsx`
- Modify: `app/app/[workspace]/[section]/page.tsx`
- Delete: `features/screens/coach/production-core-overview.tsx`
- Test: `tests/integration/coach-schedule.test.tsx`

**Interfaces:**
- Produces: `ProductionCoachScheduleScreen({ organisationId, section, workspace }: { organisationId: string; section: string; workspace: string }): Promise<JSX.Element>`, handling sections `today`, `calendar` and `event-editor`.
- Consumes: `createTeamEvent`, `cancelEventInstance`, `rescheduleEventInstance` (Task 6), `outstandingResponses` (Task 9).

This replaces the raw JSON dump at `production-core-overview.tsx:45`. Reuse the `EventCard` visual pattern from `features/screens/parent/core-football.tsx:18-30` and the `Field` helper from `features/screens/club/production-operations.tsx:186`.

The expected-player count for `outstandingResponses` comes from `team_memberships` for the instance's team, filtered to `member_kind = 'player'` and `status = 'active'`. **The filter is mandatory:** `team_memberships` also holds coaches and volunteers (`member_kind` check constraint, `0002_people_households.sql`), and an unfiltered count inflates "expected" with people who never reply. `teams.status` is confirmed to exist (`'active' | 'inactive'`), so filtering the team select to active teams is safe.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/coach-schedule.test.tsx
it("shows how many replies are still outstanding", async () => {
  mockTeamEvents({ instance: { id: "e1", starts_at: "2026-08-09T09:00:00Z" },
    squadSize: 5, replies: 2 });
  render(await ProductionCoachScheduleScreen({
    organisationId: ORG, section: "today", workspace: "riverside",
  }));
  expect(screen.getByText(/3 replies outstanding/i)).toBeInTheDocument();
});

it("offers every team the coach can manage in the create form", async () => {
  mockTeamEvents({ teams: [{ id: "t1", name: "Under 11s" }] });
  render(await ProductionCoachScheduleScreen({
    organisationId: ORG, section: "event-editor", workspace: "riverside",
  }));
  expect(screen.getByRole("option", { name: "Under 11s" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/integration/coach-schedule.test.tsx` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

One query block, then three section branches:

```typescript
export async function ProductionCoachScheduleScreen({ organisationId, section, workspace }: Props) {
  const client = await createServerSupabaseClient();
  if (!client) throw new Error("The organisation connection is unavailable.");
  const db = client as unknown as SupabaseClient;
  const now = new Date();

  const [{ data: teamData, error: teamError }, { data: instanceData, error: instanceError }] =
    await Promise.all([
      db.from("teams").select("id,name").eq("organisation_id", organisationId)
        .order("name").limit(100),
      db.from("event_instances")
        .select("id,team_id,starts_at,ends_at,response_deadline,location_name,status,events(title,kind),teams(name)")
        .eq("organisation_id", organisationId).gte("ends_at", now.toISOString())
        .neq("status", "cancelled").order("starts_at").limit(50),
    ]);
  if (teamError || instanceError) throw new Error("We could not load your team schedule.");
  // then: load availability_responses and team_memberships for these instance ids,
  // build expectedByInstance, and call outstandingResponses(instances, replies, expected, now)
}
```

Section behaviour:

- `today`: the first upcoming instance as an `EventCard`, its `OutstandingSummary` rendered as "N replies outstanding" or "All replies in", and a link to `/app/{workspace}/squad?role=coach&instance={id}`.
- `calendar`: every upcoming instance grouped by `toLocaleDateString("en-GB", { timeZone: "Europe/London" })`.
- `event-editor`: the create form (team select, kind select over the four `event_kind` members, title, location, `datetime-local` start, end and response deadline), plus per-instance cancel and reschedule forms. The cancel form **must** include a required reason input, because `event_instances` rejects a cancelled row with a null `cancelled_reason`.

- [ ] **Step 4: Route it**

In `app/app/[workspace]/[section]/page.tsx`, replace the `ProductionCoachCoreOverview` branch for `today`, `calendar` and `event-editor` with `ProductionCoachScheduleScreen`. Leave `availability` and `squad` on their existing branches until Task 10. Once no import remains, delete `production-core-overview.tsx`.

- [ ] **Step 5: Run and commit**

Run: `npx vitest run tests/integration/coach-schedule.test.tsx && npm run typecheck` — Expected: PASS

```bash
git add features/screens/coach app/app tests/integration/coach-schedule.test.tsx
git rm features/screens/coach/production-core-overview.tsx
git commit -m "feat: coach schedule and event editor on live data"
```

---

## Task 10: Squad selection

**Files:**
- Create: `features/squads/production-actions.ts`
- Create: `features/screens/coach/production-squad-selection.tsx`
- Create: `lib/supabase/acting-membership.ts`
- Modify: `app/app/[workspace]/[section]/page.tsx`
- Test: `tests/unit/squad-actions.test.ts`, `tests/security/squad-scoping.test.ts`

**Interfaces:**
- Produces:
  - `createSquadForInstance(formData)` — fields `organisationId`, `workspace`, `eventInstanceId`, `teamId`. Inserts a `squads` row with `status: "draft"`.
  - `setSquadMembers(formData)` — fields `organisationId`, `workspace`, `squadId`, `teamId`, plus repeated `selected` and `standby` entries carrying player ids. Deletes then re-inserts `squad_members`.
  - `publishSquad(formData)` — fields `organisationId`, `workspace`, `squadId`. Sets `status: "published"`, `published_at` and `published_by_membership_id`.
  - `actingMembershipId(db, organisationId)` extracted from Task 6 into `lib/supabase/acting-membership.ts` and imported by both files rather than duplicated.
- Consumes: `outstandingResponses` (Task 9).

Three schema rules drive this design. `squad_members` has no UPDATE policy, so `setSquadMembers` deletes and re-inserts. `squads` is unique per `event_instance_id`, so creation is idempotent per event. Publishing requires `published_at` and `published_by_membership_id` together.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/squad-actions.test.ts
it("replaces squad members rather than upserting them", async () => {
  const calls = recordCalls();
  await setSquadMembers(formDataOf({
    organisationId: ORG, workspace: "riverside", squadId: SQUAD, teamId: TEAM,
    selected: [PLAYER_A, PLAYER_B], standby: [PLAYER_C],
  }));
  expect(calls.operations("squad_members")).toEqual(["delete", "insert"]);
  expect(calls.row("squad_members", 2)).toMatchObject({ player_id: PLAYER_C, status: "standby" });
});

it("refuses to select a player who replied unavailable for this event", async () => {
  mockAvailability({ [PLAYER_A]: "unavailable" });
  await expect(setSquadMembers(formDataOf({
    organisationId: ORG, workspace: "riverside", squadId: SQUAD, teamId: TEAM,
    selected: [PLAYER_A], standby: [],
  }))).rejects.toThrow(/replied unavailable/i);
});

it("refuses to publish a squad with no selected players", async () => {
  mockSquadMembers([]);
  await expect(publishSquad(formDataOf({
    organisationId: ORG, workspace: "riverside", squadId: SQUAD,
  }))).rejects.toThrow(/at least one player/i);
});

it("sets both published fields together", async () => {
  mockSquadMembers([{ player_id: PLAYER_A, status: "selected" }]);
  const calls = recordCalls();
  await publishSquad(formDataOf({ organisationId: ORG, workspace: "riverside", squadId: SQUAD }));
  const update = calls.row("squads");
  expect(update.status).toBe("published");
  expect(update.published_at).toEqual(expect.any(String));
  expect(update.published_by_membership_id).toEqual(expect.any(String));
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/unit/squad-actions.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement `setSquadMembers`**

```typescript
export async function setSquadMembers(formData: FormData) {
  const input = z.object({
    ...context,
    squadId: z.string().uuid(),
    teamId: z.string().uuid(),
  }).parse(Object.fromEntries(formData));
  const selected = formData.getAll("selected").map(String);
  const standby = formData.getAll("standby").map(String);
  const db = await database();

  const { data: squad, error: squadError } = await db.from("squads")
    .select("id,event_instance_id").eq("organisation_id", input.organisationId)
    .eq("id", input.squadId).single();
  if (squadError || !squad) throw new Error("This squad could not be found.");
  const instanceId = (squad as { event_instance_id: string }).event_instance_id;

  const players = [...selected, ...standby];
  if (players.length) {
    const { data: unavailable, error } = await db.from("availability_responses")
      .select("player_id").eq("organisation_id", input.organisationId)
      .eq("event_instance_id", instanceId)
      .in("player_id", players).eq("status", "unavailable");
    if (error) throw new Error("We could not check availability replies.");
    if ((unavailable ?? []).length) {
      throw new Error("A selected player replied unavailable for this event.");
    }
  }

  const { error: deleteError } = await db.from("squad_members")
    .delete().eq("organisation_id", input.organisationId).eq("squad_id", input.squadId);
  if (deleteError) throw new Error("The previous selection could not be cleared.");

  const rows = [
    ...selected.map((playerId, index) => ({ playerId, status: "selected" as const, order: index + 1 })),
    ...standby.map((playerId, index) => ({ playerId, status: "standby" as const, order: index + 1 })),
  ].map(({ playerId, status, order }) => ({
    organisation_id: input.organisationId, squad_id: input.squadId,
    team_id: input.teamId, player_id: playerId, status, position_order: order,
  }));
  if (rows.length) {
    const { error: insertError } = await db.from("squad_members").insert(rows);
    if (insertError) throw new Error("The selection could not be saved.");
  }

  revalidatePath(`/app/${input.workspace}/squad`);
}
```

`publishSquad` reads the squad's members, throws `"Select at least one player before publishing."` if no row has `status: "selected"`, then updates all three published fields in a single call using `actingMembershipId`.

- [ ] **Step 4: Build the picker screen**

`ProductionSquadSelectionScreen({ organisationId, workspace, instanceId })` renders four columns sourced from `availability_responses` joined to `team_memberships` (filtered to `member_kind = 'player'`, `status = 'active'`): Available, Unsure, Unavailable, No reply. Available and Unsure players carry checkboxes named `selected` or `standby`. Unavailable players render read-only. The publish button appears only when at least one player is selected, labelled "Publish squad to families" so the coach understands it is the notifying action.

- [ ] **Step 5: Route and commit**

Route coach `squad` to the new screen in the section page.

Run: `npx vitest run tests/unit/squad-actions.test.ts tests/security/squad-scoping.test.ts && npm run typecheck` — Expected: PASS

```bash
git add features/squads features/screens/coach/production-squad-selection.tsx lib/supabase/acting-membership.ts app/app tests/unit/squad-actions.test.ts tests/security/squad-scoping.test.ts
git commit -m "feat: select and publish a match squad"
```

---

## Task 11: Port the parent journey onto real data

**Files:**
- Rewrite: `features/screens/parent/production-core-football.tsx`
- Create: `features/screens/parent/child-selector.tsx`
- Test: `tests/integration/parent-journey.test.tsx`, extend `tests/e2e/core-football.spec.ts`

**Interfaces:**
- Produces: `ProductionParentCoreFootballScreen({ organisationId, section, workspace, playerId }: Props)`. `playerId` comes from the `child` query parameter and defaults to the guardian's first linked player.
- Consumes: Tasks 6, 8, 9, 10.

This is a port. `features/screens/parent/core-football.tsx` is the specification; keep its markup and copy. Commit after each section.

**Shared data load.** Every section needs the signed-in guardian's linked players:

```typescript
async function linkedPlayers(db: SupabaseClient, organisationId: string) {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error("Sign in to view your family's football.");
  const { data, error } = await db.from("player_guardians")
    .select("player_id, players(id, first_name, last_name)")
    .eq("organisation_id", organisationId);
  if (error) throw new Error("We could not load your linked children.");
  return (data ?? []) as Array<{ player_id: string; players: { first_name: string; last_name: string } }>;
}
```

RLS restricts `player_guardians` to the caller's own links via `player_guardians_select_own_or_scoped`. **Read that policy's exact predicate before relying on it**; if it grants broader access to scoped staff, add an explicit guardian filter.

**Section mapping**

| Section | Demo source | Live data |
|---|---|---|
| `home` | `core-football.tsx:45-47` | Next `event_instances` row for the child's team, plus outstanding replies |
| `actions` | `:53-70` | Instances with no reply from this player and `response_deadline` in the future, plus `polls` with `status: "open"` |
| `schedule` | `:72-82` | Upcoming instances, real token from `private_calendar_tokens` |
| `event` | `:84-95` | Instance plus its latest `event_change_summaries.summary` array |
| `availability` | `:97-114` | Form posting to `saveProductionAvailability` |
| `polls` | `:116-133` | `poll_options` with `pitch_capacity`, posting to `saveProductionPollResponse` |
| `squad` | `:135-142` | `squad_members` for this player where the parent squad has `status: "published"` |
| `announcements` | `:144-152` | `announcements` with `status: "published"` joined to `announcement_recipients` |

**Three rules during the port**

1. Remove every `DemoFeedback` block (`core-football.tsx:14-16`). Replies now save.
2. Preserve the neutral-wording note at `:139` verbatim. It is a safeguarding decision, not filler.
3. The `squad` section must filter on the parent squad's `status: "published"`. A draft selection must never reach a family.

**Child selector.** The demo assumes one child. Create `child-selector.tsx` rendering a segmented control of linked players, linking to `?child={playerId}`, and rendering nothing when there is exactly one linked player. Include it in the screen header for all eight sections.

- [ ] **Step 1: Write the failing integration tests**

```typescript
// tests/integration/parent-journey.test.tsx
it("tells a parent their child has a place once the squad is published", async () => {
  mockParentData({ player: { id: "p1", first_name: "Jamie" },
    squad: { status: "published" }, member: { status: "selected" } });
  render(await ProductionParentCoreFootballScreen({
    organisationId: ORG, section: "squad", workspace: "riverside", playerId: "p1",
  }));
  expect(screen.getByText(/has a place/i)).toBeInTheDocument();
});

it("hides a draft squad from families", async () => {
  mockParentData({ player: { id: "p1", first_name: "Jamie" },
    squad: { status: "draft" }, member: { status: "selected" } });
  render(await ProductionParentCoreFootballScreen({
    organisationId: ORG, section: "squad", workspace: "riverside", playerId: "p1",
  }));
  expect(screen.queryByText(/has a place/i)).not.toBeInTheDocument();
});

it("hides the child selector for a single-child family", async () => {
  mockParentData({ players: [{ id: "p1", first_name: "Jamie" }] });
  render(await ProductionParentCoreFootballScreen({
    organisationId: ORG, section: "home", workspace: "riverside", playerId: "p1",
  }));
  expect(screen.queryByRole("group", { name: /choose a child/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run and confirm failure.**

Run: `npx vitest run tests/integration/parent-journey.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement section by section**, committing each as `feat: live parent <section> screen`.

- [ ] **Step 4: Extend the e2e spec** in `tests/e2e/core-football.spec.ts` to walk: coach creates fixture, parent replies available, coach selects and publishes, parent sees their place.

- [ ] **Step 5:** Run `npx playwright test tests/e2e/core-football.spec.ts` — Expected: PASS.

---

## Task 12: Announcements and automatic change notices

**Files:**
- Create: `features/screens/coach/production-compose.tsx`
- Modify: `features/events/production-actions.ts`
- Modify: `app/app/[workspace]/[section]/page.tsx`
- Test: `tests/integration/announcements.test.tsx`

**Interfaces:**
- Consumes: `publishAnnouncement` (`features/communications/actions.ts:58`), `cancelEventInstance` and `rescheduleEventInstance` (Task 6).
- Modifies: `publishAnnouncement` itself — see below.
- Produces: `ProductionComposeScreen({ organisationId, workspace })`.

**Verified signature facts (final review).** `publishAnnouncement` does not insert into `announcements` directly; it calls the RPC `publish_announcement(requested_organisation_id, requested_title, requested_body, requested_team_id)` — and it currently hardcodes `requested_team_id: null`, so it can only publish club-wide. Task 12 therefore includes a small modification to `features/communications/actions.ts`: accept an optional `teamId` field (Zod `z.string().uuid().optional()`) and pass it through as `requested_team_id`, keeping null for club-wide. The automatic reschedule notice must call the same RPC (team-scoped to the event's team), not insert an `announcements` row directly — the RPC is where `authored_by_membership_id` and publish semantics are enforced.

The automatic notice is the flow the demo shows at `core-football.tsx:91`: rescheduling writes an `event_change_summaries` row **and** publishes an announcement naming the previous and new values.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/announcements.test.tsx
it("announces a reschedule naming the previous and new location", async () => {
  const calls = recordCalls();
  await rescheduleEventInstance(formDataOf({
    organisationId: ORG, workspace: "riverside", eventInstanceId: INSTANCE,
    teamId: TEAM, startsAt: "2026-08-09T10:00", endsAt: "2026-08-09T11:30",
    locationName: "Main pitch", previousLocationName: "Pitch 2",
  }));
  expect(calls.row("event_change_summaries").summary).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ field: "location", from: "Pitch 2", to: "Main pitch" }),
    ]),
  );
  expect(calls.rpc("publish_announcement").requested_body).toMatch(/Pitch 2[\s\S]*Main pitch/);
  expect(calls.rpc("publish_announcement").requested_team_id).toBe(TEAM);
});
```

- [ ] **Step 2: Run and confirm failure.**

Run: `npx vitest run tests/integration/announcements.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement**

`event_change_summaries.summary` must be a JSON array. Use one object per changed field:

```typescript
const summary = [
  previousLocation !== location
    ? { field: "location", from: previousLocation, to: location } : null,
  previousStart !== startsAt
    ? { field: "startsAt", from: previousStart, to: startsAt } : null,
].filter((entry) => entry !== null);
```

Insert with `edit_scope: "this"` and the acting membership id. Then publish an announcement whose body renders each entry as a readable line.

- [ ] **Step 4: Build the composer.** Title, body textarea, and a team select whose blank option means club-wide.

- [ ] **Step 5: Run and commit**

Run: `npx vitest run tests/integration/announcements.test.tsx && npm run typecheck` — Expected: PASS

```bash
git add features/screens/coach/production-compose.tsx features/events/production-actions.ts app/app tests/integration/announcements.test.tsx
git commit -m "feat: compose announcements and announce event changes automatically"
```

---

## Self-review notes

- **Spec coverage:** every gap in the main plan's chain table now has a task. The `households` prerequisite was missing from the original Task 8 and is added here.
- **Type consistency:** `OutstandingSummary` is defined once in Task 9 and consumed by Tasks 7 and 10. `actingMembershipId` is extracted to `lib/supabase/acting-membership.ts` in Task 10 rather than duplicated from Task 6.
- **Resolved during final review (2026-07-27):**
  - `teams.status` exists (`'active' | 'inactive'`), so Task 7 may filter to active teams.
  - `publishAnnouncement` is RPC-based and hardcodes club-wide scope; Task 12 now includes extending it with an optional `teamId`.
  - `saveProductionPollResponse` verified: fields `organisationId`, `pollId`, `optionId`, `respondentId`, `workspace`, `response` (`available | unavailable | maybe`), upserting `poll_responses` on `(organisation_id, option_id, respondent_id)`.
- **New defect found during final review — fix inside Task 11's polls section:** `saveProductionPollResponse` takes `respondentId` from client form data with no check that the caller is linked to that respondent. This is the same attribution class as the Task 9 availability bug. When wiring the parent polls screen, add the membership → guardian → `player_guardians` link verification (reuse the Task 9 pattern) before trusting `respondentId`, and cover it with a security test in `tests/security/`. Task 0 assertion 9 probes what RLS currently permits on `poll_responses`.
- **Still to verify during execution:**
  1. The exact predicate of `player_guardians_select_own_or_scoped`, relied on in Task 11 (settled by Task 0 assertion 7).
  2. What `poll_responses.respondent_id` references (player or guardian) — read its foreign key in `0003_events_polls_squads.sql` before wiring Task 11's polls section.
