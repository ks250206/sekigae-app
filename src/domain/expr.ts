/**
 * 条件式の素朴な解決（UI プレビュー用）。エンジンはビットセット版を使う。
 */
import { computeRoomDepth, type RoomDepth } from "./geometry/depth";
import { roleGroupOf } from "./roles";
import type { PersonExpr, SeatExpr } from "./rules";
import type { ID, Member, Room } from "./schema";

export function matchPerson(expr: PersonExpr, m: Member): boolean {
  switch (expr.op) {
    case "all":
      return true;
    case "members":
      return expr.ids.includes(m.id);
    case "role":
      return expr.in.includes(m.role);
    case "roleGroup":
      return expr.in.includes(roleGroupOf(m.role));
    case "lab":
      return m.labId !== undefined && expr.in.includes(m.labId);
    case "gender":
      return expr.in.includes(m.gender);
    case "tag":
      return m.tags.some((t) => expr.in.includes(t));
    case "and":
      return expr.args.every((a) => matchPerson(a, m));
    case "or":
      return expr.args.some((a) => matchPerson(a, m));
    case "not":
      return !matchPerson(expr.arg, m);
  }
}

export function resolvePeople(expr: PersonExpr, members: readonly Member[]): ID[] {
  return members.filter((m) => matchPerson(expr, m)).map((m) => m.id);
}

export function resolveSeats(
  expr: SeatExpr,
  rooms: readonly Room[],
  depthCache: Map<ID, RoomDepth> = new Map(),
): ID[] {
  const all = rooms.flatMap((r) => r.seats.map((s) => ({ room: r, seat: s })));
  const depthOf = (r: Room) => {
    let d = depthCache.get(r.id);
    if (!d) {
      d = computeRoomDepth(r);
      depthCache.set(r.id, d);
    }
    return d;
  };
  const evalSet = (e: SeatExpr): Set<ID> => {
    switch (e.op) {
      case "all":
        return new Set(all.map((x) => x.seat.id));
      case "rooms":
        return new Set(all.filter((x) => e.roomIds.includes(x.room.id)).map((x) => x.seat.id));
      case "seats":
        return new Set(e.seatIds.filter((id) => all.some((x) => x.seat.id === id)));
      case "seatTag":
        return new Set(
          all.filter((x) => x.seat.tags.some((t) => e.in.includes(t))).map((x) => x.seat.id),
        );
      case "depth": {
        const out = new Set<ID>();
        for (const r of rooms) {
          if (e.roomIds.length && !e.roomIds.includes(r.id)) continue;
          const d = depthOf(r);
          const sorted = [...r.seats].sort((a, b) => {
            const da = d.seats.get(a.id)?.dist ?? 0;
            const db = d.seats.get(b.id)?.dist ?? 0;
            return e.from === "back" ? db - da : da - db;
          });
          const n =
            e.count !== undefined
              ? e.count
              : e.ratio !== undefined
                ? Math.round(sorted.length * e.ratio)
                : 0;
          for (const s of sorted.slice(0, n)) out.add(s.id);
        }
        return out;
      }
      case "and": {
        const sets = e.args.map(evalSet);
        if (!sets.length) return new Set();
        return new Set([...sets[0]!].filter((id) => sets.every((s) => s.has(id))));
      }
      case "or":
        return new Set(e.args.flatMap((a) => [...evalSet(a)]));
      case "not": {
        const inner = evalSet(e.arg);
        return new Set(all.map((x) => x.seat.id).filter((id) => !inner.has(id)));
      }
    }
  };
  return [...evalSet(expr)];
}
