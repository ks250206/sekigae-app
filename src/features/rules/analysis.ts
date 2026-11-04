/**
 * 参照切れ検知と静的な矛盾チェック。issue #98
 * および「関係する人・部屋」の判定（フィルタ用、#99）。
 */
import { matchPerson, resolvePeople, resolveSeats } from "@/domain/expr";
import {
  childBlocks,
  type PersonExpr,
  type Rule,
  type RuleBlock,
  type SeatExpr,
} from "@/domain/rules";
import type { ID, Member, Project } from "@/domain/schema";
import { isUnsetPeople } from "./registry";

export interface RefSet {
  rooms: Set<ID>;
  seats: Set<ID>;
  members: Set<ID>;
  labs: Set<ID>;
}

const emptyRefs = (): RefSet => ({
  rooms: new Set(),
  seats: new Set(),
  members: new Set(),
  labs: new Set(),
});

function personRefs(e: PersonExpr, out: RefSet) {
  switch (e.op) {
    case "members":
      e.ids.forEach((id) => out.members.add(id));
      break;
    case "lab":
      e.in.forEach((id) => out.labs.add(id));
      break;
    case "and":
    case "or":
      e.args.forEach((a) => personRefs(a, out));
      break;
    case "not":
      personRefs(e.arg, out);
      break;
  }
}

function seatRefs(e: SeatExpr, out: RefSet) {
  switch (e.op) {
    case "rooms":
    case "depth":
      e.roomIds.forEach((id) => out.rooms.add(id));
      break;
    case "seats":
      e.seatIds.forEach((id) => out.seats.add(id));
      break;
    case "and":
    case "or":
      e.args.forEach((a) => seatRefs(a, out));
      break;
    case "not":
      seatRefs(e.arg, out);
      break;
  }
}

/** ブロック（子ルールを含む）が参照する ID */
export function collectRefs(b: RuleBlock, out: RefSet = emptyRefs()): RefSet {
  if ("rooms" in b && Array.isArray(b.rooms)) b.rooms.forEach((id) => out.rooms.add(id));
  if ("people" in b) personRefs(b.people, out);
  if ("a" in b) personRefs(b.a, out);
  if ("b" in b) personRefs(b.b, out);
  if ("seats" in b) seatRefs(b.seats, out);
  if ("memberId" in b && b.memberId) out.members.add(b.memberId);
  if (b.type === "seat.pin" && b.seatId) out.seats.add(b.seatId);
  if (b.type === "person.pin" && b.target) {
    if (b.target.kind === "seat") out.seats.add(b.target.seatId);
    else out.rooms.add(b.target.roomId);
  }
  childBlocks(b).forEach((c) => collectRefs(c, out));
  return out;
}

interface Known {
  rooms: Set<ID>;
  seats: Set<ID>;
  members: Set<ID>;
  labs: Set<ID>;
}

function known(p: Project): Known {
  return {
    rooms: new Set(p.layout.rooms.map((r) => r.id)),
    seats: new Set(p.layout.rooms.flatMap((r) => r.seats.map((s) => s.id))),
    members: new Set(p.members.map((m) => m.id)),
    labs: new Set(p.labs.map((l) => l.id)),
  };
}

export interface Dangling {
  rooms: ID[];
  seats: ID[];
  members: ID[];
  labs: ID[];
}

export const danglingCount = (d: Dangling) =>
  d.rooms.length + d.seats.length + d.members.length + d.labs.length;

/** 存在しない部屋・席・人・研究室への参照 */
export function findDangling(b: RuleBlock, project: Project, k: Known = known(project)): Dangling {
  const r = collectRefs(b);
  return {
    rooms: [...r.rooms].filter((id) => !k.rooms.has(id)),
    seats: [...r.seats].filter((id) => !k.seats.has(id)),
    members: [...r.members].filter((id) => !k.members.has(id)),
    labs: [...r.labs].filter((id) => !k.labs.has(id)),
  };
}

function stripPerson(e: PersonExpr, k: Known): PersonExpr {
  switch (e.op) {
    case "members":
      return { ...e, ids: e.ids.filter((id) => k.members.has(id)) };
    case "lab":
      return { ...e, in: e.in.filter((id) => k.labs.has(id)) };
    case "and":
    case "or":
      return { ...e, args: e.args.map((a) => stripPerson(a, k)) };
    case "not":
      return { ...e, arg: stripPerson(e.arg, k) };
    default:
      return e;
  }
}

function stripSeat(e: SeatExpr, k: Known): SeatExpr {
  switch (e.op) {
    case "rooms":
    case "depth":
      return { ...e, roomIds: e.roomIds.filter((id) => k.rooms.has(id)) };
    case "seats":
      return { ...e, seatIds: e.seatIds.filter((id) => k.seats.has(id)) };
    case "and":
    case "or":
      return { ...e, args: e.args.map((a) => stripSeat(a, k)) };
    case "not":
      return { ...e, arg: stripSeat(e.arg, k) };
    default:
      return e;
  }
}

/** 参照切れを取り除いたブロック（単一参照は null = 未設定に戻す） */
export function stripDangling(
  b: RuleBlock,
  project: Project,
  k: Known = known(project),
): RuleBlock {
  const x = { ...b } as Record<string, unknown> & RuleBlock;
  if ("rooms" in b && Array.isArray(b.rooms)) x.rooms = b.rooms.filter((id) => k.rooms.has(id));
  if ("people" in b) x.people = stripPerson(b.people, k);
  if ("a" in b) x.a = stripPerson(b.a, k);
  if ("b" in b) x.b = stripPerson(b.b, k);
  if ("seats" in b) x.seats = stripSeat(b.seats, k);
  if ("memberId" in b && b.memberId && !k.members.has(b.memberId)) x.memberId = null;
  if (b.type === "seat.pin" && b.seatId && !k.seats.has(b.seatId)) x.seatId = null;
  if (b.type === "person.pin" && b.target) {
    const ok =
      b.target.kind === "seat" ? k.seats.has(b.target.seatId) : k.rooms.has(b.target.roomId);
    if (!ok) x.target = null;
  }
  if (b.type === "logic.any" || b.type === "logic.all")
    x.children = b.children.map((c) => stripDangling(c, project, k));
  if (b.type === "logic.ifThen") {
    x.condition = b.condition ? stripDangling(b.condition, project, k) : null;
    x.then = b.then ? stripDangling(b.then, project, k) : null;
  }
  return x;
}

// ---------------------------------------------------------------------------
// 静的な矛盾
// ---------------------------------------------------------------------------

export type ContradictionCode =
  | "memberTwoPins"
  | "seatTwoPins"
  | "sameAndDifferent"
  | "pairConflict"
  | "onlyEmpty"
  | "onlyDisjoint";

export interface Contradiction {
  code: ContradictionCode;
  ruleIds: ID[];
  /** メッセージの補間値（name = メンバー ID, seat = 席 ID） */
  memberId?: ID;
  seatId?: ID;
}

function overlaps(a: readonly ID[], b: readonly ID[]) {
  const s = new Set(a);
  return b.some((x) => s.has(x));
}

export function findContradictions(rules: readonly Rule[], project: Project): Contradiction[] {
  const out: Contradiction[] = [];
  const active = rules.filter((r) => r.enabled && r.strength === "hard");
  const seatRoom = new Map<ID, ID>();
  for (const room of project.layout.rooms) for (const s of room.seats) seatRoom.set(s.id, room.id);
  const members = project.members;
  const people = (e: PersonExpr) => resolvePeople(e, members);

  // 固定の衝突
  const pinsByMember = new Map<ID, { ruleId: ID; seat?: ID; room?: ID }[]>();
  const pinsBySeat = new Map<ID, { ruleId: ID; member: ID }[]>();
  const pushM = (m: ID, v: { ruleId: ID; seat?: ID; room?: ID }) =>
    pinsByMember.set(m, [...(pinsByMember.get(m) ?? []), v]);
  const pushS = (s: ID, v: { ruleId: ID; member: ID }) =>
    pinsBySeat.set(s, [...(pinsBySeat.get(s) ?? []), v]);
  for (const r of active) {
    const b = r.block;
    if (b.type === "seat.pin" && b.seatId && b.memberId) {
      pushM(b.memberId, { ruleId: r.id, seat: b.seatId });
      pushS(b.seatId, { ruleId: r.id, member: b.memberId });
    }
    if (b.type === "person.pin" && b.memberId && b.target) {
      if (b.target.kind === "seat") {
        pushM(b.memberId, { ruleId: r.id, seat: b.target.seatId });
        pushS(b.target.seatId, { ruleId: r.id, member: b.memberId });
      } else pushM(b.memberId, { ruleId: r.id, room: b.target.roomId });
    }
  }
  for (const [memberId, pins] of pinsByMember) {
    const seats = new Set(pins.flatMap((p) => (p.seat ? [p.seat] : [])));
    const rooms = new Set(pins.flatMap((p) => (p.room ? [p.room] : [])));
    const seatRooms = new Set([...seats].map((s) => seatRoom.get(s)));
    const conflict =
      seats.size > 1 ||
      rooms.size > 1 ||
      (seats.size === 1 && rooms.size === 1 && ![...rooms].every((x) => seatRooms.has(x)));
    if (conflict)
      out.push({
        code: "memberTwoPins",
        memberId,
        ruleIds: [...new Set(pins.map((p) => p.ruleId))],
      });
  }
  for (const [seatId, pins] of pinsBySeat) {
    if (new Set(pins.map((p) => p.member)).size > 1)
      out.push({ code: "seatTwoPins", seatId, ruleIds: [...new Set(pins.map((p) => p.ruleId))] });
  }

  // 昨年度と同じ / 別
  const sames = active.filter((r) => r.block.type === "prev.same");
  const diffs = active.filter((r) => r.block.type === "prev.different");
  for (const s of sames) {
    for (const d of diffs) {
      const sb = s.block as Extract<RuleBlock, { type: "prev.same" }>;
      const db = d.block as Extract<RuleBlock, { type: "prev.different" }>;
      const scopeClash = sb.scope === db.scope || (sb.scope === "seat" && db.scope === "room");
      if (!scopeClash) continue;
      const same = JSON.stringify(sb.people) === JSON.stringify(db.people);
      if (same || overlaps(people(sb.people), people(db.people)))
        out.push({ code: "sameAndDifferent", ruleIds: [s.id, d.id] });
    }
  }

  // ペアの関係
  const pairs = active.filter((r) => r.block.type === "pair.relation");
  const clash: Record<string, string[]> = {
    sameRoom: ["differentRoom"],
    adjacent: ["notAdjacent", "differentRoom"],
  };
  const pairKey = (b: Extract<RuleBlock, { type: "pair.relation" }>) =>
    [JSON.stringify(b.a), JSON.stringify(b.b)].sort().join("|") + JSON.stringify(b.qualifier ?? {});
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const a = pairs[i]!.block as Extract<RuleBlock, { type: "pair.relation" }>;
      const b = pairs[j]!.block as Extract<RuleBlock, { type: "pair.relation" }>;
      if (pairKey(a) !== pairKey(b)) continue;
      if (clash[a.relation]?.includes(b.relation) || clash[b.relation]?.includes(a.relation))
        out.push({ code: "pairConflict", ruleIds: [pairs[i]!.id, pairs[j]!.id] });
    }
  }

  // 「のみ」
  const onlys = active.filter(
    (r): r is Rule & { block: Extract<RuleBlock, { type: "room.only" | "seat.only" }> } =>
      (r.block.type === "room.only" || r.block.type === "seat.only") &&
      !isUnsetPeople(r.block.people),
  );
  if (members.length) {
    for (const r of onlys)
      if (people(r.block.people).length === 0) out.push({ code: "onlyEmpty", ruleIds: [r.id] });
  }
  const allRoomIds = project.layout.rooms.map((r) => r.id);
  const areaOf = (b: Extract<RuleBlock, { type: "room.only" | "seat.only" }>): ID[] =>
    b.type === "room.only"
      ? resolveSeats(
          { op: "rooms", roomIds: b.rooms.length ? b.rooms : allRoomIds },
          project.layout.rooms,
        )
      : resolveSeats(b.seats, project.layout.rooms);
  for (let i = 0; i < onlys.length; i++) {
    for (let j = i + 1; j < onlys.length; j++) {
      const a = onlys[i]!;
      const b = onlys[j]!;
      if (!overlaps(areaOf(a.block), areaOf(b.block))) continue;
      const pa = people(a.block.people);
      const pb = people(b.block.people);
      if (pa.length && pb.length && !overlaps(pa, pb))
        out.push({ code: "onlyDisjoint", ruleIds: [a.id, b.id] });
    }
  }
  return out;
}

export interface RulesAnalysis {
  dangling: Map<ID, Dangling>;
  contradictions: Contradiction[];
}

export function analyzeRules(project: Project): RulesAnalysis {
  const k = known(project);
  const dangling = new Map<ID, Dangling>();
  for (const r of project.rules) {
    const d = findDangling(r.block, project, k);
    if (danglingCount(d)) dangling.set(r.id, d);
  }
  return { dangling, contradictions: findContradictions(project.rules, project) };
}

// ---------------------------------------------------------------------------
// 関係する人・部屋（フィルタ）
// ---------------------------------------------------------------------------

function personExprs(b: RuleBlock): PersonExpr[] {
  const out: PersonExpr[] = [];
  if ("people" in b) out.push(b.people);
  if ("a" in b) out.push(b.a);
  if ("b" in b) out.push(b.b);
  return [...out, ...childBlocks(b).flatMap(personExprs)];
}

function seatExprs(b: RuleBlock): SeatExpr[] {
  return ["seats" in b ? [b.seats] : [], ...childBlocks(b).map(seatExprs)].flat();
}

/** ルールがこのメンバーに関係するか（「全員」指定は除く） */
export function ruleRelatesToMember(rule: Rule, member: Member): boolean {
  if (collectRefs(rule.block).members.has(member.id)) return true;
  return personExprs(rule.block).some((e) => e.op !== "all" && matchPerson(e, member));
}

/** ルールがこの部屋に関係するか（「すべての部屋」指定は除く） */
export function ruleRelatesToRoom(rule: Rule, roomId: ID, project: Project): boolean {
  const refs = collectRefs(rule.block);
  if (refs.rooms.has(roomId)) return true;
  const room = project.layout.rooms.find((r) => r.id === roomId);
  if (!room) return false;
  const seatIds = new Set(room.seats.map((s) => s.id));
  if ([...refs.seats].some((s) => seatIds.has(s))) return true;
  return seatExprs(rule.block).some(
    (e) => e.op !== "all" && resolveSeats(e, [room]).some((s) => seatIds.has(s)),
  );
}
