import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("Flow 7: coach controls the resilient match clock by keyboard", async ({ page }) => {
  await page.goto("/app/riverside-juniors/match-day?role=coach");
  await expect(page.getByRole("heading", { level: 1, name: "Match day" })).toBeVisible();
  const start = page.getByRole("button", { name: "Start match" });
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Pause clock" })).toBeVisible();
  await page.getByRole("button", { name: "Pause clock" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/timestamp-derived/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("Flow 6: coach previews attendance without durable child data and reorders a training plan", async ({ page }) => {
  await page.goto("/app/riverside-juniors/attendance?role=coach");
  await page.getByRole("radio", { name: "Absent" }).first().check();
  await page.getByRole("button", { name: "Preview attendance" }).click();
  await expect(page.getByRole("status")).toContainText(/in memory only/i);
  await expect(page.getByText(/never placed in a durable browser queue/i)).toBeVisible();

  await page.goto("/app/riverside-juniors/training?role=coach");
  await page.getByRole("button", { name: "Move Small-sided game up" }).click();
  await page.getByRole("button", { name: "Preview training plan" }).click();
  await expect(page.getByRole("status")).toContainText(/55-minute plan/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("coaching and approved parent development views have no detectable axe violations", async ({ page }) => {
  for (const path of [
    "/app/riverside-juniors/match-day?role=coach",
    "/app/riverside-juniors/attendance?role=coach",
    "/app/riverside-juniors/training?role=coach",
    "/app/riverside-juniors/child?role=parent",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `Accessibility violations on ${path}`).toEqual([]);
  }
});
