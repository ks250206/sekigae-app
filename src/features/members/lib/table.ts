/** 名簿テーブルの行モデル・検索・フィルタ・ソート（純関数）。#67 */
import type { Gender } from "@/domain/genders";
import { ROLE_ORDER, type RoleKey } from "@/domain/roles";
import type { ID, Lab, Member, Project } from "@/domain/schema";
import { compareNames } from "@/lib/format";
import { activePlan, labIndex, seatIndex, type SeatRef } from "@/store/selectors";
import { classifyChanges, type ChangeKind } from "./diff";
import { prevPlacements, type PrevPlacement } from "./prevPlan";
import { searchKey } from "./normalize";

export interface MemberRow {
  member: Member;
  lab?: Lab;
  current?: SeatRef;
  prev: PrevPlacement;
  change: ChangeKind;
  /** 検索用に正規化済みの文字列 */
  haystack: string;
}

export function buildRows(p: Project): MemberRow[] {
  const labs = labIndex(p.labs);
  const idx = seatIndex(p.layout.rooms);
  const plan = activePlan(p);
  const cur = new Map<ID, SeatRef>();
  for (const [sid, mid] of Object.entries(plan.assignment)) {
    const ref = idx.get(sid);
    if (ref) cur.set(mid, ref);
  }
  const prev = prevPlacements(p);
  const changes = classifyChanges(p, plan);
  return p.members.map((m) => {
    const lab = m.labId ? labs.get(m.labId) : undefined;
    return {
      member: m,
      lab,
      current: cur.get(m.id),
      prev: prev.get(m.id) ?? { kind: "none" },
      change: changes.get(m.id) ?? "unassigned",
      haystack: searchKey(
        [m.name, m.kana ?? "", ...m.tags, lab?.name ?? "", lab?.shortName ?? ""].join("\u0001"),
      ),
    };
  });
}

export interface RowFilter {
  query: string;
  roles: RoleKey[];
  /** "" = 未所属 */
  labs: ID[];
  genders: Gender[];
  tags: string[];
  /** 今年度の案で未配置の人だけ */
  unassigned: boolean;
  changes: ChangeKind[];
}

export const EMPTY_FILTER: RowFilter = {
  query: "",
  roles: [],
  labs: [],
  genders: [],
  tags: [],
  unassigned: false,
  changes: [],
};

export function activeFilterCount(f: RowFilter): number {
  return (
    f.roles.length +
    f.labs.length +
    f.genders.length +
    f.tags.length +
    f.changes.length +
    (f.unassigned ? 1 : 0)
  );
}

export function filterRows(rows: readonly MemberRow[], f: RowFilter): MemberRow[] {
  const terms = f.query
    .split(/[\s　]+/u)
    .map(searchKey)
    .filter(Boolean);
  return rows.filter((r) => {
    const m = r.member;
    if (f.roles.length && !f.roles.includes(m.role)) return false;
    if (f.labs.length && !f.labs.includes(m.labId ?? "")) return false;
    if (f.genders.length && !f.genders.includes(m.gender)) return false;
    if (f.tags.length && !f.tags.some((t) => m.tags.includes(t))) return false;
    if (f.unassigned && r.current) return false;
    if (f.changes.length && !f.changes.includes(r.change)) return false;
    return terms.every((t) => r.haystack.includes(t));
  });
}

export type SortKey = "order" | "role" | "name" | "lab" | "gender" | "current" | "prev" | "change";
export interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

const roleIdx = (r: RoleKey) => ROLE_ORDER.indexOf(r);
const seatSortKey = (ref: { room: { name: string }; seat?: { label: string } } | undefined) =>
  ref ? `${ref.room.name}\u0001${ref.seat?.label ?? ""}` : "￿";

export function sortRows(
  rows: readonly MemberRow[],
  s: SortState,
  lng: string,
  labOrder: readonly ID[],
): MemberRow[] {
  const out = rows.map((r, i) => ({ r, i }));
  const labPos = new Map(labOrder.map((id, i) => [id, i]));
  const byName = (a: MemberRow, b: MemberRow) => compareNames(a.member, b.member, lng);
  const coll = new Intl.Collator(lng, { numeric: true, sensitivity: "base" });
  const cmp: Record<SortKey, (a: MemberRow, b: MemberRow) => number> = {
    order: () => 0,
    role: (a, b) => roleIdx(a.member.role) - roleIdx(b.member.role) || byName(a, b),
    name: byName,
    lab: (a, b) =>
      (labPos.get(a.member.labId ?? "") ?? 1e9) - (labPos.get(b.member.labId ?? "") ?? 1e9) ||
      roleIdx(a.member.role) - roleIdx(b.member.role) ||
      byName(a, b),
    gender: (a, b) => a.member.gender.localeCompare(b.member.gender) || byName(a, b),
    current: (a, b) => coll.compare(seatSortKey(a.current), seatSortKey(b.current)),
    prev: (a, b) =>
      coll.compare(
        seatSortKey(a.prev.kind === "none" ? undefined : a.prev),
        seatSortKey(b.prev.kind === "none" ? undefined : b.prev),
      ),
    change: (a, b) => CHANGE_ORDER.indexOf(a.change) - CHANGE_ORDER.indexOf(b.change),
  };
  const f = cmp[s.key];
  const sign = s.dir === "asc" ? 1 : -1;
  out.sort((a, b) => sign * f(a.r, b.r) || a.i - b.i);
  return out.map((x) => x.r);
}

const CHANGE_ORDER: ChangeKind[] = ["sameSeat", "sameRoom", "differentRoom", "new", "unassigned"];

/** 全メンバーのタグ（出現数の多い順） */
export function allTags(members: readonly Member[]): string[] {
  const n = new Map<string, number>();
  for (const m of members) for (const t of m.tags) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

export const COLUMN_KEYS = [
  "name",
  "kana",
  "lab",
  "gender",
  "role",
  "tags",
  "prev",
  "current",
  "change",
  "note",
] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];
