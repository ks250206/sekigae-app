/** ルールブロック内の ID 参照（人・部屋・席・研究室）の列挙と置換 */
import type { PersonExpr, Rule, RuleBlock, SeatExpr } from "@/domain/rules";
import type { Project } from "@/domain/schema";

export type RefKind = "member" | "room" | "seat" | "lab";
export type RefMapper = (kind: RefKind, id: string) => string;

export function mapPersonExpr(e: PersonExpr, f: RefMapper): PersonExpr {
  switch (e.op) {
    case "members":
      return { ...e, ids: e.ids.map((id) => f("member", id)) };
    case "lab":
      return { ...e, in: e.in.map((id) => f("lab", id)) };
    case "and":
    case "or":
      return { ...e, args: e.args.map((a) => mapPersonExpr(a, f)) };
    case "not":
      return { ...e, arg: mapPersonExpr(e.arg, f) };
    default:
      return e;
  }
}

export function mapSeatExpr(e: SeatExpr, f: RefMapper): SeatExpr {
  switch (e.op) {
    case "rooms":
    case "depth":
      return { ...e, roomIds: e.roomIds.map((id) => f("room", id)) };
    case "seats":
      return { ...e, seatIds: e.seatIds.map((id) => f("seat", id)) };
    case "and":
    case "or":
      return { ...e, args: e.args.map((a) => mapSeatExpr(a, f)) };
    case "not":
      return { ...e, arg: mapSeatExpr(e.arg, f) };
    default:
      return e;
  }
}

/**
 * フィールド名で構造的にたどる（people/a/b: 人の条件式、seats: 席の条件式、
 * rooms: 部屋 ID 配列、memberId/seatId/target: 単独参照、children/condition/then: 子ブロック）
 */
export function mapBlockRefs(b: RuleBlock, f: RefMapper): RuleBlock {
  const out: Record<string, unknown> = { ...b };
  for (const [k, v] of Object.entries(b) as [string, unknown][]) {
    if (v === null || v === undefined) continue;
    switch (k) {
      case "people":
      case "a":
      case "b":
        out[k] = mapPersonExpr(v as PersonExpr, f);
        break;
      case "seats":
        out[k] = mapSeatExpr(v as SeatExpr, f);
        break;
      case "rooms":
        out[k] = (v as string[]).map((id) => f("room", id));
        break;
      case "memberId":
        out[k] = f("member", v as string);
        break;
      case "seatId":
        out[k] = f("seat", v as string);
        break;
      case "target": {
        const tg = v as { kind: "seat"; seatId: string } | { kind: "room"; roomId: string };
        out[k] =
          tg.kind === "seat"
            ? { ...tg, seatId: f("seat", tg.seatId) }
            : { ...tg, roomId: f("room", tg.roomId) };
        break;
      }
      case "children":
        out[k] = (v as RuleBlock[]).map((c) => mapBlockRefs(c, f));
        break;
      case "condition":
      case "then":
        out[k] = mapBlockRefs(v as RuleBlock, f);
        break;
    }
  }
  return out as RuleBlock;
}

export function collectBlockRefs(b: RuleBlock): { kind: RefKind; id: string }[] {
  const refs: { kind: RefKind; id: string }[] = [];
  mapBlockRefs(b, (kind, id) => {
    refs.push({ kind, id });
    return id;
  });
  return refs;
}

/** プロジェクト内に存在しない参照の数 */
export function countDanglingRefs(rules: Rule[], p: Project): number {
  const ids: Record<RefKind, Set<string>> = {
    member: new Set(p.members.map((m) => m.id)),
    lab: new Set(p.labs.map((l) => l.id)),
    room: new Set(p.layout.rooms.map((r) => r.id)),
    seat: new Set(p.layout.rooms.flatMap((r) => r.seats.map((s) => s.id))),
  };
  let n = 0;
  for (const r of rules)
    for (const ref of collectBlockRefs(r.block)) if (!ids[ref.kind].has(ref.id)) n++;
  return n;
}
