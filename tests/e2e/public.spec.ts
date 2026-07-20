import { expect, test } from "@playwright/test";

test("public page exposes the GrassRoots identity", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/GrassRoots/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
});
