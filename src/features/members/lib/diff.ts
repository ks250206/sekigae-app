/**
 * 今年度案と昨年度の差分分類（純関数）。#81
 * 名簿の「変化」列と、席配置ビューの色分けモード「昨年度との差分」で同じ結果を使う。
 */
import type { ID, Project, Room, SeatPlan } from "@/domain/schema";
import { activePlan, previousPlan, seatIndex } from "@/store/selectors";
import { prevPlacements } from "./prevPlan";

export const CHANGE_KINDS = ["sameSeat", "sameRoom", "differentRoom", "new", "unassigned"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/**
 * - unassigned: 今年度の案で席がない
 * - new: 昨年度の席・部屋がない（新規メンバーなど）
 * - sameSeat: 同じ席
 * - sameRoom: 同じ部屋の別の席（昨年度が部屋のみ指定の場合もここ）
 * - differentRoom: 別の部屋
 */
export function classifyChanges(
  p: Project,
  current: SeatPlan | undefined = activePlan(p),
  previous: SeatPlan | undefined = previousPlan(p),
): Map<ID, ChangeKind> {
  const idx = seatIndex(p.layout.rooms);
  const prev = prevPlacements(p, previous);
  const curSeat = new Map<ID, ID>();
  if (current)
    for (const [sid, mid] of Object.entries(current.assignment))
      if (idx.has(sid)) curSeat.set(mid, sid);
  const out = new Map<ID, ChangeKind>();
  for (const m of p.members) {
    const sid = curSeat.get(m.id);
    if (!sid) {
      out.set(m.id, "unassigned");
      continue;
    }
    const pp = prev.get(m.id);
    if (!pp || pp.kind === "none") {
      out.set(m.id, "new");
      continue;
    }
    const room = idx.get(sid)!.room;
    if (pp.kind === "seat" && pp.seat.id === sid) out.set(m.id, "sameSeat");
    else if (pp.room.key === room.key) out.set(m.id, "sameRoom");
    else out.set(m.id, "differentRoom");
  }
  return out;
}

export interface RoomRetention {
  room: Room;
  /** 昨年度この部屋にいて、今も名簿にいる人数 */
  previous: number;
  /** そのうち今年度も同じ部屋（席が同じ人を含む） */
  stayed: number;
  /** そのうち同じ席 */
  sameSeat: number;
  /** stayed / previous（previous=0 なら null） */
  ratio: number | null;
}

/** 部屋ごとの残留率 */
export function retentionByRoom(
  p: Project,
  current: SeatPlan | undefined = activePlan(p),
  previous: SeatPlan | undefined = previousPlan(p),
): RoomRetention[] {
  const idx = seatIndex(p.layout.rooms);
  const prev = prevPlacements(p, previous);
  const curRoomKey = new Map<ID, { key: ID; seat: ID }>();
  if (current)
    for (const [sid, mid] of Object.entries(current.assignment)) {
      const ref = idx.get(sid);
      if (ref) curRoomKey.set(mid, { key: ref.room.key, seat: sid });
    }
  const stats = new Map<ID, RoomRetention>(
    p.layout.rooms.map((room) => [
      room.key,
      { room, previous: 0, stayed: 0, sameSeat: 0, ratio: null },
    ]),
  );
  for (const m of p.members) {
    const pp = prev.get(m.id);
    if (!pp || pp.kind === "none") continue;
    const s = stats.get(pp.room.key);
    if (!s) continue;
    s.previous++;
    const cur = curRoomKey.get(m.id);
    if (cur?.key === pp.room.key) {
      s.stayed++;
      if (pp.kind === "seat" && pp.seat.id === cur.seat) s.sameSeat++;
    }
  }
  for (const s of stats.values()) s.ratio = s.previous ? s.stayed / s.previous : null;
  return [...stats.values()];
}
