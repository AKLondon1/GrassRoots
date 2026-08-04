import { expect, test } from "@playwright/test";

test.skip(
  process.env.NEXT_PUBLIC_DATA_MODE !== "supabase",
  "runs only in the explicit Supabase-mode release check",
);

test("Supabase sign-in offers both routes, invitation-gated", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();

  // Phase 14 made the magic link the second route, and the only one without a Google
  // account. This assertion used to be toHaveCount(0) -- written before 14a existed and
  // never executed since, because the spec is skipped unless NEXT_PUBLIC_DATA_MODE is
  // supabase and the demo Playwright run never sets it. The product was right and the
  // test was stale: sign-in-screen.tsx:119 renders MagicLinkForm, labelled at
  // magic-link-form.tsx:39-41. A check absent from the loop is indistinguishable from a
  // check that passes, which is precisely how it survived a whole phase inverted.
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /email me a sign-in link/i }),
  ).toBeVisible();

  await expect(
    page.getByText(/club invitation is still required/i),
  ).toBeVisible();
});

test("Supabase sign-in exposes no password field, on any route", async ({ page }) => {
  await page.goto("/sign-in");

  // Phase 14 decided magic links only, and the reason is worth restating where somebody
  // might be tempted to add one for a test: the moment a password path exists for a
  // test, it exists for an attacker. This codebase stores no password, so it owns no
  // reset flow, no strength policy and no credential-stuffing surface. Asserted in the
  // rendered DOM because preflight-auth.mjs can only assert the absence of the API call.
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});
