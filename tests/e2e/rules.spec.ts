import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** ルール画面を開き、テスト用プロジェクト（3 部屋・30 名）を読み込む */
async function openRules(page: Page) {
  await page.goto("./#/rules");
  await page.waitForFunction(() => !!(globalThis as { __sekigae?: unknown }).__sekigae);
  await page.evaluate(async () => {
    const hooks = (globalThis as unknown as { __sekigae: { seed: (s: string) => Promise<void> } })
      .__sekigae;
    await hooks.seed("medium");
  });
  await expect(page.getByTestId("rule-palette")).toBeVisible();
}

const cards = (page: Page) => page.getByTestId("rule-card");

test("adds blocks from each category and fills slots", async ({ freshPage: page }) => {
  await openRules(page);
  await expect(page.getByTestId("rules-empty")).toBeVisible();

  // 部屋: [部屋] は [人] のみ → 人スロットが自動で開く
  await page.getByTestId("palette-block-room.only").click();
  await expect(cards(page)).toHaveCount(1);
  const peoplePopover = page.getByTestId("slot-popover-people");
  await expect(peoplePopover).toBeVisible();
  await peoplePopover.getByTestId("quick-staff").click();
  await expect(peoplePopover.getByTestId("people-preview")).toContainText("該当");
  await peoplePopover.getByTestId("slot-done").click();
  const room = cards(page).nth(0);
  await room.getByTestId("slot-rooms").click();
  await page.getByTestId("room-option-r1").click();
  await page.getByTestId("slot-popover-rooms").getByTestId("slot-done").click();
  await expect(room.getByTestId("rule-sentence")).toHaveText(/Room 1\s*は\s*スタッフ\d*\s*のみ/);

  // 席: [席] は空席 → 部屋図で席を選ぶ
  await page.getByTestId("palette-block-seat.empty").click();
  const seatsPopover = page.getByTestId("slot-popover-seats");
  await expect(seatsPopover).toBeVisible();
  await seatsPopover.getByTestId("seat-tab-pick").click();
  await seatsPopover.getByTestId("mini-seat-r1-s1").click();
  await seatsPopover.getByTestId("mini-seat-r1-s2").click();
  await expect(seatsPopover).toContainText("2 席を選択中");
  await seatsPopover.getByTestId("slot-done").click();
  await expect(cards(page).nth(1).getByTestId("slot-seats")).toContainText("R-01");

  // 人: [人] は [席/部屋] に固定
  await page.getByTestId("palette-block-person.pin").click();
  await expect(page.getByTestId("slot-popover-member")).toBeVisible();
  await page.getByTestId("member-option-m2").click();
  await expect(page.getByTestId("slot-popover-member")).toHaveCount(0);
  const pin = cards(page).nth(2);
  await pin.getByTestId("slot-target").click();
  await page.getByTestId("target-tab-room").click();
  await page.getByTestId("room-option-r2").click();
  await expect(pin.getByTestId("slot-target")).toHaveText(/Room 2/);

  // 全体: まとめる（属性を役職に）
  await page.getByTestId("palette-block-group.cluster").click();
  const cluster = cards(page).nth(3);
  await cluster.getByTestId("slot-attr").click();
  await page.getByTestId("option-role").click();
  await expect(cluster.getByTestId("rule-sentence")).toContainText("役職ごとにまとめる");

  // 論理: いずれか → パレットから中へドラッグ
  await page.getByTestId("palette-block-logic.any").click();
  await expect(cards(page)).toHaveCount(5);
  const logic = cards(page).nth(4);
  await page.keyboard.press("Escape");
  await dragTo(
    page,
    page.getByTestId("palette-block-seat.empty"),
    logic.getByTestId("logic-drop-children"),
  );
  await expect(logic.getByTestId("rule-child")).toHaveCount(1);
  await expect(cards(page)).toHaveCount(5);
});

/** dnd-kit 用のドラッグ（ポインタを段階的に動かす） */
async function dragTo(
  page: Page,
  from: ReturnType<Page["locator"]>,
  to: ReturnType<Page["locator"]>,
  chase = true,
) {
  await to.scrollIntoViewIfNeeded();
  await from.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 });
  // 端に近いと自動スクロールで目標が動くので、位置を測り直しながら近づける
  for (let i = 0; i < (chase ? 4 : 1); i++) {
    const b = (await to.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: i ? 3 : 12 });
  }
  await page.mouse.up();
}

test("strength, weight, duplicate, delete, reorder and undo", async ({ freshPage: page }) => {
  await openRules(page);
  await page.getByTestId("palette-block-group.labBalance").click();
  await page.getByTestId("palette-block-prev.same").click();
  await expect(cards(page)).toHaveCount(2);

  // labBalance は「できれば」専用
  const first = cards(page).nth(0);
  await expect(first).toHaveAttribute("data-strength", "soft");
  await expect(first.getByTestId("strength-hard")).toBeDisabled();
  await first.getByTestId("weight-5").click();
  await expect(first.getByTestId("weight-5")).toHaveAttribute("aria-checked", "true");

  const second = cards(page).nth(1);
  await expect(second).toHaveAttribute("data-strength", "hard");
  await second.getByTestId("strength-soft").click();
  await expect(second).toHaveAttribute("data-strength", "soft");
  await expect(second.getByTestId("weight-3")).toHaveAttribute("aria-checked", "true");

  // 有効/無効
  await second.getByTestId("rule-enabled").click();
  await expect(second).toHaveAttribute("data-enabled", "false");

  // 複製
  await first.getByTestId("rule-menu").click();
  await page.getByTestId("rule-duplicate").click();
  await expect(cards(page)).toHaveCount(3);
  await expect(cards(page).nth(1)).toHaveAttribute("data-rule-type", "group.labBalance");

  // 並べ替え（最後のルールを先頭へ）
  await dragTo(
    page,
    cards(page).nth(2).getByTestId("rule-drag-handle"),
    cards(page).nth(0).getByTestId("rule-drag-handle"),
    false,
  );
  await expect(cards(page).nth(0)).toHaveAttribute("data-rule-type", "prev.same");

  // 削除 → 元に戻す
  await cards(page).nth(0).getByTestId("rule-menu").click();
  await page.getByTestId("rule-delete").click();
  await expect(cards(page)).toHaveCount(2);
  await page.getByTestId("undo").click();
  await expect(cards(page)).toHaveCount(3);
  await expect(cards(page).nth(0)).toHaveAttribute("data-rule-type", "prev.same");
});

test("adds a template and opens the slot to fill", async ({ freshPage: page }) => {
  await openRules(page);
  await page.getByTestId("palette-tab-templates").click();
  await page.getByTestId("palette-template-facultyRoom").click();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByTestId("slot-popover-rooms")).toBeVisible();
  await page.getByTestId("room-option-r3").click();
  await page.getByTestId("slot-popover-rooms").getByTestId("slot-done").click();
  await expect(cards(page).nth(0).getByTestId("rule-sentence")).toHaveText(
    /Room 3\s*は\s*教員\d*\s*のみ/,
  );
  await expect(cards(page).nth(0)).toContainText("テンプレート");

  await page.getByTestId("palette-template-noSameLabSameGradeAdjacent").click();
  await expect(cards(page).nth(1).getByTestId("rule-sentence")).toContainText("同じ研究室同士なら");
});

test("switching language changes the word order", async ({ freshPage: page }) => {
  await openRules(page);
  await page.getByTestId("palette-tab-templates").click();
  await page.getByTestId("palette-template-facultyRoom").click();
  await page.getByTestId("room-option-r1").click();
  await page.keyboard.press("Escape");
  const sentence = cards(page).nth(0).getByTestId("rule-sentence");
  await expect(sentence).toHaveText(/^Room 1\s*は\s*教員\d*\s*のみ$/);
  await page.getByTestId("language-menu").click();
  await page.getByRole("menuitem", { name: "English" }).click();
  await expect(sentence).toHaveText(/^Only\s+Faculty\d*\s+in\s+Room 1$/);
});

test("warns about references to deleted rooms", async ({ freshPage: page }) => {
  await openRules(page);
  await page.getByTestId("palette-tab-templates").click();
  await page.getByTestId("palette-template-facultyRoom").click();
  await page.getByTestId("room-option-r2").click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const h = (
      globalThis as unknown as {
        __sekigae: { store: { getState: () => { removeRoom: (id: string) => void } } };
      }
    ).__sekigae;
    h.store.getState().removeRoom("r2");
  });
  await expect(page.getByTestId("rules-warnings")).toBeVisible();
  await expect(cards(page).nth(0).getByTestId("dangling-badge")).toBeVisible();
  await page.getByTestId("fix-all-dangling").click();
  await expect(page.getByTestId("rules-warnings")).toHaveCount(0);
});

test("screenshot", async ({ freshPage: page }) => {
  test.skip(!process.env.RULES_SCREENSHOT, "manual");
  const out = process.env.RULES_SCREENSHOT!;
  await page.setViewportSize({ width: 1400, height: 1000 });
  await openRules(page);
  await page.getByTestId("palette-tab-templates").click();
  for (const id of ["buddySenior", "prevDifferentRoom"])
    await page.getByTestId(`palette-template-${id}`).click();
  await page.getByTestId("palette-tab-blocks").click();
  await page.getByTestId("palette-block-logic.ifThen").click();
  await page.getByTestId("palette-block-seat.only").click();
  await page.getByTestId("seat-tab-depth").click();
  await page.getByTestId("slot-popover-seats").getByRole("button", { name: "Room 1" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: out.replace(".png", "-depth.png") });
  await page.keyboard.press("Escape");
  await page.getByTestId("theme-menu").click();
  await page.getByRole("menuitem", { name: "ダーク" }).click();
  await page.getByTestId("slot-b").first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: out.replace(".png", "-dark.png") });
  await page.keyboard.press("Escape");
  await page.getByTestId("view-collapsed").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out.replace(".png", "-collapsed.png") });
});
