/**
 * 名簿取込（CSV / XLSX / 貼り付け共通）の純関数部分。#72 #73 #84
 * - ヘッダー行の検出、列マッピングの推定
 * - 行の正規化（役職・性別・研究室・タグ・昨年度の部屋/席）と警告・エラー
 */
import type { Gender } from "@/domain/genders";
import type { RoleKey } from "@/domain/roles";
import type { ID, Lab, Room } from "@/domain/schema";
import {
  compactKey,
  labKey,
  matchLab,
  nameKey,
  normalizeGender,
  normalizeName,
  normalizeRole,
  normalizeWidth,
  parseTags,
  seatLabelKey,
} from "./normalize";

export const IMPORT_FIELDS = [
  "name",
  "kana",
  "lab",
  "gender",
  "role",
  "tags",
  "note",
  "prevRoom",
  "prevSeat",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
/** 列 → フィールド（null = 取り込まない） */
export type ColumnMapping = (ImportField | null)[];

const HEADER_SYNONYMS: Record<ImportField, readonly string[]> = {
  name: [
    "氏名",
    "名前",
    "なまえ",
    "姓名",
    "フルネーム",
    "name",
    "fullname",
    "membername",
    "member",
  ],
  kana: [
    "ふりがな",
    "フリガナ",
    "よみ",
    "ヨミ",
    "よみがな",
    "読み",
    "読み仮名",
    "かな",
    "カナ",
    "kana",
    "furigana",
    "reading",
    "yomi",
  ],
  lab: [
    "研究室",
    "所属",
    "所属研究室",
    "研究室名",
    "ラボ",
    "グループ",
    "lab",
    "laboratory",
    "labname",
    "group",
    "affiliation",
  ],
  gender: ["性別", "せいべつ", "gender", "sex"],
  role: [
    "役職",
    "学年",
    "役職学年",
    "役職・学年",
    "身分",
    "区分",
    "職位",
    "課程",
    "role",
    "grade",
    "year",
    "position",
    "status",
    "title",
  ],
  tags: ["タグ", "属性", "tags", "tag", "labels"],
  note: ["メモ", "備考", "コメント", "注記", "note", "notes", "memo", "remarks", "comment"],
  prevRoom: [
    "昨年度の部屋",
    "昨年度部屋",
    "前年度の部屋",
    "前年度部屋",
    "昨年の部屋",
    "旧部屋",
    "previousroom",
    "prevroom",
    "lastyearroom",
    "oldroom",
  ],
  prevSeat: [
    "昨年度の席",
    "昨年度席",
    "前年度の席",
    "前年度席",
    "昨年の席",
    "旧席",
    "previousseat",
    "prevseat",
    "lastyearseat",
    "oldseat",
  ],
};

const SYNONYM_LOOKUP = new Map<string, ImportField>(
  (Object.entries(HEADER_SYNONYMS) as [ImportField, readonly string[]][]).flatMap(([f, words]) =>
    words.map((w) => [headerKey(w), f] as const),
  ),
);

function headerKey(s: string): string {
  return compactKey(s).replace(/[・*＊:：()（）[\]【】_\-/／]/gu, "");
}

/** 列名からフィールドを推定 */
export function guessField(header: string): ImportField | null {
  const k = headerKey(header);
  if (!k) return null;
  const exact = SYNONYM_LOOKUP.get(k);
  if (exact) return exact;
  // 「氏名（漢字）」「昨年度 席番号」などの部分一致
  if (/昨年|前年|previous|lastyear|旧/u.test(k)) {
    if (/席|seat/u.test(k)) return "prevSeat";
    if (/部屋|室|room/u.test(k)) return "prevRoom";
  }
  if (/ふりがな|フリガナ|よみ|ヨミ|kana|furigana/u.test(k)) return "kana";
  if (/氏名|名前|name/u.test(k)) return "name";
  if (/研究室|lab/u.test(k)) return "lab";
  if (/性別|gender|sex/u.test(k)) return "gender";
  if (/役職|学年|role|grade/u.test(k)) return "role";
  if (/備考|メモ|note/u.test(k)) return "note";
  if (/タグ|tag/u.test(k)) return "tags";
  return null;
}

/** 推定したマッピング（同じフィールドは最初の列だけ） */
export function guessMapping(headers: readonly string[]): ColumnMapping {
  const used = new Set<ImportField>();
  return headers.map((h) => {
    const f = guessField(h);
    if (!f || used.has(f)) return null;
    used.add(f);
    return f;
  });
}

/**
 * ヘッダー行の検出。先頭 10 行のうち列名として認識できるセルが最も多い行（2 個以上、
 * または列が 1〜2 列で 1 個以上）。見つからなければ -1（ヘッダーなし）。
 */
export function detectHeaderRow(rows: readonly (readonly string[])[]): number {
  let best = -1;
  let bestScore = 0;
  rows.slice(0, 10).forEach((row, i) => {
    const filled = row.filter((c) => c.trim()).length;
    const score = new Set(row.map(guessField).filter(Boolean)).size;
    const need = filled <= 2 ? 1 : 2;
    if (score >= need && score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

/** ヘッダーなしの場合、中身から推定（役職・性別らしい列 / 最初の文字列列 = 氏名） */
export function guessMappingFromData(rows: readonly (readonly string[])[]): ColumnMapping {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const sample = rows.slice(0, 50);
  const mapping: ColumnMapping = Array.from({ length: width }, () => null);
  const ratio = (col: number, test: (v: string) => boolean) => {
    const vals = sample.map((r) => r[col] ?? "").filter((v) => v.trim());
    return vals.length ? vals.filter(test).length / vals.length : 0;
  };
  const used = new Set<ImportField>();
  for (let c = 0; c < width; c++) {
    if (!used.has("role") && ratio(c, (v) => normalizeRole(v).status === "ok") >= 0.6) {
      mapping[c] = "role";
      used.add("role");
    } else if (!used.has("gender") && ratio(c, (v) => normalizeGender(v).status === "ok") >= 0.8) {
      mapping[c] = "gender";
      used.add("gender");
    } else if (
      !used.has("kana") &&
      used.has("name") &&
      ratio(c, (v) =>
        /^[\p{Script=Hiragana}\p{Script=Katakana}ー\s・]+$/u.test(normalizeWidth(v)),
      ) >= 0.8
    ) {
      mapping[c] = "kana";
      used.add("kana");
    } else if (!used.has("name") && ratio(c, (v) => /\p{L}/u.test(v)) >= 0.8) {
      mapping[c] = "name";
      used.add("name");
    } else if (!used.has("lab") && ratio(c, (v) => /研|lab/iu.test(v)) >= 0.6) {
      mapping[c] = "lab";
      used.add("lab");
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// 行の正規化
// ---------------------------------------------------------------------------

export type IssueCode =
  | "nameMissing"
  | "roleUnknown"
  | "genderUnknown"
  | "labNew"
  | "prevRoomUnknown"
  | "prevSeatUnknown"
  | "prevSeatRoomOnly"
  | "prevSeatDuplicate"
  | "duplicateName";

export interface ImportIssue {
  field: ImportField;
  code: IssueCode;
  raw?: string;
}

export interface ImportRow {
  /** 元データの行番号（1 始まり） */
  line: number;
  name: string;
  kana?: string;
  /** 研究室の入力値（正規化済み） */
  labName?: string;
  /** 既存研究室にマッチした場合の ID */
  labId?: ID;
  gender: Gender;
  role: RoleKey;
  tags: string[];
  note?: string;
  /** 昨年度: 部屋 key と席 ID（部屋のみの場合 seatId なし） */
  prev?: { roomKey: ID; seatId?: ID };
  /** 値が入っていたフィールド（更新モードでは空欄の項目は上書きしない） */
  filled: Set<ImportField>;
  warnings: ImportIssue[];
  errors: ImportIssue[];
}

export interface BuildContext {
  labs: readonly Lab[];
  rooms: readonly Room[];
}

function findRoom(raw: string, rooms: readonly Room[]): Room | undefined {
  const k = compactKey(raw);
  const lk = labKey(raw);
  return (
    rooms.find((r) => compactKey(r.name) === k) ??
    rooms.find((r) => labKey(r.name) === lk) ??
    rooms.find((r) => compactKey(r.name).startsWith(k) || k.startsWith(compactKey(r.name)))
  );
}

function findSeat(
  label: string,
  room: Room | undefined,
  rooms: readonly Room[],
): { room: Room; seatId: ID } | "ambiguous" | undefined {
  const k = seatLabelKey(label);
  if (!k) return undefined;
  if (room) {
    const s = room.seats.find((x) => seatLabelKey(x.label) === k);
    return s ? { room, seatId: s.id } : undefined;
  }
  const hits = rooms.flatMap((r) =>
    r.seats.filter((x) => seatLabelKey(x.label) === k).map((s) => ({ room: r, seatId: s.id })),
  );
  if (hits.length > 1) return "ambiguous";
  return hits[0];
}

/** 表データ（ヘッダー行を除く）を正規化した取込行にする */
export function buildImportRows(
  data: readonly (readonly string[])[],
  mapping: ColumnMapping,
  ctx: BuildContext,
  lineOffset = 1,
): ImportRow[] {
  const col = (f: ImportField) => mapping.indexOf(f);
  const cols = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, col(f)])) as Record<
    ImportField,
    number
  >;
  const seatsTaken = new Map<ID, number>();
  const names = new Map<string, number>();
  const out: ImportRow[] = [];

  data.forEach((cells, i) => {
    const get = (f: ImportField) => (cols[f] >= 0 ? normalizeWidth(cells[cols[f]] ?? "") : "");
    if (cells.every((c) => !String(c ?? "").trim())) return; // 空行
    const row: ImportRow = {
      line: i + lineOffset,
      name: normalizeName(get("name")),
      gender: "unspecified",
      role: "other",
      tags: [],
      filled: new Set(
        IMPORT_FIELDS.filter((f) => cols[f] >= 0 && String(cells[cols[f]] ?? "").trim()),
      ),
      warnings: [],
      errors: [],
    };
    if (!row.name) row.errors.push({ field: "name", code: "nameMissing" });
    else {
      const k = nameKey(row.name);
      const prevLine = names.get(k);
      if (prevLine !== undefined)
        row.warnings.push({ field: "name", code: "duplicateName", raw: String(prevLine) });
      else names.set(k, row.line);
    }
    const kana = get("kana");
    if (kana) row.kana = kana;

    const role = normalizeRole(get("role"));
    row.role = role.value;
    if (role.status === "unknown")
      row.warnings.push({ field: "role", code: "roleUnknown", raw: get("role") });

    const gender = normalizeGender(get("gender"));
    row.gender = gender.value;
    if (gender.status === "unknown")
      row.warnings.push({ field: "gender", code: "genderUnknown", raw: get("gender") });

    const labRaw = get("lab");
    if (labRaw) {
      const lab = matchLab(labRaw, ctx.labs);
      if (lab) {
        row.labId = lab.id;
        row.labName = lab.name;
      } else {
        row.labName = labRaw;
        row.warnings.push({ field: "lab", code: "labNew", raw: labRaw });
      }
    }

    row.tags = parseTags(cols.tags >= 0 ? (cells[cols.tags] ?? "") : "");
    const note = cols.note >= 0 ? String(cells[cols.note] ?? "").trim() : "";
    if (note) row.note = note;

    // 昨年度の部屋・席（#84）
    const roomRaw = get("prevRoom");
    const seatRaw = get("prevSeat");
    if (roomRaw || seatRaw) {
      const room = roomRaw ? findRoom(roomRaw, ctx.rooms) : undefined;
      if (roomRaw && !room)
        row.warnings.push({ field: "prevRoom", code: "prevRoomUnknown", raw: roomRaw });
      const seat = seatRaw ? findSeat(seatRaw, room, ctx.rooms) : undefined;
      if (seat && seat !== "ambiguous") {
        const taken = seatsTaken.get(seat.seatId);
        if (taken !== undefined)
          row.errors.push({
            field: "prevSeat",
            code: "prevSeatDuplicate",
            raw: `${seatRaw} (${taken})`,
          });
        else {
          seatsTaken.set(seat.seatId, row.line);
          row.prev = { roomKey: seat.room.key, seatId: seat.seatId };
        }
      } else if (room) {
        row.prev = { roomKey: room.key };
        if (seatRaw)
          row.warnings.push({ field: "prevSeat", code: "prevSeatRoomOnly", raw: seatRaw });
      } else if (seatRaw) {
        row.warnings.push({ field: "prevSeat", code: "prevSeatUnknown", raw: seatRaw });
      }
    }
    out.push(row);
  });
  return out;
}

/** 取込対象（エラーのない行） */
export const validRows = (rows: readonly ImportRow[]) => rows.filter((r) => !r.errors.length);

/** 新規作成される研究室名（重複除去・正規化キーで同一視） */
export function newLabNames(rows: readonly ImportRow[]): string[] {
  const seen = new Map<string, string>();
  for (const r of validRows(rows))
    if (r.labName && !r.labId && !seen.has(labKey(r.labName)))
      seen.set(labKey(r.labName), r.labName);
  return [...seen.values()];
}

function cellToString(c: unknown): string {
  if (c === null || c === undefined) return "";
  if (typeof c === "string") return c;
  if (typeof c === "number" || typeof c === "boolean" || typeof c === "bigint") return String(c);
  return JSON.stringify(c);
}

/** 表を矩形に揃え、末尾の空列を除く */
export function normalizeTable(rows: readonly (readonly unknown[])[]): string[][] {
  const str = rows.map((r) => r.map(cellToString));
  let width = 0;
  for (const r of str)
    for (let i = r.length - 1; i >= 0; i--)
      if (r[i]!.trim()) {
        width = Math.max(width, i + 1);
        break;
      }
  return str
    .map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""))
    .filter((r) => r.some((c) => c.trim()));
}
