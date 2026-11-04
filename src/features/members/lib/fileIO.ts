/**
 * 取込ファイルの読み込み（CSV / TSV / XLSX）とテンプレート生成。
 * Papaparse・ExcelJS は dynamic import で遅延ロードする。
 */
import { normalizeTable } from "./importRows";

export type TextEncoding = "utf-8" | "shift_jis";

export interface SheetData {
  name: string;
  rows: string[][];
}

/** BOM と UTF-8 の妥当性から文字コードを判定してデコードする */
export function decodeText(
  bytes: Uint8Array,
  encoding: TextEncoding | "auto" = "auto",
): { text: string; encoding: TextEncoding } {
  if (encoding !== "auto") return { text: new TextDecoder(encoding).decode(bytes), encoding };
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { text: new TextDecoder("utf-8").decode(bytes), encoding: "utf-8" };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("shift_jis").decode(bytes), encoding: "shift_jis" };
  }
}

/** CSV / TSV テキストを表にする（区切り文字は自動判定、delimiter で指定も可） */
export async function parseDelimited(text: string, delimiter?: string): Promise<string[][]> {
  const { default: Papa } = await import("papaparse");
  const res = Papa.parse<string[]>(text.replace(/^﻿/u, ""), {
    delimiter: delimiter ?? "",
    skipEmptyLines: "greedy",
  });
  return normalizeTable(res.data);
}

/** Excel からの貼り付け（TSV） */
export function parsePasted(text: string): Promise<string[][]> {
  const delimiter = text.includes("\t") ? "\t" : undefined;
  return parseDelimited(text.replace(/\r\n?/gu, "\n").replace(/\n+$/u, ""), delimiter);
}

type CellValue = unknown;

function cellText(v: CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText))
      return (o.richText as { text?: string }[]).map((r) => r.text ?? "").join("");
    if ("result" in o) return cellText(o.result);
    if ("text" in o) return cellText(o.text);
    if ("error" in o) return "";
    return "";
  }
  return typeof v === "string" ? v : String(v as number | boolean);
}

/** XLSX の全シートを読み込む */
export async function readXlsx(buffer: ArrayBuffer): Promise<SheetData[]> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheets: SheetData[] = [];
  wb.eachSheet((ws) => {
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as CellValue[]; // 1 始まり
      rows.push(values.slice(1).map(cellText));
    });
    sheets.push({ name: ws.name, rows: normalizeTable(rows) });
  });
  return sheets;
}

export interface TemplateText {
  sheet: string;
  headers: string[];
  samples: string[][];
  roleValues: string[];
  genderValues: string[];
  /** 役職・性別の列番号（0 始まり） */
  roleCol: number;
  genderCol: number;
}

/** 取込用テンプレート XLSX */
export async function buildTemplateXlsx(t: TemplateText): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t.sheet, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(t.headers);
  for (const s of t.samples) ws.addRow(s);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
  ws.columns.forEach((c) => (c.width = 16));
  const list = (values: string[]) => ({
    type: "list" as const,
    allowBlank: true,
    showErrorMessage: false,
    formulae: [`"${values.join(",")}"`],
  });
  for (let r = 2; r <= 200; r++) {
    ws.getCell(r, t.roleCol + 1).dataValidation = list(t.roleValues);
    ws.getCell(r, t.genderCol + 1).dataValidation = list(t.genderValues);
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
