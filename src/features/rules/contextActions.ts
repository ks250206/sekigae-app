/**
 * 部屋図・席配置・名簿の右クリックメニューからルールを作る API。issue #97
 * 画面側は `ruleActionsForSeat(seatId)` などで得たメニュー項目を描画し、選ばれたら `run()` を呼ぶ。
 * （shadcn の ContextMenu 用の描画コンポーネント: ./RuleContextMenuItems）
 */
import type { LucideIcon } from "lucide-react";
import { Armchair, CircleSlash, DoorClosed, DoorOpen, MapPin, Pin, Split } from "lucide-react";
import { toast } from "sonner";
import i18n from "@/i18n";
import { compareRole } from "@/domain/roles";
import type { Rule, RuleBlock, Strength } from "@/domain/rules";
import type { ID, Project } from "@/domain/schema";
import { getProject, useProjectStore } from "@/store/project";
import { addBlockRule } from "./actions";
import { QUICK_PICKS } from "./quickPicks";
import { makeSummaryCtx, summarizeBlock, summarizePeople } from "./summary";
import { useRulesUi } from "./rulesUi";

export interface RuleActionItem {
  /** 安定した ID（テスト・key 用） */
  id: string;
  /** i18n キー（rules 名前空間）と補間値 */
  labelKey: string;
  labelValues?: Record<string, string>;
  /** 現在の言語で翻訳済みのラベル */
  label: string;
  icon?: LucideIcon;
  /** 同等のルールが既にある */
  exists?: boolean;
  /** 実行してルールを作る（既存なら作らずその ID）。サブメニューのみの項目では undefined */
  run?: () => ID | null;
  children?: RuleActionItem[];
}

export interface RuleActionOptions {
  /** 「開く」で呼ばれる（既定: ルール画面へ遷移してハイライト） */
  onOpen?: (ruleId: ID) => void;
  /** トーストを出さない */
  silent?: boolean;
}

const tr = (key: string, values?: Record<string, string>) =>
  (i18n.t as unknown as (k: string, o?: Record<string, unknown>) => string)(key, {
    ns: "rules",
    ...values,
  });

const sameBlock = (a: RuleBlock, b: RuleBlock) => JSON.stringify(a) === JSON.stringify(b);

/** ブロックが同等か（ペアは順不同） */
export function isEquivalentBlock(a: RuleBlock, b: RuleBlock): boolean {
  if (sameBlock(a, b)) return true;
  if (a.type === "pair.relation" && b.type === "pair.relation") {
    return sameBlock({ ...a, a: a.b, b: a.a }, b);
  }
  if (a.type === "person.pin" && b.type === "seat.pin") return isEquivalentBlock(b, a);
  if (a.type === "seat.pin" && b.type === "person.pin") {
    return a.memberId === b.memberId && b.target?.kind === "seat" && b.target.seatId === a.seatId;
  }
  return false;
}

export function findEquivalentRule(rules: readonly Rule[], block: RuleBlock): Rule | undefined {
  return rules.find((r) => isEquivalentBlock(r.block, block));
}

/** ルール画面を開いて該当ルールをハイライト */
export function openRuleInEditor(ruleId: ID) {
  useRulesUi.getState().focusRule(ruleId);
  void import("@/app/router").then(({ router }) => router.navigate({ to: "/rules" }));
}

/**
 * ルールを作成（origin: contextMenu）し、トースト「ルールを追加しました [開く] [元に戻す]」を出す。
 * 同等のルールがあれば作らずに既存の ID を返す。
 */
export function createContextRule(
  block: RuleBlock,
  strength: Strength = "hard",
  opts: RuleActionOptions = {},
): ID {
  const project = getProject();
  const existing = findEquivalentRule(project.rules, block);
  const onOpen = opts.onOpen ?? openRuleInEditor;
  if (existing) {
    if (!opts.silent)
      toast.info(tr("context.exists"), {
        action: { label: tr("context.open"), onClick: () => onOpen(existing.id) },
      });
    return existing.id;
  }
  const id = addBlockRule(block, { origin: "contextMenu", strength, openSlot: null });
  if (!opts.silent) {
    const summary = summarizeBlock(makeSummaryCtx(getProject()), block);
    toast.success(tr("context.added"), {
      description: summary,
      action: { label: tr("context.open"), onClick: () => onOpen(id) },
      cancel: {
        label: tr("context.undo"),
        onClick: () => useProjectStore.getState().removeRules([id]),
      },
    });
  }
  return id;
}

// ---------------------------------------------------------------------------
// メニュー項目
// ---------------------------------------------------------------------------

const QUICK_PEOPLE = QUICK_PICKS.filter((q) => q.key !== "all");

function item(
  project: Project,
  id: string,
  labelKey: string,
  labelValues: Record<string, string> | undefined,
  block: RuleBlock,
  strength: Strength,
  opts: RuleActionOptions,
  icon?: LucideIcon,
): RuleActionItem {
  return {
    id,
    labelKey,
    labelValues,
    label: tr(labelKey, labelValues),
    icon,
    exists: !!findEquivalentRule(project.rules, block),
    run: () => createContextRule(block, strength, opts),
  };
}

function submenu(
  id: string,
  labelKey: string,
  children: RuleActionItem[],
  icon?: LucideIcon,
): RuleActionItem {
  return { id, labelKey, label: tr(labelKey), icon, children };
}

const sortedMembers = (p: Project) =>
  [...p.members].sort((a, b) => compareRole(a.role, b.role) || a.name.localeCompare(b.name));

/** 席の右クリック: 人を固定 / 役職を限定 / 空席に */
export function ruleActionsForSeat(seatId: ID, opts: RuleActionOptions = {}): RuleActionItem[] {
  const p = getProject();
  const ctx = makeSummaryCtx(p);
  const seats = { op: "seats" as const, seatIds: [seatId] };
  return [
    submenu(
      "seat.pinMember",
      "context.seatPinMemberMenu",
      sortedMembers(p).map((m) =>
        item(
          p,
          `seat.pinMember:${m.id}`,
          "context.seatPinMember",
          { name: m.name },
          { type: "seat.pin", seatId, memberId: m.id },
          "hard",
          opts,
        ),
      ),
      MapPin,
    ),
    submenu(
      "seat.onlyRole",
      "context.seatOnlyRoleMenu",
      QUICK_PEOPLE.map((q) =>
        item(
          p,
          `seat.onlyRole:${q.key}`,
          "context.seatOnlyRole",
          { role: summarizePeople(ctx, q.expr) },
          { type: "seat.only", seats, people: q.expr },
          "hard",
          opts,
        ),
      ),
      Armchair,
    ),
    item(
      p,
      "seat.empty",
      "context.seatEmpty",
      undefined,
      { type: "seat.empty", seats },
      "hard",
      opts,
      CircleSlash,
    ),
  ];
}

/** 部屋の右クリック: この部屋は [人集合] のみ / 多めに */
export function ruleActionsForRoom(roomId: ID, opts: RuleActionOptions = {}): RuleActionItem[] {
  const p = getProject();
  const ctx = makeSummaryCtx(p);
  const build = (kind: "only" | "prefer") =>
    QUICK_PEOPLE.map((q) =>
      item(
        p,
        `room.${kind}:${q.key}`,
        kind === "only" ? "context.roomOnly" : "context.roomPrefer",
        { who: summarizePeople(ctx, q.expr) },
        kind === "only"
          ? { type: "room.only", rooms: [roomId], people: q.expr }
          : { type: "room.prefer", rooms: [roomId], people: q.expr },
        kind === "only" ? "hard" : "soft",
        opts,
      ),
    );
  return [
    submenu("room.only", "context.roomOnlyMenu", build("only"), DoorClosed),
    submenu("room.prefer", "context.roomPreferMenu", build("prefer"), DoorOpen),
  ];
}

/**
 * メンバーの右クリック（チップ・名簿行）: この席に固定 / 部屋に固定 / ○○さんと別の部屋に。
 * at.seatId を渡すと「この席に固定」、at.roomId を渡すと部屋の候補の先頭に出す。
 */
export function ruleActionsForMember(
  memberId: ID,
  at: { seatId?: ID; roomId?: ID } = {},
  opts: RuleActionOptions = {},
): RuleActionItem[] {
  const p = getProject();
  const m = p.members.find((x) => x.id === memberId);
  if (!m) return [];
  const out: RuleActionItem[] = [];
  if (at.seatId) {
    out.push(
      item(
        p,
        "member.pinSeat",
        "context.memberPinSeat",
        { name: m.name },
        { type: "person.pin", memberId, target: { kind: "seat", seatId: at.seatId } },
        "hard",
        opts,
        Pin,
      ),
    );
  }
  const rooms = [...p.layout.rooms].sort(
    (a, b) => Number(b.id === at.roomId) - Number(a.id === at.roomId),
  );
  out.push(
    submenu(
      "member.pinRoom",
      "context.memberPinRoomMenu",
      rooms.map((r) =>
        item(
          p,
          `member.pinRoom:${r.id}`,
          "context.memberPinRoom",
          { name: m.name, room: r.name },
          { type: "person.pin", memberId, target: { kind: "room", roomId: r.id } },
          "hard",
          opts,
        ),
      ),
      DoorClosed,
    ),
    submenu(
      "member.separate",
      "context.memberSeparateMenu",
      sortedMembers(p)
        .filter((o) => o.id !== memberId)
        .map((o) =>
          item(
            p,
            `member.separate:${o.id}`,
            "context.memberSeparate",
            { name: m.name, other: o.name },
            {
              type: "pair.relation",
              a: { op: "members", ids: [memberId] },
              b: { op: "members", ids: [o.id] },
              relation: "differentRoom",
            },
            "hard",
            opts,
          ),
        ),
      Split,
    ),
  );
  return out;
}
