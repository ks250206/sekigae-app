/**
 * 昨年度 SeatPlan（kind: "previous"）の API。#77
 * - 単一の真実: `project.previousPlanId` が指す SeatPlan。名簿の「昨年度席」列も部屋ビューの昨年度モードもここを使う
 * - 1 席 1 人・1 人 1 席を維持。席を指定したら roomOnly は消える（排他）
 *
 * 前半は SeatPlan（immer draft でも可）を直接操作する純関数、後半はストアに対するアクション。
 */
import type { Draft } from "immer";
import { createSeatPlan } from "@/domain/factory";
import type { ID, Project, Room, Seat, SeatPlan } from "@/domain/schema";
import { useProjectStore } from "@/store/project";
import { previousPlan, seatIndex, seatOfMember } from "@/store/selectors";

// ---------------------------------------------------------------------------
// 参照（純関数）
// ---------------------------------------------------------------------------

export type PrevPlacement =
  | { kind: "seat"; room: Room; seat: Seat }
  | { kind: "room"; room: Room }
  | { kind: "none" };

export function getPreviousPlan(p: Project): SeatPlan | undefined {
  return previousPlan(p);
}

/** 昨年度の席（席 ID が現在のレイアウトに存在する場合のみ） */
export function prevSeatOf(p: Project, memberId: ID, plan = previousPlan(p)) {
  if (!plan) return undefined;
  const sid = seatOfMember(plan.assignment).get(memberId);
  return sid ? seatIndex(p.layout.rooms).get(sid) : undefined;
}

/** 昨年度の部屋の Room.key（席 → 部屋、なければ roomOnly） */
export function prevRoomKeyOf(p: Project, memberId: ID, plan = previousPlan(p)): ID | undefined {
  if (!plan) return undefined;
  const ref = prevSeatOf(p, memberId, plan);
  if (ref) return ref.room.key;
  const key = plan.roomOnly[memberId];
  return key && p.layout.rooms.some((r) => r.key === key) ? key : undefined;
}

export function roomByKey(rooms: readonly Room[], key: ID): Room | undefined {
  return rooms.find((r) => r.key === key);
}

/** 昨年度の配置（席 / 部屋のみ / なし） */
export function prevPlacementOf(p: Project, memberId: ID, plan = previousPlan(p)): PrevPlacement {
  if (!plan) return { kind: "none" };
  const ref = prevSeatOf(p, memberId, plan);
  if (ref) return { kind: "seat", room: ref.room, seat: ref.seat };
  const key = plan.roomOnly[memberId];
  const room = key ? roomByKey(p.layout.rooms, key) : undefined;
  return room ? { kind: "room", room } : { kind: "none" };
}

/** 全メンバーの昨年度配置をまとめて求める */
export function prevPlacements(p: Project, plan = previousPlan(p)): Map<ID, PrevPlacement> {
  const out = new Map<ID, PrevPlacement>();
  if (!plan) return out;
  const idx = seatIndex(p.layout.rooms);
  const rooms = new Map(p.layout.rooms.map((r) => [r.key, r]));
  for (const [sid, mid] of Object.entries(plan.assignment)) {
    const ref = idx.get(sid);
    if (ref) out.set(mid, { kind: "seat", room: ref.room, seat: ref.seat });
  }
  for (const [mid, key] of Object.entries(plan.roomOnly)) {
    const room = rooms.get(key);
    if (room && !out.has(mid)) out.set(mid, { kind: "room", room });
  }
  return out;
}

// ---------------------------------------------------------------------------
// SeatPlan の操作（純関数・破壊的。immer draft に対して使う）
// ---------------------------------------------------------------------------

type PlanLike = Pick<SeatPlan, "assignment" | "roomOnly"> | Draft<SeatPlan>;

/** その人の席を外す（roomOnly は残す） */
export function unseatInPlan(plan: PlanLike, memberId: ID): ID | undefined {
  let prev: ID | undefined;
  for (const [sid, mid] of Object.entries(plan.assignment))
    if (mid === memberId) {
      prev = sid;
      delete plan.assignment[sid];
    }
  return prev;
}

export interface PlaceResult {
  /** 席にいた別の人（入れ替え / 押し出し） */
  displaced?: ID;
  /** 入れ替えで displaced が移った席 */
  swappedTo?: ID;
}

/**
 * 人を席に置く。1 人 1 席・1 席 1 人を保ち、roomOnly を消す。
 * 席が埋まっていれば `swap` で入れ替え（元の席がない場合、相手は元の部屋のみ指定に残す）。
 */
export function placeInPlan(
  plan: PlanLike,
  memberId: ID,
  seatId: ID,
  opts: { swap?: boolean } = {},
): PlaceResult {
  const occupant = plan.assignment[seatId];
  if (occupant === memberId) {
    delete plan.roomOnly[memberId];
    return {};
  }
  const fromSeat = unseatInPlan(plan, memberId);
  const fromRoomOnly = plan.roomOnly[memberId];
  delete plan.roomOnly[memberId];
  plan.assignment[seatId] = memberId;
  if (!occupant) return {};
  if (opts.swap && fromSeat) {
    plan.assignment[fromSeat] = occupant;
    return { displaced: occupant, swappedTo: fromSeat };
  }
  if (opts.swap && fromRoomOnly) plan.roomOnly[occupant] = fromRoomOnly;
  return { displaced: occupant };
}

/** 部屋のみ指定（席は外す）。roomKey=null で解除 */
export function setRoomOnlyInPlan(plan: PlanLike, memberId: ID, roomKey: ID | null): void {
  unseatInPlan(plan, memberId);
  if (roomKey) plan.roomOnly[memberId] = roomKey;
  else delete plan.roomOnly[memberId];
}

/** 席も部屋も消す */
export function clearInPlan(plan: PlanLike, memberId: ID): void {
  unseatInPlan(plan, memberId);
  delete plan.roomOnly[memberId];
}

/** draft 上で昨年度案を取得（なければ作成） */
export function ensurePreviousPlanDraft(d: Draft<Project>, name: string): Draft<SeatPlan> {
  const existing = d.previousPlanId ? d.plans.find((x) => x.id === d.previousPlanId) : undefined;
  if (existing) return existing;
  const plan = createSeatPlan(name, "previous");
  d.plans.push(plan);
  d.previousPlanId = plan.id;
  return d.plans[d.plans.length - 1]!;
}

// ---------------------------------------------------------------------------
// ストアアクション（いずれも 1 回の Undo）
// ---------------------------------------------------------------------------

export const DEFAULT_PREVIOUS_NAME = "昨年度";

export const prevSeatActions = {
  /** 昨年度案の ID を返す（なければ作る） */
  ensure(name = DEFAULT_PREVIOUS_NAME): ID {
    const s = useProjectStore.getState();
    if (s.project.previousPlanId && previousPlan(s.project)) return s.project.previousPlanId;
    let id = "";
    s.update((d) => void (id = ensurePreviousPlanDraft(d, name).id));
    return id;
  },
  /** 昨年度案の参照を外す（案そのものは残す: アーカイブ） */
  detach() {
    useProjectStore.getState().setPreviousPlan(undefined);
  },
  /** 昨年度の席を設定。seatId=null で席を外す */
  setSeat(
    memberId: ID,
    seatId: ID | null,
    opts: { swap?: boolean; planName?: string } = {},
  ): PlaceResult {
    let result: PlaceResult = {};
    useProjectStore.getState().update((d) => {
      const plan = ensurePreviousPlanDraft(d, opts.planName ?? DEFAULT_PREVIOUS_NAME);
      if (seatId) result = placeInPlan(plan, memberId, seatId, { swap: opts.swap });
      else unseatInPlan(plan, memberId);
    });
    return result;
  },
  setRoomOnly(memberId: ID, roomKey: ID | null, opts: { planName?: string } = {}) {
    useProjectStore.getState().update((d) => {
      const plan = ensurePreviousPlanDraft(d, opts.planName ?? DEFAULT_PREVIOUS_NAME);
      setRoomOnlyInPlan(plan, memberId, roomKey);
    });
  },
  clear(memberIds: ID[]) {
    const s = useProjectStore.getState();
    if (!previousPlan(s.project)) return;
    s.update((d) => {
      const plan = d.plans.find((x) => x.id === d.previousPlanId);
      if (plan) for (const id of memberIds) clearInPlan(plan, id);
    });
  },
  /** 2 人の昨年度配置を入れ替える */
  swap(a: ID, b: ID) {
    useProjectStore.getState().update((d) => {
      const plan = d.plans.find((x) => x.id === d.previousPlanId);
      if (!plan) return;
      const sa = Object.entries(plan.assignment).find(([, m]) => m === a)?.[0];
      const sb = Object.entries(plan.assignment).find(([, m]) => m === b)?.[0];
      const ra = plan.roomOnly[a];
      const rb = plan.roomOnly[b];
      clearInPlan(plan, a);
      clearInPlan(plan, b);
      if (sb) plan.assignment[sb] = a;
      else if (rb) plan.roomOnly[a] = rb;
      if (sa) plan.assignment[sa] = b;
      else if (ra) plan.roomOnly[b] = ra;
    });
  },
};
