import { expect, test } from "@playwright/test";

test("demo sign-in offers an honest adult role journey", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(
    page.getByRole("heading", { level: 1, name: "Sign in to GrassRoots" }),
  ).toBeVisible();
  await expect(page.getByText(/fictional adult accounts/i)).toBeVisible();
  await expect(page.getByLabel(/email/i)).toHaveCount(0);

  await page.getByRole("link", { name: "Coach demo" }).click();

  await expect(page).toHaveURL(/\/app\/riverside-juniors\/today\?role=coach$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Today with Under 11s" }),
  ).toBeVisible();
  await expect(page.getByText(/changes are not saved/i)).toBeVisible();
});

test("demo session cannot be relabelled as another organisation", async ({ page }) => {
  await page.goto("/app/northfield-juniors/home?role=parent");

  await expect(page.getByRole("heading", { level: 1, name: "404" })).toBeVisible();
});
