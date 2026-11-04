/**
 * ブロック定義レジストリ。docs/DESIGN.md §4.3 / issue #86
 * ブロック種別ごとに カテゴリ・アイコン・既定値・スロット定義・i18n テンプレート・hard 可否・検証 を持つ。
 */
import {
  Armchair,
  ArrowDownWideNarrow,
  Ban,
  Blend,
  CircleSlash,
  DoorClosed,
  DoorOpen,
  GitBranch,
  Group,
  Handshake,
  History,
  Layers,
  ListChecks,
  type LucideIcon,
  Percent,
  Pin,
  Repeat,
  Scale,
  Shuffle,
  Split,
  Users,
  UserX,
  Hash,
  MapPin,
} from "lucide-react";
import { MAX_EXPR_DEPTH, exprDepth } from "@/domain/rules";
import {
  MAX_LOGIC_DEPTH,
  RULE_CATEGORY,
  RULE_TYPES,
  SOFT_ONLY_TYPES,
  logicDepth,
  type PersonExpr,
  type Rule,
  type RuleBlock,
  type RuleCategory,
  type RuleType,
  type SeatExpr,
} from "@/domain/rules";
import type { Project } from "@/domain/schema";

export type SlotKind =
  | "rooms" // RoomIds（複数・空 = すべての部屋）
  | "people" // PersonExpr
  | "member" // ID | null（1 人）
  | "seats" // SeatExpr
  | "seat" // ID | null（1 席）
  | "target" // person.pin の { kind: seat | room } | null
  | "number"
  | "enum";

export interface SlotDef {
  /** テンプレート内のタグ名 */
  name: string;
  kind: SlotKind;
  /** ブロック内のフィールドパス（"qualifier.lab" のようにドット区切り） */
  path: string;
  /** enum: 選択肢 */
  options?: readonly string[];
  /** enum: 表示ラベルの i18n キー `values.<valueSet>.<option>` */
  valueSet?: string;
  /** enum: 未指定（undefined）を許す */
  optional?: boolean;
  /** number: 単位（count / percent）フィールドのパス */
  unitPath?: string;
  min?: number;
  max?: number;
}

export interface BlockIssue {
  /** i18n キー（rules:issues.*） */
  code:
    | "unsetSlot"
    | "noPreviousPlan"
    | "emptyLogic"
    | "ifThenIncomplete"
    | "tooDeep"
    | "percentOver"
    | "softOnly"
    | "minOverOptions";
  severity: "error" | "warning";
  slot?: string;
}

export interface ValidationCtx {
  project: Project;
}

export interface BlockDefinition {
  type: RuleType;
  category: RuleCategory;
  icon: LucideIcon;
  /** 既定値のブロック */
  create: () => RuleBlock;
  slots: readonly SlotDef[];
  /** i18n キーの接頭辞（rules:blocks.<type>）。`.name` `.template` を持つ */
  i18nKey: string;
  /** 必須(hard) にできるか */
  hardAllowed: boolean;
  /** 子ルールを持つ論理ブロックの形 */
  container?: "list" | "ifThen";
  validate: (block: RuleBlock, ctx: ValidationCtx) => BlockIssue[];
}

// ---------------------------------------------------------------------------
// 未設定の判定（プレースホルダ表示・自動で開くスロット）
// ---------------------------------------------------------------------------

export const UNSET_PEOPLE: PersonExpr = { op: "members", ids: [] };
export const UNSET_SEATS: SeatExpr = { op: "seats", seatIds: [] };

export const isUnsetPeople = (e: PersonExpr) => e.op === "members" && e.ids.length === 0;
export const isUnsetSeats = (e: SeatExpr) => e.op === "seats" && e.seatIds.length === 0;

// ---------------------------------------------------------------------------
// パスでの読み書き
// ---------------------------------------------------------------------------

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** イミュータブルに値を設定する。undefined はキー削除（空になった親オブジェクトも削除） */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split(".");
  const src = (obj ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };
  if (!rest.length) {
    if (value === undefined) delete out[head!];
    else out[head!] = value;
  } else {
    const child = setPath(src[head!], rest.join("."), value) as Record<string, unknown>;
    if (Object.keys(child).length === 0) delete out[head!];
    else out[head!] = child;
  }
  return out as T;
}

export function slotValue(block: RuleBlock, slot: SlotDef): unknown {
  return getPath(block, slot.path);
}

export function isSlotUnset(block: RuleBlock, slot: SlotDef): boolean {
  const v = slotValue(block, slot);
  switch (slot.kind) {
    case "people":
      return isUnsetPeople(v as PersonExpr);
    case "seats":
      return isUnsetSeats(v as SeatExpr);
    case "member":
    case "seat":
    case "target":
      return v === null || v === undefined;
    case "enum":
      return !slot.optional && v === undefined;
    default:
      return false;
  }
}

/** 最初の未設定スロット（ブロック追加時に自動で開く） */
export function firstUnsetSlot(block: RuleBlock): string | null {
  const def = BLOCKS[block.type];
  return def.slots.find((s) => isSlotUnset(block, s))?.name ?? null;
}

// ---------------------------------------------------------------------------
// スロット定義のヘルパ
// ---------------------------------------------------------------------------

const rooms = (): SlotDef => ({ name: "rooms", kind: "rooms", path: "rooms" });
const people = (name = "people", path = name): SlotDef => ({ name, kind: "people", path });
const seats = (): SlotDef => ({ name: "seats", kind: "seats", path: "seats" });
const member = (): SlotDef => ({ name: "member", kind: "member", path: "memberId" });
const enumSlot = (
  name: string,
  path: string,
  options: readonly string[],
  valueSet: string,
  optional = false,
): SlotDef => ({ name, kind: "enum", path, options, valueSet, optional });
const num = (name: string, path: string, min: number, max: number, unitPath?: string): SlotDef => ({
  name,
  kind: "number",
  path,
  min,
  max,
  unitPath,
});

// ---------------------------------------------------------------------------
// 検証
// ---------------------------------------------------------------------------

function genericIssues(block: RuleBlock, def: Omit<BlockDefinition, "validate">): BlockIssue[] {
  const out: BlockIssue[] = [];
  for (const s of def.slots) {
    if (isSlotUnset(block, s)) out.push({ code: "unsetSlot", severity: "warning", slot: s.name });
    if (s.kind === "number") {
      const v = slotValue(block, s) as number;
      const unit = s.unitPath ? getPath(block, s.unitPath) : undefined;
      if (unit === "percent" && v > 100)
        out.push({ code: "percentOver", severity: "error", slot: s.name });
    }
    if (s.kind === "people" || s.kind === "seats") {
      const v = slotValue(block, s) as PersonExpr | SeatExpr;
      if (exprDepth(v) > MAX_EXPR_DEPTH)
        out.push({ code: "tooDeep", severity: "error", slot: s.name });
    }
  }
  return out;
}

type Spec = Omit<BlockDefinition, "category" | "i18nKey" | "hardAllowed" | "validate"> & {
  validate?: (block: RuleBlock, ctx: ValidationCtx) => BlockIssue[];
};

function define(spec: Spec): BlockDefinition {
  const base = {
    ...spec,
    category: RULE_CATEGORY[spec.type],
    i18nKey: `blocks.${spec.type}`,
    hardAllowed: !SOFT_ONLY_TYPES.has(spec.type),
  };
  return {
    ...base,
    validate: (block, ctx) => [
      ...genericIssues(block, base),
      ...(spec.validate?.(block, ctx) ?? []),
    ],
  };
}

const prevValidate = (_b: RuleBlock, ctx: ValidationCtx): BlockIssue[] =>
  ctx.project.previousPlanId ? [] : [{ code: "noPreviousPlan", severity: "warning" }];

const logicValidate = (b: RuleBlock): BlockIssue[] => {
  const out: BlockIssue[] = [];
  if (logicDepth(b) > MAX_LOGIC_DEPTH) out.push({ code: "tooDeep", severity: "error" });
  if ((b.type === "logic.any" || b.type === "logic.all") && b.children.length === 0)
    out.push({ code: "emptyLogic", severity: "warning" });
  if (b.type === "logic.ifThen" && (!b.condition || !b.then))
    out.push({ code: "ifThenIncomplete", severity: "warning" });
  return out;
};

// ---------------------------------------------------------------------------
// レジストリ本体
// ---------------------------------------------------------------------------

const defs: BlockDefinition[] = [
  define({
    type: "room.only",
    icon: DoorClosed,
    create: () => ({ type: "room.only", rooms: [], people: UNSET_PEOPLE }),
    slots: [rooms(), people()],
  }),
  define({
    type: "room.prefer",
    icon: DoorOpen,
    create: () => ({ type: "room.prefer", rooms: [], people: UNSET_PEOPLE }),
    slots: [rooms(), people()],
  }),
  define({
    type: "room.count",
    icon: Hash,
    create: () => ({
      type: "room.count",
      rooms: [],
      people: UNSET_PEOPLE,
      op: "gte",
      value: 1,
      unit: "count",
    }),
    slots: [
      rooms(),
      people(),
      num("value", "value", 0, 999, "unit"),
      enumSlot("op", "op", ["gte", "lte", "eq"], "op"),
    ],
  }),
  define({
    type: "room.exclude",
    icon: Ban,
    create: () => ({ type: "room.exclude", rooms: [], people: UNSET_PEOPLE }),
    slots: [rooms(), people()],
  }),
  define({
    type: "room.diversity",
    icon: Blend,
    create: () => ({ type: "room.diversity", rooms: [], attr: "lab", min: 2 }),
    slots: [rooms(), enumSlot("attr", "attr", ["lab", "role"], "attr"), num("min", "min", 1, 99)],
    validate: (b, ctx) => {
      if (b.type !== "room.diversity") return [];
      const n = b.attr === "lab" ? ctx.project.labs.length : Infinity;
      return ctx.project.labs.length && b.min > n
        ? [{ code: "minOverOptions", severity: "warning", slot: "min" }]
        : [];
    },
  }),
  define({
    type: "room.attrCap",
    icon: Percent,
    create: () => ({ type: "room.attrCap", rooms: [], attr: "lab", max: 50, unit: "percent" }),
    slots: [
      rooms(),
      enumSlot("attr", "attr", ["lab", "role", "gender"], "attr"),
      num("max", "max", 0, 999, "unit"),
    ],
  }),
  define({
    type: "seat.only",
    icon: Armchair,
    create: () => ({ type: "seat.only", seats: UNSET_SEATS, people: UNSET_PEOPLE }),
    slots: [seats(), people()],
  }),
  define({
    type: "seat.pin",
    icon: MapPin,
    create: () => ({ type: "seat.pin", seatId: null, memberId: null }),
    slots: [{ name: "seat", kind: "seat", path: "seatId" }, member()],
  }),
  define({
    type: "seat.empty",
    icon: CircleSlash,
    create: () => ({ type: "seat.empty", seats: UNSET_SEATS }),
    slots: [seats()],
  }),
  define({
    type: "person.pin",
    icon: Pin,
    create: () => ({ type: "person.pin", memberId: null, target: null }),
    slots: [member(), { name: "target", kind: "target", path: "target" }],
  }),
  define({
    type: "person.avoid",
    icon: UserX,
    create: () => ({ type: "person.avoid", memberId: null, seats: UNSET_SEATS }),
    slots: [member(), seats()],
  }),
  define({
    type: "pair.relation",
    icon: Handshake,
    create: () => ({
      type: "pair.relation",
      a: UNSET_PEOPLE,
      b: UNSET_PEOPLE,
      relation: "differentRoom",
    }),
    slots: [
      people("a"),
      people("b"),
      enumSlot(
        "relation",
        "relation",
        ["sameRoom", "differentRoom", "adjacent", "notAdjacent"],
        "relation",
      ),
      enumSlot("qualLab", "qualifier.lab", ["same", "different"], "qualLab", true),
      enumSlot("qualRole", "qualifier.role", ["same", "different"], "qualRole", true),
    ],
  }),
  define({
    type: "prev.different",
    icon: Shuffle,
    create: () => ({ type: "prev.different", people: { op: "all" }, scope: "room" }),
    slots: [people(), enumSlot("scope", "scope", ["room", "seat"], "prevDifferentScope")],
    validate: prevValidate,
  }),
  define({
    type: "prev.same",
    icon: History,
    create: () => ({ type: "prev.same", people: { op: "all" }, scope: "seat" }),
    slots: [people(), enumSlot("scope", "scope", ["room", "seat"], "prevSameScope")],
    validate: prevValidate,
  }),
  define({
    type: "group.cluster",
    icon: Group,
    create: () => ({ type: "group.cluster", people: { op: "all" }, attr: "lab" }),
    slots: [people(), enumSlot("attr", "attr", ["lab", "role"], "attr")],
  }),
  define({
    type: "group.spread",
    icon: Split,
    create: () => ({ type: "group.spread", people: { op: "all" }, attr: "lab" }),
    slots: [people(), enumSlot("attr", "attr", ["lab", "role", "gender"], "attr")],
  }),
  define({
    type: "depth.order",
    icon: ArrowDownWideNarrow,
    create: () => ({ type: "depth.order", people: { op: "all" }, direction: "seniorBack" }),
    slots: [
      people(),
      enumSlot("direction", "direction", ["seniorBack", "seniorFront"], "direction"),
    ],
  }),
  define({
    type: "group.mixAdjacent",
    icon: Repeat,
    create: () => ({ type: "group.mixAdjacent", people: { op: "all" }, attr: "lab" }),
    slots: [people(), enumSlot("attr", "attr", ["lab", "role"], "attr")],
  }),
  define({
    type: "group.buddy",
    icon: Users,
    create: () => ({
      type: "group.buddy",
      a: UNSET_PEOPLE,
      b: UNSET_PEOPLE,
      scope: "sameRoom",
      min: 1,
    }),
    slots: [
      people("a"),
      enumSlot("scope", "scope", ["sameRoom", "adjacent"], "buddyScope"),
      people("b"),
      num("min", "min", 1, 99),
    ],
  }),
  define({
    type: "group.labBalance",
    icon: Scale,
    create: () => ({ type: "group.labBalance", people: { op: "all" } }),
    slots: [people()],
  }),
  define({
    type: "logic.any",
    icon: Layers,
    create: () => ({ type: "logic.any", children: [] }),
    slots: [],
    container: "list",
    validate: logicValidate,
  }),
  define({
    type: "logic.all",
    icon: ListChecks,
    create: () => ({ type: "logic.all", children: [] }),
    slots: [],
    container: "list",
    validate: logicValidate,
  }),
  define({
    type: "logic.ifThen",
    icon: GitBranch,
    create: () => ({ type: "logic.ifThen", condition: null, then: null }),
    slots: [],
    container: "ifThen",
    validate: logicValidate,
  }),
];

export const BLOCKS: Record<RuleType, BlockDefinition> = Object.fromEntries(
  defs.map((d) => [d.type, d]),
) as Record<RuleType, BlockDefinition>;

export const CATEGORIES: readonly RuleCategory[] = ["room", "seat", "person", "global", "logic"];

/** パレットの並び順 */
export const BLOCKS_BY_CATEGORY: Record<RuleCategory, BlockDefinition[]> = Object.fromEntries(
  CATEGORIES.map((c) => [
    c,
    RULE_TYPES.filter((t) => RULE_CATEGORY[t] === c).map((t) => BLOCKS[t]),
  ]),
) as Record<RuleCategory, BlockDefinition[]>;

/** カテゴリ色（ライト / ダーク共通で読める中間色） */
export const CATEGORY_COLORS: Record<RuleCategory, string> = {
  room: "#6366f1",
  seat: "#0ea5e9",
  person: "#10b981",
  global: "#f59e0b",
  logic: "#ec4899",
};

export const blockDef = (b: RuleBlock | RuleType) => BLOCKS[typeof b === "string" ? b : b.type];

/** 既定値のブロック（ディープコピー） */
export function createBlock(type: RuleType): RuleBlock {
  return structuredClone(BLOCKS[type].create());
}

/** 子ルールも含めて検証 */
export function validateBlock(block: RuleBlock, ctx: ValidationCtx): BlockIssue[] {
  const own = BLOCKS[block.type].validate(block, ctx);
  const kids =
    block.type === "logic.any" || block.type === "logic.all"
      ? block.children
      : block.type === "logic.ifThen"
        ? [block.condition, block.then].filter((x): x is RuleBlock => !!x)
        : [];
  return [...own, ...kids.flatMap((k) => validateBlock(k, ctx))];
}

export function validateRule(rule: Rule, ctx: ValidationCtx): BlockIssue[] {
  const out = validateBlock(rule.block, ctx);
  if (rule.strength === "hard" && !BLOCKS[rule.block.type].hardAllowed)
    out.unshift({ code: "softOnly", severity: "error" });
  return out;
}

/** 新しいルールの既定の強さ */
export function defaultStrength(type: RuleType): "hard" | "soft" {
  return BLOCKS[type].hardAllowed ? "hard" : "soft";
}
