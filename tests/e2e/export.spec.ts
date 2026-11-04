import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { captureDownload, expect, test } from "./fixtures";

/** src/features/export/e2e.ts が navigator.webdriver のときだけ公開するフック */
type HookWindow = { __sekigaeExportTest?: { loadFixture: () => void } };

async function openWithFixture(page: import("@playwright/test").Page) {
  await page.goto("./#/export");
  await page.waitForFunction(() => !!(globalThis as unknown as HookWindow).__sekigaeExportTest);
  await page.evaluate(() =>
    (globalThis as unknown as HookWindow).__sekigaeExportTest!.loadFixture(),
  );
  await expect(page.getByTestId("export-preview").getByRole("figure")).toHaveCount(3);
}

async function slideTexts(path: string) {
  const zip = await JSZip.loadAsync(await readFile(path));
  const files = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  const xml = await Promise.all(files.map((f) => zip.file(f)!.async("string")));
  return { count: files.length, text: xml.join("\n") };
}

test("downloads XLSX in Japanese", async ({ freshPage: page }) => {
  await openWithFixture(page);
  await expect(page.getByTestId("export-warning-unassigned")).toBeVisible();
  await page.getByTestId("export-format-xlsx").click();
  await page.getByTestId("export-lang-ja").click();
  const input = page.getByTestId("export-filename");
  await expect(input).toHaveValue(/^テスト研究室_座席表_\d{4}-\d{2}-\d{2}$/);
  // 非 ASCII のダウンロード名は UTF-8 ロケールでない headless Chromium で "download" になるため ASCII で検証
  await input.fill("e2e-ja");
  const { filename, path } = await captureDownload(page, () =>
    page.getByTestId("export-download").first().click(),
  );
  expect(filename).toBe("e2e-ja.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const names = wb.worksheets.map((w) => w.name);
  expect(names).toEqual(
    expect.arrayContaining(["座席表_301 号室", "名簿", "部屋別一覧", "未配置"]),
  );
  expect(wb.getWorksheet("名簿")!.getCell("A1").value).toBe("氏名");
  await expect(page.getByTestId("export-progress")).toContainText(filename);
});

test("downloads PPTX in English independent of the UI language", async ({ freshPage: page }) => {
  await openWithFixture(page);
  await page.getByTestId("export-format-pptx").click();
  await page.getByTestId("export-lang-en").click();
  await page.getByTestId("export-composition").click();
  // UI は日本語のまま
  await expect(page.locator("main h1")).toHaveText("出力");
  const input = page.getByTestId("export-filename");
  await expect(input).toHaveValue(/^テスト研究室_seating_\d{4}-\d{2}-\d{2}$/);
  await input.fill("e2e-en");
  const { filename, path } = await captureDownload(page, () =>
    page.getByTestId("export-download").first().click(),
  );
  expect(filename).toBe("e2e-en.pptx");
  const { count, text } = await slideTexts(path);
  // 表紙 + 全体図 + 3 部屋 + 構成表
  expect(count).toBe(6);
  expect(text).toContain("Floor overview");
  expect(text).toContain("Room composition");
  expect(text).toContain("Entrance");

  // 選択は記憶される
  await page.reload();
  await page.waitForFunction(() => !!(globalThis as unknown as HookWindow).__sekigaeExportTest);
  await page.evaluate(() =>
    (globalThis as unknown as HookWindow).__sekigaeExportTest!.loadFixture(),
  );
  await expect(page.getByTestId("export-format-pptx")).toHaveAttribute("data-state", "on");
  await expect(page.getByTestId("export-lang-en")).toHaveAttribute("data-state", "on");
});

test("downloads a PNG of the selected rooms", async ({ freshPage: page }) => {
  await openWithFixture(page);
  await page.getByTestId("export-format-png").click();
  await page.getByTestId("export-filename").fill("e2e-floor");
  const { filename, path } = await captureDownload(page, () =>
    page.getByTestId("export-download").first().click(),
  );
  expect(filename).toBe("e2e-floor.png");
  const bytes = await readFile(path);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
});
