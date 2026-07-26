import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("Flow 9: parent sees a truthful manual payment contract", async ({ page }) => {
  await page.goto("/app/riverside-juniors/payments?role=parent");
  await expect(page.getByRole("heading", { level: 1, name: "Payments" })).toBeVisible();
  await page.getByRole("button", { name: /preview manual payment/i }).click();
  await expect(page.getByRole("status")).toContainText("not been charged");
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("Flow 10: welfare area communicates restriction and audit", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app/riverside-juniors/safeguarding?role=club");
  await expect(page.getByText(/detail hidden/i)).toBeVisible();
  await page.goto("/app/riverside-juniors/safeguarding?role=club&clubRole=welfare");
  await expect(page.getByRole("heading", { level: 1, name: "Safeguarding" })).toBeVisible();
  await expect(page.getByText(/welfare officers only/i)).toBeVisible();
  await expect(page.getByText(/metadata-only audit/i)).toBeVisible();
  await page.getByRole("button", { name: /preview audited open/i }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText(/no restricted record was opened/i);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("treasurer and platform operational views remain responsive", async ({ page }) => {
  await page.goto("/app/riverside-juniors/payments?role=club");
  await expect(page.getByText("Member payments and reconciliation")).toBeVisible();
  await page.goto("/app/riverside-juniors/provider-usage?role=platform");
  await expect(page.getByText("Provider metering")).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

async function horizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
