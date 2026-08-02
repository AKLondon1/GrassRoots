import { expect, test, type Page } from "@playwright/test";

import { waitForMagicLink } from "./support/mailpit";

const WORKSPACE_PATH = "/app/riverside-juniors";
const ALEX_SMOKE_PATH = `${WORKSPACE_PATH}/announcements?role=parent`;
const IDENTITIES = {
  alex: "alex.morgan@example.test",
  morgan: "morgan.lee@example.test",
  priya: "priya.shah@example.test",
  sam: "sam.taylor@example.test",
} as const;

function localDateTimeAfter(minutes: number) {
  const value = new Date(Date.now() + minutes * 60_000);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.NEXT_PUBLIC_DATA_MODE !== "supabase",
  "This suite requires the dedicated local Supabase configuration.",
);

async function signInThroughMailpit(page: Page, email: string, nextPath: string) {
  await page.context().clearCookies();
  await page.goto(`/sign-in?next=${encodeURIComponent(nextPath)}`);

  await page.getByLabel("Email address").fill(email);
  const requestedAfter = new Date();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(
    page.getByText("If that address has an account, a sign-in link is on its way."),
  ).toBeVisible();

  const confirmationUrl = await waitForMagicLink({
    email,
    requestedAfter,
    timeoutMs: 15_000,
  });
  const browserConfirmationUrl = new URL(confirmationUrl);
  // Supabase advertises its local API on 127.0.0.1, while this test's exact
  // callback allowlist and managed web server use localhost. Both names resolve
  // to this machine; normalising only the already-validated Auth origin keeps the
  // browser on one loopback host through the redirect.
  browserConfirmationUrl.hostname = "localhost";
  try {
    await page.goto(browserConfirmationUrl.toString());
  } catch {
    // The URL contains a one-time credential. Never let Playwright echo it into
    // the test log if local Auth navigation fails.
    throw new Error("The local confirmation navigation failed.");
  }
  await page.waitForURL((url) => url.pathname.startsWith(WORKSPACE_PATH));
}

test("signs in through the caught magic link", async ({ page }) => {
  await signInThroughMailpit(page, IDENTITIES.alex, ALEX_SMOKE_PATH);

  await expect(page.getByText("Organisation access", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign out of this session" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Choose a child" })).toContainText(
    "Jamie",
  );
  await expect(page.getByRole("navigation", { name: "Choose a child" })).toContainText(
    "Maya",
  );
});

test("persists the coach-to-parent weekly journey", async ({ page }) => {
  const fixtureTitle = `Phase 15 weekly journey ${Date.now()}`;
  const fixture = {
    responseDeadline: localDateTimeAfter(60),
    startsAt: localDateTimeAfter(120),
    movedStartsAt: localDateTimeAfter(150),
    endsAt: localDateTimeAfter(210),
    movedEndsAt: localDateTimeAfter(240),
    initialLocation: "Phase 15 pitch",
    movedLocation: "Phase 15 main pitch",
  } as const;
  const coachEditor = `${WORKSPACE_PATH}/event-editor?role=coach`;

  await signInThroughMailpit(page, IDENTITIES.sam, coachEditor);
  await expect(
    page.getByRole("heading", { level: 1, name: "Fixtures and sessions" }),
  ).toBeVisible();

  const createForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Add to the calendar" }),
  });
  await createForm.getByLabel("Kind").selectOption("match");
  await createForm.getByLabel("Title").fill(fixtureTitle);
  await createForm.getByLabel("Location").fill(fixture.initialLocation);
  await createForm.getByLabel("Starts").fill(fixture.startsAt);
  await createForm.getByLabel("Ends").fill(fixture.endsAt);
  await createForm.getByLabel("Replies needed by").fill(fixture.responseDeadline);
  await createForm.getByRole("button", { name: "Add to the calendar" }).click();

  await expect(page.getByRole("listitem").filter({ hasText: fixtureTitle })).toBeVisible();
  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  const fixtureCard = page.getByRole("article").filter({ hasText: fixtureTitle });
  await expect(fixtureCard).toBeVisible();
  const squadHref = await fixtureCard.getByRole("link", { name: "Pick the squad" }).getAttribute("href");
  expect(squadHref).toMatch(/^\/app\/riverside-juniors\/squad\?role=coach&instance=[0-9a-f-]+$/);

  await signInThroughMailpit(
    page,
    IDENTITIES.alex,
    `${WORKSPACE_PATH}/availability?role=parent`,
  );
  const childSelector = page.getByRole("navigation", { name: "Choose a child" });
  await childSelector.getByRole("link", { name: "Jamie" }).click();
  const availabilityCard = page.getByRole("article").filter({ hasText: fixtureTitle });
  await availabilityCard.getByRole("radio", { name: "available", exact: true }).check();
  await availabilityCard.getByRole("button", { name: "Save availability" }).click();
  await expect(availabilityCard.getByText("available", { exact: true })).toBeVisible();

  await signInThroughMailpit(page, IDENTITIES.sam, squadHref!);
  await page.getByRole("button", { name: "Start picking" }).click();
  const jamieRow = page.getByRole("listitem").filter({ hasText: "Jamie Morgan" });
  await jamieRow.getByRole("checkbox", { name: "Playing" }).check();
  await page.getByRole("button", { name: "Save selection" }).click();
  await page.getByRole("button", { name: "Publish squad to families" }).click();
  await expect(page.getByText("Published to families", { exact: true })).toBeVisible();

  await signInThroughMailpit(page, IDENTITIES.alex, `${WORKSPACE_PATH}/squad?role=parent`);
  await page.getByRole("navigation", { name: "Choose a child" }).getByRole("link", { name: "Jamie" }).click();
  const jamieSquad = page.getByRole("region", {
    name: "Squad status for Jamie Morgan",
  });
  const latestJamiePlace = jamieSquad.getByRole("article").first();
  await expect(latestJamiePlace.getByRole("heading", { name: "Jamie Morgan", exact: true })).toBeVisible();
  await expect(latestJamiePlace).toContainText(
    "A place is confirmed in the published squad.",
  );
  await page.getByRole("navigation", { name: "Choose a child" }).getByRole("link", { name: "Maya" }).click();
  await expect(page.getByRole("heading", { name: "No published squad status" })).toBeVisible();
  await expect(page.getByText("Jamie Morgan", { exact: true })).toHaveCount(0);

  await signInThroughMailpit(page, IDENTITIES.sam, coachEditor);
  const fixtureRow = page.getByRole("listitem").filter({ hasText: fixtureTitle });
  const moveForm = fixtureRow.locator("form").filter({
    has: page.getByRole("button", { name: "Move it" }),
  });
  await moveForm.getByLabel("New start").fill(fixture.movedStartsAt);
  await moveForm.getByLabel("New end").fill(fixture.movedEndsAt);
  await moveForm.getByLabel("Location").fill(fixture.movedLocation);
  await moveForm.getByRole("button", { name: "Move it" }).click();
  await expect(moveForm.getByLabel("New start")).toHaveValue(fixture.movedStartsAt);
  await expect(moveForm.getByLabel("Location")).toHaveValue(fixture.movedLocation);

  await signInThroughMailpit(page, IDENTITIES.alex, `${WORKSPACE_PATH}/event?role=parent`);
  await page.getByRole("navigation", { name: "Choose a child" }).getByRole("link", { name: "Jamie" }).click();
  await expect(page.getByTestId("parent-event")).toContainText(fixtureTitle);
  await expect(page.getByTestId("parent-event")).toContainText(fixture.movedLocation);
  await expect(page.getByRole("complementary", { name: "What changed" })).toBeVisible();
});

test("enforces the four signed-in role tiers", async ({ page }) => {
  await signInThroughMailpit(page, IDENTITIES.alex, ALEX_SMOKE_PATH);
  const alexChildren = page.getByRole("navigation", { name: "Choose a child" });
  await expect(alexChildren.getByRole("link", { name: "Jamie" })).toBeVisible();
  await expect(alexChildren.getByRole("link", { name: "Maya" })).toBeVisible();

  await signInThroughMailpit(
    page,
    IDENTITIES.sam,
    `${WORKSPACE_PATH}/home?role=parent`,
  );
  await expect(page.getByRole("heading", { name: "Rowan’s football week" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Choose a child" })).toHaveCount(0);
  await expect(page.getByText("Jamie", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Maya", { exact: true })).toHaveCount(0);

  await signInThroughMailpit(
    page,
    IDENTITIES.priya,
    `${WORKSPACE_PATH}/pitch-planner?role=club`,
  );
  await expect(page.getByRole("heading", { level: 1, name: "Pitch planner" })).toBeVisible();
  const fixtureSelect = page.getByLabel("Fixture");
  await expect(fixtureSelect).toBeVisible();
  await expect(fixtureSelect.getByRole("option")).not.toHaveCount(0);
  await expect(fixtureSelect).toContainText("Phase 15 weekly journey");

  await signInThroughMailpit(
    page,
    IDENTITIES.morgan,
    `${WORKSPACE_PATH}/home?role=parent`,
  );
  await expect(
    page.getByRole("heading", { name: "Home is not available for this role" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Jamie");
  await expect(page.locator("body")).not.toContainText("Maya");
  await expect(page.locator("body")).not.toContainText("Rowan");
  await expect(page.locator("body")).not.toContainText("Phase 15 weekly journey");
});
