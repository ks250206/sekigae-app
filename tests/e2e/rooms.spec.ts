import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** ワールド座標（セル単位）→ 画面座標 */
async function worldPoint(page: Page, wx: number, wy: number) {
  const svg = page.getByTestId("floor-canvas");
  const vb = (await svg.getAttribute("viewBox"))!.split(" ").map(Number);
  const r = (await svg.boundingBox())!;
  const s = r.width / vb[2]!;
  return { x: r.x + (wx - vb[0]!) * s, y: r.y + (wy - vb[1]!) * s };
}

/** 部屋 (0,0) にあるセル (x, y) の中心をクリック */
async function clickCell(page: Page, x: number, y: number, opts?: { shift?: boolean }) {
  const p = await worldPoint(page, x + 0.5, y + 0.5);
  if (opts?.shift) await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y);
  if (opts?.shift) await page.keyboard.up("Shift");
}

async function dragCells(page: Page, from: [number, number], to: [number, number], shift = false) {
  const a = await worldPoint(page, from[0] + 0.5, from[1] + 0.5);
  const b = await worldPoint(page, to[0] + 0.5, to[1] + 0.5);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}

const seatCount = (page: Page) => page.getByTestId("room-seat-count").first();

async function addRoom(page: Page, name: string) {
  await page.getByTestId("add-room").click();
  await page.getByTestId("add-room-name").fill(name);
  await page.getByTestId("add-room-submit").click();
  await expect(page.getByTestId("room-row").filter({ hasText: name })).toBeVisible();
}

test.beforeEach(async ({ freshPage: page }) => {
  await page.goto("./#/rooms");
  await expect(page.getByTestId("floor-canvas")).toBeVisible();
});

test("add a room, rename it, place seats and entrances with undo/redo", async ({
  freshPage: page,
}) => {
  await expect(page.getByTestId("rooms-empty")).toBeVisible();
  await addRoom(page, "居室A");
  await expect(page.getByTestId("rooms-empty")).toHaveCount(0);

  // インライン名前変更
  await page.getByTestId("room-row").first().dblclick();
  const input = page.getByTestId("room-rename-input");
  await input.fill("居室B");
  await input.press("Enter");
  await expect(page.getByTestId("room-name").first()).toHaveText("居室B");

  // 席ツール: クリックで 2 席
  await page.keyboard.press("s");
  await expect(page.getByTestId("tool-seat")).toHaveAttribute("aria-pressed", "true");
  await clickCell(page, 1, 1);
  await clickCell(page, 2, 1);
  await expect(seatCount(page)).toHaveText("2 席");

  // 選択ツールで席を選ぶと、自動採番されたラベルが見える
  await page.keyboard.press("v");
  await clickCell(page, 1, 1);
  await expect(page.getByTestId("inspector-seat-label")).toHaveValue("B-01");

  // R で回転
  await page.keyboard.press("r");
  await expect(page.getByTestId("facing-e")).toHaveAttribute("aria-checked", "true");

  // 入口ツール: 上辺に追加（空の部屋テンプレートは下辺に 1 つ）
  await page.keyboard.press("Escape");
  await page.keyboard.press("e");
  const top = await worldPoint(page, 4.5, 0.15);
  await page.mouse.click(top.x, top.y);
  await page.keyboard.press("v");
  await page.getByTestId("room-row").first().click();
  await expect(page.getByTestId("inspector")).toContainText("入口");
  const entrances = page.locator('[data-testid="floor-canvas"] [data-entrance-id]');
  await expect(entrances).toHaveCount(2);

  // Undo / Redo
  await page.getByTestId("undo").click();
  await expect(entrances).toHaveCount(1);
  await page.getByTestId("redo").click();
  await expect(entrances).toHaveCount(2);
});

test("paints an L-shape with void cells as a single undo step", async ({ freshPage: page }) => {
  await addRoom(page, "L");
  await page.keyboard.press("x");
  // Shift+ドラッグで右上 3×3 を部屋外に
  await dragCells(page, [5, 0], [7, 2], true);

  // 部屋外には席を置けない
  await page.keyboard.press("s");
  await clickCell(page, 6, 1);
  await expect(seatCount(page)).toHaveText("0 席");
  await clickCell(page, 1, 4);
  await expect(seatCount(page)).toHaveText("1 席");

  // 席の追加を戻し、続けて塗りも 1 回で戻る
  await page.getByTestId("undo").click();
  await expect(seatCount(page)).toHaveText("0 席");
  await page.getByTestId("undo").click();
  await clickCell(page, 6, 1);
  await expect(seatCount(page)).toHaveText("1 席");
});

test("inserts a seat template and undoes it in one step", async ({ freshPage: page }) => {
  await addRoom(page, "T");
  await page.getByTestId("template-button").click();
  await page.getByTestId("template-island2x2").click();
  await expect(page.getByTestId("tool-hint")).toContainText("クリックで配置");
  await clickCell(page, 3, 2);
  await expect(seatCount(page)).toHaveText("4 席");
  await page.getByTestId("undo").click();
  await expect(seatCount(page)).toHaveText("0 席");
});

test("drags a room by its header as a single undo step", async ({ freshPage: page }) => {
  await addRoom(page, "M");
  await page.getByTestId("room-row").first().click();
  await expect(page.getByTestId("inspector")).toContainText("位置: (0, 0)");
  const a = await worldPoint(page, 2, -0.4);
  const b = await worldPoint(page, 5, 2.6);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("inspector")).toContainText("位置: (3, 3)");
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("inspector")).toContainText("位置: (0, 0)");
});

test("shortcuts are disabled while typing and heatmap toggles", async ({ freshPage: page }) => {
  await addRoom(page, "K");
  await page.getByTestId("inspector-room-name").click();
  await page.keyboard.type("s");
  await expect(page.getByTestId("tool-seat")).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("inspector-room-name").press("Escape");
  await page.getByTestId("floor-canvas").focus();
  await page.keyboard.press("Shift+H");
  await expect(page.getByTestId("depth-heatmap")).toBeVisible();
  await expect(page.getByTestId("heatmap-legend")).toBeVisible();
});
