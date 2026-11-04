/**
 * ルール DSL。docs/DESIGN.md §4
 * - 人集合 / 席集合は条件式ツリー（かつ / または / でない）
 * - ルール同士は論理ブロック（いずれか / すべて / もし〜なら）で組み合わせる
 */
import { z } from "zod";
import { GENDERS, type Gender } from "./genders";
import { ROLE_GROUPS, ROLE_KEYS, type RoleGroup, type RoleKey } from "./roles";

export type ID = string;

// ---------------------------------------------------------------------------
// 条件式
// ---------------------------------------------------------------------------

export type PersonExpr =
  | { op: "all" }
  | { op: "members"; ids: ID[] }
  | { op: "role"; in: RoleKey[] }
  | { op: "roleGroup"; in: RoleGroup[] }
  | { op: "lab"; in: ID[] }
  | { op: "gender"; in: Gender[] }
  | { op: "tag"; in: string[] }
  | { op: "and"; args: PersonExpr[] }
  | { op: "or"; args: PersonExpr[] }
  | { op: "not"; arg: PersonExpr };

export type SeatExpr =
  | { op: "all" }
  | { op: "rooms"; roomIds: ID[] }
  | { op: "seats"; seatIds: ID[] }
  | { op: "seatTag"; in: string[] }
  | {
      op: "depth";
      roomIds: ID[];
      from: "back" | "front";
      count?: number;
      ratio?: number;
    }
  | { op: "and"; args: SeatExpr[] }
  | { op: "or"; args: SeatExpr[] }
  | { op: "not"; arg: SeatExpr };

/** 入れ子の最大深さ（and/or/not を 1 段と数える） */
export const MAX_EXPR_DEPTH = 2;

export const personExprSchema: z.ZodType<PersonExpr> = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.object({ op: z.literal("all") }),
    z.object({ op: z.literal("members"), ids: z.array(z.string()) }),
    z.object({ op: z.literal("role"), in: z.array(z.enum(ROLE_KEYS)) }),
    z.object({ op: z.literal("roleGroup"), in: z.array(z.enum(ROLE_GROUPS)) }),
    z.object({ op: z.literal("lab"), in: z.array(z.string()) }),
    z.object({ op: z.literal("gender"), in: z.array(z.enum(GENDERS)) }),
    z.object({ op: z.literal("tag"), in: z.array(z.string()) }),
    z.object({ op: z.literal("and"), args: z.array(personExprSchema) }),
    z.object({ op: z.literal("or"), args: z.array(personExprSchema) }),
    z.object({ op: z.literal("not"), arg: personExprSchema }),
  ]),
);

export const seatExprSchema: z.ZodType<SeatExpr> = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.object({ op: z.literal("all") }),
    z.object({ op: z.literal("rooms"), roomIds: z.array(z.string()) }),
    z.object({ op: z.literal("seats"), seatIds: z.array(z.string()) }),
    z.object({ op: z.literal("seatTag"), in: z.array(z.string()) }),
    z.object({
      op: z.literal("depth"),
      roomIds: z.array(z.string()),
      from: z.enum(["back", "front"]),
      count: z.number().int().min(0).optional(),
      ratio: z.number().min(0).max(1).optional(),
    }),
    z.object({ op: z.literal("and"), args: z.array(seatExprSchema) }),
    z.object({ op: z.literal("or"), args: z.array(seatExprSchema) }),
    z.object({ op: z.literal("not"), arg: seatExprSchema }),
  ]),
);

export function exprDepth(e: PersonExpr | SeatExpr): number {
  switch (e.op) {
    case "and":
    case "or":
      return 1 + Math.max(0, ...e.args.map((a) => exprDepth(a)));
    case "not":
      return 1 + exprDepth(e.arg);
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// ルールブロック
// ---------------------------------------------------------------------------

/** 部屋の指定。空配列 = すべての部屋 */
export type RoomIds = ID[];
export type CmpOp = "gte" | "lte" | "eq";
export type Unit = "count" | "percent";
export type Attr = "lab" | "role" | "gender";
export type PairRelation = "sameRoom" | "differentRoom" | "adjacent" | "notAdjacent";
export type SameDiff = "same" | "different";

export type RuleBlock =
  // 部屋
  | { type: "room.only"; rooms: RoomIds; people: PersonExpr }
  | { type: "room.prefer"; rooms: RoomIds; people: PersonExpr }
  | {
      type: "room.count";
      rooms: RoomIds;
      people: PersonExpr;
      op: CmpOp;
      value: number;
      unit: Unit;
    }
  | { type: "room.exclude"; rooms: RoomIds; people: PersonExpr }
  | { type: "room.diversity"; rooms: RoomIds; attr: "lab" | "role"; min: number }
  | { type: "room.attrCap"; rooms: RoomIds; attr: Attr; max: number; unit: Unit }
  // 席
  | { type: "seat.only"; seats: SeatExpr; people: PersonExpr }
  | { type: "seat.pin"; seatId: ID | null; memberId: ID | null }
  | { type: "seat.empty"; seats: SeatExpr }
  // 人
  | {
      type: "person.pin";
      memberId: ID | null;
      target: { kind: "seat"; seatId: ID } | { kind: "room"; roomId: ID } | null;
    }
  | { type: "person.avoid"; memberId: ID | null; seats: SeatExpr }
  | {
      type: "pair.relation";
      a: PersonExpr;
      b: PersonExpr;
      relation: PairRelation;
      qualifier?: { lab?: SameDiff; role?: SameDiff };
    }
  // 全体
  | { type: "prev.different"; people: PersonExpr; scope: "room" | "seat" }
  | { type: "prev.same"; people: PersonExpr; scope: "room" | "seat" }
  | { type: "group.cluster"; people: PersonExpr; attr: "lab" | "role" }
  | { type: "group.spread"; people: PersonExpr; attr: Attr }
  | { type: "depth.order"; people: PersonExpr; direction: "seniorBack" | "seniorFront" }
  | { type: "group.mixAdjacent"; people: PersonExpr; attr: "lab" | "role" }
  | {
      type: "group.buddy";
      a: PersonExpr;
      b: PersonExpr;
      scope: "sameRoom" | "adjacent";
      min: number;
    }
  | { type: "group.labBalance"; people: PersonExpr }
  // 論理
  | { type: "logic.any"; children: RuleBlock[] }
  | { type: "logic.all"; children: RuleBlock[] }
  | { type: "logic.ifThen"; condition: RuleBlock | null; then: RuleBlock | null };

export type RuleType = RuleBlock["type"];
export type RuleCategory = "room" | "seat" | "person" | "global" | "logic";

export const RULE_TYPES = [
  "room.only",
  "room.prefer",
  "room.count",
  "room.exclude",
  "room.diversity",
  "room.attrCap",
  "seat.only",
  "seat.pin",
  "seat.empty",
  "person.pin",
  "person.avoid",
  "pair.relation",
  "prev.different",
  "prev.same",
  "group.cluster",
  "group.spread",
  "depth.order",
  "group.mixAdjacent",
  "group.buddy",
  "group.labBalance",
  "logic.any",
  "logic.all",
  "logic.ifThen",
] as const satisfies readonly RuleType[];

export const RULE_CATEGORY: Record<RuleType, RuleCategory> = {
  "room.only": "room",
  "room.prefer": "room",
  "room.count": "room",
  "room.exclude": "room",
  "room.diversity": "room",
  "room.attrCap": "room",
  "seat.only": "seat",
  "seat.pin": "seat",
  "seat.empty": "seat",
  "person.pin": "person",
  "person.avoid": "person",
  "pair.relation": "person",
  "prev.different": "global",
  "prev.same": "global",
  "group.cluster": "global",
  "group.spread": "global",
  "depth.order": "global",
  "group.mixAdjacent": "global",
  "group.buddy": "global",
  "group.labBalance": "global",
  "logic.any": "logic",
  "logic.all": "logic",
  "logic.ifThen": "logic",
};

/** soft（できれば）専用のブロック */
export const SOFT_ONLY_TYPES: ReadonlySet<RuleType> = new Set<RuleType>([
  "room.prefer",
  "group.labBalance",
]);

/** 論理ブロック内で子として使えない（入れ子は論理ブロック自身で 2 段まで） */
export const MAX_LOGIC_DEPTH = 2;

const roomIds = z.array(z.string());
const unit = z.enum(["count", "percent"]);
const attr = z.enum(["lab", "role", "gender"]);
const labOrRole = z.enum(["lab", "role"]);
const sameDiff = z.enum(["same", "different"]);

export const ruleBlockSchema: z.ZodType<RuleBlock> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("room.only"), rooms: roomIds, people: personExprSchema }),
    z.object({ type: z.literal("room.prefer"), rooms: roomIds, people: personExprSchema }),
    z.object({
      type: z.literal("room.count"),
      rooms: roomIds,
      people: personExprSchema,
      op: z.enum(["gte", "lte", "eq"]),
      value: z.number().min(0),
      unit,
    }),
    z.object({ type: z.literal("room.exclude"), rooms: roomIds, people: personExprSchema }),
    z.object({
      type: z.literal("room.diversity"),
      rooms: roomIds,
      attr: labOrRole,
      min: z.number().int().min(1),
    }),
    z.object({
      type: z.literal("room.attrCap"),
      rooms: roomIds,
      attr,
      max: z.number().min(0),
      unit,
    }),
    z.object({ type: z.literal("seat.only"), seats: seatExprSchema, people: personExprSchema }),
    z.object({
      type: z.literal("seat.pin"),
      seatId: z.string().nullable(),
      memberId: z.string().nullable(),
    }),
    z.object({ type: z.literal("seat.empty"), seats: seatExprSchema }),
    z.object({
      type: z.literal("person.pin"),
      memberId: z.string().nullable(),
      target: z
        .discriminatedUnion("kind", [
          z.object({ kind: z.literal("seat"), seatId: z.string() }),
          z.object({ kind: z.literal("room"), roomId: z.string() }),
        ])
        .nullable(),
    }),
    z.object({
      type: z.literal("person.avoid"),
      memberId: z.string().nullable(),
      seats: seatExprSchema,
    }),
    z.object({
      type: z.literal("pair.relation"),
      a: personExprSchema,
      b: personExprSchema,
      relation: z.enum(["sameRoom", "differentRoom", "adjacent", "notAdjacent"]),
      qualifier: z.object({ lab: sameDiff.optional(), role: sameDiff.optional() }).optional(),
    }),
    z.object({
      type: z.literal("prev.different"),
      people: personExprSchema,
      scope: z.enum(["room", "seat"]),
    }),
    z.object({
      type: z.literal("prev.same"),
      people: personExprSchema,
      scope: z.enum(["room", "seat"]),
    }),
    z.object({ type: z.literal("group.cluster"), people: personExprSchema, attr: labOrRole }),
    z.object({ type: z.literal("group.spread"), people: personExprSchema, attr }),
    z.object({
      type: z.literal("depth.order"),
      people: personExprSchema,
      direction: z.enum(["seniorBack", "seniorFront"]),
    }),
    z.object({ type: z.literal("group.mixAdjacent"), people: personExprSchema, attr: labOrRole }),
    z.object({
      type: z.literal("group.buddy"),
      a: personExprSchema,
      b: personExprSchema,
      scope: z.enum(["sameRoom", "adjacent"]),
      min: z.number().int().min(1),
    }),
    z.object({ type: z.literal("group.labBalance"), people: personExprSchema }),
    z.object({ type: z.literal("logic.any"), children: z.array(ruleBlockSchema) }),
    z.object({ type: z.literal("logic.all"), children: z.array(ruleBlockSchema) }),
    z.object({
      type: z.literal("logic.ifThen"),
      condition: ruleBlockSchema.nullable(),
      then: ruleBlockSchema.nullable(),
    }),
  ]),
);

export type Strength = "hard" | "soft";
export type Weight = 1 | 2 | 3 | 4 | 5;
export type RuleOrigin = "user" | "preset" | "contextMenu" | "template";

export interface Rule {
  id: ID;
  enabled: boolean;
  strength: Strength;
  /** soft のみ有効 */
  weight: Weight;
  block: RuleBlock;
  note?: string;
  origin?: RuleOrigin;
}

export const ruleSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  strength: z.enum(["hard", "soft"]),
  weight: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  block: ruleBlockSchema,
  note: z.string().optional(),
  origin: z.enum(["user", "preset", "contextMenu", "template"]).optional(),
}) satisfies z.ZodType<Rule>;

export function logicDepth(b: RuleBlock | null): number {
  if (!b) return 0;
  switch (b.type) {
    case "logic.any":
    case "logic.all":
      return 1 + Math.max(0, ...b.children.map(logicDepth));
    case "logic.ifThen":
      return 1 + Math.max(logicDepth(b.condition), logicDepth(b.then));
    default:
      return 0;
  }
}

/** ブロックの子ルールを列挙（論理ブロック以外は空） */
export function childBlocks(b: RuleBlock): RuleBlock[] {
  switch (b.type) {
    case "logic.any":
    case "logic.all":
      return b.children;
    case "logic.ifThen":
      return [b.condition, b.then].filter((x): x is RuleBlock => x !== null);
    default:
      return [];
  }
}
