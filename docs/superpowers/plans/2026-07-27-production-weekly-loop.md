# Production Weekly Loop Implementation Plan

> **Start at `2026-07-27-master-plan.md`,** which is the entry point and carries Task 0 (the database probe that must pass before Task 1), the design-asset reuse policy, and the document map.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take GrassRoots from a demo shell with a production backend to an app one real grassroots team can run their week on: create a fixture, ask parents for availability, get replies, pick a squad, tell everyone what changed.

**Architecture:** Keep the existing shell, screen registry and capability model. Change three things: make the role resolver return every role a member holds instead of one, add the missing write paths that generate the weekly loop, and replace the auto-generated placeholder copy on in-scope screens with the demo screens ported to real data. The demo components in `features/screens/*/core-football.tsx` are the design specification, not scaffolding to delete.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Supabase (Postgres + RLS + PKCE auth), Zod, Vitest, Playwright, Tailwind.

## Global Constraints

- Do not change Google, Supabase, Vercel or environment configuration.
- Server actions follow the established pattern in `features/people/production-actions.ts`: `"use server"`, Zod parse of `Object.fromEntries(formData)`, a `context` object of `{ organisationId, workspace }`, insert or upsert, then `revalidatePath`.
- `createServerSupabaseClient()` takes no argument outside Route Handlers. Only the OAuth callback passes a `NextResponse`.
- Capabilities gate navigation only. Every mutation must independently verify authorisation against `scopedGrants` from `resolveProductionWorkspaceAccess`. Never authorise a write from the `capabilities` array.
- All timestamps render in `Europe/London` via `toLocaleString("en-GB", { timeZone: "Europe/London" })`.
- Child-visible copy stays neutral: no rankings, no comparison between children, no selection history. This rule is already honoured in `features/screens/parent/core-football.tsx:139` and must survive the port.
- Every new table access needs a matching test in `tests/security/` proving a member of another organisation cannot read or write it.
- No `console.log` in production code. Files stay under 500 lines.
- Run `npm run typecheck && npm run test:unit` before every commit. `APP_ORIGIN=https://grassroots.example npm run build` before every phase gate.

---

## Why this order

The instinct is to fix navigation first because that is the visible symptom. That is half right. Navigation is Phase 0 because it is small and because you cannot manually verify anything else until you can reach the screens. But navigation is not the reason the app feels empty.

The app feels empty because **the weekly loop has no entry point**. Here is the chain a grassroots team actually runs on, and what exists today:

| Step | Table | Write path | State |
|---|---|---|---|
| Set up season, age group, team, players | `seasons`, `age_groups`, `teams`, `players` | `features/people/production-actions.ts` | Built |
| **Create a fixture or training session** | `events`, `event_series`, `event_instances` | **none** | **Missing** |
| Link a parent to their child | `guardians`, `player_guardians` | none | Missing |
| Ask parents for availability | `availability_responses` | magic link only | Partial |
| Parent replies | `availability_responses` | `saveProductionAvailability` | Built, no UI |
| Coach picks a squad | `squads`, `squad_members` | **none** | **Missing** |
| Parent sees selection | `squads` | read only | Thin |
| Coach tells everyone what changed | `announcements`, `event_change_summaries` | `publishAnnouncement` | Built, no UI |

Two write paths are missing at the centre of the chain, and both are load-bearing. Without event creation there is nothing to be available for. Without squad selection the availability replies go nowhere. Everything downstream that you already built (match day clock, formations, playing time, attendance, development reviews) sits behind those two gaps.

So the order is: make it navigable, then close the two missing write paths, then port the demo screens onto the now-real data. Facilities, finance, safeguarding, compliance, documents, equipment, volunteers and all platform operations stay exactly as they are behind their existing placeholder empty states. They are not on the weekly loop and a single team does not need them to start.

**Timeline.** Phase 0 is one working session. Phase 1 is three to five sessions of AI-assisted implementation, so days rather than weeks of calendar time. The binding constraint is not code generation; it is verification against a real Supabase project and review capacity. See "What governs the timeline" below.

**Tasks 7 to 12 are detailed in a companion document:** `2026-07-27-weekly-loop-phase1-detail.md`, which supersedes the condensed versions here and carries a Task 6 amendment that must be applied.

## What governs the timeline

Code volume for Phase 1 is modest: roughly seven new files and perhaps 1,500 lines including tests. Generation is not the bottleneck. Four things are:

1. **Verification round trips.** Seeding three families, creating a fixture, replying as a parent and checking the squad renders is human clock time and human judgement. It does not compress with model speed.
2. **Schema reality.** The detail pass found two constraints that would have caused runtime failures: the `event_instances` uniqueness rule that collides two teams training at the same time, and the missing UPDATE policy on `squad_members` that breaks any upsert. Both were invisible without reading the migrations. A faster model reads faster; it does not remove the need to look, and an agent that skips looking writes plausible wrong code faster.
3. **Review capacity.** Every change wants a human read before it reaches a real club's data. On a solo project that is the true rate limit.
4. **Token cost.** Running Phase 1 through a frontier model with full test and build cycles is a real budget line. Worth planning deliberately rather than discovering.

The good news from the detail pass: RLS policies already exist for every table on the weekly loop, so **no migrations are required**. That was the largest unknown and it resolved favourably.

---

## File Structure

**Phase 0, navigation and honesty**

- Modify `features/tenancy/service.ts` — `resolveProductionWorkspaceAccess` returns `roles: readonly AppRole[]` plus an active-role selector.
- Modify `lib/navigation/screen-registry.ts` — add `getDefaultScreenForRoles` and `parseRequestedRole`, keep everything else.
- Modify `app/app/[workspace]/page.tsx` — role-aware landing redirect.
- Modify `app/app/[workspace]/[section]/page.tsx` — honour a validated `?role=` in production.
- Modify `components/shell/application-shell.tsx` — production role switcher, remove fictional fallback, fix empty-screens crash.
- Modify `components/shell/role-switcher.tsx` — accept an allowed-roles list.
- Create `lib/navigation/screen-copy.ts` — real per-screen copy for in-scope screens, falling back to the existing generated strings.

**Phase 1, the weekly loop**

- Create `features/events/production-actions.ts` — event and instance creation, cancellation, reschedule.
- Create `features/people/guardian-actions.ts` — guardian creation, player linking, permissions.
- Create `features/squads/production-actions.ts` — squad creation, selection, publish.
- Create `features/availability/request-service.ts` — outstanding-response computation.
- Create `features/screens/coach/production-schedule.tsx` — coach today, calendar, event editor.
- Create `features/screens/coach/production-squad-selection.tsx` — squad picker.
- Create `features/screens/coach/production-compose.tsx` — announcement composer.
- Rewrite `features/screens/parent/production-core-football.tsx` — port of the demo parent journey.
- Modify `app/app/[workspace]/[section]/page.tsx` — route the new screens.

---

# PHASE 0: Make the app navigable and honest

Gate: a club admin who is also a parent can sign in, land somewhere real, switch between their two roles, and never see a fictional child's name.

### Task 1: Resolve every role a member holds

**Files:**
- Modify: `features/tenancy/service.ts:90-96` (`appRoleForAssignedKeys`), `:98-186` (`resolveProductionWorkspaceAccess`)
- Test: `tests/unit/tenancy-service.test.ts`

**Interfaces:**
- Produces: `ProductionWorkspaceAccess` gains `roles: readonly AppRole[]` (every distinct role, ordered platform, club, coach, parent) and `role: AppRole` becomes the **active** role. New signature: `resolveProductionWorkspaceAccess(reader, workspace, userId, requestedRole?: AppRole)`. When `requestedRole` is present and in `roles`, it becomes the active role; otherwise the highest-priority role is active. `capabilities` remains scoped to the active role only.
- Consumes: existing `TenancyAccessReader`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/tenancy-service.test.ts
it("returns every held role and honours a valid requested role", async () => {
  const reader = fakeReader({ roleKeys: ["club-admin", "parent"] });
  const access = await resolveProductionWorkspaceAccess(reader, "riverside", "user-1", "parent");

  expect(access.status).toBe("allowed");
  if (access.status !== "allowed") return;
  expect(access.roles).toEqual(["club", "parent"]);
  expect(access.role).toBe("parent");
});

it("falls back to the highest-priority role when the requested role is not held", async () => {
  const reader = fakeReader({ roleKeys: ["parent"] });
  const access = await resolveProductionWorkspaceAccess(reader, "riverside", "user-1", "club");

  expect(access.status).toBe("allowed");
  if (access.status !== "allowed") return;
  expect(access.roles).toEqual(["parent"]);
  expect(access.role).toBe("parent");
});
```

Build `fakeReader` in the test file returning one organisation, one active membership, one assignment per role key, and one permission per role so `capabilities` is non-empty.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/tenancy-service.test.ts`
Expected: FAIL, `access.roles` is undefined.

- [ ] **Step 3: Implement**

Replace `appRoleForAssignedKeys` with a function returning all roles in priority order:

```typescript
const ROLE_PRIORITY = ["platform", "club", "coach", "parent"] as const;

function appRolesForAssignedKeys(keys: readonly string[]): readonly AppRole[] {
  const mapped = new Set(keys.map(appRoleForAssignedKey));
  return ROLE_PRIORITY.filter((role) => mapped.has(role));
}
```

In `resolveProductionWorkspaceAccess`, replace the single `role` derivation with:

```typescript
const roles = appRolesForAssignedKeys(assignedRoles.map(({ key }) => key));
const role = requestedRole && roles.includes(requestedRole) ? requestedRole : roles[0];
```

Leave the `capabilities` computation exactly as it is: it already filters `scopedGrants` by `appRoleForAssignedKey(grant.role.key) === role`, so scoping to the active role is automatic. Return `roles` alongside `role`. Keep `scopedGrants` unfiltered so mutation authorisation is unaffected.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/tenancy-service.test.ts` — Expected: PASS
Run: `npm run test:unit` — Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add features/tenancy/service.ts tests/unit/tenancy-service.test.ts
git commit -m "feat: resolve every role a member holds in a workspace"
```

### Task 2: Role-aware landing and section routing

**Files:**
- Modify: `app/app/[workspace]/page.tsx:19-23`
- Modify: `app/app/[workspace]/[section]/page.tsx:68-97`
- Modify: `lib/navigation/screen-registry.ts`
- Test: `tests/unit/workspace-landing.test.ts`

**Interfaces:**
- Produces: `getDefaultScreenForRoles(roles: readonly AppRole[]): ScreenDefinition` returning the default screen of `roles[0]`. `parseRequestedRole(value: string | undefined): AppRole | undefined` returning the matching role or `undefined`.
- Consumes: `resolveProductionWorkspaceAccess` from Task 1.

The landing page currently hardcodes `getDefaultScreen("parent")`, which sends a club admin to a parent-only section and produces the "Home is not available for this role" wall. It must resolve the signed-in member first.

`parseRequestedRole` is deliberately separate from the existing `parseAppRole`, which defaults to `"parent"`. That default is correct for demo mode and must stay unchanged.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/workspace-landing.test.ts
import { getDefaultScreenForRoles, parseRequestedRole } from "@/lib/navigation/screen-registry";

it("lands a club admin on the club default screen", () => {
  expect(getDefaultScreenForRoles(["club", "parent"]).section).toBe("overview");
});

it("lands a parent-only member on the parent default screen", () => {
  expect(getDefaultScreenForRoles(["parent"]).section).toBe("home");
});

it("returns undefined for an unknown requested role rather than defaulting", () => {
  expect(parseRequestedRole("nonsense")).toBeUndefined();
  expect(parseRequestedRole(undefined)).toBeUndefined();
  expect(parseRequestedRole("coach")).toBe("coach");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/workspace-landing.test.ts` — Expected: FAIL, not exported.

- [ ] **Step 3: Implement**

In `lib/navigation/screen-registry.ts`:

```typescript
export function getDefaultScreenForRoles(
  roles: readonly AppRole[],
): ScreenDefinition {
  return getDefaultScreen(roles[0] ?? "parent");
}

export function parseRequestedRole(value: string | undefined): AppRole | undefined {
  return appRoles.find((role) => role === value);
}
```

In `app/app/[workspace]/page.tsx`, keep the existing parent default for demo mode and resolve real access in production:

```typescript
const supabase = await createServerSupabaseClient();
if (!supabase) redirect("/sign-in");
const { data, error } = await supabase.auth.getUser();
if (error || !data.user) redirect(`/sign-in?next=${encodeURIComponent(`/app/${workspace}`)}`);
const access = await resolveProductionWorkspaceAccess(
  createSupabaseTenancyAccessReader(supabase), workspace, data.user.id,
);
if (access.status === "denied") redirect("/sign-in?error=workspace");
redirect(getScreenHref(workspace, getDefaultScreenForRoles(access.roles), access.role));
```

In `app/app/[workspace]/[section]/page.tsx`, pass the requested role through so a legitimately held role in the URL is honoured:

```typescript
const requestedRole = parseRequestedRole(
  Array.isArray(query.role) ? query.role[0] : query.role,
);
const access = await resolveProductionWorkspaceAccess(
  createSupabaseTenancyAccessReader(supabase), workspace, data.user.id, requestedRole,
);
```

Then set `role = access.role; capabilities = access.capabilities;` and thread `access.roles` into the shell.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/unit/workspace-landing.test.ts && npm run typecheck` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/app lib/navigation/screen-registry.ts tests/unit/workspace-landing.test.ts
git commit -m "feat: land members on a screen their role can open"
```

### Task 3: Production role switcher, shown only to multi-role members

**Files:**
- Modify: `components/shell/role-switcher.tsx:14-44`
- Modify: `components/shell/application-shell.tsx:31-38` (props), `:116-124` (header)
- Test: `tests/unit/role-switcher.test.tsx`

**Interfaces:**
- Consumes: `roles` from Task 1, threaded through the section page from Task 2.
- Produces: `RoleSwitcherProps` gains `roles: readonly AppRole[]`. `ApplicationShellProps` gains `roles?: readonly AppRole[]`, defaulting to `[role]` so existing renders (including `tests/unit/application-shell.test.tsx`, which already exists) keep compiling.

Multi-role is not the norm but will be used a lot, so the switcher costs single-role members nothing: it renders only when `roles.length > 1`. The component already does the right thing at `role-switcher.tsx:24` by navigating to the target role's default screen, which avoids landing on a section the new role cannot open.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/role-switcher.test.tsx
it("offers only the roles the member actually holds", () => {
  render(<RoleSwitcher value="club" workspace="riverside" roles={["club", "parent"]} />);
  expect(screen.getByRole("option", { name: "Club administration" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Parent" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Coach" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/role-switcher.test.tsx` — Expected: FAIL, renders all four roles.

- [ ] **Step 3: Implement**

In `role-switcher.tsx`, add `roles: readonly AppRole[]` to `RoleSwitcherProps` and map over `roles` instead of the module-level `appRoles`. Change the visible label from "View as" to "Acting as", because in production this is a real permission change, not a preview.

In `application-shell.tsx`, replace line 118 so the switcher is no longer demo-gated:

```tsx
{roles.length > 1 ? <RoleSwitcher value={role} workspace={workspace} roles={roles} /> : null}
```

Thread `roles` from the section page. In demo mode pass `appRoles` so the demo keeps all four options.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/role-switcher.test.tsx && npm run test:unit` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/shell tests/unit/role-switcher.test.tsx
git commit -m "feat: let multi-role members switch role in production"
```

### Task 4: Stop showing fictional data to real users

**Files:**
- Modify: `components/shell/application-shell.tsx:40-81` (`roleDemo`), `:91-95`, `:160-166`, `:179-240`
- Create: `lib/navigation/screen-copy.ts`
- Test: extend the existing `tests/unit/application-shell.test.tsx` (do not overwrite it; read it first and add the new cases)

**Interfaces:**
- Produces: `getScreenCopy(screen: ScreenDefinition): { title: string; description: string }` returning curated copy for in-scope screens and falling back to `screen.label` plus `screen.states.empty.description` otherwise.

Three separate defects here. The `roleDemo` block containing "Jamie", "Meadow Park" and "Riverside, Pitch 2" renders in production whenever `screenContent` is undefined (line 179). The page subtitle is always the generated empty-state string (line 165) whether or not data exists. And line 95 dereferences `screens[0]` without a guard, which throws for a member holding a role with no matching capabilities.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/application-shell.test.tsx
it("never renders demo copy when not in demo mode", () => {
  render(<ApplicationShell activeSection="overview" capabilities={["club:view"]}
    isDemo={false} role="club" roles={["club"]} workspace="riverside" />);
  expect(screen.queryByText(/Jamie/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Meadow Park/)).not.toBeInTheDocument();
});

it("renders a recoverable state when the role has no permitted screens", () => {
  render(<ApplicationShell activeSection="overview" capabilities={[]}
    isDemo={false} role="club" roles={["club"]} workspace="riverside" />);
  expect(screen.getByRole("heading", { name: /No screens are available/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/unit/application-shell.test.tsx`
Expected: FAIL on both, the second with a TypeError reading `id` of undefined.

- [ ] **Step 3: Implement**

Guard the empty case before any dereference of `screens[0]`:

```tsx
const screens = getAllowedScreensForRole(role, capabilities);
if (screens.length === 0) {
  return <NoScreensState role={role} workspace={workspace} />;
}
```

`NoScreensState` renders inside the same chrome, with the heading "No screens are available for this role" and an explanation that a club administrator needs to grant a capability. Do not throw.

Gate the demo header copy on `isDemo`, keeping the layout exactly as it is:

```tsx
<h1 id="application-page-title" ...>
  {isDemo && isDefaultScreen ? demo.title : getScreenCopy(currentScreen).title}
</h1>
<p ...>
  {isDemo && isDefaultScreen ? demo.summary : getScreenCopy(currentScreen).description}
</p>
```

Replace the fallback at line 179 so production shows an honest empty state instead of the fictional two-panel block:

```tsx
{children ?? (isDemo ? <DemoFocusPanels demo={demo} currentScreen={currentScreen} /> : (
  <EmptyState
    title={`${currentScreen.label} is not built yet`}
    description="This screen is planned but not part of the current release. Nothing here is real data."
  />
))}
```

Extract the existing two-panel markup verbatim into a `DemoFocusPanels` component in the same file. The demo keeps exactly the look it has now.

Create `lib/navigation/screen-copy.ts` with curated entries for the Phase 1 screens only:

```typescript
import type { ScreenDefinition } from "@/lib/navigation/screen-registry";

const copy: Record<string, { title: string; description: string }> = {
  "parent:home": { title: "Your football week", description: "Replies you owe, and what is coming up." },
  "parent:availability": { title: "Availability", description: "Tell the manager who can play." },
  "parent:squad": { title: "Squad status", description: "Whether your child has a place this week." },
  "coach:today": { title: "Today", description: "Your next session, and who has replied." },
  "coach:squad": { title: "Squad selection", description: "Pick from the players who said they are available." },
  "coach:event-editor": { title: "Fixtures and sessions", description: "Create and change your team's events." },
  "club:overview": { title: "Club overview", description: "Teams, upcoming fixtures and outstanding replies." },
};

export function getScreenCopy(screen: ScreenDefinition) {
  return copy[`${screen.role}:${screen.id}`] ?? {
    title: screen.label,
    description: screen.states.empty.description,
  };
}
```

Screens outside Phase 1 keep the generated copy, which is acceptable because they now sit behind an honest "not built yet" empty state rather than fake data.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/application-shell.test.tsx && npm run test:unit` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/shell lib/navigation/screen-copy.ts tests/unit/application-shell.test.tsx
git commit -m "fix: stop rendering demo fixtures and fake copy to signed-in members"
```

### Task 5: Phase 0 gate

- [ ] **Step 1:** Run `npm run typecheck && npm run test:unit`
- [ ] **Step 2:** Run `npx playwright test tests/e2e/shell.spec.ts tests/e2e/release-role-matrix.spec.ts`
- [ ] **Step 3:** Run `APP_ORIGIN=https://grassroots.example npm run build`
- [ ] **Step 4:** Manually verify against a real Supabase project: sign in as a member holding both `club-admin` and `parent`, confirm the landing page opens the club overview, confirm the switcher appears, confirm switching to Parent opens the parent home, confirm no fictional names appear anywhere.
- [ ] **Step 5:** Open a PR titled `feat: role-aware navigation and honest production shell`.

---

# PHASE 1: The weekly loop

Gate: a coach creates Sunday's fixture, three parents reply, the coach picks a squad, and each parent sees their child's status. All on real data, in production mode.

**Execution order is 6, 8, 9, 7, 10, 11, 12**, not strictly numerical. Task 7's outstanding-replies count consumes `outstandingResponses` from Task 9, and Task 9's expected-player count depends on the guardian links from Task 8. Tasks are numbered by subject area for readability; build them in the order given here.

### Task 6: Event creation

**Files:**
- Create: `features/events/production-actions.ts`
- Test: `tests/unit/event-actions.test.ts`, `tests/security/event-scoping.test.ts`

**Interfaces:**
- Produces: `createTeamEvent(formData: FormData): Promise<void>` reading `organisationId`, `workspace`, `teamId`, `kind`, `title`, `locationName`, `startsAt`, `endsAt`, `responseDeadline`. Inserts one `events` row and one `event_instances` row. Also produces `cancelEventInstance(formData)` and `rescheduleEventInstance(formData)`, both of which write an `event_change_summaries` row.
- Consumes: `createServerSupabaseClient`.

This is the keystone task. `events.created_by_membership_id` is `not null` and foreign-keyed to `(memberships.id, organisation_id)`, so the action must resolve the caller's membership first, and that lookup doubles as the authorisation check.

**Before writing the insert:** read `supabase/migrations/0003_events_polls_squads.sql` and confirm the exact members of the `public.event_kind` enum and the exact column list of `event_instances`. The values below are the expected shape and must be matched to the migration, not assumed.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/event-actions.test.ts
it("rejects an event whose end is not after its start", async () => {
  await expect(createTeamEvent(formDataOf({
    organisationId: ORG, workspace: "riverside", teamId: TEAM, kind: "match",
    title: "Under 11s v Meadow Park", locationName: "Riverside Main pitch",
    startsAt: "2026-08-09T10:00", endsAt: "2026-08-09T10:00",
    responseDeadline: "2026-08-06T18:00",
  }))).rejects.toThrow(/end time must be after/i);
});

it("rejects a response deadline after the event starts", async () => {
  await expect(createTeamEvent(formDataOf({
    organisationId: ORG, workspace: "riverside", teamId: TEAM, kind: "match",
    title: "Under 11s v Meadow Park", locationName: "Riverside Main pitch",
    startsAt: "2026-08-09T10:00", endsAt: "2026-08-09T11:30",
    responseDeadline: "2026-08-09T10:30",
  }))).rejects.toThrow(/deadline must be before/i);
});
```

`formDataOf` is a local helper turning a record into `FormData`. Mock `@/lib/supabase/server` following the pattern in `tests/unit/auth-callback-route.test.ts`.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/unit/event-actions.test.ts` — Expected: FAIL, module not found.

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
  if (!client) throw new Error("Sign in to manage team events.");
  return client as unknown as SupabaseClient;
}

async function actingMembershipId(db: SupabaseClient, organisationId: string) {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error("Sign in to manage team events.");
  const { data, error } = await db.from("memberships").select("id")
    .eq("organisation_id", organisationId).eq("user_id", auth.user.id)
    .eq("status", "active").maybeSingle();
  if (error || !data) throw new Error("You do not have access to this club.");
  return (data as { id: string }).id;
}

const eventInput = z.object({
  ...context,
  teamId: z.string().uuid(),
  kind: z.enum(["match", "training", "social", "meeting"]),
  title: z.string().trim().min(2).max(120),
  locationName: z.string().trim().min(2).max(160),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  responseDeadline: z.string().min(1),
}).refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
  message: "The event end time must be after its start time.",
}).refine((v) => new Date(v.responseDeadline) < new Date(v.startsAt), {
  message: "The response deadline must be before the event starts.",
});

export async function createTeamEvent(formData: FormData) {
  const input = eventInput.parse(Object.fromEntries(formData));
  const db = await database();
  const membershipId = await actingMembershipId(db, input.organisationId);

  const { data: event, error: eventError } = await db.from("events").insert({
    organisation_id: input.organisationId, team_id: input.teamId, kind: input.kind,
    title: input.title, default_location_name: input.locationName,
    created_by_membership_id: membershipId,
  }).select("id").single();
  if (eventError || !event) throw new Error("The event could not be created.");

  const { error: instanceError } = await db.from("event_instances").insert({
    organisation_id: input.organisationId, event_id: (event as { id: string }).id,
    team_id: input.teamId, starts_at: new Date(input.startsAt).toISOString(),
    ends_at: new Date(input.endsAt).toISOString(),
    response_deadline: new Date(input.responseDeadline).toISOString(),
    location_name: input.locationName, status: "scheduled",
  });
  if (instanceError) throw new Error("The event date could not be saved.");

  revalidatePath(`/app/${input.workspace}/today`);
  revalidatePath(`/app/${input.workspace}/calendar`);
}
```

Add `cancelEventInstance` and `rescheduleEventInstance` in the same file. Both update `event_instances` and insert an `event_change_summaries` row recording the previous and new value, because the parent "What changed" panel at `features/screens/parent/core-football.tsx:88-92` reads from it.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/event-actions.test.ts` — Expected: PASS

- [ ] **Step 5: Write the cross-organisation security test**

```typescript
// tests/security/event-scoping.test.ts
it("refuses to create an event for a team in another organisation", async () => {
  await expect(createTeamEvent(formDataOf({
    organisationId: OTHER_ORG, workspace: "other", teamId: OUR_TEAM, kind: "training",
    title: "Injected session", locationName: "Elsewhere",
    startsAt: "2026-08-09T10:00", endsAt: "2026-08-09T11:00",
    responseDeadline: "2026-08-08T18:00",
  }))).rejects.toThrow();
});
```

Run: `npx vitest run tests/security/event-scoping.test.ts` — Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add features/events/production-actions.ts tests/unit/event-actions.test.ts tests/security/event-scoping.test.ts
git commit -m "feat: create, cancel and reschedule team events"
```

### Task 7: Coach schedule and event editor screen

**Files:**
- Create: `features/screens/coach/production-schedule.tsx`
- Modify: `app/app/[workspace]/[section]/page.tsx` (route coach `today`, `calendar`, `event-editor` here)
- Delete: `features/screens/coach/production-core-overview.tsx` once nothing imports it
- Test: `tests/integration/coach-schedule.test.tsx`

**Interfaces:**
- Consumes: `createTeamEvent`, `cancelEventInstance`, `rescheduleEventInstance` from Task 6; `outstandingResponses` from Task 9 once available.
- Produces: `ProductionCoachScheduleScreen({ organisationId, section, workspace }): Promise<JSX.Element>`.

This replaces the raw JSON dump at `features/screens/coach/production-core-overview.tsx:45`. Use `features/screens/coach/core-football.tsx` as the visual specification and the `EventCard` pattern from `features/screens/parent/core-football.tsx:18-30` for consistency. Reuse `Field` from `features/screens/club/production-operations.tsx:186` for form inputs.

Section behaviour: `today` shows the next instance with a count of outstanding availability replies and a link to squad selection. `calendar` lists upcoming instances grouped by date. `event-editor` renders the create form plus cancel and reschedule controls per instance, with the team select populated from `teams`.

- [ ] **Step 1:** Write the failing integration test asserting the create form renders a team option, and that an instance with two of five replies renders "3 replies outstanding".
- [ ] **Step 2:** Run `npx vitest run tests/integration/coach-schedule.test.tsx` and confirm failure.
- [ ] **Step 3:** Implement the screen and route it in the section page, replacing the `ProductionCoachCoreOverview` branch for these three sections.
- [ ] **Step 4:** Run `npx vitest run tests/integration/coach-schedule.test.tsx && npm run typecheck` — Expected: PASS.
- [ ] **Step 5:** Commit `feat: coach schedule and event editor on live data`.

### Task 8: Guardians and child linking

**Files:**
- Create: `features/people/guardian-actions.ts`
- Modify: `features/screens/club/production-operations.tsx` (`people` section gains a guardian panel)
- Test: `tests/unit/guardian-actions.test.ts`, `tests/security/guardian-scoping.test.ts`

**Interfaces:**
- Produces: `createGuardian(formData)` inserting into `guardians` with `display_name`, `email`, `status: "pending"`; `linkGuardianToPlayer(formData)` inserting into `player_guardians` plus a default `guardian_permissions` row with `communication: true` and every other flag false; `updateGuardianPermissions(formData)`.

Without this a parent has no child, so the entire parent journey renders empty regardless of how good the screens are. `guardians.membership_id` is nullable and unique per organisation, so a guardian record can exist before the parent accepts their invitation and is linked on acceptance.

**Before implementing:** confirm the `player_guardians` table name, columns and primary key against `supabase/migrations/0002_people_households.sql`. Its existence is implied by `guardian_permissions.player_guardian_id` but the exact shape must be read, not assumed.

- [ ] **Step 1:** Write failing tests for: rejecting a guardian with neither email nor phone; defaulting new permissions to communication-only; refusing to link a player belonging to another organisation.
- [ ] **Step 2:** Run `npx vitest run tests/unit/guardian-actions.test.ts` and confirm failure.
- [ ] **Step 3:** Implement following the `features/people/production-actions.ts` pattern exactly.
- [ ] **Step 4:** Add the guardian panel to the club `people` section using `OperationalForm` from `production-operations.tsx:191`.
- [ ] **Step 5:** Run `npx vitest run tests/unit/guardian-actions.test.ts tests/security/guardian-scoping.test.ts` — Expected: PASS. Commit `feat: create guardians and link them to players`.

### Task 9: Availability collection

**Files:**
- Create: `features/availability/request-service.ts`
- Modify: `features/availability/actions.ts:16-30`
- Test: `tests/unit/availability-request-service.test.ts`, `tests/security/availability-attribution.test.ts`

**Interfaces:**
- Produces: `outstandingResponses(instances, responses, expectedByInstance): OutstandingSummary[]` as a pure function, testable without a database. `OutstandingSummary` is `{ eventInstanceId: string; expected: number; replied: number; outstanding: number; deadlinePassed: boolean }`.
- Modifies: `saveProductionAvailability`.

`saveProductionAvailability` currently resolves the guardian with `.maybeSingle()` filtered only on organisation and status (`features/availability/actions.ts:25`). In an organisation with more than one active guardian that picks an arbitrary family and can attribute a response to the wrong child. It must resolve the guardian by the caller's `membership_id` and verify via `player_guardians` that the guardian is linked to the player being answered for. This is a real authorisation defect, not a refactor.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/availability-request-service.test.ts
it("counts outstanding replies per instance", () => {
  const summary = outstandingResponses(
    [{ id: "e1", response_deadline: "2026-08-06T18:00:00Z" }],
    [{ event_instance_id: "e1", player_id: "p1" }],
    new Map([["e1", 5]]),
  );
  expect(summary[0]).toMatchObject({ expected: 5, replied: 1, outstanding: 4 });
});
```

Plus a security test asserting a guardian cannot save a response for a player they are not linked to.

- [ ] **Step 2:** Run and confirm failure.
- [ ] **Step 3:** Implement the pure service, then correct the guardian resolution in the action.
- [ ] **Step 4:** Run `npx vitest run tests/unit/availability-request-service.test.ts tests/security/` — Expected: PASS.
- [ ] **Step 5:** Commit `fix: attribute availability responses to the signed-in guardian`.

### Task 10: Squad selection

**Files:**
- Create: `features/squads/production-actions.ts`
- Create: `features/screens/coach/production-squad-selection.tsx`
- Modify: `app/app/[workspace]/[section]/page.tsx` (route coach `squad`)
- Test: `tests/unit/squad-actions.test.ts`, `tests/security/squad-scoping.test.ts`

**Interfaces:**
- Produces: `createSquadForInstance(formData)` inserting a `squads` row with `status: "draft"`; `setSquadMembers(formData)` replacing `squad_members` for a squad with the submitted player ids and a `status` of `"selected"` or `"standby"`; `publishSquad(formData)` setting `status: "published"` and `published_at`.
- Consumes: `outstandingResponses` from Task 9.

Draft and published must stay distinct so a coach can pick a squad without notifying families mid-decision. The parent screen in Task 11 reads published squads only.

- [ ] **Step 1:** Write failing tests for: refusing to select a player who replied unavailable; refusing to publish an empty squad; refusing to touch a squad in another organisation.
- [ ] **Step 2:** Run `npx vitest run tests/unit/squad-actions.test.ts` and confirm failure.
- [ ] **Step 3:** Implement the actions, then the picker screen showing available, unavailable, unsure and no-reply columns.
- [ ] **Step 4:** Run `npx vitest run tests/unit/squad-actions.test.ts tests/security/squad-scoping.test.ts && npm run typecheck` — Expected: PASS.
- [ ] **Step 5:** Commit `feat: select and publish a match squad`.

### Task 11: Port the parent journey onto real data

**Files:**
- Rewrite: `features/screens/parent/production-core-football.tsx`
- Test: `tests/integration/parent-journey.test.tsx`, extend `tests/e2e/core-football.spec.ts`

**Interfaces:**
- Consumes: Task 6 events, Task 8 guardian links, Task 9 availability, Task 10 published squads.

This is a port, not a redesign. `features/screens/parent/core-football.tsx` is the specification and its structure is already right. Map each demo function to a live equivalent, keeping the markup and copy:

| Demo function | Lines | Live source |
|---|---|---|
| `ParentHome` | 45-47 | Next instance for linked children, plus outstanding replies |
| `ParentActions` | 53-70 | Instances past no reply and before deadline, plus open polls |
| `ParentSchedule` | 72-82 | Upcoming instances, real calendar feed token |
| `ParentEvent` | 84-95 | Instance plus `event_change_summaries` for "What changed" |
| `ParentAvailability` | 97-114 | `saveProductionAvailability`, `useState` replaced by a server action |
| `ParentPoll` | 116-133 | `saveProductionPollResponse` |
| `ParentSquad` | 135-142 | Published squad membership only |
| `ParentAnnouncements` | 144-152 | `announcements` and `announcement_recipients` |

Two rules during the port. Every `DemoFeedback` block (`core-football.tsx:14-16`) is removed, since responses now save. The neutral-wording note at line 139 is preserved verbatim; it is a safeguarding decision, not filler.

A parent linked to more than one child needs a child selector on every screen. The demo assumes one child. Add it as a segmented control in the screen header, defaulting to the only child when there is one.

- [ ] **Step 1:** Write the failing integration test: a guardian linked to one player, one published squad including them, asserting "has a place in Sunday's squad" renders and the availability form posts to the server action.
- [ ] **Step 2:** Run `npx vitest run tests/integration/parent-journey.test.tsx` and confirm failure.
- [ ] **Step 3:** Implement section by section, committing after each of the eight as `feat: live parent <section> screen`.
- [ ] **Step 4:** Extend `tests/e2e/core-football.spec.ts` to walk create fixture, reply, select, publish, parent sees result.
- [ ] **Step 5:** Run `npx playwright test tests/e2e/core-football.spec.ts` — Expected: PASS.

### Task 12: Announcements and change notification

**Files:**
- Create: `features/screens/coach/production-compose.tsx`
- Modify: `app/app/[workspace]/[section]/page.tsx` (route coach `compose`)
- Test: `tests/integration/announcements.test.tsx`

**Interfaces:**
- Consumes: `publishAnnouncement` from `features/communications/actions.ts:58`; `cancelEventInstance` and `rescheduleEventInstance` from Task 6.

The action already exists. This task is the composer UI plus wiring cancellation and reschedule to generate an announcement automatically, which is the "Pitch 2 to Main pitch" flow the demo shows at `features/screens/parent/core-football.tsx:91`.

- [ ] **Step 1:** Write the failing test asserting a reschedule produces an announcement naming the previous and new value.
- [ ] **Step 2:** Run and confirm failure.
- [ ] **Step 3:** Implement the composer and the automatic announcement on change.
- [ ] **Step 4:** Run `npx vitest run tests/integration/announcements.test.tsx` — Expected: PASS.
- [ ] **Step 5:** Commit `feat: compose and publish team announcements`.

### Task 13: Phase 1 gate

- [ ] **Step 1:** Run `npm run typecheck && npm run test:unit && npm run test:integration && npm run test:permissions`
- [ ] **Step 2:** Run `npx playwright test`
- [ ] **Step 3:** Run `APP_ORIGIN=https://grassroots.example npm run build`
- [ ] **Step 4:** Full manual run against a real Supabase project with three seeded families, following the gate scenario at the top of this phase.
- [ ] **Step 5:** Open a PR titled `feat: production weekly loop`.

---

# PHASE 2 and beyond (separate plans)

Each of these produces working software on its own and gets its own plan when reached. Do not start any before the Phase 1 gate passes.

**Phase 2, onboarding.** A new club registers via `create_organisation` and then faces empty tables with no guidance. Needs a setup checklist walking season, age group, team, players, guardians, first fixture. Without this, Phase 1 only works for clubs seeded by hand.

**Phase 3, payments.** `startStripeCheckout`, `createMemberInvoice` and the webhook exist. Needs subs scheduling and the parent-facing payment screen. This is the largest Teamer feature not on the Phase 1 loop.

**Phase 4, messaging.** Conversations, reporting and preferences all exist as actions with no UI.

**Phase 5, the remainder.** Facilities, compliance, safeguarding, documents, equipment, volunteers, platform operations. These keep the honest "not built yet" empty state from Task 4 indefinitely, and get built when a real club asks.

## What deliberately stays as it is

The screen registry keeps all 68 entries. Cutting it would break the capability model and the role matrix e2e test for no benefit, and after Task 4 the unbuilt screens are honest rather than misleading. Demo mode stays fully intact as the design reference. The facilities, coaching and support features already built to a high standard are untouched.
