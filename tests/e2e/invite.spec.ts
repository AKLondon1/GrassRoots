import { expect, test } from "@playwright/test";

test("demo invitation route is honest and non-actionable", async ({ page }) => {
  await page.goto("/invite/fictional-token");

  await expect(page.getByRole("heading", { name: "Club invitation" })).toBeVisible();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Invitations are unavailable in demo mode",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /accept/i })).toHaveCount(0);
});
