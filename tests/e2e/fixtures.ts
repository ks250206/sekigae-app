import { test as base, expect, type Download, type Page } from "@playwright/test";

/** 各テストを空の localStorage から開始する */
export const test = base.extend<{ freshPage: Page }>({
  freshPage: async ({ page }, provide) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("__e2e_init__")) {
        localStorage.clear();
        sessionStorage.setItem("__e2e_init__", "1");
      }
    });
    await provide(page);
  },
});

export { expect };

/** ダウンロードを待ってファイル名と中身を返す */
export async function captureDownload(page: Page, trigger: () => Promise<unknown>) {
  const [download] = await Promise.all([page.waitForEvent("download"), trigger()]);
  const d = download as Download;
  const path = await d.path();
  return { filename: d.suggestedFilename(), path };
}
