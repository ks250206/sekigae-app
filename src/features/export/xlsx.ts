/**
 * XLSX 出力（ExcelJS）。issue #131, #132
 * ExcelJS は dynamic import で読み込み、初期バンドルに含めない。
 */
import type { Borders, Cell, Fill, Font, Workbook, Worksheet } from "exceljs";
import type { Facing } from "@/domain/schema";
import { outputFonts } from "./fonts";
import {
  ENTRANCE_COLOR,
  FLOOR_FILL,
  OBSTACLE_FILL,
  rosterValue,
  VOID_FILL,
  WALL_COLOR,
  type ExportModel,
  type ExportRoom,
  type RosterKey,
} from "./model";

type ExcelModule = typeof import("exceljs");

export async function loadExcelJS(): Promise<ExcelModule> {
  const mod = (await import("exceljs")) as ExcelModule & { default?: ExcelModule };
  return mod.default ?? mod;
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** グリッド 1 マスの列幅（文字数）と行高（pt）。ほぼ正方形になるよう調整 */
export const GRID_COL_WIDTH = 11;
export const GRID_ROW_HEIGHT = 60;
const GRID_TOP = 4;
const GRID_LEFT = 2;

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
const solid = (hex: string): Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: argb(hex) },
});

const FORBIDDEN = /[\\/?*[\]:]/g;

/** UTF-16 単位で切り詰める（サロゲートペアは分割しない） */
function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/** Excel のシート名制約（31 文字、禁止文字、重複不可、先頭末尾の ' 不可）を満たす名前 */
export function sheetName(base: string, used: Set<string>): string {
  let s =
    base
      .replace(FORBIDDEN, "_")
      .replace(/^'+|'+$/g, "")
      .trim() || "Sheet";
  s = truncate(s, 31);
  let name = s;
  for (let i = 2; used.has(name.toLowerCase()); i++) {
    const suffix = `(${i})`;
    name = truncate(s, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

const EXCEL_SIDE: Record<Facing, keyof Pick<Borders, "top" | "right" | "bottom" | "left">> = {
  n: "top",
  e: "right",
  s: "bottom",
  w: "left",
};

function colLetter(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26))
    s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

interface Ctx {
  model: ExportModel;
  font: Partial<Font>;
}

function baseFont(ctx: Ctx, extra: Partial<Font> = {}): Partial<Font> {
  return { ...ctx.font, ...extra };
}

/** 部屋を (row0, col0) を左上として描画 */
function paintRoom(ws: Worksheet, ctx: Ctx, room: ExportRoom, row0: number, col0: number) {
  const { strings } = ctx.model;
  const seatById = new Map(room.seats.map((s) => [s.id, s]));
  for (const c of room.cells) {
    if (c.kind === "void") {
      ws.getCell(row0 + c.y, col0 + c.x).fill = solid(VOID_FILL);
      continue;
    }
    const cell: Cell = ws.getCell(row0 + c.y, col0 + c.x);
    const border: Partial<Borders> = {};
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    const seat = c.seatId ? seatById.get(c.seatId) : undefined;
    if (seat) {
      const thin = { style: "thin" as const, color: { argb: argb("#94a3b8") } };
      border.top = border.right = border.bottom = border.left = thin;
      if (seat.member) {
        cell.value = seat.member.subtitle
          ? `${seat.member.name}\n${seat.member.subtitle}`
          : seat.member.name;
        cell.fill = solid(seat.fill);
        cell.font = baseFont(ctx, { size: 9, bold: true, color: { argb: argb(seat.text) } });
      } else {
        cell.value = seat.label;
        cell.fill = solid(seat.fill);
        cell.font = baseFont(ctx, { size: 8, color: { argb: argb("#94a3b8") } });
      }
    } else if (c.kind === "obstacle") {
      cell.fill = {
        type: "pattern",
        pattern: "lightUp",
        fgColor: { argb: argb(OBSTACLE_FILL) },
        bgColor: { argb: argb("#e5e7eb") },
      };
    } else {
      cell.fill = solid(FLOOR_FILL);
    }
    for (const w of c.walls)
      border[EXCEL_SIDE[w]] = { style: "medium", color: { argb: argb(WALL_COLOR) } };
    for (const side of c.entranceSides)
      border[EXCEL_SIDE[side]] = { style: "thick", color: { argb: argb(ENTRANCE_COLOR) } };
    if (c.entranceSides.length && !seat) {
      cell.value = strings.entrance;
      cell.font = baseFont(ctx, { size: 8, bold: true, color: { argb: argb(ENTRANCE_COLOR) } });
    }
    cell.border = border;
  }
}

/**
 * 凡例をグリッドの下に横並びで描く（maxCols 列で折り返し）。最後に使った行を返す
 */
function paintLegend(ws: Worksheet, ctx: Ctx, row: number, col: number, maxCols: number): number {
  const { model } = ctx;
  const head = ws.getCell(row, col);
  head.value = model.strings.legend;
  head.font = baseFont(ctx, { bold: true, size: 10 });
  const items = [
    ...model.legend.map((l) => ({ ...l, entrance: false })),
    { label: model.strings.entrance, fill: "", text: ENTRANCE_COLOR, entrance: true },
  ];
  const cols = Math.max(4, maxCols);
  items.forEach((l, i) => {
    const r = row + 1 + Math.floor(i / cols);
    const c = ws.getCell(r, col + (i % cols));
    if (ws.getColumn(col + (i % cols)).width !== GRID_COL_WIDTH)
      ws.getColumn(col + (i % cols)).width = GRID_COL_WIDTH;
    c.value = l.label;
    c.alignment = { vertical: "middle", horizontal: "center", shrinkToFit: true };
    if (l.entrance) {
      c.font = baseFont(ctx, { size: 9, bold: true, color: { argb: argb(ENTRANCE_COLOR) } });
      c.border = { bottom: { style: "thick", color: { argb: argb(ENTRANCE_COLOR) } } };
    } else {
      c.fill = solid(l.fill);
      c.font = baseFont(ctx, { size: 9, color: { argb: argb(l.text) } });
      const thin = { style: "thin" as const, color: { argb: "FFFFFFFF" } };
      c.border = { left: thin, right: thin, top: thin, bottom: thin };
    }
  });
  const last = row + Math.ceil(items.length / cols);
  for (let r = row + 1; r <= last; r++) ws.getRow(r).height = 20;
  return last;
}

function setupGrid(ws: Worksheet, cols: number, rows: number) {
  ws.getColumn(1).width = 2;
  for (let i = 0; i < cols; i++) ws.getColumn(GRID_LEFT + i).width = GRID_COL_WIDTH;
  for (let i = 0; i < rows; i++) ws.getRow(GRID_TOP + i).height = GRID_ROW_HEIGHT;
}

function setupPrint(ws: Worksheet, lastCol: number, lastRow: number) {
  ws.pageSetup = {
    ...ws.pageSetup,
    orientation: "landscape",
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    printArea: `A1:${colLetter(lastCol)}${lastRow}`,
  };
}

function titleRows(ws: Worksheet, ctx: Ctx, title: string, subtitle: string) {
  const t = ws.getCell(1, GRID_LEFT);
  t.value = title;
  t.font = baseFont(ctx, { size: 16, bold: true });
  const s = ws.getCell(2, GRID_LEFT);
  s.value = subtitle;
  s.font = baseFont(ctx, { size: 10, color: { argb: argb("#475569") } });
  ws.getRow(1).height = 24;
}

function addRoomSheet(wb: Workbook, ctx: Ctx, room: ExportRoom, used: Set<string>) {
  const { model } = ctx;
  const ws = wb.addWorksheet(sheetName(`${model.strings.seatSheet}_${room.name}`, used), {
    properties: { defaultRowHeight: 18 },
    views: [{ showGridLines: false }],
  });
  setupGrid(ws, room.width, room.height);
  titleRows(
    ws,
    ctx,
    room.name,
    [room.summary, model.strings.plan, model.strings.createdOn].join("  ·  "),
  );
  paintRoom(ws, ctx, room, GRID_TOP, GRID_LEFT);
  const lastRow = paintLegend(ws, ctx, GRID_TOP + room.height + 1, GRID_LEFT, room.width);
  const lastCol = GRID_LEFT + Math.max(room.width, 4) - 1;
  setupPrint(ws, lastCol, lastRow);
}

function addFloorSheet(wb: Workbook, ctx: Ctx, used: Set<string>) {
  const { model } = ctx;
  if (!model.rooms.length) return;
  // 部屋名を書くため上に 1 行余白を取る
  const top = GRID_TOP + 1;
  const ws = wb.addWorksheet(sheetName(model.strings.floorSheet, used), {
    views: [{ showGridLines: false }],
  });
  setupGrid(ws, model.floor.width, model.floor.height + 1);
  titleRows(
    ws,
    ctx,
    model.projectName,
    [model.strings.plan, model.strings.createdOn].join("  ·  "),
  );
  const occupied = new Set<string>();
  for (const r of model.rooms)
    for (const c of r.cells)
      if (c.kind !== "void") occupied.add(`${r.floorX + c.x},${r.floorY + c.y}`);
  for (const r of model.rooms) {
    paintRoom(ws, ctx, r, top + r.floorY, GRID_LEFT + r.floorX);
    if (!occupied.has(`${r.floorX},${r.floorY - 1}`)) {
      const c = ws.getCell(top + r.floorY - 1, GRID_LEFT + r.floorX);
      c.value = `${r.name} (${r.summary})`;
      c.font = baseFont(ctx, { bold: true, size: 10 });
      c.alignment = { vertical: "bottom", horizontal: "left", wrapText: false };
    }
  }
  const lastRow = paintLegend(ws, ctx, top + model.floor.height + 1, GRID_LEFT, model.floor.width);
  setupPrint(ws, GRID_LEFT + Math.max(model.floor.width, 4) - 1, lastRow);
}

const COL_WIDTH: Record<RosterKey, number> = {
  name: 16,
  kana: 16,
  lab: 16,
  gender: 8,
  role: 10,
  room: 14,
  seat: 8,
  prevRoom: 14,
  prevSeat: 10,
  change: 14,
  note: 24,
};

function styleHeader(ctx: Ctx, row: ReturnType<Worksheet["getRow"]>) {
  row.font = baseFont(ctx, { bold: true });
  row.eachCell((c) => {
    c.fill = solid("#e2e8f0");
    c.border = { bottom: { style: "thin", color: { argb: argb("#64748b") } } };
  });
}

function addRosterSheet(wb: Workbook, ctx: Ctx, used: Set<string>) {
  const { model } = ctx;
  const cols = model.rosterColumns;
  const ws = wb.addWorksheet(sheetName(model.strings.rosterSheet, used), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: COL_WIDTH[c.key] }));
  for (const p of model.roster)
    ws.addRow(Object.fromEntries(cols.map((c) => [c.key, rosterValue(p, c.key)])));
  ws.eachRow((r) => (r.font = baseFont(ctx)));
  styleHeader(ctx, ws.getRow(1));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  ws.pageSetup = {
    ...ws.pageSetup,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:1",
  };
}

function addByRoomSheet(wb: Workbook, ctx: Ctx, used: Set<string>) {
  const { model } = ctx;
  const cols = model.rosterColumns.filter((c) => c.key !== "room");
  const ws = wb.addWorksheet(sheetName(model.strings.byRoomSheet, used));
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = COL_WIDTH[c.key]));
  let row = 1;
  for (const room of model.rooms) {
    const h = ws.getCell(row, 1);
    h.value = room.name;
    h.font = baseFont(ctx, { bold: true, size: 13 });
    row++;
    const breakdown = room.roleBreakdown.map((b) => `${b.label} ${b.count}`).join(" / ");
    ws.getCell(row, 1).value = room.summary;
    ws.getCell(row, 1).font = baseFont(ctx);
    ws.getCell(row, 3).value = `${model.strings.breakdown}: ${breakdown || model.strings.none}`;
    ws.getCell(row, 3).font = baseFont(ctx, { color: { argb: argb("#475569") } });
    row++;
    const header = ws.getRow(row);
    header.values = cols.map((c) => c.header);
    styleHeader(ctx, header);
    row++;
    for (const p of room.members) {
      const r = ws.getRow(row++);
      r.values = cols.map((c) => rosterValue(p, c.key));
      r.font = baseFont(ctx);
    }
    row++;
  }
}

function addUnassignedSheet(wb: Workbook, ctx: Ctx, used: Set<string>) {
  const { model } = ctx;
  if (!model.unassigned.length) return;
  const cols = model.rosterColumns.filter((c) => c.key !== "room" && c.key !== "seat");
  const ws = wb.addWorksheet(sheetName(model.strings.unassignedSheet, used), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: COL_WIDTH[c.key] }));
  for (const p of model.unassigned)
    ws.addRow(Object.fromEntries(cols.map((c) => [c.key, rosterValue(p, c.key)])));
  ws.eachRow((r) => (r.font = baseFont(ctx)));
  styleHeader(ctx, ws.getRow(1));
}

/** モデルから XLSX のバイト列を生成する */
export async function exportXlsx(model: ExportModel): Promise<Uint8Array> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sekigae";
  wb.title = model.projectName;
  wb.created = new Date(`${model.dateISO}T00:00:00`);
  const fonts = outputFonts(model.lang);
  // charset 128 (Shift_JIS) は游ゴシックが無い環境で日本語フォントへ置換させるヒント
  const ctx: Ctx = {
    model,
    font: model.lang === "ja" ? { name: fonts.face, charset: 128 } : { name: fonts.face },
  };
  const used = new Set<string>();
  for (const room of model.rooms) addRoomSheet(wb, ctx, room, used);
  if (model.options.floorSheet) addFloorSheet(wb, ctx, used);
  addRosterSheet(wb, ctx, used);
  addByRoomSheet(wb, ctx, used);
  addUnassignedSheet(wb, ctx, used);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
