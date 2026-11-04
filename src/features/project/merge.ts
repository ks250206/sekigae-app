/**
 * 部分 JSON（部屋レイアウト / 名簿 / ルール）を開いているプロジェクトへ適用する。
 * 関数はプロジェクトを直接書き換える（immer の draft でそのまま使える）。
 * - replace: 置き換え（ID は保持）
 * - merge:   追加（ID を振り直す）。研究室は名前で突き合わせる
 * ルールの参照切れは消さずに残し、件数を返す。
 */
import type { Lab, Project } from "@/domain/schema";
import { newId } from "@/lib/id";
import type { LayoutData, MembersData, RulesData } from "./envelope";
import { countDanglingRefs, mapBlockRefs, type RefKind } from "./ruleRefs";

export type ImportMode = "replace" | "merge";

export interface ApplyResult {
  /** プロジェクト全体のルールの参照切れ件数（取り込み後） */
  dangling: number;
}

const norm = (s: string) => s.trim().normalize("NFKC").toLowerCase();

/** 席・人が消えた場合に配置案から外す */
export function pruneDanglingAssignments(p: Project): void {
  const seatIds = new Set(p.layout.rooms.flatMap((r) => r.seats.map((s) => s.id)));
  const memberIds = new Set(p.members.map((m) => m.id));
  for (const plan of p.plans) {
    for (const [sid, mid] of Object.entries(plan.assignment))
      if (!seatIds.has(sid) || !memberIds.has(mid)) delete plan.assignment[sid];
    for (const mid of Object.keys(plan.roomOnly))
      if (!memberIds.has(mid)) delete plan.roomOnly[mid];
    plan.locks = plan.locks.filter((id) => seatIds.has(id));
  }
}

// ---------------------------------------------------------------------------
// 部屋レイアウト
// ---------------------------------------------------------------------------

export function applyLayout(p: Project, data: LayoutData, mode: ImportMode): ApplyResult {
  const incoming = structuredClone(data.rooms);
  if (mode === "replace") {
    p.layout.rooms = incoming;
  } else {
    const keys = new Set(p.layout.rooms.map((r) => r.key));
    // 既存の部屋の右側に並べる
    const right = Math.max(...p.layout.rooms.map((r) => r.position.x + r.width), -Infinity);
    const minX = Math.min(...incoming.map((r) => r.position.x), Infinity);
    const dx = Number.isFinite(right) && Number.isFinite(minX) ? right + 2 - minX : 0;
    for (const r of incoming) {
      r.id = newId("room_");
      if (keys.has(r.key)) r.key = r.id;
      keys.add(r.key);
      r.position = { x: r.position.x + dx, y: r.position.y };
      for (const s of r.seats) s.id = newId("seat_");
      for (const e of r.entrances) e.id = newId("ent_");
      p.layout.rooms.push(r);
    }
  }
  pruneDanglingAssignments(p);
  return { dangling: countDanglingRefs(p.rules, p) };
}

// ---------------------------------------------------------------------------
// 名簿（研究室マスタ同梱）
// ---------------------------------------------------------------------------

/** 研究室を名前でマージし、取り込み元 ID → プロジェクト内 ID の対応を返す */
export function mergeLabs(p: Project, labs: Lab[], reId: boolean): Map<string, string> {
  const map = new Map<string, string>();
  const byName = new Map(p.labs.map((l) => [norm(l.name), l]));
  const used = new Set(p.labs.map((l) => l.id));
  for (const lab of labs) {
    const hit = byName.get(norm(lab.name));
    if (hit) {
      map.set(lab.id, hit.id);
      continue;
    }
    const id = reId || used.has(lab.id) ? newId("lab_") : lab.id;
    const added = { ...lab, id };
    p.labs.push(added);
    byName.set(norm(lab.name), added);
    used.add(id);
    map.set(lab.id, id);
  }
  return map;
}

export function applyMembers(p: Project, data: MembersData, mode: ImportMode): ApplyResult {
  const labMap = mergeLabs(p, data.labs, mode === "merge");
  const labIds = new Set(p.labs.map((l) => l.id));
  const mapLab = (id: string | undefined) => {
    if (id === undefined) return undefined;
    const m = labMap.get(id) ?? id;
    return labIds.has(m) ? m : undefined;
  };
  const incoming = structuredClone(data.members).map((m) => ({
    ...m,
    id: mode === "merge" ? newId("m_") : m.id,
    labId: mapLab(m.labId),
  }));
  if (mode === "replace") p.members = incoming;
  else p.members.push(...incoming);
  pruneDanglingAssignments(p);
  return { dangling: countDanglingRefs(p.rules, p) };
}

// ---------------------------------------------------------------------------
// ルール
// ---------------------------------------------------------------------------

/** 取り込み元の ID を、同じ名前を持つプロジェクト内の要素の ID へ置き換える */
function refRemapper(p: Project, data: RulesData): (kind: RefKind, id: string) => string {
  const existing: Record<RefKind, Set<string>> = {
    member: new Set(p.members.map((m) => m.id)),
    lab: new Set(p.labs.map((l) => l.id)),
    room: new Set(p.layout.rooms.map((r) => r.id)),
    seat: new Set(p.layout.rooms.flatMap((r) => r.seats.map((s) => s.id))),
  };
  const maps: Record<RefKind, Map<string, string>> = {
    member: new Map(),
    lab: new Map(),
    room: new Map(),
    seat: new Map(),
  };
  const refs = data.refs;
  if (refs) {
    const byName = <T extends { id: string; name: string }>(list: T[]) =>
      new Map(list.map((x) => [norm(x.name), x.id]));
    const labs = byName(p.labs);
    const rooms = byName(p.layout.rooms);
    const members = byName(p.members);
    const seats = new Map(
      p.layout.rooms.flatMap((r) =>
        r.seats.map((s) => [`${norm(r.name)}\u0000${norm(s.label)}`, s.id]),
      ),
    );
    for (const x of refs.labs) {
      const id = labs.get(norm(x.name));
      if (id) maps.lab.set(x.id, id);
    }
    for (const x of refs.rooms) {
      const id = rooms.get(norm(x.name));
      if (id) maps.room.set(x.id, id);
    }
    for (const x of refs.members) {
      const id = members.get(norm(x.name));
      if (id) maps.member.set(x.id, id);
    }
    for (const x of refs.seats) {
      const id = seats.get(`${norm(x.roomName)}\u0000${norm(x.label)}`);
      if (id) maps.seat.set(x.id, id);
    }
  }
  return (kind, id) => (existing[kind].has(id) ? id : (maps[kind].get(id) ?? id));
}

export function applyRules(p: Project, data: RulesData, mode: ImportMode): ApplyResult {
  const remap = refRemapper(p, data);
  const incoming = structuredClone(data.rules).map((r) => ({
    ...r,
    id: mode === "merge" ? newId("rule_") : r.id,
    block: mapBlockRefs(r.block, remap),
  }));
  if (mode === "replace") p.rules = incoming;
  else p.rules.push(...incoming);
  return { dangling: countDanglingRefs(incoming, p) };
}
