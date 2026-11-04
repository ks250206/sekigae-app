import ExcelJS from "exceljs";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** src/features/members/lib/testHook.ts が自動操作ブラウザでのみ公開するストア */
interface TestStore {
  getState(): {
    project: {
      activePlanId: string;
      members: { id: string; name: string }[];
      layout: { rooms: { seats: { id: string; label: string }[] }[] };
      plans: { id: string; locks: string[] }[];
      rules: { block: { type: string } }[];
    };
    addLab(init: { name: string; color: string }): string;
    addRoom(init: { name: string; width: number; height: number }): string;
    addSeats(roomId: string, seats: { x: number; y: number; label: string }[]): string[];
    addMembers(members: { name: string; role: string; labId?: string }[]): string[];
    assignSeat(planId: string, seatId: string, memberId: string | null): void;
    setFinalPlan(planId: string): void;
  };
}
interface TestWindow {
  __sekigae?: { store: TestStore; history: { clear(): void } };
}

/** 名簿画面を開き、E2E 用に公開されたストアを待つ */
async function openMembers(page: Page) {
  await page.goto("./#/members");
  await expect(page.locator("main h1")).toHaveText("名簿");
  await page.waitForFunction(() => !!(globalThis as unknown as TestWindow).__sekigae);
}

/** 部屋 2 つ（A: A-01..A-04, B: B-01..B-04）と研究室・メンバーを用意 */
async function seed(page: Page, members: { name: string; role: string; lab?: number }[]) {
  await page.evaluate((list) => {
    const s = (globalThis as unknown as TestWindow).__sekigae!.store.getState();
    const labs = [
      s.addLab({ name: "山田研究室", color: "#e11d48" }),
      s.addLab({ name: "鈴木研究室", color: "#2563eb" }),
    ];
    for (const name of ["居室A", "居室B"]) {
      const roomId = s.addRoom({ name, width: 4, height: 1 });
      const ids = s.addSeats(
        roomId,
        [0, 1, 2, 3].map((x) => ({ x, y: 0, label: `${name.slice(-1)}-0${x + 1}` })),
      );
      void ids;
    }
    s.addMembers(
      list.map((m) => ({
        name: m.name,
        role: m.role,
        labId: m.lab === undefined ? undefined : labs[m.lab],
      })),
    );
    (globalThis as unknown as TestWindow).__sekigae!.history.clear();
  }, members);
}

const rows = (page: Page) => page.getByTestId("member-row");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 氏名セルが完全一致する行 */
const row = (page: Page, name: string) =>
  rows(page).filter({
    has: page.locator('td[data-col="name"]', { hasText: new RegExp(`^${escapeRe(name)}$`) }),
  });
const cell = (page: Page, name: string, col: string) =>
  row(page, name).locator(`td[data-col="${col}"]`);

test.describe("members", () => {
  test("adds members with the dialog, creates a lab inline, edits and deletes", async ({
    freshPage: page,
  }) => {
    await openMembers(page);
    await expect(page.getByTestId("members-empty")).toBeVisible();
    await page.getByTestId("empty-add").click();
    const dialog = page.getByTestId("member-dialog");
    await dialog.getByTestId("member-name").fill("山田 太郎");
    await dialog.getByTestId("member-kana").fill("やまだ たろう");
    await dialog.getByTestId("lab-combobox").click();
    await page.getByTestId("lab-combobox-search").fill("山田研究室");
    await page.getByTestId("lab-create-option").click();
    await dialog.getByTestId("role-select").click();
    await page.getByTestId("role-option-wd1").click();
    await dialog.getByTestId("gender-male").click();
    await dialog.getByTestId("tag-input").fill("留学生");
    await dialog.getByTestId("tag-input").press("Enter");
    await dialog.getByTestId("member-save-next").click();

    // 続けて入力（研究室・役職は引き継ぐ）。同名警告
    await expect(dialog.getByTestId("member-name")).toHaveValue("");
    await dialog.getByTestId("member-name").fill("山田太郎");
    await expect(dialog.getByTestId("duplicate-warning")).toBeVisible();
    await dialog.getByTestId("member-name").fill("佐藤 花子");
    await dialog.getByTestId("member-save").click();
    await expect(dialog).toBeHidden();

    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByTestId("member-count")).toHaveText("2");
    await expect(cell(page, "山田 太郎", "role")).toHaveText("社D1");
    await expect(cell(page, "佐藤 花子", "lab")).toHaveText("山田");
    await expect(cell(page, "山田 太郎", "tags")).toHaveText("留学生");

    // 編集
    await row(page, "佐藤 花子").hover();
    await row(page, "佐藤 花子").getByTestId("row-edit").click();
    await dialog.getByTestId("role-select").click();
    await page.getByTestId("role-option-m2").click();
    await dialog.getByTestId("member-save").click();
    await expect(cell(page, "佐藤 花子", "role")).toHaveText("M2");

    // 削除（影響表示つき確認）→ 元に戻す
    await row(page, "佐藤 花子").hover();
    await row(page, "佐藤 花子").getByTestId("row-edit").click();
    await dialog.getByTestId("member-delete").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "削除する" }).click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByTestId("undo").click();
    await expect(rows(page)).toHaveCount(2);
  });

  test("spreadsheet-like inline editing with one undo step per cell", async ({
    freshPage: page,
  }) => {
    await openMembers(page);
    await seed(page, [
      { name: "Aoki", role: "m1", lab: 0 },
      { name: "Inoue", role: "m2", lab: 0 },
    ]);
    // 並びを「名前順」に（Aoki → Inoue）
    await page.getByTestId("sort-name").click();
    await expect(rows(page).first()).toContainText("Aoki");

    await cell(page, "Aoki", "name").dblclick();
    const editor = page.getByTestId("cell-editor-name");
    await editor.fill("Aoki Ichiro");
    await editor.press("Tab"); // 確定して右へ（ふりがな）
    await expect(cell(page, "Aoki Ichiro", "kana")).toBeFocused();
    await page.keyboard.type("aoki"); // 打鍵でそのまま編集開始
    await page.keyboard.press("Enter"); // 確定して下へ
    await expect(cell(page, "Aoki Ichiro", "kana")).toHaveText("aoki");
    await expect(cell(page, "Inoue", "kana")).toBeFocused();

    // Esc で取消
    await page.keyboard.press("Enter");
    await page.getByTestId("cell-editor-kana").fill("いのうえ?");
    await page.keyboard.press("Escape");
    await expect(cell(page, "Inoue", "kana")).toHaveText("");

    // 矢印で役職セルへ移動して select で編集
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(cell(page, "Inoue", "role")).toBeFocused();
    await page.keyboard.press("Enter");
    await page.getByTestId("cell-editor-role").selectOption("d1");
    await page.getByTestId("cell-editor-role").press("Enter");
    await expect(cell(page, "Inoue", "role")).toHaveText("D1");

    // 最終行で Enter → 行が追加され、そのまま氏名を入力できる
    await expect(rows(page)).toHaveCount(3);
    await page.getByTestId("cell-editor-name").fill("Ueda");
    await page.getByTestId("cell-editor-name").press("Tab");
    await expect(row(page, "Ueda")).toHaveCount(1);
    await expect(cell(page, "Ueda", "kana")).toBeFocused();

    // 1 セル = 1 Undo
    await page.getByTestId("undo").click(); // 氏名
    await expect(row(page, "Ueda")).toHaveCount(0);
    await expect(rows(page)).toHaveCount(3);
    await page.getByTestId("undo").click(); // 追加行
    await expect(rows(page)).toHaveCount(2);
    await page.getByTestId("undo").click(); // 役職
    await expect(cell(page, "Inoue", "role")).toHaveText("M2");
    await page.getByTestId("undo").click(); // ふりがな
    await expect(cell(page, "Aoki Ichiro", "kana")).toHaveText("");
    await page.getByTestId("undo").click(); // 氏名
    await expect(row(page, "Aoki")).toHaveCount(1);
    await expect(row(page, "Aoki Ichiro")).toHaveCount(0);
  });

  test("search, filter, sort, columns and summary", async ({ freshPage: page }) => {
    await openMembers(page);
    await seed(page, [
      { name: "教授 一", role: "faculty", lab: 0 },
      { name: "修士 二", role: "m1", lab: 1 },
      { name: "学部 三", role: "b4", lab: 1 },
      { name: "社会人 四", role: "wd2" },
    ]);
    await expect(page.getByTestId("member-count")).toHaveText("4");
    // 既定は役職順
    await expect(rows(page).first()).toContainText("教授 一");
    await expect(rows(page).last()).toContainText("学部 三");
    await page.getByTestId("sort-role").click();
    await expect(rows(page).first()).toContainText("学部 三");

    await page.getByTestId("member-search").fill("修士");
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByTestId("visible-count")).toHaveText("1 / 4 人");
    await page.getByTestId("member-search").fill("");

    await page.getByTestId("filter-menu").click();
    await page.getByTestId("filter-role").click();
    await page.getByTestId("filter-role-wd2").click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("社会人 四");
    await page.getByRole("button", { name: "「社D2」の絞り込みを解除" }).click();
    await expect(rows(page)).toHaveCount(4);

    await page.getByTestId("columns-menu").click();
    await page.getByTestId("column-toggle-kana").click();
    await page.keyboard.press("Escape");
    await expect(page.locator('th:has-text("ふりがな")')).toHaveCount(0);

    // 席数（8）より人数が少ないので不足警告なし
    await expect(page.getByTestId("seat-shortage")).toHaveCount(0);
  });

  test("bulk edit and delete are single undo steps", async ({ freshPage: page }) => {
    await openMembers(page);
    await seed(page, [
      { name: "A1", role: "m1" },
      { name: "A2", role: "m1" },
      { name: "A3", role: "m1" },
      { name: "A4", role: "m1" },
    ]);
    await page.getByTestId("sort-name").click();
    await row(page, "A1").getByTestId("row-select").click();
    await row(page, "A3")
      .getByTestId("row-select")
      .click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("bulk-count")).toHaveText("3 人を選択中");

    await page.getByTestId("bulk-role").click();
    await page.getByTestId("bulk-role-m2").click();
    for (const n of ["A1", "A2", "A3"]) await expect(cell(page, n, "role")).toHaveText("M2");
    await expect(cell(page, "A4", "role")).toHaveText("M1");

    await page.getByTestId("bulk-tags").click();
    await page.getByTestId("bulk-tag-input").fill("窓側");
    await page.getByTestId("bulk-tag-input").press("Enter");
    await expect(cell(page, "A2", "tags")).toHaveText("窓側");

    await page.getByTestId("undo").click();
    await expect(cell(page, "A2", "tags")).toHaveText("");
    await page.getByTestId("undo").click();
    for (const n of ["A1", "A2", "A3"]) await expect(cell(page, n, "role")).toHaveText("M1");

    await page.getByTestId("select-all").click();
    await page.getByTestId("bulk-delete").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "削除する" }).click();
    await expect(page.getByTestId("members-empty")).toBeVisible();
    await page.getByTestId("undo").click();
    await expect(rows(page)).toHaveCount(4);
  });

  test("lab master: add, short name, merge duplicates, delete with move", async ({
    freshPage: page,
  }) => {
    await openMembers(page);
    await seed(page, [
      { name: "X", role: "m1", lab: 0 },
      { name: "Y", role: "d1", lab: 1 },
    ]);
    await page.getByTestId("open-labs").click();
    const dlg = page.getByTestId("labs-dialog");
    await dlg.getByTestId("new-lab-name").fill("山田研");
    await dlg.getByTestId("add-lab").click();
    await expect(dlg.getByTestId("lab-row")).toHaveCount(3);
    await expect(dlg.getByTestId("lab-short").nth(2)).toHaveValue("山田");
    // 「山田研究室」と「山田研」は重複 → 統合
    await dlg.getByTestId("lab-merge").click();
    await expect(dlg.getByTestId("lab-row")).toHaveCount(2);

    // 所属者のいる研究室を削除 → 移動先を選ぶ
    await dlg.getByTestId("lab-delete").nth(1).click();
    await dlg.getByTestId("lab-delete-confirm").click();
    await expect(dlg.getByTestId("lab-row")).toHaveCount(1);
    await expect(dlg.getByTestId("lab-count")).toHaveText("2");
    await page.keyboard.press("Escape");
    await expect(cell(page, "Y", "lab")).toHaveText("山田");
  });

  test("imports a 30-member XLSX with mapping and normalization", async ({
    freshPage: page,
  }, testInfo) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("名簿");
    ws.addRow(["2026年度 研究室名簿"]);
    ws.addRow([]);
    ws.addRow(["氏名", "フリガナ", "所属", "性別", "学年", "備考"]);
    const roles = ["教授", "ｍ１", "修士2年", "社会人D1", "B4", "博士後期1年"];
    for (let i = 0; i < 30; i++)
      ws.addRow([
        `メンバー ${i + 1}`,
        `メンバー`,
        i % 2 ? "山田研" : "鈴木研究室",
        i % 3 ? "男" : "女性",
        roles[i % roles.length],
        "",
      ]);
    const file = testInfo.outputPath("members.xlsx");
    await wb.xlsx.writeFile(file);

    await openMembers(page);
    await page.getByTestId("empty-import").click();
    await page.getByTestId("import-file").setInputFiles(file);
    const dlg = page.getByTestId("import-dialog");
    await expect(dlg.getByTestId("import-header")).toBeChecked();
    await expect(dlg.getByTestId("import-row")).toHaveCount(30);
    await expect(dlg.getByText("新しく作成する研究室: 鈴木研究室, 山田研")).toBeVisible();
    await dlg.getByTestId("import-run").click();
    await expect(dlg).toBeHidden();
    await expect(page.getByTestId("member-count")).toHaveText("30");
    await expect(cell(page, "メンバー 4", "role")).toHaveText("社D1");
    await expect(cell(page, "メンバー 1", "role")).toHaveText("教員");
    await expect(cell(page, "メンバー 2", "role")).toHaveText("M1");
    await expect(cell(page, "メンバー 6", "role")).toHaveText("D1");
    // 1 回の Undo で取込前に戻る
    await page.getByTestId("undo").click();
    await expect(page.getByTestId("members-empty")).toBeVisible();
  });

  test("paste from Excel (TSV) with and without header", async ({ freshPage: page }) => {
    await openMembers(page);
    await page.getByTestId("empty-paste").click();
    const dlg = page.getByTestId("import-dialog");
    await dlg
      .getByTestId("import-paste")
      .fill("山田 太郎\tM1\t男\n佐藤 花子\t社D2\t女\n\tB4\t男\n鈴木\t宇宙飛行士\t");
    await dlg.getByTestId("import-paste-next").click();
    await expect(dlg.getByTestId("import-header")).not.toBeChecked();
    await expect(dlg.getByTestId("import-row")).toHaveCount(3);
    await expect(dlg.getByTestId("import-row-error")).toHaveCount(1);
    await expect(
      dlg.getByText("役職「宇宙飛行士」を判別できないため「その他」にします"),
    ).toBeVisible();
    await dlg.getByTestId("import-run").click();
    await expect(page.getByTestId("member-count")).toHaveText("3");
    await expect(cell(page, "佐藤 花子", "role")).toHaveText("社D2");
  });

  test("previous seats from the list: room → seat, swap, room only, change column", async ({
    freshPage: page,
  }) => {
    await openMembers(page);
    await seed(page, [
      { name: "伊藤", role: "m1" },
      { name: "加藤", role: "m2" },
    ]);
    await page.getByTestId("sort-name").click();

    const pick = async (name: string, room: string, seat?: string) => {
      await cell(page, name, "prev").click();
      const ed = page.getByTestId("prev-seat-editor");
      await expect(ed).toBeVisible();
      if (await ed.getByTestId("prev-seat-back").isVisible())
        await ed.getByTestId("prev-seat-back").click();
      await ed.getByTestId(`prev-room-option-${room}`).click();
      if (seat) await ed.getByTestId(`prev-seat-option-${seat}`).click();
      else await ed.getByTestId("prev-room-only").click();
      await expect(ed).toBeHidden();
    };

    await pick("伊藤", "居室A", "A-01");
    await expect(cell(page, "伊藤", "prev")).toHaveText("居室A / A-01");
    await pick("加藤", "居室B", "B-02");
    // 埋まっている席を選ぶと入れ替え
    await pick("加藤", "居室A", "A-01");
    await expect(cell(page, "加藤", "prev")).toHaveText("居室A / A-01");
    await expect(cell(page, "伊藤", "prev")).toHaveText("居室B / B-02");
    // 部屋のみ
    await pick("伊藤", "居室B");
    await expect(cell(page, "伊藤", "prev")).toHaveText("居室B（席不明）");

    // 席名で横断検索
    await cell(page, "伊藤", "prev").click();
    await page.getByTestId("prev-seat-back").click();
    await page.getByTestId("prev-seat-search").fill("B-04");
    await page.getByTestId("prev-seat-option-B-04").click();
    await expect(cell(page, "伊藤", "prev")).toHaveText("居室B / B-04");

    // 今年度: 加藤は同じ席、伊藤は別の部屋
    await page.evaluate(() => {
      const s = (globalThis as unknown as TestWindow).__sekigae!.store.getState();
      const p = s.project;
      const seat = (label: string) =>
        p.layout.rooms.flatMap((r) => r.seats).find((x) => x.label === label)!.id;
      const id = (name: string) => p.members.find((m) => m.name === name)!.id;
      s.assignSeat(p.activePlanId, seat("A-01"), id("加藤"));
      s.assignSeat(p.activePlanId, seat("A-02"), id("伊藤"));
    });
    await expect(cell(page, "加藤", "change")).toHaveText("同じ席");
    await expect(cell(page, "伊藤", "change")).toHaveText("部屋を移動");
    await expect(cell(page, "伊藤", "current")).toHaveText("居室A / A-02");
    await page.getByTestId("filter-menu").click();
    await page.getByTestId("filter-change").click();
    await page.getByTestId("filter-change-sameSeat").click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("加藤");

    // クリア
    await page.getByRole("button", { name: "「同じ席」の絞り込みを解除" }).click();
    await cell(page, "加藤", "prev").click();
    await page.getByTestId("prev-seat-clear").click();
    await expect(cell(page, "加藤", "prev")).toHaveText("—");
  });

  test("year-update wizard promotes, graduates and carries over working doctors in one undo", async ({
    freshPage: page,
  }) => {
    await openMembers(page);
    await seed(page, [
      { name: "教員", role: "faculty" },
      { name: "学部生", role: "b4" },
      { name: "修士2年", role: "m2" },
      { name: "社会人1", role: "wd1" },
      { name: "社会人3", role: "wd3" },
    ]);
    await page.evaluate(() => {
      const s = (globalThis as unknown as TestWindow).__sekigae!.store.getState();
      const p = s.project;
      const seats = p.layout.rooms.flatMap((r) => r.seats);
      p.members.forEach((m, i) => s.assignSeat(p.activePlanId, seats[i]!.id, m.id));
      s.setFinalPlan(p.activePlanId);
      (globalThis as unknown as TestWindow).__sekigae!.history.clear();
    });

    await page.getByTestId("open-wizard").click();
    const wiz = page.getByTestId("year-wizard");
    await wiz.getByTestId("wizard-prev-name").fill("2026年度");
    await wiz.getByTestId("wizard-next").click();

    await expect(
      wiz.getByTestId("wizard-track-workingDoctor").getByTestId("promotion-row"),
    ).toHaveCount(2);
    // 社D3 は在籍継続をワンクリックで
    await wiz.getByTestId("wd3-toggle").getByText("在籍継続").click();
    await expect(wiz.getByTestId("wizard-graduates")).toContainText("修士2年");
    await expect(wiz.getByTestId("wizard-graduates")).not.toContainText("社会人3");
    await expect(wiz.getByTestId("wizard-carry")).toBeChecked();
    await wiz.getByTestId("wizard-run").click();
    await expect(wiz.getByTestId("wizard-done")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("member-count")).toHaveText("4");
    await expect(cell(page, "学部生", "role")).toHaveText("M1");
    await expect(cell(page, "社会人1", "role")).toHaveText("社D2");
    await expect(cell(page, "社会人3", "role")).toHaveText("社D3");
    await expect(cell(page, "教員", "role")).toHaveText("教員");
    await expect(cell(page, "社会人1", "prev")).toHaveText("居室A / A-04");
    await expect(cell(page, "社会人1", "current")).toHaveText("居室A / A-04");
    await expect(cell(page, "学部生", "current")).toHaveText("未配置");
    const state = await page.evaluate(() => {
      const p = (globalThis as unknown as TestWindow).__sekigae!.store.getState().project;
      const cur = p.plans.find((x) => x.id === p.activePlanId)!;
      return { locks: cur.locks.length, rules: p.rules.map((r) => r.block.type) };
    });
    expect(state).toEqual({ locks: 2, rules: ["prev.same"] });

    await page.getByTestId("undo").click();
    await expect(page.getByTestId("member-count")).toHaveText("5");
    await expect(cell(page, "学部生", "role")).toHaveText("B4");
    await expect(cell(page, "社会人1", "prev")).toHaveText("—");
  });
});
