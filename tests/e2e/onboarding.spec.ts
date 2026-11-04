import { expect, test } from "./fixtures";

test("first run shows welcome; sample loads and dialog does not return", async ({
  firstRunPage: page,
}) => {
  await page.goto("./");
  const dialog = page.getByTestId("welcome-dialog");
  await expect(dialog).toBeVisible();
  await page.getByLabel(/ガイドツアー|guided tour/i).uncheck();
  await page.getByTestId("welcome-sample").click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("welcome-dialog")).toBeHidden();
});

test("start empty and open shortcuts from help menu", async ({ firstRunPage: page }) => {
  await page.goto("./");
  await page.getByLabel(/ガイドツアー|guided tour/i).uncheck();
  await page.getByTestId("welcome-empty").click();
  await page.getByTestId("help-menu").click();
  await page.getByRole("menuitem", { name: /ショートカット|shortcuts/i }).click();
  await expect(page.getByRole("dialog")).toContainText(/元に戻す|Undo/);
});

test("guided tour starts and can be closed", async ({ freshPage: page }) => {
  await page.goto("./#/rooms");
  await page.getByTestId("help-menu").click();
  await page.getByRole("menuitem", { name: /ガイドツアー|guided tour/i }).click();
  await expect(page.locator(".driver-popover")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".driver-popover")).toBeHidden();
});
