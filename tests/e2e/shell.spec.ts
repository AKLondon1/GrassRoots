import { expect, test } from "@playwright/test";

test("illustrative workspace shell adapts navigation and role content", async ({
  page,
}, testInfo) => {
  await page.goto("/app/riverside-juniors");

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

  await page.getByRole("combobox", { name: "Preview role" }).selectOption("coach");
  await expect(
    page.getByRole("heading", { level: 1, name: "Today with Under 11s" }),
  ).toBeVisible();
});
