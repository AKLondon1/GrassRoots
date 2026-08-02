# Phase 15 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to execute this plan task-by-task, with a fresh implementer and review checkpoint for each task.

**Goal:** Remove the role-switch hydration race, prove the signed-in weekly journey and role boundaries against local Supabase, automate three fresh-reset green gates, and then rehearse migrations `0023`–`0030` on the designated staging project.

**Architecture:** Keep the demo browser suite and persistent Supabase browser suite separate. Make hydration readiness explicit in the product, use Mailpit-delivered one-time links for real browser sessions, and place all local reset orchestration behind a script whose command model cannot express a remote reset. Hosted migration work starts only after three complete local greens.

**Tech stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Playwright, Supabase CLI/Postgres/GoTrue, Mailpit, Node.js ESM.

## Global constraints

- Work only in `C:\Users\Gaming PC\Documents\GrassRoots\.claude\worktrees\phase-15-test-commit-83a3ca` on `claude/phase-15-test-commit-83a3ca`.
- Never run `supabase db reset` against a linked or remote project. Every reset command in this plan must include `--local` literally.
- Do not merge PR #8 or push to `main`.
- Do not commit passwords, access tokens, service-role keys, browser storage state, magic-link URLs, or generated evidence.
- Prefix Docker-dependent PowerShell commands with `$env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"`.
- Treat any required RLS or safeguarding-policy change as a review stop, not an incidental test repair.
- Diagnose a failing assertion before changing it. Do not weaken a product contract merely to make the gate green.

---

### Task 1: Make role switching hydration-safe

**Files:**
- Modify: `components/shell/role-switcher.tsx`
- Modify: `tests/unit/role-switcher.test.tsx`
- Verify: `tests/e2e/shell.spec.ts`

**Step 1: Write the failing server-render contract**

Add a test using `renderToStaticMarkup` that renders `RoleSwitcher` and asserts the `select` has the `disabled` attribute. Keep the existing client tests.

```tsx
it("does not expose role switching before hydration", () => {
  const html = renderToStaticMarkup(
    <RoleSwitcher value="club" workspace="riverside" roles={["club", "parent"]} />,
  );

  expect(html).toMatch(/<select[^>]*disabled/);
});
```

Run:

```powershell
npm test -- tests/unit/role-switcher.test.tsx
```

Expected: FAIL because the server-rendered selector is currently enabled.

**Step 2: Implement the readiness boundary**

In `RoleSwitcher`, initialize `isHydrated` to `false`, set it to `true` in `useEffect`, and render `disabled={!isHydrated}` on the selector. Do not change routing or role authorization.

```tsx
const [isHydrated, setIsHydrated] = useState(false);

useEffect(() => {
  setIsHydrated(true);
}, []);
```

**Step 3: Prove focused behavior**

Run:

```powershell
npm test -- tests/unit/role-switcher.test.tsx tests/unit/application-shell.test.tsx
npx playwright test tests/e2e/shell.spec.ts --workers=16 --repeat-each=10
```

Expected: all unit tests pass; the repeated role-switch path is green with the uncapped worker count observed by the cold audit.

**Step 4: Prove the uncapped suite**

Run:

```powershell
npx playwright test --workers=16
```

Expected: 102 passed and 6 skipped in demo mode, with no role-switch failure.

**Step 5: Commit**

```powershell
git add components/shell/role-switcher.tsx tests/unit/role-switcher.test.tsx
git commit -m "fix: gate role switching on hydration"
```

---

### Task 2: Add real local passwordless browser sessions

**Files:**
- Create: `tests/e2e/support/mailpit.ts`
- Create: `tests/unit/mailpit.test.ts`
- Create: `playwright.supabase.config.ts`
- Create: `tests/e2e/signed-in-supabase.spec.ts`
- Modify: `package.json`

**Step 1: Write failing Mailpit parser tests**

Cover both default plain-text messages and custom HTML messages. The parser must decode HTML entities, accept only `http://localhost:54321/auth/v1/verify` links, and reject bodies with no local confirmation link.

```ts
expect(extractLocalConfirmationUrl({
  Text: "Follow http://localhost:54321/auth/v1/verify?token=abc&type=magiclink&redirect_to=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback",
  HTML: "",
})).toContain("/auth/v1/verify?");
```

Run:

```powershell
npm test -- tests/unit/mailpit.test.ts
```

Expected: FAIL because the helper does not exist.

**Step 2: Implement the Mailpit helper**

Export:

- `extractLocalConfirmationUrl(message)` as a pure parser.
- `waitForMagicLink({ email, requestedAfter, timeoutMs })`, which polls `http://127.0.0.1:54324/api/v1/messages`, selects a message addressed to the exact email with `Created >= requestedAfter`, loads `/api/v1/message/{ID}`, and returns the parsed URL.

On timeout, report only the recipient and elapsed time. Never print a confirmation URL or token.

Run the focused unit test again. Expected: PASS.

**Step 3: Add a dedicated Supabase Playwright configuration**

Create a one-project, one-worker config with:

- `testMatch: "signed-in-supabase.spec.ts"`
- `baseURL: "http://localhost:3000"`
- a managed `npm run dev -- --hostname localhost --port 3000` web server
- `reuseExistingServer: false`
- trace and screenshot retention on failure

Add `"test:e2e:supabase": "playwright test --config=playwright.supabase.config.ts"` to `package.json`.

The command inherits local Supabase values from its parent process; it must not contain literal keys.

**Step 4: Write and prove a real sign-in smoke path**

In the serial signed-in spec, add a helper that:

1. clears cookies,
2. opens the real sign-in screen,
3. submits the identity email,
4. waits for the fresh Mailpit message,
5. navigates to the one-time confirmation URL,
6. waits for `/auth/callback` to resolve into `/app/riverside-juniors`.

Start with Alex and assert the authenticated shell names Alex Morgan. Reset the local database immediately before this proof, seed identities if reset does not already do so, derive process-only environment values from `npx supabase status --output json`, and run:

```powershell
npm run test:e2e:supabase -- --grep "signs in through the caught magic link"
```

Expected: PASS through the real Auth callback without a committed session fixture.

**Step 5: Commit**

```powershell
git add tests/e2e/support/mailpit.ts tests/unit/mailpit.test.ts playwright.supabase.config.ts tests/e2e/signed-in-supabase.spec.ts package.json
git commit -m "test: add local passwordless browser sessions"
```

---

### Task 3: Prove the persistent weekly journey and role tiers

**Files:**
- Modify: `tests/e2e/signed-in-supabase.spec.ts`
- Modify only if a genuine product defect is found: the smallest affected file under `app/`, `components/`, `features/`, or `lib/`

**Step 1: Add the failing coach-to-parent weekly journey**

Use a title containing the current test timestamp and fixed future ISO times. Drive only visible UI controls:

1. Sam creates a match from `event-editor?role=coach` and captures its “Pick the squad” instance link.
2. Alex selects Jamie and saves `available`.
3. Sam starts selection, marks Jamie `Playing`, saves, and publishes.
4. Alex sees Jamie's confirmed place and no selection history for Maya.
5. Sam moves the match and changes its location.
6. Alex sees the new time/location and “What changed”.

Run the single journey after a fresh local reset. Expected initially: FAIL at the first selector or product behavior not matching the acceptance criteria.

**Step 2: Diagnose every red before editing**

For a selector mismatch, update the test to target the accessible contract already presented by the product. For a product defect, add the narrowest unit/integration regression test first, observe it fail, implement the smallest fix, and rerun both regression and journey. Stop for review if the fix would alter RLS or safeguarding behavior.

**Step 3: Add the four-identity role-tier pass**

Using a fresh magic link for each identity:

- Alex sees the Jamie/Maya child selector.
- Sam forcing `?role=parent` sees Rowan only and no child selector.
- Priya sees the created fixture in the club pitch-planner fixture selector.
- Morgan's parent-screen attempt is denied without leaking Jamie, Maya, Rowan, or the fixture title.

Run:

```powershell
npm run test:e2e:supabase
```

Expected: the entire serial suite passes from one fresh reset.

**Step 4: Run supporting gates**

Run:

```powershell
npm test
npm run typecheck
npm run lint
```

Expected: all pass.

**Step 5: Commit**

```powershell
git add tests/e2e/signed-in-supabase.spec.ts
git status --short
# If Step 2 required a product fix, add only the regression test and the exact
# affected implementation file shown by this status output.
git commit -m "test: cover the signed-in weekly journey"
```

---

### Task 4: Automate the local-only three-green gate

**Files:**
- Create: `scripts/run-phase-15-loop.mjs`
- Create: `tests/unit/phase-15-loop.test.ts`
- Modify: `package.json`

**Step 1: Write failing command-model tests**

Import the runner without executing it and assert:

- it exports exactly three iterations,
- each reset command is `supabase db reset --local`,
- no planned argument contains `--linked`, `--db-url`, or a project ref,
- every iteration includes preflight auth/database, pgTAP, Vitest, typecheck, lint, production build, demo E2E, and signed-in E2E.

Run:

```powershell
npm test -- tests/unit/phase-15-loop.test.ts
```

Expected: FAIL because the runner does not exist.

**Step 2: Implement a shell-free Windows-safe runner**

Use `spawn` with `shell: false` and `npm.cmd`/`npx.cmd` on Windows. The runner must:

- abort on the first non-zero exit,
- call `npx supabase status --output json` after each reset,
- map the returned API URL, anon key, and service-role key into child-process environment only,
- set `NEXT_PUBLIC_DATA_MODE=supabase`, a non-secret `CRON_SECRET`, and the correct local or canonical build `APP_ORIGIN`,
- run the production build with a canonical HTTPS origin and browser suites with `http://localhost:3000`,
- write command name, sanitized arguments, exit code, duration, commit SHA, iteration, and consecutive-green count to a timestamped JSON file under `test-results/phase-15/`,
- never serialize child environment values.

Keep the direct-execution guard separate from exports so Vitest can inspect the plan without launching commands.

**Step 3: Prove the model and one deliberate failure path**

Run the focused unit test. Add a unit seam for a fake failing executor and assert later commands are not invoked and the evidence record marks the iteration red.

Expected: PASS.

**Step 4: Run three fresh-reset greens**

Add `"phase15:loop": "node scripts/run-phase-15-loop.mjs"` and run:

```powershell
$env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"
npm run phase15:loop
```

Expected: three complete green iterations in one invocation and one ignored JSON evidence file showing `consecutiveGreen: 3`.

**Step 5: Commit**

```powershell
git add scripts/run-phase-15-loop.mjs tests/unit/phase-15-loop.test.ts package.json
git commit -m "test: automate the Phase 15 local gate"
```

---

### Task 5: Rehearse migrations `0023`–`0030` on staging

**Files:**
- Do not modify repository files unless the rehearsal exposes a genuine tracked defect.
- Preserve evidence in the final verdict; do not commit credentials or generated command logs.

**Step 1: Confirm dashboard-only prerequisites**

Before linking, confirm that project `mxpuicrkfnyychmwqhus` is the disposable staging target, SMTP points to the designated catcher, Site URL/redirects match staging, and the Google provider decision is recorded. If this cannot be confirmed, stop this task as blocked; do not infer it from repository configuration.

**Step 2: Authenticate and link the exact staging ref**

Run:

```powershell
npx supabase link --project-ref mxpuicrkfnyychmwqhus
```

Expected: local project linked to exactly `mxpuicrkfnyychmwqhus`.

**Step 3: Inspect and push the migration batch**

First run the CLI's non-mutating migration/list or dry-run command supported by the installed version and verify that the only pending local migrations are `0023` through `0030` in filename order. Then run:

```powershell
npx supabase db push
```

Expected: the complete pending batch applies successfully. Never use `db reset` here.

**Step 4: Run the linked read-only preflight**

Run the repository's linked database preflight mode with Supabase production-mode variables provided only through the process environment.

Expected: every linked database assertion passes. A preflight red is diagnosed; migrations are not rolled back destructively.

**Step 5: Record the verdict and leave PR #8 unmerged**

Report the three-green evidence, staging project ref, exact applied migration filenames, linked preflight totals, and any dashboard-only caveats. Do not merge the PR.

---

### Task 6: Final independent review

**Files:**
- Review every Phase 15 commit and the final diff from baseline `d9055b9`.

**Step 1: Run the repository-wide static gates**

```powershell
npm run typecheck
npm run lint
npm test
```

Expected: all pass with current totals recorded.

**Step 2: Review scope and secret hygiene**

```powershell
git diff --check d9055b9..HEAD
git status --short
git log --oneline d9055b9..HEAD
```

Expected: no whitespace errors, no untracked generated evidence, no committed secret/session artifacts, and only Phase 15 completion changes.

**Step 3: Request a final code review**

Review the full diff against the approved design and acceptance plan. Resolve all High and Medium findings, rerun affected checks, and retain the final evidence before making any completion claim.
