import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const roleScreens = [
  { role: "parent", label: "parent", path: "/app/riverside-juniors/home?role=parent", heading: "Your football week" },
  { role: "coach", label: "coach", path: "/app/riverside-juniors/today?role=coach", heading: "Today" },
  { role: "club", label: "club administrator", path: "/app/riverside-juniors/overview?role=club", heading: "Overview" },
  { role: "club", label: "pitch administrator", path: "/app/riverside-juniors/pitch-planner?role=club", heading: "Pitch planner" },
  { role: "club", label: "treasurer", path: "/app/riverside-juniors/payments?role=club", heading: "Payments" },
  { role: "club", label: "welfare officer", path: "/app/riverside-juniors/safeguarding?role=club&clubRole=welfare", heading: "Safeguarding" },
  { role: "platform", label: "platform operator", path: "/app/riverside-juniors/health?role=platform", heading: "System health" },
] as const;

test.describe("release role screens", () => {
  for (const screen of roleScreens) {
    test(`${screen.label} is keyboard reachable, responsive, reduced-motion safe and axe clean`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(screen.path);
      await expect(page.getByRole("heading", { level: 1, name: screen.heading })).toBeVisible();
      await expect(page.getByText(/Preview data is fictional and remains in this browser session only/i)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, `${screen.label} accessibility violations`).toEqual([]);
    });
  }
});
