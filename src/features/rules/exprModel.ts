/**
 * 条件ビルダー（#153）の UI モデル ⇄ 条件式ツリーの変換。
 * 深さ 2 まで: ルート (かつ/または) → 条件（でない 可）| グループ（1 段のカッコ、中は葉のみ）
 */
import type { PersonExpr, SeatExpr } from "@/domain/rules";

export type AnyExpr = PersonExpr | SeatExpr;
type Composite = { op: "and" } | { op: "or" } | { op: "not" };
export type LeafOf<E extends AnyExpr> = Exclude<E, Composite & E>;
export type Junction = "and" | "or";

export type CondItem<E extends AnyExpr> =
  | { id: string; kind: "leaf"; not: boolean; leaf: LeafOf<E> }
  | { id: string; kind: "group"; op: Junction; leaves: LeafOf<E>[] };

export interface CondModel<E extends AnyExpr> {
  op: Junction;
  items: CondItem<E>[];
}

let seq = 0;
export const newItemId = () => `c${++seq}`;

const isComposite = (e: AnyExpr) => e.op === "and" || e.op === "or" || e.op === "not";

function itemFrom<E extends AnyExpr>(e: E): CondItem<E> | null {
  if (e.op === "not") {
    const arg = (e as unknown as { arg: E }).arg;
    if (isComposite(arg)) return null;
    return { id: newItemId(), kind: "leaf", not: true, leaf: arg as LeafOf<E> };
  }
  if (e.op === "and" || e.op === "or") {
    const args = (e as unknown as { args: E[] }).args;
    if (args.some(isComposite)) return null;
    return { id: newItemId(), kind: "group", op: e.op, leaves: args as LeafOf<E>[] };
  }
  return { id: newItemId(), kind: "leaf", not: false, leaf: e as LeafOf<E> };
}

/** 条件式 → UI モデル。表現できない（深すぎる）場合は null */
export function fromExpr<E extends AnyExpr>(e: E): CondModel<E> | null {
  if (e.op === "all") return { op: "and", items: [] };
  if (e.op === "and" || e.op === "or") {
    const items = (e as unknown as { args: E[] }).args.map((a) => itemFrom(a));
    if (items.some((x) => x === null)) return null;
    return { op: e.op, items: items as CondItem<E>[] };
  }
  const item = itemFrom(e);
  return item ? { op: "and", items: [item] } : null;
}

function itemTo<E extends AnyExpr>(item: CondItem<E>): E {
  if (item.kind === "leaf") return (item.not ? { op: "not", arg: item.leaf } : item.leaf) as E;
  if (item.leaves.length === 1) return item.leaves[0] as E;
  return { op: item.op, args: item.leaves } as unknown as E;
}

/** UI モデル → 条件式 */
export function toExpr<E extends AnyExpr>(m: CondModel<E>): E {
  if (!m.items.length) return { op: "all" } as E;
  if (m.items.length === 1) return itemTo(m.items[0]!);
  return { op: m.op, args: m.items.map(itemTo) } as unknown as E;
}

export const sameExpr = (a: AnyExpr, b: AnyExpr) => JSON.stringify(a) === JSON.stringify(b);

export type PersonLeaf = LeafOf<PersonExpr>;
export type SeatLeaf = LeafOf<SeatExpr>;

export const PERSON_LEAF_OPS = ["role", "roleGroup", "lab", "gender", "tag", "members"] as const;
export const SEAT_LEAF_OPS = ["rooms", "seats", "seatTag", "depth"] as const;

export function defaultPersonLeaf(op: (typeof PERSON_LEAF_OPS)[number]): PersonLeaf {
  return op === "members" ? { op, ids: [] } : { op, in: [] };
}

export function defaultSeatLeaf(op: (typeof SEAT_LEAF_OPS)[number]): SeatLeaf {
  switch (op) {
    case "rooms":
      return { op, roomIds: [] };
    case "seats":
      return { op, seatIds: [] };
    case "seatTag":
      return { op, in: [] };
    case "depth":
      return { op, roomIds: [], from: "back", count: 3 };
  }
}
