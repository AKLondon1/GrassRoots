import { expect, test } from "@playwright/test";

test("public page exposes the GrassRoots identity", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/GrassRoots/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await expect(
    page.getByRole("heading", { level: 1, name: /the week in football, sorted/i }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText(
    "Football organised around people.",
  );
});

test("public page keeps its main journey touch-safe and free of horizontal overflow", async ({
  page,
}) => {
  await page.goto("/");

  const primaryAction = page.getByRole("link", { name: /see the weekly view/i });
  const actionBox = await primaryAction.boundingBox();

  expect(actionBox?.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);

  await primaryAction.click();
  await expect(page.locator("#weekly-view")).toBeInViewport();
});

test("product showcase remains stable when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const showcase = page.getByTestId("container-scroll-card");
  await expect(showcase).toHaveCSS("transform", "none");
  await expect(showcase).toBeVisible();
});
