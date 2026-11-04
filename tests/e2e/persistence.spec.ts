import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { captureDownload, expect, test } from "./fixtures";

async function openProjectDialog(page: Page) {
  await page.getByTestId("project-switcher").click();
  await page.getByTestId("project-manage").click();
  await expect(page.getByTestId("project-dialog")).toBeVisible();
}

async function renameCurrentProject(page: Page, name: string) {
  await openProjectDialog(page);
  const row = page.locator('[data-testid="project-row"][data-current]');
  await row.getByTestId("project-rename").click();
  await row.getByTestId("project-rename-input").fill(name);
  await row.getByTestId("project-rename-input").press("Enter");
  await expect(row.getByTestId("project-row-name")).toHaveText(name);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("project-dialog")).toBeHidden();
}

const readProjects = (page: Page) =>
  page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith("sekigae:v1:project:"))
      .map((k) => JSON.parse(localStorage.getItem(k)!) as Record<string, unknown>),
  );

test("restores edits after reload", async ({ freshPage: page }) => {
  await page.goto("./#/rooms");
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved");
  await renameCurrentProject(page, "2026年度 E2E研");
  await page.reload();
  await expect(page.getByTestId("project-name")).toHaveText("2026年度 E2E研");
});

test("exports a project and imports it as a new project", async ({ freshPage: page }) => {
  await page.goto("./#/rooms");
  await renameCurrentProject(page, "Export Me");
  await openProjectDialog(page);

  const { filename, path } = await captureDownload(page, () =>
    page.getByTestId("export-project").click(),
  );
  expect(filename).toMatch(/^Export Me_\d{4}-\d{2}-\d{2}\.sekigae\.json$/);
  const exported = JSON.parse(await readFile(path!, "utf8"));
  expect(exported).toMatchObject({ app: "sekigae", kind: "project", data: { name: "Export Me" } });

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("import-json").click(),
  ]);
  await chooser.setFiles(path!);
  // 同じ ID が既にあるので取り込み方法を選ぶ
  await page.getByTestId("choice-new").click();
  await expect(page.getByTestId("project-row")).toHaveCount(2);

  const projects = await readProjects(page);
  expect(projects).toHaveLength(2);
  const [a, b] = projects as [Record<string, unknown>, Record<string, unknown>];
  expect(a.id).not.toBe(b.id);
  const strip = ({ id: _id, updatedAt: _u, ...rest }: Record<string, unknown>) => rest;
  expect(strip(a)).toEqual(strip(b));
});

test("warns when another tab updates the project", async ({ freshPage: page, context }) => {
  await page.goto("./#/rooms");
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved");
  const other = await context.newPage();
  await other.goto("./#/rooms");
  await expect(other.getByTestId("project-name")).toHaveText(
    (await page.getByTestId("project-name").textContent())!,
  );

  await renameCurrentProject(page, "Changed in tab A");
  await expect(other.getByTestId("conflict-banner")).toBeVisible();
  await other.getByTestId("conflict-reload").click();
  await expect(other.getByTestId("conflict-banner")).toBeHidden();
  await expect(other.getByTestId("project-name")).toHaveText("Changed in tab A");
});

test("recovers from corrupt saved data without losing it", async ({ freshPage: page }) => {
  await page.goto("./#/rooms");
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved");
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("sekigae:v1:project:"))!;
    localStorage.setItem(key, '{"schemaVersion":1,"broken":');
  });
  await page.reload();
  await expect(page.getByTestId("recovery-dialog")).toBeVisible();
  await page.getByTestId("recovery-start-empty").click();
  await expect(page.getByTestId("recovery-dialog")).toBeHidden();
  const backups = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("sekigae:v1:corrupt:")),
  );
  expect(backups).toHaveLength(1);
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-state", "saved");
});
