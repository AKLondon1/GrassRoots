# GrassRoots Shareable Beta Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release GrassRoots as a shareable, non-commercial Vercel beta using the real Supabase database, Google OAuth and invitation-gated organisation access.

**Architecture:** A server action starts Supabase Google OAuth with a canonical, same-origin callback. The existing callback exchanges the PKCE code and sends the adult to a new authenticated `/app` entry route, which selects an active membership or renders an invitation-required state; existing workspace RLS remains authoritative. Vercel Hobby hosts the beta, while Google OAuth is configured in Supabase and Resend remains disabled.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript 5, Supabase Auth/SSR 2.110.7/0.12.3, Tailwind CSS 4, Vitest 4.1.10, Playwright 1.61.1, Vercel Hobby.

## Global Constraints

- The deployed beta must use `NEXT_PUBLIC_DATA_MODE=supabase`; demo mode must never be used by the public deployment.
- Children never authenticate.
- Google identity must not grant a role or organisation membership.
- Production OAuth redirects must use the exact HTTPS Vercel production origin; no production wildcard redirect is allowed.
- Email magic-link implementation remains in the repository but is not presented while email delivery is unconfigured.
- Resend remains disabled and the previously disclosed API key must be revoked.
- The beta remains non-commercial while hosted on Vercel Hobby.
- No Supabase service-role, cron or provider credential may enter Git or a `NEXT_PUBLIC_*` variable.

## File Structure

- Create `lib/supabase/oauth.ts`: pure construction and validation of the Google OAuth request.
- Modify `app/(auth)/sign-in/actions.ts`: expose only the async Google OAuth server action in addition to retained magic-link actions.
- Create `components/auth/google-sign-in-form.tsx`: accessible pending/error form for the Google action.
- Modify `components/auth/sign-in-screen.tsx`: present Google OAuth in Supabase mode and keep demo entry points unchanged.
- Modify `app/(auth)/sign-in/page.tsx`: map callback/provider query errors to the sign-in interface.
- Create `features/tenancy/authenticated-home.ts`: resolve an authenticated adult's first active, assigned workspace without broadening access.
- Create `app/app/page.tsx`: authenticated post-login entry route and invitation-required state.
- Modify `lib/supabase/auth-callback.ts`: default successful OAuth callbacks to `/app`.
- Modify `tests/unit/sign-in.test.tsx`: cover OAuth destination, error handling and Supabase-mode UI.
- Modify `tests/unit/auth-callback.test.ts`: cover `/app` as the safe default.
- Create `tests/unit/authenticated-home.test.ts`: cover membership selection and denied states.
- Modify `tests/e2e/sign-in.spec.ts`: keep demo coverage and add a controlled Supabase-mode Google sign-in journey.
- Modify `.env.example`, `README.md`, `docs/DEPLOYMENT.md` and `docs/PROVIDERS.md`: document the beta configuration and disabled Resend boundary.

---

### Task 1: Safe Google OAuth initiation

**Files:**
- Create: `lib/supabase/oauth.ts`
- Modify: `app/(auth)/sign-in/actions.ts`
- Modify: `tests/unit/sign-in.test.tsx`

**Interfaces:**
- Consumes: `normaliseInternalPath(value)` from `lib/supabase/auth-callback.ts`, `environment.server.APP_ORIGIN`, `createServerSupabaseClient()`.
- Produces: `buildGoogleOAuthRequest(origin: string | null, nextPath: string | null | undefined, configuredOrigin: string | undefined, nodeEnv: string): { redirectTo: string; nextPath: string } | null`.
- Produces: async server action `signInWithGoogle(formData: FormData): Promise<never | void>`.

- [ ] **Step 1: Write failing tests for canonical OAuth destinations**

Add to `tests/unit/sign-in.test.tsx`:

```ts
import { buildGoogleOAuthRequest } from "@/lib/supabase/oauth";

it("builds a Google callback from the configured canonical origin", () => {
  expect(
    buildGoogleOAuthRequest(
      "https://attacker.example",
      "/invite/secure-token",
      "https://grassroots-beta.vercel.app",
      "production",
    ),
  ).toEqual({
    nextPath: "/invite/secure-token",
    redirectTo:
      "https://grassroots-beta.vercel.app/auth/callback?next=%2Finvite%2Fsecure-token",
  });
});

it("rejects missing canonical origin in production", () => {
  expect(
    buildGoogleOAuthRequest(
      "https://grassroots-beta.vercel.app",
      "/app",
      undefined,
      "production",
    ),
  ).toBeNull();
});

it("normalises an external OAuth return path", () => {
  expect(
    buildGoogleOAuthRequest(
      "http://localhost:3000",
      "https://attacker.example",
      "http://localhost:3000",
      "development",
    ),
  )?.nextPath).toBe("/");
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
npx vitest run tests/unit/sign-in.test.tsx
```

Expected: FAIL because `@/lib/supabase/oauth` does not exist.

- [ ] **Step 3: Implement the pure OAuth request boundary**

Create `lib/supabase/oauth.ts`:

```ts
import { normaliseInternalPath } from "@/lib/supabase/auth-callback";

export interface GoogleOAuthRequest {
  nextPath: string;
  redirectTo: string;
}

export function buildGoogleOAuthRequest(
  requestOrigin: string | null,
  requestedNextPath: string | null | undefined,
  configuredOrigin: string | undefined,
  nodeEnv: string,
): GoogleOAuthRequest | null {
  try {
    const trustedOrigin =
      configuredOrigin ?? (nodeEnv === "production" ? undefined : requestOrigin);
    if (!trustedOrigin) return null;

    const trustedUrl = new URL(trustedOrigin);
    if (
      nodeEnv === "production" &&
      (trustedUrl.protocol !== "https:" ||
        (requestOrigin &&
          new URL(requestOrigin).origin !== trustedUrl.origin))
    ) {
      return null;
    }

    const nextPath = normaliseInternalPath(requestedNextPath);
    const redirectTo = new URL("/auth/callback", trustedUrl);
    redirectTo.searchParams.set("next", nextPath === "/" ? "/app" : nextPath);

    return { nextPath, redirectTo: redirectTo.toString() };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Add the async Google server action**

In `app/(auth)/sign-in/actions.ts`, import `redirect` from `next/navigation` and `buildGoogleOAuthRequest`. Add:

```ts
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const requestHeaders = await headers();
  const request = buildGoogleOAuthRequest(
    requestHeaders.get("origin"),
    typeof formData.get("next") === "string"
      ? String(formData.get("next"))
      : "/app",
    environment.server.APP_ORIGIN,
    environment.nodeEnv,
  );
  const supabase = await createServerSupabaseClient();

  if (!request || !supabase) {
    redirect("/sign-in?error=provider");
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: request.redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    redirect("/sign-in?error=provider");
  }

  redirect(data.url);
}
```

Keep `requestMagicLinkForMode` and `submitMagicLink` unchanged so the custom-domain release can restore the existing email flow. Ensure every runtime export in the `"use server"` file remains an async function.

- [ ] **Step 5: Run focused tests, type-check and server-action export tests**

Run:

```powershell
npx vitest run tests/unit/sign-in.test.tsx tests/security/server-action-exports.test.ts
npm run typecheck
```

Expected: both test files PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the OAuth initiation boundary**

```powershell
git add -- 'lib/supabase/oauth.ts' 'app/(auth)/sign-in/actions.ts' 'tests/unit/sign-in.test.tsx'
git commit -m "feat: add safe Google OAuth initiation"
```

---

### Task 2: Honest beta sign-in interface

**Files:**
- Create: `components/auth/google-sign-in-form.tsx`
- Modify: `components/auth/sign-in-screen.tsx`
- Modify: `app/(auth)/sign-in/page.tsx`
- Modify: `tests/unit/sign-in.test.tsx`
- Modify: `tests/e2e/sign-in.spec.ts`

**Interfaces:**
- Consumes: `signInWithGoogle(formData)` from Task 1.
- Produces: `GoogleSignInForm({ nextPath }: { nextPath: string }): ReactNode`.
- Produces: `SignInScreen` prop `authError?: "callback" | "provider" | "session-revoked"`.

- [ ] **Step 1: Replace stale Supabase-mode assertions with failing Google UI assertions**

In `tests/unit/sign-in.test.tsx`, replace the email-form Supabase test with:

```tsx
it("renders Google sign-in without email or demo controls in Supabase mode", () => {
  render(<SignInScreen mode="supabase" nextPath="/invite/raw-token" />);

  expect(
    screen.getByRole("button", { name: "Continue with Google" }),
  ).toBeInTheDocument();
  expect(
    document.querySelector('input[name="next"]'),
  ).toHaveAttribute("value", "/invite/raw-token");
  expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /demo/i })).not.toBeInTheDocument();
  expect(screen.getByText(/club invitation is still required/i)).toBeVisible();
});

it("shows a provider-specific recoverable error", () => {
  render(
    <SignInScreen
      authError="provider"
      mode="supabase"
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    /Google sign-in could not be started/i,
  );
});
```

- [ ] **Step 2: Run the unit test and verify RED**

Run:

```powershell
npx vitest run tests/unit/sign-in.test.tsx
```

Expected: FAIL because the Google button and `authError` prop do not exist.

- [ ] **Step 3: Implement the pending-safe Google form**

Create `components/auth/google-sign-in-form.tsx`:

```tsx
"use client";

import { useFormStatus } from "react-dom";

import { signInWithGoogle } from "@/app/(auth)/sign-in/actions";
import { Button } from "@/components/ui/button";

function GoogleButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      className="w-full"
      loading={pending}
      loadingLabel="Opening secure Google sign-in"
      type="submit"
    >
      Continue with Google
    </Button>
  );
}

export function GoogleSignInForm({ nextPath }: { nextPath: string }) {
  return (
    <form action={signInWithGoogle} className="mt-8">
      <input name="next" type="hidden" value={nextPath} />
      <GoogleButton />
    </form>
  );
}
```

- [ ] **Step 4: Present Google only in Supabase mode**

In `components/auth/sign-in-screen.tsx`:

- replace the `MagicLinkForm` import with `GoogleSignInForm`;
- replace `callbackError?: boolean` with:

```ts
authError?: "callback" | "provider" | "session-revoked";
```

- map error copy without exposing provider details:

```ts
const authErrorMessage =
  authError === "provider"
    ? "Google sign-in could not be started. Try again in a moment."
    : authError === "session-revoked"
      ? "Your session ended securely. Sign in again to continue."
      : authError === "callback"
        ? "That sign-in could not be completed. Start again and try once more."
        : null;
```

- render this Supabase-mode body:

```tsx
<>
  <p className="mt-4 max-w-[55ch] text-sm leading-6 text-muted">
    Continue with your adult Google account. A GrassRoots club invitation is
    still required before you can access an organisation workspace.
  </p>
  <GoogleSignInForm nextPath={nextPath} />
</>
```

Keep the demo branch unchanged.

- [ ] **Step 5: Map query errors at the page boundary**

In `app/(auth)/sign-in/page.tsx`, map only the allowlisted error values:

```ts
const authError =
  error === "callback" ||
  error === "provider" ||
  error === "session-revoked"
    ? error
    : undefined;
```

Pass `authError={authError}` to `SignInScreen`.

- [ ] **Step 6: Add controlled Supabase-mode E2E coverage**

Create `tests/e2e/sign-in-supabase.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.skip(
  process.env.NEXT_PUBLIC_DATA_MODE !== "supabase",
  "runs only in the explicit Supabase-mode release check",
);

test("Supabase sign-in presents the invitation-gated Google journey", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveCount(0);
  await expect(page.getByText(/club invitation is still required/i)).toBeVisible();
});
```

Run this spec with process-only Supabase public test values. It renders the
production contract without clicking through to live Google:

```powershell
$env:NEXT_PUBLIC_DATA_MODE='supabase'
$env:NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='public-anon-test-key'
npx playwright test tests/e2e/sign-in-supabase.spec.ts --project=mobile --project=desktop
```

The existing full Playwright suite continues to run with
`NEXT_PUBLIC_DATA_MODE=demo`.

- [ ] **Step 7: Verify the interface**

Run:

```powershell
npx vitest run tests/unit/sign-in.test.tsx
$env:NEXT_PUBLIC_DATA_MODE='supabase'
$env:NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='public-anon-test-key'
npx playwright test tests/e2e/sign-in-supabase.spec.ts --project=mobile --project=desktop
npm run typecheck
npm run lint
```

Expected: all focused tests PASS, both viewports PASS, type-check and lint exit 0.

- [ ] **Step 8: Commit the beta sign-in interface**

```powershell
git add -- 'components/auth/google-sign-in-form.tsx' 'components/auth/sign-in-screen.tsx' 'app/(auth)/sign-in/page.tsx' 'tests/unit/sign-in.test.tsx' 'tests/e2e/sign-in-supabase.spec.ts'
git commit -m "feat: present invitation-gated Google sign-in"
```

---

### Task 3: Authenticated membership landing

**Files:**
- Create: `features/tenancy/authenticated-home.ts`
- Create: `app/app/page.tsx`
- Modify: `lib/supabase/auth-callback.ts`
- Create: `tests/unit/authenticated-home.test.ts`
- Modify: `tests/unit/auth-callback.test.ts`

**Interfaces:**
- Produces: `AuthenticatedHomeReader` with `findFirstActiveWorkspace(userId: string): Promise<{ workspace: string; roleKey: string } | null>`.
- Produces: `resolveAuthenticatedHome(reader: AuthenticatedHomeReader, userId: string): Promise<{ status: "allowed"; href: string } | { status: "invitation-required" }>`.
- Consumes: `getDefaultScreen(role)` and `getScreenHref(workspace, screen, role)`.

- [ ] **Step 1: Write failing membership-home tests**

Create `tests/unit/authenticated-home.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  resolveAuthenticatedHome,
  type AuthenticatedHomeReader,
} from "@/features/tenancy/authenticated-home";

describe("authenticated home", () => {
  it("routes an assigned adult to the first active workspace", async () => {
    const reader: AuthenticatedHomeReader = {
      async findFirstActiveWorkspace() {
        return { workspace: "riverside-juniors", roleKey: "coach" };
      },
    };

    await expect(
      resolveAuthenticatedHome(reader, "adult-1"),
    ).resolves.toEqual({
      status: "allowed",
      href: "/app/riverside-juniors/today",
    });
  });

  it("denies an authenticated adult without an active assigned membership", async () => {
    const reader: AuthenticatedHomeReader = {
      async findFirstActiveWorkspace() {
        return null;
      },
    };

    await expect(
      resolveAuthenticatedHome(reader, "adult-uninvited"),
    ).resolves.toEqual({ status: "invitation-required" });
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
npx vitest run tests/unit/authenticated-home.test.ts
```

Expected: FAIL because `features/tenancy/authenticated-home.ts` does not exist.

- [ ] **Step 3: Implement the membership-home boundary**

Create `features/tenancy/authenticated-home.ts` with:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getDefaultScreen,
  getScreenHref,
  type AppRole,
} from "@/lib/navigation/screen-registry";
import type { Database } from "@/lib/supabase/types";

export interface AuthenticatedHomeReader {
  findFirstActiveWorkspace(
    userId: string,
  ): Promise<{ workspace: string; roleKey: string } | null>;
}

function roleForKey(key: string): AppRole {
  if (key === "parent" || key === "guardian") return "parent";
  if (key === "coach" || key === "manager") return "coach";
  if (key === "platform-owner" || key === "platform-operator") return "platform";
  return "club";
}

export async function resolveAuthenticatedHome(
  reader: AuthenticatedHomeReader,
  userId: string,
) {
  const target = await reader.findFirstActiveWorkspace(userId);
  if (!target) return { status: "invitation-required" } as const;
  const role = roleForKey(target.roleKey);
  return {
    status: "allowed",
    href: getScreenHref(
      target.workspace,
      getDefaultScreen(role),
      role,
    ),
  } as const;
}

export function createSupabaseAuthenticatedHomeReader(
  client: SupabaseClient<Database>,
): AuthenticatedHomeReader {
  return {
    async findFirstActiveWorkspace(userId) {
      const database = client as unknown as SupabaseClient;
      const { data: memberships, error: membershipError } = await database
        .from("memberships")
        .select("id, organisation_id, joined_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("joined_at", { ascending: true })
        .limit(20);
      if (membershipError) throw new Error("Could not resolve account access.");

      for (const membership of memberships ?? []) {
        const [
          { data: organisation, error: organisationError },
          { data: assignment, error: assignmentError },
        ] = await Promise.all([
          database
            .from("organisations")
            .select("slug")
            .eq("id", membership.organisation_id)
            .eq("status", "active")
            .maybeSingle(),
          database
            .from("scoped_role_assignments")
            .select("role_id")
            .eq("organisation_id", membership.organisation_id)
            .eq("membership_id", membership.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);
        if (organisationError || assignmentError) {
          throw new Error("Could not resolve account access.");
        }
        if (!organisation || !assignment) continue;

        const { data: role, error: roleError } = await database
          .from("roles")
          .select("key")
          .eq("organisation_id", membership.organisation_id)
          .eq("id", assignment.role_id)
          .maybeSingle();
        if (roleError) throw new Error("Could not resolve account access.");
        if (role) {
          return {
            workspace: String(organisation.slug),
            roleKey: String(role.key),
          };
        }
      }

      return null;
    },
  };
}
```

The existing RLS policies constrain memberships to `auth.uid()`, organisations
to active members, and assignments to the current membership. Do not add a
service-role reader or a database migration for this route.

- [ ] **Step 4: Implement `/app` as the post-login boundary**

Create `app/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

import { DeniedState } from "@/components/ui/denied-state";
import {
  createSupabaseAuthenticatedHomeReader,
  resolveAuthenticatedHome,
} from "@/features/tenancy/authenticated-home";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AuthenticatedHomePage() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/sign-in");

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/sign-in?next=%2Fapp");

  const target = await resolveAuthenticatedHome(
    createSupabaseAuthenticatedHomeReader(supabase),
    data.user.id,
  );
  if (target.status === "allowed") redirect(target.href);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <DeniedState
        className="bg-background"
        title="A club invitation is required"
        description="You are signed in securely, but this account does not have an active GrassRoots organisation membership. Ask your club administrator for an invitation link."
      />
    </main>
  );
}
```

- [ ] **Step 5: Make successful callbacks default to `/app`**

In `lib/supabase/auth-callback.ts`, use `/app` only when the normalised `next`
value is `/`:

```ts
const destination = normaliseInternalPath(url.searchParams.get("next"));
return {
  destination: destination === "/" ? "/app" : destination,
  status: "success",
};
```

Update `tests/unit/auth-callback.test.ts`:

```ts
it("routes a successful callback without a return path to authenticated home", async () => {
  await expect(
    completeAuthCallback(
      "https://grassroots-beta.vercel.app/auth/callback?code=secure-code",
      async () => ({ error: null }),
    ),
  ).resolves.toEqual({ destination: "/app", status: "success" });
});
```

- [ ] **Step 6: Verify membership routing and RLS**

Run:

```powershell
npx vitest run tests/unit/authenticated-home.test.ts tests/unit/auth-callback.test.ts tests/unit/workspace-auth-route.test.tsx
npm run test:permissions
npm run typecheck
```

Expected: all tests PASS, and an uninvited user resolves no organisation.

- [ ] **Step 7: Commit authenticated routing**

```powershell
git add -- 'features/tenancy/authenticated-home.ts' 'app/app/page.tsx' 'lib/supabase/auth-callback.ts' 'tests/unit/authenticated-home.test.ts' 'tests/unit/auth-callback.test.ts'
git commit -m "feat: route authenticated adults by membership"
```

---

### Task 4: Beta configuration and release documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/PROVIDERS.md`
- Modify: `docs/KNOWN-LIMITATIONS.md`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Consumes: existing `parseEnvironment` production validation.
- Produces: an exact beta configuration contract with Google managed in
  Supabase and Resend intentionally unset.

- [ ] **Step 1: Add a failing environment contract test**

Add to `tests/unit/env.test.ts`:

```ts
it("accepts a Supabase beta without email provider credentials", () => {
  const environment = parseEnvironment({
    NODE_ENV: "production",
    NEXT_PUBLIC_DATA_MODE: "supabase",
    APP_ORIGIN: "https://grassroots-beta.vercel.app",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "s".repeat(32),
    CRON_SECRET: "c".repeat(32),
  });

  expect(environment.dataMode).toBe("supabase");
  expect(environment.server.RESEND_API_KEY).toBeUndefined();
  expect(environment.server.EMAIL_FROM).toBeUndefined();
});
```

- [ ] **Step 2: Run the environment test**

Run:

```powershell
npx vitest run tests/unit/env.test.ts
```

Expected: PASS if the current environment contract already supports the
approved beta. Do not change production parsing merely to force a RED test; this
test records an already-supported deployment boundary.

- [ ] **Step 3: Document exact beta variables and provider state**

Update `.env.example` comments and the deployment documents to state:

```text
Beta authentication is Google OAuth configured in Supabase Auth.
RESEND_API_KEY and EMAIL_FROM stay unset until a custom sending domain is verified.
The Vercel production deployment uses NEXT_PUBLIC_DATA_MODE=supabase.
APP_ORIGIN is the exact HTTPS production URL assigned by Vercel.
```

Document these account-level actions:

1. Revoke the previously disclosed Resend key.
2. In Google Cloud, create a Web application OAuth client.
3. Set the authorised redirect URI to
   `https://mxpuicrkfnyychmwqhus.supabase.co/auth/v1/callback`.
4. Add the Google client ID and secret to the Supabase Google provider.
5. Set Supabase Site URL to the exact Vercel production origin.
6. Add the exact Vercel `/auth/callback` URL and localhost callback URL to
   Supabase redirect allowlists.

- [ ] **Step 4: Verify documentation and configuration**

Run:

```powershell
npx vitest run tests/unit/env.test.ts tests/security/server-action-exports.test.ts
rg -n "NEXT_PUBLIC_DATA_MODE=supabase|Google OAuth|Resend" .env.example README.md docs/DEPLOYMENT.md docs/PROVIDERS.md docs/KNOWN-LIMITATIONS.md
git diff --check
```

Expected: tests PASS, every required configuration is documented, and the diff
check exits 0.

- [ ] **Step 5: Commit beta release documentation**

```powershell
git add -- '.env.example' 'README.md' 'docs/DEPLOYMENT.md' 'docs/PROVIDERS.md' 'docs/KNOWN-LIMITATIONS.md' 'tests/unit/env.test.ts'
git commit -m "docs: define free beta provider configuration"
```

---

### Task 5: Full verification, push and Vercel deployment

**Files:**
- Modify only if verification reveals a release defect.
- Do not commit `.vercel`, `.env.local`, `.next`, Playwright output or secrets.

**Interfaces:**
- Consumes: the completed application from Tasks 1–4.
- Produces: a public Vercel production URL, linked GitHub repository and
  documented provider configuration.

- [ ] **Step 1: Run the complete local release gate**

Run each command and require exit code 0:

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run test:permissions
$env:APP_ORIGIN='https://grassroots-beta.vercel.app'
npm run build
$env:NEXT_PUBLIC_DATA_MODE='demo'
npx playwright test --workers=4
```

Expected: lint and type-check clean; all Vitest/security tests PASS; all 23 or
more production pages build; all Playwright mobile/tablet/desktop journeys PASS.

- [ ] **Step 2: Audit the release tree for credentials**

Read the sensitive values from `.env.local` in-process, compare them against all
tracked files and print only match counts and file names. Require:

```text
environment_files_tracked=0
exact_secret_matches=0
credential_pattern_files=0
```

Also run:

```powershell
git status --short
git diff --check
```

Expected: only intended committed files; no uncommitted release changes.

- [ ] **Step 3: Push the verified commits**

```powershell
git push origin main
```

Expected: `main` advances on `AKLondon1/GrassRoots` through the latest beta
commit.

- [ ] **Step 4: Authenticate and link Vercel**

Install/run the current Vercel CLI through `npx`, authenticate interactively,
and link the repository:

```powershell
npx vercel login
npx vercel link --yes
```

Choose the existing Vercel account and the project name `grassroots-beta`; if
that name is unavailable, accept Vercel's generated project name and use the
returned production URL consistently in every subsequent setting.

- [ ] **Step 5: Add Vercel environment variables without printing secrets**

For Production, Preview and Development where appropriate, configure:

```text
NEXT_PUBLIC_DATA_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
APP_ORIGIN
```

Use interactive `npx vercel env add` prompts or the Vercel dashboard. Never put
secret values on a command line, in terminal output or in a committed file.
Keep `RESEND_API_KEY`, `EMAIL_FROM`, Stripe, OpenAI, push and scanner variables
unset.

- [ ] **Step 6: Create the first production deployment**

Run:

```powershell
npx vercel deploy --prod --yes
```

Expected: Vercel returns a production `https://*.vercel.app` URL. If the URL
differs from the configured `APP_ORIGIN`, update `APP_ORIGIN` to the exact URL
and redeploy once.

- [ ] **Step 7: Configure Google OAuth and Supabase redirects**

In Google Cloud, create a Web application OAuth client with this exact
authorised redirect URI:

```text
https://mxpuicrkfnyychmwqhus.supabase.co/auth/v1/callback
```

In the Supabase GrassRoots project:

- enable Google and enter that client ID/secret;
- set Site URL to the exact Vercel production origin;
- allow the exact production `/auth/callback` URL;
- retain `http://localhost:3000/auth/callback` for local development;
- do not add a production wildcard.

This is the only mandatory interactive account configuration. Treat the Google
client secret as server-only.

- [ ] **Step 8: Verify the deployed beta**

Verify without exposing credentials:

```text
GET /                         -> 200
GET /sign-in                  -> 200 and Continue with Google visible
GET /api/health               -> 200, database reachable
GET /app                      -> redirects to /sign-in when signed out
```

Complete one real Google sign-in with an invited adult and confirm workspace
access. Complete one real Google sign-in without an invitation and confirm the
invitation-required state. Sign out and confirm the private route redirects.

- [ ] **Step 9: Record release evidence**

Update `README.md` and `docs/DEPLOYMENT.md` with the final public beta URL,
deployment date, Google OAuth enabled state, Resend disabled state and the
verification totals. Commit and push:

```powershell
git add -- 'README.md' 'docs/DEPLOYMENT.md'
git commit -m "docs: record public beta deployment"
git push origin main
```

Expected: GitHub `main` matches the deployed beta and contains no secrets.
