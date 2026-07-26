import { expect, test } from "@playwright/test";

test("Flow 1: club admin completes the fictional setup and people-import journey", async ({
  page,
}) => {
  await page.goto("/app/riverside-juniors/people?role=club");

  await expect(
    page.getByRole("heading", { level: 1, name: "People" }),
  ).toBeVisible();
  await expect(page.getByText(/changes are not saved/i)).toBeVisible();
  const clubSetup = page.getByRole("region", { name: "Club setup" });
  await expect(clubSetup.getByText("Riverside Juniors", { exact: true })).toBeVisible();
  await expect(clubSetup.getByText("2026/27 season", { exact: true })).toBeVisible();
  await expect(clubSetup.getByText("Under 7s", { exact: true })).toBeVisible();
  await expect(page.getByText(/no email has been sent/i)).toBeVisible();

  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible();
  await expect(page.getByText("1 row ready")).toBeVisible();
  await expect(page.getByText(/nothing has been added yet/i)).toBeVisible();

  await page.getByRole("button", { name: "Apply 1 row" }).click();
  await expect(page.getByText("1 person added to this demo")).toBeVisible();
  await expect(page.getByText(/not saved to supabase/i)).toBeVisible();
});
