import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Flow 2: parent responds to availability on a responsive task screen", async ({ page }) => {
  await page.goto("/app/riverside-juniors/availability?role=parent");
  await expect(page.getByRole("heading", { level: 1, name: "Availability" })).toBeVisible();
  await page.getByRole("radio", { name: "Unavailable" }).check();
  await page.getByRole("button", { name: "Preview response" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo only" })).toContainText("not saved");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Flow 3: parent answers a capacity-aware time poll", async ({ page }) => {
  await page.goto("/app/riverside-juniors/polls?role=parent");
  await expect(page.getByRole("heading", { level: 1, name: "Time polls" })).toBeVisible();
  await page.getByRole("radio", { name: /Saturday 5 September · 11:00/i }).check();
  await page.getByRole("button", { name: "Preview poll response" }).click();
  await expect(page.getByRole("status")).toContainText(/not saved/i);
  await expect(page.getByText(/capacity 9 · recommended/i)).toBeVisible();
});

test("coach validates an event edit and previews the change scope", async ({ page }) => {
  await page.goto("/app/riverside-juniors/event-editor?role=coach");
  await expect(page.getByRole("heading", { level: 1, name: "Event editor" })).toBeVisible();
  await page.getByRole("textbox", { name: "Event title" }).fill("");
  await page.getByRole("button", { name: "Preview event changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter an event title" })).toContainText("Enter an event title");
  await page.getByRole("textbox", { name: "Event title" }).fill("Thursday training");
  await page.getByLabel("Apply changes to").selectOption("this-and-future");
  await page.getByRole("button", { name: "Preview event changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo only" })).toContainText("not saved");
});

test("Flow 5: coach can preview a fair squad publication", async ({ page }) => {
  await page.goto("/app/riverside-juniors/squad?role=coach");
  await expect(page.getByText("Selection guide", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Preview squad publication" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo only" })).toContainText("No notifications were sent");
});

test("core parent and coach task screens have no detectable accessibility violations", async ({ page }) => {
  for (const path of [
    "/app/riverside-juniors/availability?role=parent",
    "/app/riverside-juniors/event-editor?role=coach",
    "/app/riverside-juniors/squad?role=coach",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `Accessibility violations on ${path}`).toEqual([]);
  }
});
