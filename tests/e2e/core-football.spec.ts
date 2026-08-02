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
  // "Fixtures and sessions", not "Event editor". lib/navigation/screen-copy.ts
  // overrides the heading for this screen while the navigation keeps the registry's
  // label, so the two legitimately differ. This assertion said "Event editor" and had
  // been failing since ea855c4, the baseline commit that introduced the override --
  // undetected because Playwright was not run again until the Phase 1 gate.
  await expect(page.getByRole("heading", { level: 1, name: "Fixtures and sessions" })).toBeVisible();
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

/**
 * The weekly loop, walked end to end in one session.
 *
 * WHAT THIS CAN AND CANNOT PROVE. These specs run in demo mode, where every form is
 * a preview and nothing is written -- that is what the "Demo only ... not saved"
 * status in the tests above is asserting. So this is a journey test, not a
 * persistence test: it proves a coach can get from editing an event to publishing a
 * squad, and a parent from an availability request to seeing their child's place,
 * with every screen rendering and no dead end between them.
 *
 * It follows that the loop cannot be closed here in the sense the Task 13 handoff
 * asks for. "Coach creates a fixture, parent replies available, coach selects,
 * parent sees their place" needs writes that survive a navigation, and demo mode has
 * none. Worth being plain about: in demo mode the router renders the DEMO screens,
 * so every production screen built in Tasks 6 to 12b is untouched by Playwright. The
 * signed-in browser pass against local Supabase is what covers those, and this file
 * does not substitute for it.
 */
test("demo mode only: the weekly loop is navigable, and nothing is persisted", async ({ page }) => {
  await page.goto("/app/riverside-juniors/event-editor?role=coach");
  await expect(page.getByRole("heading", { level: 1, name: "Fixtures and sessions" })).toBeVisible();
  await page.getByRole("textbox", { name: "Event title" }).fill("Sunday match v Meadow Park");
  await page.getByRole("button", { name: "Preview event changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo only" })).toBeVisible();

  await page.goto("/app/riverside-juniors/availability?role=parent");
  await expect(page.getByRole("heading", { level: 1, name: "Availability" })).toBeVisible();
  // `exact` matters: "Available" is a substring of "Unavailable", so the loose form
  // resolves to both radios and Playwright refuses in strict mode.
  await page.getByRole("radio", { name: "Available", exact: true }).check();
  await page.getByRole("button", { name: "Preview response" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo only" })).toBeVisible();

  await page.goto("/app/riverside-juniors/squad?role=coach");
  await expect(page.getByText("Selection guide", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Preview squad publication" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo only" })).toBeVisible();

  await page.goto("/app/riverside-juniors/squad?role=parent");
  await expect(page.getByRole("heading", { level: 1, name: "Squad status" })).toBeVisible();

  // The end of the loop for a family: the announcement telling them about it. This
  // is also the screen with no mark-as-read control, which is an outstanding write
  // path rather than a defect.
  await page.goto("/app/riverside-juniors/announcements?role=parent");
  await expect(page.getByRole("heading", { level: 1, name: "Announcements" })).toBeVisible();
});

test("the coach compose screen is reachable and renders its own heading", async ({ page }) => {
  // `compose` sits in both coachCoreSections and phase4CoachSections, so in
  // production the router needs a branch above the Phase 4 one or the composer is
  // never reached. Demo mode takes a different branch entirely, so this asserts only
  // that the route resolves rather than landing on a denial wall.
  await page.goto("/app/riverside-juniors/compose?role=coach");
  await expect(page.getByRole("heading", { level: 1, name: "Compose update" })).toBeVisible();
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
