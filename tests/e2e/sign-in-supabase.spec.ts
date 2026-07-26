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
  await expect(
    page.getByText(/club invitation is still required/i),
  ).toBeVisible();
});
