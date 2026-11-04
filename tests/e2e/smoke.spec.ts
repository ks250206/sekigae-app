import { expect, test } from "./fixtures";

const steps = ["rooms", "members", "rules", "seating", "export"] as const;

test("navigates through all steps", async ({ freshPage: page }) => {
  await page.goto("./");
  await expect(page).toHaveURL(/#\/rooms/);
  for (const step of steps) {
    await page.locator(`header [data-tour="step-${step}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#/${step}`));
    await expect(page.locator("main h1")).toBeVisible();
  }
});

test("switches language and theme", async ({ freshPage: page }) => {
  await page.goto("./#/rooms");
  await page.getByTestId("language-menu").click();
  await page.getByRole("menuitem", { name: "English" }).click();
  await expect(page.locator("main h1")).toHaveText("Rooms");
  await page.getByTestId("theme-menu").click();
  await page.getByRole("menuitem", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("main h1")).toHaveText("Rooms");
});
