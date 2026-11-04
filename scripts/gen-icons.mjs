// public/favicon.svg から PWA 用 PNG アイコンを生成する (Playwright の Chromium を利用)
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const svg = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function render(size, padding, out) {
  const inner = size - padding * 2;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:${padding ? "#6366f1" : "transparent"}">` +
      `<div style="padding:${padding}px">` +
      svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `) +
      `</div></body></html>`,
  );
  const buf = await page.screenshot({
    omitBackground: !padding,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  await writeFile(new URL(`../public/${out}`, import.meta.url), buf);
}

await render(192, 0, "pwa-192.png");
await render(512, 0, "pwa-512.png");
await render(512, 64, "pwa-maskable-512.png");
await render(180, 0, "apple-touch-icon.png");
await browser.close();
console.log("icons generated");
