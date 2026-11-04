/**
 * 学年の一括進級（純関数）。#83
 * 一般トラック: b3→b4→m1→m2→d1→d2→d3→卒業候補
 * 社会人ドクタートラック: wd1→wd2→wd3→卒業候補（在籍継続を選びやすく）
 * 教員・技術員・支援員・PD・その他は変化なし。
 */
import { GRADUATION_POINTS, ROLES, nextRole, type RoleKey } from "@/domain/roles";
import type { ID, Member } from "@/domain/schema";

export type PromotionTrack = "general" | "workingDoctor";

/** 新年度の学年。"graduate" = 卒業候補、"stay" = 進級しない（留年・在籍継続） */
export type PromotionTarget = RoleKey | "graduate" | "stay";

export interface PromotionRow {
  memberId: ID;
  from: RoleKey;
  track: PromotionTrack;
  /** 既定の進級先 */
  defaultTarget: PromotionTarget;
  /** 進学（継続）した場合の学年（B4→M1 / M2→D1）。それ以外は null */
  continueTo: RoleKey | null;
  /** 終端学年（卒業候補になりうる） */
  terminal: boolean;
}

/**
 * 既定値:
 * - B4 → M1（進学）。進学しない場合は卒業候補
 * - M2 → 卒業候補。進学する場合は D1
 * - D3 / 社D3 → 卒業候補（社D3 は「在籍継続」を選びやすく）
 */
export function defaultTargetOf(role: RoleKey): PromotionTarget | null {
  const next = nextRole(role);
  if (next === null) return null;
  if (role === "m2") return "graduate";
  return next;
}

export function promotionRows(members: readonly Member[]): PromotionRow[] {
  const rows: PromotionRow[] = [];
  for (const m of members) {
    const target = defaultTargetOf(m.role);
    if (target === null) continue;
    const next = nextRole(m.role);
    rows.push({
      memberId: m.id,
      from: m.role,
      track: ROLES[m.role].group === "workingDoctor" ? "workingDoctor" : "general",
      defaultTarget: target,
      continueTo: m.role === "b4" || m.role === "m2" ? (next as RoleKey) : null,
      terminal: GRADUATION_POINTS.includes(m.role),
    });
  }
  return rows;
}

/** 進級後の役職（"graduate" は卒業候補のまま） */
export function resolveTarget(from: RoleKey, t: PromotionTarget): RoleKey | "graduate" {
  return t === "stay" ? from : t;
}

export interface PromotionPlan {
  /** 役職を変える人 */
  roleChanges: { memberId: ID; role: RoleKey }[];
  /** 卒業候補 */
  graduates: ID[];
}

export function planPromotion(
  rows: readonly PromotionRow[],
  overrides: Readonly<Record<ID, PromotionTarget>>,
): PromotionPlan {
  const roleChanges: PromotionPlan["roleChanges"] = [];
  const graduates: ID[] = [];
  for (const r of rows) {
    const to = resolveTarget(r.from, overrides[r.memberId] ?? r.defaultTarget);
    if (to === "graduate") graduates.push(r.memberId);
    else if (to !== r.from) roleChanges.push({ memberId: r.memberId, role: to });
  }
  return { roleChanges, graduates };
}
