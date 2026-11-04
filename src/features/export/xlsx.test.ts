import { describe, expect, it } from "vite-plus/test";
import { ROLE_COLORS } from "@/graphics/palette";
import { makeExportFixture } from "./fixture";
import { buildExportModel, EXPORT_COLUMNS, type ExportOptions } from "./model";
import { exportXlsx, GRID_COL_WIDTH, loadExcelJS, sheetName } from "./xlsx";

const DATE = new Date(2026, 3, 1);

async function generate(opts: Partial<ExportOptions> = {}) {
  const project = makeExportFixture();
  const model = buildExportModel(project, {
    lang: "ja",
    columns: EXPORT_COLUMNS,
    colorBy: "role",
    date: DATE,
    ...opts,
  });
  const bytes = await exportXlsx(model);
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  return { wb, model };
}

describe("sheetName", () => {
  it("removes forbidden characters, truncates to 31 chars and de-duplicates", () => {
    const used = new Set<string>();
    expect(sheetName("座席表_A/B:C?", used)).toBe("座席表_A_B_C_");
    const long = "x".repeat(40);
    expect(sheetName(long, used)).toHaveLength(31);
    const dup = sheetName(long, used);
    expect(dup).toHaveLength(31);
    expect(dup.endsWith("(2)")).toBe(true);
    expect(sheetName("'quoted'", used)).toBe("quoted");
  });
});

describe("exportXlsx", () => {
  it("writes seat-map, roster, by-room and unassigned sheets (ja)", async () => {
    const { wb, model } = await generate({ floorSheet: true });
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "座席表_301 号室",
      "座席表_302 号室",
      "座席表_Room_303",
      "フロア",
      "名簿",
      "部屋別一覧",
      "未配置",
    ]);

    // 座席表: タイトル・席セルの値と塗り
    const ws = wb.getWorksheet("座席表_301 号室")!;
    expect(ws.getCell("B1").value).toBe("301 号室");
    const room = model.rooms[0]!;
    const seat = room.seats[0]!;
    const cell = ws.getCell(4 + seat.y, 2 + seat.x);
    expect(cell.value).toBe(`${seat.member!.name}\n${seat.member!.subtitle}`);
    const fill = cell.fill as { pattern: string; fgColor: { argb: string } };
    expect(fill.pattern).toBe("solid");
    expect(fill.fgColor.argb).toBe(
      `FF${ROLE_COLORS[seat.member!.roleKey].light.slice(1).toUpperCase()}`,
    );
    expect(cell.font.name).toBe("Yu Gothic");
    // 障害物はハッチング
    expect((ws.getCell(4, 2 + 6).fill as { pattern: string }).pattern).toBe("lightUp");
    // 入口: ラベル + 太線
    const ent = ws.getCell(4 + 5, 2);
    expect(ent.value).toBe("入口");
    expect(ent.border.bottom?.style).toBe("thick");
    // 外壁
    expect(ws.getCell(4, 2 + 1).border.top?.style).toBe("medium");
    expect(ws.getColumn(2).width).toBe(GRID_COL_WIDTH);
    expect(ws.pageSetup.orientation).toBe("landscape");
    expect(ws.pageSetup.fitToPage).toBe(true);

    // L 字の void はグレー
    const ws3 = wb.getWorksheet("座席表_Room_303")!;
    expect((ws3.getCell(4, 2 + 6).fill as { fgColor: { argb: string } }).fgColor.argb).toBe(
      "FFD9D9D9",
    );

    // 名簿
    const roster = wb.getWorksheet("名簿")!;
    expect(roster.getRow(1).values).toEqual([
      undefined,
      "氏名",
      "ふりがな",
      "研究室",
      "性別",
      "役職・学年",
      "部屋",
      "席",
      "昨年度の部屋",
      "昨年度の席",
      "変化",
      "メモ",
    ]);
    expect(roster.rowCount).toBe(1 + model.roster.length);
    expect(roster.getCell("A2").value).toBe(model.roster[0]!.name);
    expect(roster.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(roster.autoFilter).toBeTruthy();

    // 部屋別一覧
    const byRoom = wb.getWorksheet("部屋別一覧")!;
    expect(byRoom.getCell("A1").value).toBe("301 号室");
    expect(byRoom.getCell("C2").text).toContain("内訳");

    // 未配置
    const un = wb.getWorksheet("未配置")!;
    expect(un.rowCount).toBe(1 + model.unassigned.length);
  });

  it("uses English headings and Arial when the output language is en", async () => {
    const { wb } = await generate({ lang: "en", columns: ["role"], colorBy: "none" });
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Seats_301 号室",
      "Seats_302 号室",
      "Seats_Room_303",
      "Roster",
      "By room",
      "Unassigned",
    ]);
    const roster = wb.getWorksheet("Roster")!;
    expect(roster.getRow(1).values).toEqual([undefined, "Name", "Kana", "Role", "Room", "Seat"]);
    expect(roster.getCell("A2").font.name).toBe("Arial");
  });
});
