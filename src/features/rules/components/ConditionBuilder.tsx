/**
 * 条件ビルダー（#153）。人集合・席集合の共通 UI。
 * 条件の追加 → 条件間の かつ/または、各条件の「でない」、1 段のグループ化（C 型ブロック）。
 */
import { Brackets, Plus, TriangleAlert, Ungroup, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolvePeople, resolveSeats } from "@/domain/expr";
import type { PersonExpr, SeatExpr } from "@/domain/rules";
import { cn } from "@/lib/utils";
import { useMembers, useRooms } from "@/store/selectors";
import {
  defaultPersonLeaf,
  defaultSeatLeaf,
  fromExpr,
  newItemId,
  PERSON_LEAF_OPS,
  SEAT_LEAF_OPS,
  sameExpr,
  toExpr,
  type CondItem,
  type CondModel,
  type Junction,
  type LeafOf,
} from "../exprModel";
import { useRT, useSummaryCtx } from "../hooks";
import { summarizePeople, summarizeSeats } from "../summary";
import { PersonLeafEditor, SeatLeafEditor } from "./LeafEditors";

type Kind = "person" | "seat";
type ExprOf<K extends Kind> = K extends "person" ? PersonExpr : SeatExpr;

interface Props<K extends Kind> {
  kind: K;
  value: ExprOf<K>;
  onChange: (e: ExprOf<K>) => void;
  color?: string;
}

/** 葉の一致数（ゼロ件の警告用） */
function useCounter(kind: Kind) {
  const members = useMembers();
  const rooms = useRooms();
  return (e: PersonExpr | SeatExpr) =>
    kind === "person"
      ? resolvePeople(e as PersonExpr, members).length
      : resolveSeats(e as SeatExpr, rooms).length;
}

export function ConditionBuilder<K extends Kind>({ kind, value, onChange, color }: Props<K>) {
  type E = ExprOf<K>;
  const { t } = useRT();
  const ctx = useSummaryCtx();
  const count = useCounter(kind);
  const [state, setState] = useState(() => ({ value, model: fromExpr<E>(value) }));
  // 外部から値が変わったら（クイック指定など）モデルを作り直す
  if (!sameExpr(state.value, value)) setState({ value, model: fromExpr<E>(value) });
  const model = state.model;

  const commit = (m: CondModel<E>) => {
    const e = toExpr(m);
    setState({ value: e, model: m });
    onChange(e);
  };

  const newLeaf = (): LeafOf<E> =>
    (kind === "person" ? defaultPersonLeaf("role") : defaultSeatLeaf("rooms")) as LeafOf<E>;

  const summary = useMemo(
    () =>
      kind === "person"
        ? summarizePeople(ctx, value as PersonExpr)
        : summarizeSeats(ctx, value as SeatExpr),
    [ctx, kind, value],
  );
  const total = count(value);

  if (!model) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm">
        <p className="text-muted-foreground">{t("slot.complex")}</p>
        <p className="font-medium">{summary}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => commit({ op: "and", items: [] })}
          data-testid="builder-reset"
        >
          {t("slot.resetCondition")}
        </Button>
      </div>
    );
  }

  const setItem = (i: number, item: CondItem<E>) =>
    commit({ ...model, items: model.items.map((x, j) => (j === i ? item : x)) });
  const removeItem = (i: number) =>
    commit({ ...model, items: model.items.filter((_, j) => j !== i) });
  const toggleRoot = () => commit({ ...model, op: model.op === "and" ? "or" : "and" });

  return (
    <div className="flex flex-col gap-2" data-testid="condition-builder">
      <div
        className="bg-muted/50 flex items-start justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs"
        aria-live="polite"
      >
        <span>
          <span className="text-muted-foreground">{t("builder.summary")}: </span>
          <span className="font-medium" data-testid="builder-summary">
            {model.items.length
              ? summary
              : t(kind === "person" ? "builder.empty" : "builder.emptySeats")}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 font-semibold tabular-nums",
            total === 0 ? "bg-warning/30" : "bg-background",
          )}
          data-testid="builder-count"
        >
          {t(kind === "person" ? "slot.matchCount" : "slot.seatCount", { n: total })}
        </span>
      </div>

      <div className="flex flex-col">
        {model.items.map((item, i) => (
          <div key={item.id} className="flex flex-col">
            {i > 0 && <JunctionToggle op={model.op} onToggle={toggleRoot} />}
            {item.kind === "leaf" ? (
              <LeafRow
                kind={kind}
                leaf={item.leaf}
                not={item.not}
                matches={count(item.leaf)}
                color={color}
                onChange={(leaf) => setItem(i, { ...item, leaf })}
                onNot={() => setItem(i, { ...item, not: !item.not })}
                onGroup={() =>
                  setItem(i, {
                    id: item.id,
                    kind: "group",
                    op: model.op === "and" ? "or" : "and",
                    leaves: [item.leaf, newLeaf()],
                  })
                }
                onRemove={() => removeItem(i)}
              />
            ) : (
              <GroupBlock
                kind={kind}
                item={item}
                color={color}
                count={count}
                onChange={(g) => setItem(i, g)}
                onUngroup={() => {
                  const items = [...model.items];
                  items.splice(
                    i,
                    1,
                    ...item.leaves.map((leaf): CondItem<E> => ({
                      id: newItemId(),
                      kind: "leaf",
                      not: false,
                      leaf,
                    })),
                  );
                  commit({ ...model, items });
                }}
                onRemove={() => removeItem(i)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          data-testid="builder-add"
          onClick={() =>
            commit({
              ...model,
              items: [
                ...model.items,
                { id: newItemId(), kind: "leaf", not: false, leaf: newLeaf() },
              ],
            })
          }
        >
          <Plus /> {t("builder.addCondition")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          data-testid="builder-add-group"
          onClick={() =>
            commit({
              ...model,
              items: [
                ...model.items,
                {
                  id: newItemId(),
                  kind: "group",
                  op: model.op === "and" ? "or" : "and",
                  leaves: [newLeaf(), newLeaf()],
                },
              ],
            })
          }
        >
          <Brackets /> {t("builder.addGroup")}
        </Button>
      </div>
    </div>
  );
}

function JunctionToggle({ op, onToggle }: { op: Junction; onToggle: () => void }) {
  const { t } = useRT();
  return (
    <div className="flex items-center gap-2 py-1 pl-3">
      <span className="bg-border h-3 w-px" />
      <button
        type="button"
        onClick={onToggle}
        data-testid="builder-junction"
        aria-label={`${t("builder.and")} / ${t("builder.or")}`}
        className={cn(
          "rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide transition-colors",
          op === "and"
            ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
            : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        )}
      >
        {t(op === "and" ? "builder.and" : "builder.or")}
      </button>
    </div>
  );
}

function AttrSelect({
  kind,
  op,
  onChange,
}: {
  kind: Kind;
  op: string;
  onChange: (op: string) => void;
}) {
  const { t } = useRT();
  const ops = kind === "person" ? PERSON_LEAF_OPS : SEAT_LEAF_OPS;
  return (
    <Select value={op} onValueChange={onChange}>
      <SelectTrigger size="sm" className="h-7 w-32 text-xs" aria-label={t("builder.attribute")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ops.map((o) => (
          <SelectItem key={o} value={o} className="text-xs">
            {t(`leaf.${o}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LeafRow<E extends PersonExpr | SeatExpr>({
  kind,
  leaf,
  not,
  matches,
  color,
  onChange,
  onNot,
  onGroup,
  onRemove,
}: {
  kind: Kind;
  leaf: LeafOf<E>;
  not?: boolean;
  matches: number;
  color?: string;
  onChange: (l: LeafOf<E>) => void;
  onNot?: () => void;
  onGroup?: () => void;
  onRemove: () => void;
}) {
  const { t } = useRT();
  return (
    <div
      className="bg-card flex flex-col gap-1.5 rounded-lg border p-2 shadow-xs"
      data-testid="builder-leaf"
      onKeyDown={(e) => {
        if (e.key === "Delete" && e.target === e.currentTarget) onRemove();
      }}
    >
      <div className="flex items-center gap-1.5">
        {onNot && (
          <button
            type="button"
            aria-pressed={!!not}
            onClick={onNot}
            data-testid="builder-not"
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[11px] font-bold transition-colors",
              not
                ? "border-rose-500 bg-rose-500 text-white"
                : "text-muted-foreground hover:bg-accent border-dashed",
            )}
          >
            {t("builder.not")}
          </button>
        )}
        <AttrSelect
          kind={kind}
          op={leaf.op}
          onChange={(op) =>
            onChange(
              (kind === "person"
                ? defaultPersonLeaf(op as (typeof PERSON_LEAF_OPS)[number])
                : defaultSeatLeaf(op as (typeof SEAT_LEAF_OPS)[number])) as LeafOf<E>,
            )
          }
        />
        <span className="flex-1" />
        {matches === 0 && (
          <span
            className="text-warning-foreground flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400"
            title={t("builder.zeroWarning")}
          >
            <TriangleAlert className="size-3.5" />0
          </span>
        )}
        {onGroup && (
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            title={t("builder.group")}
            aria-label={t("builder.group")}
            onClick={onGroup}
            data-testid="builder-group"
          >
            <Brackets />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          title={t("builder.remove")}
          aria-label={t("builder.remove")}
          onClick={onRemove}
        >
          <X />
        </Button>
      </div>
      {kind === "person" ? (
        <PersonLeafEditor
          leaf={leaf as LeafOf<PersonExpr>}
          onChange={(l) => onChange(l as LeafOf<E>)}
        />
      ) : (
        <SeatLeafEditor
          leaf={leaf as LeafOf<SeatExpr>}
          color={color}
          onChange={(l) => onChange(l as LeafOf<E>)}
        />
      )}
    </div>
  );
}

/** Scratch 風の C 型グループ（1 段のカッコ） */
function GroupBlock<E extends PersonExpr | SeatExpr>({
  kind,
  item,
  color,
  count,
  onChange,
  onUngroup,
  onRemove,
}: {
  kind: Kind;
  item: Extract<CondItem<E>, { kind: "group" }>;
  color?: string;
  count: (e: PersonExpr | SeatExpr) => number;
  onChange: (g: Extract<CondItem<E>, { kind: "group" }>) => void;
  onUngroup: () => void;
  onRemove: () => void;
}) {
  const { t } = useRT();
  const accent = color ?? "var(--ring)";
  return (
    <div
      className="flex flex-col rounded-lg border-2"
      style={{ borderColor: `color-mix(in oklab, ${accent} 45%, transparent)` }}
      data-testid="builder-group-block"
    >
      <div
        className="flex items-center gap-2 rounded-t-md px-2 py-1 text-xs font-semibold"
        style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)` }}
      >
        <Brackets className="size-3.5" />
        {t("builder.groupLabel")}
        <span className="flex-1" />
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          title={t("builder.ungroup")}
          aria-label={t("builder.ungroup")}
          onClick={onUngroup}
        >
          <Ungroup />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          title={t("builder.remove")}
          aria-label={t("builder.remove")}
          onClick={onRemove}
        >
          <X />
        </Button>
      </div>
      <div
        className="ml-3 flex flex-col border-l-[6px] py-1.5 pr-1.5 pl-2"
        style={{ borderColor: `color-mix(in oklab, ${accent} 30%, transparent)` }}
      >
        {item.leaves.map((leaf, j) => (
          <div key={j} className="flex flex-col">
            {j > 0 && (
              <JunctionToggle
                op={item.op}
                onToggle={() => onChange({ ...item, op: item.op === "and" ? "or" : "and" })}
              />
            )}
            <LeafRow<E>
              kind={kind}
              leaf={leaf}
              matches={count(leaf)}
              color={color}
              onChange={(l) =>
                onChange({ ...item, leaves: item.leaves.map((x, k) => (k === j ? l : x)) })
              }
              onRemove={() => {
                const leaves = item.leaves.filter((_, k) => k !== j);
                if (leaves.length) onChange({ ...item, leaves });
                else onRemove();
              }}
            />
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 h-6 self-start text-xs"
          onClick={() =>
            onChange({
              ...item,
              leaves: [
                ...item.leaves,
                (kind === "person"
                  ? defaultPersonLeaf("role")
                  : defaultSeatLeaf("rooms")) as LeafOf<E>,
              ],
            })
          }
        >
          <Plus /> {t("builder.addCondition")}
        </Button>
      </div>
      <div
        className="ml-3 h-2 w-16 rounded-b-md"
        style={{ background: `color-mix(in oklab, ${accent} 30%, transparent)` }}
      />
    </div>
  );
}
