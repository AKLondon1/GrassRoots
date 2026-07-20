import { expect, test } from "@playwright/test";

test("illustrative workspace shell adapts navigation and role content", async ({
  page,
}, testInfo) => {
  await page.goto("/app/riverside-juniors");
  await expect(page).toHaveURL(
    /\/app\/riverside-juniors\/home\?role=parent$/,
  );

  await expect(page.getByText(/illustrative demo/i)).toBeVisible();
  await expect(page.getByText(/changes are not saved/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Your football week" }),
  ).toBeVisible();

  const navigationName =
    testInfo.project.name === "desktop"
      ? "Parent navigation"
      : "Parent mobile navigation";
  const navigation = page.getByRole("navigation", { name: navigationName });
  await expect(navigation).toBeVisible();
  await expect(navigation).toBeInViewport();

  const scheduleLink = navigation.getByRole("link", { name: "Schedule" });
  await expect(scheduleLink).toHaveAttribute(
    "href",
    "/app/riverside-juniors/schedule?role=parent",
  );

  await page.getByRole("combobox", { name: "Preview role" }).selectOption("coach");
  await expect(page).toHaveURL(/\/app\/riverside-juniors\/today\?role=coach$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Today with Under 11s" }),
  ).toBeVisible();
});

test("workspace route distinguishes denied and unknown sections", async ({ page }) => {
  await page.goto("/app/riverside-juniors/today?role=parent");
  await expect(
    page.getByRole("heading", { name: "Today is not available for this role" }),
  ).toBeVisible();
  await expect(page.getByText(/does not include permission/i)).toBeVisible();

  await page.goto("/app/riverside-juniors/not-a-real-screen?role=parent");
  await expect(page.getByRole("heading", { level: 1, name: "404" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
    "content",
    /noindex/,
  );
});
