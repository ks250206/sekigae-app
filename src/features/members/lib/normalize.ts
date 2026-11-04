/**
 * 取込時の表記ゆれ正規化（純関数）。#74
 * - 全角半角・空白・大文字小文字を揃える（NFKC）
 * - 役職: "M1" / "ｍ１" / "修士1年" / "博士前期1年" / "Master 1" → m1 など
 *   社会人ドクター（"社D1" / "社会人博士1年" / "WD1" …）は一般の D と区別して wd* にする
 * - 性別: "男" / "Male" / "M" → male など
 * - 研究室名: 空白・「研究室」「Lab」などの接尾辞を無視して既存マスタと突合
 */
import type { Gender } from "@/domain/genders";
import { ROLE_KEYS, type RoleKey } from "@/domain/roles";
import type { Lab } from "@/domain/schema";

export type NormalizeStatus = "ok" | "empty" | "unknown";
export interface Normalized<T> {
  value: T;
  status: NormalizeStatus;
}

/** 全角英数→半角、半角カナ→全角、連続空白を 1 つに、前後の空白を除去 */
export function normalizeWidth(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\s　]+/gu, " ")
    .trim();
}

/** 比較用キー: NFKC + 小文字 + 空白除去 */
export function compactKey(s: string): string {
  return normalizeWidth(s).toLowerCase().replace(/\s+/gu, "");
}

/** 氏名の正規化（全角空白→半角、連続空白を 1 つに） */
export function normalizeName(s: string): string {
  return normalizeWidth(s);
}

/** 同姓同名チェック用のキー（空白を無視） */
export function nameKey(s: string): string {
  return compactKey(s);
}

/** カタカナ → ひらがな（ふりがな検索用） */
export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 検索用の正規化（NFKC + 小文字 + ひらがな化 + 空白除去） */
export function searchKey(s: string): string {
  return toHiragana(compactKey(s));
}

const KANJI_DIGITS: Record<string, string> = { 一: "1", 二: "2", 三: "3", 四: "4", 五: "5" };

/** 役職比較用の前処理 */
function roleKey(s: string): string {
  return compactKey(s)
    .replace(/[一二三四五]/gu, (c) => KANJI_DIGITS[c] ?? c)
    .replace(/[・.\-_'’]/gu, "")
    .replace(/回生|年生|年次|学年/gu, "年")
    .replace(/(\d)(st|nd|rd|th)(year|yr|grade)?$/u, "$1")
    .replace(/(year|yr|grade)(\d)$/u, "$2");
}

const STAFF_WORDS: [RoleKey, readonly string[]][] = [
  [
    "pd",
    [
      "pd",
      "postdoc",
      "postdoctoral",
      "postdoctoralresearcher",
      "postdoctoralfellow",
      "ポスドク",
      "ポストドク",
      "博士研究員",
      "特任研究員",
      "研究員",
      "特別研究員",
      "学振pd",
      "rpd",
      "researcher",
      "researchfellow",
    ],
  ],
  [
    "faculty",
    [
      "faculty",
      "教員",
      "教官",
      "教授",
      "准教授",
      "助教授",
      "助教",
      "講師",
      "特任教授",
      "特任准教授",
      "特任助教",
      "特任講師",
      "客員教授",
      "客員准教授",
      "名誉教授",
      "professor",
      "prof",
      "associateprofessor",
      "assistantprofessor",
      "assocprof",
      "asstprof",
      "lecturer",
      "pi",
    ],
  ],
  [
    "technician",
    ["technician", "技術員", "技術職員", "技官", "技術補佐員", "技術専門職員", "technicalstaff"],
  ],
  [
    "support",
    [
      "support",
      "supportstaff",
      "支援員",
      "研究支援員",
      "研究補助員",
      "事務",
      "事務員",
      "事務補佐員",
      "秘書",
      "secretary",
      "administrativestaff",
    ],
  ],
  ["other", ["other", "others", "その他", "他", "研究生", "聴講生", "visitor", "guest", "ゲスト"]],
];

const STAFF_LOOKUP = new Map<string, RoleKey>(
  STAFF_WORDS.flatMap(([role, words]) => words.map((w) => [w, role] as const)),
);

/** 社会人ドクター（一般の D より先に判定する） */
const WD_PATTERNS = [
  /^(?:社会人|社)(?:博士後期課程|博士後期|博士課程|博士|ドクター|ドクタ|d|dr|phd|doctor|doctoral)?(\d)年?$/u,
  /^(?:社会人|社)(?:博士後期課程|博士後期|博士課程|博士|ドクター|d|doctor)(\d)年?/u,
  /^wd(\d)$/u,
  /^working(?:doctor|doctoral|phd|d)(?:student)?(\d)$/u,
  /^(?:社会人|社)d(\d)$/u,
];
const D_PATTERN =
  /^(?:d|dc|dr|博士後期課程|博士後期|博士課程|博士|ドクター|doctor|doctoral|doctorate|phd|phdstudent|phdcandidate)(\d)年?$/u;
const M_PATTERN =
  /^(?:m|mc|修士課程|修士|博士前期課程|博士前期|master|masters|mastersstudent|masterstudent|ms)(\d)年?$/u;
const B_PATTERN = /^(?:b|学部|学士|学部生|bachelor|bachelors|undergraduate|undergrad|ug)(\d)年?$/u;
const YEAR_ONLY = /^(\d)年?$/u;

function matchRole(k: string): RoleKey | null {
  if (!k) return null;
  if ((ROLE_KEYS as readonly string[]).includes(k)) return k as RoleKey;
  const staff = STAFF_LOOKUP.get(k);
  if (staff) return staff;
  for (const re of WD_PATTERNS) {
    const m = re.exec(k);
    if (m) return pick(["wd1", "wd2", "wd3"], m[1]);
  }
  // 「社会人ドクター」「社D」など学年なし → 社D1 とはせず不明扱い（学年が必要）
  let m = D_PATTERN.exec(k);
  if (m) return pick(["d1", "d2", "d3"], m[1]);
  m = M_PATTERN.exec(k);
  if (m) return pick(["m1", "m2"], m[1]);
  m = B_PATTERN.exec(k);
  if (m) return pick([null, null, "b3", "b4"], m[1]);
  m = YEAR_ONLY.exec(k);
  if (m) return pick([null, null, "b3", "b4"], m[1]);
  return null;
}

function pick(list: readonly (RoleKey | null)[], digit: string | undefined): RoleKey | null {
  const n = Number(digit);
  if (!Number.isInteger(n) || n < 1) return null;
  return list[n - 1] ?? null;
}

/** 役職・学年の正規化。未知の値は other + status "unknown" */
export function normalizeRole(raw: string | null | undefined): Normalized<RoleKey> {
  const s = normalizeWidth(raw ?? "");
  if (!s) return { value: "other", status: "empty" };
  const candidates = [s];
  // 「博士3年 (D3)」「M1（修士1年）」のような括弧書き
  const paren = /^(.*?)[(（[［](.*?)[)）\]］]\s*$/u.exec(s);
  if (paren) candidates.push(paren[1] ?? "", paren[2] ?? "");
  for (const c of candidates) {
    const r = matchRole(roleKey(c));
    if (r) return { value: r, status: "ok" };
  }
  return { value: "other", status: "unknown" };
}

const GENDER_WORDS: [Gender, readonly string[]][] = [
  ["male", ["male", "man", "men", "boy", "m", "男", "男性", "おとこ", "オトコ", "♂", "1"]],
  [
    "female",
    ["female", "woman", "women", "girl", "f", "w", "女", "女性", "おんな", "オンナ", "♀", "2"],
  ],
  ["other", ["other", "x", "nonbinary", "non-binary", "nb", "その他", "ノンバイナリー", "3"]],
  [
    "unspecified",
    [
      "unspecified",
      "unknown",
      "n/a",
      "na",
      "-",
      "ー",
      "不明",
      "未回答",
      "無回答",
      "未設定",
      "回答しない",
      "回答なし",
      "prefernottosay",
      "prefernottoanswer",
      "0",
    ],
  ],
];
const GENDER_LOOKUP = new Map<string, Gender>(
  GENDER_WORDS.flatMap(([g, words]) => words.map((w) => [compactKey(w), g] as const)),
);

export function normalizeGender(raw: string | null | undefined): Normalized<Gender> {
  const k = compactKey(raw ?? "").replace(/[.・']/gu, "");
  if (!k) return { value: "unspecified", status: "empty" };
  const g = GENDER_LOOKUP.get(k);
  return g ? { value: g, status: "ok" } : { value: "unspecified", status: "unknown" };
}

/** 研究室名の比較キー（空白・大小文字・接尾辞「研究室」「研」「Lab」を無視） */
export function labKey(name: string): string {
  return compactKey(name)
    .replace(/(研究室|研究グループ|研)$/u, "")
    .replace(/(laboratory|lab|group)$/u, "")
    .replace(/^(laboratory|lab)of/u, "");
}

/** 既存の研究室マスタと突合する（名前 → 略称の順） */
export function matchLab(raw: string, labs: readonly Lab[]): Lab | undefined {
  const k = labKey(raw);
  if (!k) return undefined;
  return (
    labs.find((l) => labKey(l.name) === k) ??
    labs.find((l) => labKey(l.shortName) === k) ??
    labs.find((l) => compactKey(l.shortName) === compactKey(raw))
  );
}

/** タグ文字列を分割（カンマ・読点・セミコロン・改行区切り） */
export function parseTags(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of normalizeWidth(raw ?? "").split(/[,、;；\n|｜]+/u)) {
    const t = part.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** 席ラベルの比較キー（"A-01" と "a01"、"Ａ－１" を同一視） */
export function seatLabelKey(s: string): string {
  return compactKey(s)
    .replace(/[-－‐ー_\s]/gu, "")
    .replace(/(\D)0+(\d)/gu, "$1$2");
}
