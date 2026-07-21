import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("Flow 4: a pitch admin resolves a Saturday allocation conflict by keyboard", async ({ page }) => {
  await page.goto("/app/riverside-juniors/pitch-planner?role=club");
  await expect(page.getByRole("heading", { level: 1, name: "Pitch planner" })).toBeVisible();
  await page.getByLabel("Move Under 11s fixture").selectOption("pitch-2-1100");
  await page.getByRole("button", { name: "Preview relocation" }).click();
  await expect(page.getByRole("status")).toContainText("not saved");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("club staff find a document and prepare a safe export", async ({ page }) => {
  await page.goto("/app/riverside-juniors/documents?role=club");
  await expect(page.getByText("Pitch allocation policy")).toBeVisible();
  await page.getByRole("button", { name: "Preview CSV export" }).click();
  await expect(page.getByRole("status")).toContainText("watermarked");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("Flow 8: inspection closure resolves an event and its family calendar impact", async ({ page }) => {
  await page.goto("/app/riverside-juniors/inspections?role=club");
  await page.getByRole("button", { name: "Preview pitch closure" }).click();
  await expect(page.getByText("Affected event: Under 11s v Meadow Park")).toBeVisible();
  await page.getByLabel("Resolve affected Under 11s fixture").selectOption("cancel");
  await page.getByRole("button", { name: "Preview closure outcome" }).click();
  await expect(page.getByRole("status")).toContainText("removed from family calendar feeds");
  await expect(page.getByRole("status")).toContainText("urgent notice queued");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
