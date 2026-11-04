/**
 * ルール・条件式の自然文サマリー（ツールチップ・1 行表示・出力で再利用）。issue #99
 * 語順は i18n テンプレート（rules:blocks.<type>.template）に従い、スロットを文字列で埋める。
 */
import i18n from "@/i18n";
import {
  ROLE_KEYS,
  ROLE_GROUPS,
  ROLE_QUICK_PICKS,
  rolesInGroup,
  type RoleKey,
} from "@/domain/roles";
import type { PersonExpr, Rule, RuleBlock, SeatExpr } from "@/domain/rules";
import type { ID, Project } from "@/domain/schema";
import { BLOCKS, getPath, slotValue, type SlotDef } from "./registry";

export type LooseT = (key: string, opts?: Record<string, unknown>) => string;

export interface SummaryCtx {
  project: Project;
  /** rules 名前空間 */
  t: LooseT;
  /** common 名前空間 */
  tc: LooseT;
}

export function makeSummaryCtx(project: Project, lng?: string): SummaryCtx {
  const lang = lng ?? i18n.resolvedLanguage ?? i18n.language ?? "ja";
  return {
    project,
    t: i18n.getFixedT(lang, "rules") as unknown as LooseT,
    tc: i18n.getFixedT(lang, "common") as unknown as LooseT,
  };
}

// ---------------------------------------------------------------------------
// 部品
// ---------------------------------------------------------------------------

const sameSet = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** 最大 max 個まで並べ、残りは「ほか n」 */
function listNames(ctx: SummaryCtx, names: string[], moreKey = "expr.more", max = 3): string {
  const sep = ctx.t("expr.listSep");
  if (names.length <= max) return names.join(sep);
  return `${names.slice(0, max).join(sep)} ${ctx.t(moreKey, { n: names.length - max })}`;
}

function roleLabel(ctx: SummaryCtx, roles: readonly RoleKey[]): string[] {
  if (sameSet(roles, ROLE_QUICK_PICKS.students)) return [ctx.tc("roleGroups.students")];
  // グループ単位にまとめられるものはまとめる
  const rest = new Set(roles);
  const labels: string[] = [];
  for (const g of ROLE_GROUPS) {
    const inG = rolesInGroup(g);
    if (inG.length > 1 && inG.every((r) => rest.has(r))) {
      labels.push(ctx.tc(`roleGroups.${g}`));
      inG.forEach((r) => rest.delete(r));
    }
  }
  for (const r of ROLE_KEYS) if (rest.has(r)) labels.push(ctx.tc(`roles.${r}`));
  return labels;
}

export function roomName(ctx: SummaryCtx, id: ID): string {
  return ctx.project.layout.rooms.find((r) => r.id === id)?.name ?? ctx.t("expr.deleted");
}

export function memberName(ctx: SummaryCtx, id: ID | null | undefined): string {
  if (!id) return ctx.t("expr.nobody");
  return ctx.project.members.find((m) => m.id === id)?.name ?? ctx.t("expr.deleted");
}

export function seatLabel(ctx: SummaryCtx, id: ID | null | undefined, withRoom = true): string {
  if (!id) return ctx.t("expr.noSeats");
  for (const r of ctx.project.layout.rooms) {
    const s = r.seats.find((x) => x.id === id);
    if (s) return withRoom ? `${r.name} ${s.label}` : s.label;
  }
  return ctx.t("expr.deleted");
}

export function summarizeRooms(ctx: SummaryCtx, ids: readonly ID[]): string {
  if (!ids.length) return ctx.t("expr.allRooms");
  return listNames(
    ctx,
    ids.map((id) => roomName(ctx, id)),
    "expr.more",
    4,
  );
}

// ---------------------------------------------------------------------------
// 条件式
// ---------------------------------------------------------------------------

/** compound = 複数要素を含む。joiner = 要素間の結合（同じ結合の親ではカッコ不要） */
type Piece = { text: string; compound: boolean; joiner?: "and" | "or" };

function personLeaf(ctx: SummaryCtx, e: PersonExpr): Piece {
  const orSep = ctx.t("expr.or");
  const join = (xs: string[]): Piece => ({
    text: xs.join(orSep),
    compound: xs.length > 1,
    joiner: "or",
  });
  switch (e.op) {
    case "all":
      return { text: ctx.t("expr.allPeople"), compound: false };
    case "members":
      if (!e.ids.length) return { text: ctx.t("expr.nobody"), compound: false };
      return {
        text: listNames(
          ctx,
          e.ids.map((id) => memberName(ctx, id)),
        ),
        compound: e.ids.length > 1,
      };
    case "role":
      return join(roleLabel(ctx, e.in));
    case "roleGroup": {
      const gs = new Set(e.in);
      const labels: string[] = [];
      if (gs.has("doctor") && gs.has("workingDoctor") && gs.size === 2)
        return { text: ctx.t("quickPicks.anyDoctor"), compound: true, joiner: "or" };
      for (const g of ROLE_GROUPS) if (gs.has(g)) labels.push(ctx.tc(`roleGroups.${g}`));
      return join(labels);
    }
    case "lab":
      return join(
        e.in.map((id) => {
          const lab = ctx.project.labs.find((l) => l.id === id);
          return lab ? lab.name : ctx.t("expr.deleted");
        }),
      );
    case "gender":
      return join(e.in.map((g) => ctx.tc(`genders.${g}`)));
    case "tag":
      return { text: ctx.t("expr.tag", { tags: e.in.join(", ") }), compound: false };
    default:
      return { text: "", compound: false };
  }
}

function seatLeaf(ctx: SummaryCtx, e: SeatExpr): Piece {
  switch (e.op) {
    case "all":
      return { text: ctx.t("expr.allSeats"), compound: false };
    case "rooms":
      if (!e.roomIds.length) return { text: ctx.t("expr.noSeats"), compound: false };
      return {
        text: e.roomIds.map((id) => roomName(ctx, id)).join(ctx.t("expr.or")),
        compound: e.roomIds.length > 1,
      };
    case "seats":
      if (!e.seatIds.length) return { text: ctx.t("expr.noSeats"), compound: false };
      return {
        text: listNames(
          ctx,
          e.seatIds.map((id) => seatLabel(ctx, id)),
          "expr.moreSeats",
        ),
        compound: e.seatIds.length > 1,
      };
    case "seatTag":
      return { text: ctx.t("expr.seatTag", { tags: e.in.join(", ") }), compound: false };
    case "depth": {
      const n =
        e.count !== undefined
          ? ctx.t("expr.depthCount", { n: e.count })
          : ctx.t("expr.depthRatio", { n: Math.round((e.ratio ?? 0) * 100) });
      return {
        text: ctx.t(e.from === "back" ? "expr.depthBack" : "expr.depthFront", {
          n,
          rooms: summarizeRooms(ctx, e.roomIds),
        }),
        compound: false,
      };
    }
    default:
      return { text: "", compound: false };
  }
}

function summarizeExpr<E extends PersonExpr | SeatExpr>(
  ctx: SummaryCtx,
  e: E,
  leaf: (ctx: SummaryCtx, e: E) => Piece,
): Piece {
  const wrap = (p: Piece, parent?: "and" | "or") =>
    p.compound && p.joiner !== parent ? `(${p.text})` : p.text;
  switch (e.op) {
    case "and":
    case "or": {
      const args = e.args as E[];
      if (args.length === 1) return summarizeExpr(ctx, args[0]!, leaf);
      const parts = args.map((a) => summarizeExpr(ctx, a, leaf));
      return {
        text: parts
          .map((p) => wrap(p, e.op as "and" | "or"))
          .join(ctx.t(e.op === "and" ? "expr.and" : "expr.or")),
        compound: parts.length > 1,
        joiner: e.op,
      };
    }
    case "not":
      return {
        text: ctx.t("expr.not", { x: wrap(summarizeExpr(ctx, e.arg as E, leaf)) }),
        compound: false,
      };
    default:
      return leaf(ctx, e);
  }
}

/** 「(D または M2) かつ 山田研」のような自然文 */
export function summarizePeople(ctx: SummaryCtx, e: PersonExpr): string {
  return summarizeExpr(ctx, e, personLeaf).text;
}

export function summarizeSeats(ctx: SummaryCtx, e: SeatExpr): string {
  return summarizeExpr(ctx, e, seatLeaf).text;
}

// ---------------------------------------------------------------------------
// スロット・ブロック・ルール
// ---------------------------------------------------------------------------

export function formatNumber(ctx: SummaryCtx, n: number, unit?: unknown): string {
  if (unit === "percent") return ctx.t("units.percent", { n });
  if (unit === "count") return ctx.t(n === 1 ? "units.countOne" : "units.count", { n });
  return String(n);
}

export function summarizeSlot(ctx: SummaryCtx, block: RuleBlock, slot: SlotDef): string {
  const v = slotValue(block, slot);
  switch (slot.kind) {
    case "rooms":
      return summarizeRooms(ctx, v as ID[]);
    case "people":
      return summarizePeople(ctx, v as PersonExpr);
    case "seats":
      return summarizeSeats(ctx, v as SeatExpr);
    case "member":
      return memberName(ctx, v as ID | null);
    case "seat":
      return seatLabel(ctx, v as ID | null);
    case "target": {
      const tg = v as { kind: "seat"; seatId: ID } | { kind: "room"; roomId: ID } | null;
      if (!tg) return ctx.t("expr.noSeats");
      return tg.kind === "seat" ? seatLabel(ctx, tg.seatId) : roomName(ctx, tg.roomId);
    }
    case "number":
      return formatNumber(
        ctx,
        v as number,
        slot.unitPath ? getPath(block, slot.unitPath) : undefined,
      );
    case "enum":
      return v === undefined ? "" : ctx.t(`values.${slot.valueSet}.${v as string}`);
  }
}

/** テンプレートのタグ名一覧（<name/> または <name></name>） */
export function templateSlots(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(/<([a-zA-Z][\w]*)\s*\/?>/g)) {
    if (!out.includes(m[1]!)) out.push(m[1]!);
  }
  return out;
}

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template
    .replace(
      /<([a-zA-Z][\w]*)\s*\/>|<([a-zA-Z][\w]*)>(.*?)<\/\2>/g,
      (_m, a, b) => values[a ?? b] ?? "",
    )
    .replace(/\s+/g, " ")
    .replace(/\s+([,.:;、。])/g, "$1")
    .trim();
}

export function summarizeBlock(ctx: SummaryCtx, block: RuleBlock): string {
  const def = BLOCKS[block.type];
  if (block.type === "logic.any" || block.type === "logic.all") {
    const items = block.children.length
      ? block.children.map((c) => `(${summarizeBlock(ctx, c)})`).join(ctx.t("expr.childSep"))
      : ctx.t("expr.emptyChildren");
    return ctx.t("expr.listOf", { label: ctx.t(`${def.i18nKey}.template`), items });
  }
  if (block.type === "logic.ifThen") {
    const s = (b: RuleBlock | null) => (b ? summarizeBlock(ctx, b) : ctx.t("expr.emptyChildren"));
    return ctx.t("expr.ifThen", { if: s(block.condition), then: s(block.then) });
  }
  const template = ctx.t(`${def.i18nKey}.template`);
  const values = Object.fromEntries(def.slots.map((s) => [s.name, summarizeSlot(ctx, block, s)]));
  return fillTemplate(template, values);
}

export interface SummarizeOptions {
  lng?: string;
  /** 先頭に［必須］／［できれば ●●●］を付ける */
  withStrength?: boolean;
}

/** ルールの自然文サマリー（ツールチップ・出力用）。React 外からも使える */
export function summarizeRule(rule: Rule, project: Project, opts: SummarizeOptions = {}): string {
  const ctx = makeSummaryCtx(project, opts.lng);
  const body = summarizeBlock(ctx, rule.block);
  if (!opts.withStrength) return body;
  const s =
    rule.strength === "hard"
      ? ctx.t("shell.hard")
      : `${ctx.t("shell.soft")} ${"●".repeat(rule.weight)}${"○".repeat(5 - rule.weight)}`;
  return `[${s}] ${body}`;
}
