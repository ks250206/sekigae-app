/**
 * スタック上のルール（#87）と、論理ブロックの C 型の中身（#155）。
 */
import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Braces,
  ChevronRight,
  Copy,
  LogOut,
  StickyNote,
  Trash2,
  TriangleAlert,
  Unlink,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import type { Rule, RuleBlock } from "@/domain/rules";
import type { ID } from "@/domain/schema";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/project";
import { useProject } from "@/store/selectors";
import { danglingCount, stripDangling, type Dangling } from "../analysis";
import { childDragId, dropOnStack, gapId, type DragData, type DropData } from "../dnd";
import { useRT, useSummaryCtx } from "../hooks";
import { BLOCKS, CATEGORY_COLORS, validateRule, type BlockIssue } from "../registry";
import { pathKey, setAt, type BlockPath, type ContainerKey } from "../ruleTree";
import { useRulesUi } from "../rulesUi";
import { summarizeBlock } from "../summary";
import { BlockSentence } from "./BlockSentence";
import { BlockShell } from "./BlockShell";

// ---------------------------------------------------------------------------
// ドロップ先（論理ブロック内の隙間）
// ---------------------------------------------------------------------------

function DropGap({
  ruleId,
  containerPath,
  containerKey,
  index,
  empty,
  label,
}: {
  ruleId: ID;
  containerPath: BlockPath;
  containerKey: ContainerKey;
  index: number;
  empty?: boolean;
  label?: string;
}) {
  const { active } = useDndContext();
  const data: DropData = { target: "gap", ruleId, containerPath, key: containerKey, index };
  const { setNodeRef, isOver } = useDroppable({
    id: gapId(ruleId, containerPath, containerKey, index),
    data,
  });
  const dragging = !!active;
  if (empty) {
    return (
      <div
        ref={setNodeRef}
        data-testid={`logic-drop-${containerKey}`}
        className={cn(
          "text-muted-foreground grid min-h-11 place-items-center rounded-lg border-2 border-dashed px-3 text-xs transition-colors",
          dragging && "border-(--cat)/50",
          isOver && "border-(--cat) bg-(--cat)/10 text-foreground",
        )}
      >
        {label}
      </div>
    );
  }
  return (
    <div
      ref={setNodeRef}
      data-testid={`logic-gap-${containerKey}-${index}`}
      className={cn("relative transition-all", dragging ? "h-4" : "h-2")}
    >
      {isOver && (
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-(--cat)" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 論理ブロック内の子ルール
// ---------------------------------------------------------------------------

function ChildCard({ rule, path, block }: { rule: Rule; path: BlockPath; block: RuleBlock }) {
  const { t } = useRT();
  const def = BLOCKS[block.type];
  const pending = useRulesUi((s) => s.pendingOpen);
  const clearPendingOpen = useRulesUi((s) => s.clearPendingOpen);
  const setRuleBlock = useProjectStore((s) => s.setRuleBlock);
  const drag: DragData = { source: "child", ruleId: rule.id, path };
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: childDragId(rule.id, path),
    data: drag,
  });
  const update = (b: RuleBlock) => {
    const latest = useProjectStore.getState().project.rules.find((r) => r.id === rule.id);
    if (latest) setRuleBlock(rule.id, setAt(latest.block, path, b)!);
  };
  const autoOpen =
    pending && pending.ruleId === rule.id && pending.path === pathKey(path) ? pending.slot : null;
  return (
    <div ref={setNodeRef} data-testid="rule-child" data-rule-type={block.type}>
      <BlockShell
        def={def}
        child
        dragging={isDragging}
        handleProps={{ ...listeners, ...attributes }}
        menu={
          <>
            <DropdownMenuItem
              onSelect={() =>
                dropOnStack(
                  drag,
                  useProjectStore.getState().project.rules.findIndex((r) => r.id === rule.id) + 1,
                )
              }
              data-testid="child-move-out"
            >
              <LogOut /> {t("shell.moveOut")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setRuleBlock(rule.id, setAt(rule.block, path, null)!)}
              data-testid="child-remove"
            >
              <X /> {t("shell.removeChild")}
            </DropdownMenuItem>
          </>
        }
        footer={def.container ? <LogicBody rule={rule} path={path} block={block} /> : undefined}
      >
        {def.container !== "ifThen" && (
          <BlockSentence
            block={block}
            onChange={update}
            autoOpen={autoOpen}
            onAutoOpened={clearPendingOpen}
          />
        )}
      </BlockShell>
    </div>
  );
}

/** C 型の中身。list = いずれか/すべて、ifThen = もし/なら */
function LogicBody({ rule, path, block }: { rule: Rule; path: BlockPath; block: RuleBlock }) {
  const { t } = useRT();
  const color = CATEGORY_COLORS.logic;
  const arm = (label: string | null, content: React.ReactNode, key: string) => (
    <div key={key} className="flex flex-col">
      {label && (
        <span className="px-3 pt-1 text-sm font-bold" style={{ color }}>
          {label}
        </span>
      )}
      <div
        className="mr-2 ml-3 flex flex-col rounded-r-lg border-l-[10px] py-1.5 pl-2"
        style={{ borderColor: `color-mix(in oklab, ${color} 55%, transparent)` }}
      >
        {content}
      </div>
    </div>
  );
  if (block.type === "logic.any" || block.type === "logic.all") {
    const kids = block.children;
    return (
      <div className="pb-2" data-testid="logic-body">
        {arm(
          null,
          kids.length === 0 ? (
            <DropGap
              ruleId={rule.id}
              containerPath={path}
              containerKey="children"
              index={0}
              empty
              label={t("shell.dropHere")}
            />
          ) : (
            <>
              <DropGap ruleId={rule.id} containerPath={path} containerKey="children" index={0} />
              {kids.map((c, i) => (
                <div key={`${i}-${c.type}`}>
                  <ChildCard rule={rule} path={[...path, "children", i]} block={c} />
                  <DropGap
                    ruleId={rule.id}
                    containerPath={path}
                    containerKey="children"
                    index={i + 1}
                  />
                </div>
              ))}
            </>
          ),
          "children",
        )}
        <div
          className="ml-3 h-2.5 w-24 rounded-b-lg"
          style={{ background: `color-mix(in oklab, ${color} 55%, transparent)` }}
        />
      </div>
    );
  }
  if (block.type === "logic.ifThen") {
    const part = (key: "condition" | "then") => {
      const b = block[key];
      return b ? (
        <ChildCard rule={rule} path={[...path, key]} block={b} />
      ) : (
        <DropGap
          ruleId={rule.id}
          containerPath={path}
          containerKey={key}
          index={0}
          empty
          label={t(key === "condition" ? "shell.dropCondition" : "shell.dropThen")}
        />
      );
    };
    return (
      <div className="pb-2" data-testid="logic-body">
        {arm(t("blocks.logic.ifThen.if"), part("condition"), "condition")}
        {arm(t("blocks.logic.ifThen.then"), part("then"), "then")}
        <div
          className="ml-3 h-2.5 w-24 rounded-b-lg"
          style={{ background: `color-mix(in oklab, ${color} 55%, transparent)` }}
        />
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// 警告
// ---------------------------------------------------------------------------

function IssuesFooter({
  rule,
  issues,
  dangling,
}: {
  rule: Rule;
  issues: BlockIssue[];
  dangling?: Dangling;
}) {
  const { t } = useRT();
  const project = useProject();
  const s = useProjectStore.getState;
  const unique = [...new Map(issues.map((i) => [i.code, i])).values()];
  if (!unique.length && !dangling) return null;
  return (
    <div className="flex flex-col gap-1 border-t px-3 py-1.5 text-xs" data-testid="rule-issues">
      {dangling && (
        <div className="text-destructive flex flex-wrap items-center gap-2">
          <Unlink className="size-3.5" />
          <span>{t("warnings.dangling")}</span>
          <button
            type="button"
            className="font-semibold underline-offset-2 hover:underline"
            data-testid="fix-dangling"
            onClick={() => s().setRuleBlock(rule.id, stripDangling(rule.block, project))}
          >
            {t("warnings.removeRefs")}
          </button>
          <button
            type="button"
            className="font-semibold underline-offset-2 hover:underline"
            onClick={() => s().removeRules([rule.id])}
          >
            {t("shell.delete")}
          </button>
        </div>
      )}
      {unique.map((i) => (
        <div
          key={i.code}
          className={cn(
            "flex items-center gap-1.5",
            i.severity === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400",
          )}
          data-issue={i.code}
        >
          <TriangleAlert className="size-3.5 shrink-0" />
          {t(`issues.${i.code}`)}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ルール（トップレベル）
// ---------------------------------------------------------------------------

export interface RuleCardProps {
  rule: Rule;
  violationCount?: number;
  dangling?: Dangling;
  collapsed?: boolean;
}

export function RuleCard({ rule, violationCount, dangling, collapsed }: RuleCardProps) {
  const { t } = useRT();
  const ctx = useSummaryCtx();
  const project = useProject();
  const def = BLOCKS[rule.block.type];
  const store = useProjectStore;
  const { focusRuleId, pendingOpen, focusRule, clearPendingOpen } = useRulesUi();
  const [expandedLocal, setExpandedLocal] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const drag: DragData = { source: "rule", ruleId: rule.id };
  const sortable = useSortable({
    id: rule.id,
    data: { ...drag, target: "rule" } as DragData & DropData,
  });
  const setSortableRef = sortable.setNodeRef;
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      ref.current = el;
      setSortableRef(el);
    },
    [setSortableRef],
  );

  useEffect(() => {
    if (focusRuleId !== rule.id) return;
    ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    const id = window.setTimeout(() => focusRule(null), 1400);
    return () => window.clearTimeout(id);
  }, [focusRuleId, rule.id, focusRule]);

  const flash = focusRuleId === rule.id;
  const issues = useMemo(() => validateRule(rule, { project }), [rule, project]);
  const summary = useMemo(() => summarizeBlock(ctx, rule.block), [ctx, rule.block]);
  const autoOpen =
    pendingOpen && pendingOpen.ruleId === rule.id && pendingOpen.path === ""
      ? pendingOpen.slot
      : null;
  const isCollapsed = collapsed && !expandedLocal && !autoOpen;

  const update = (patch: Partial<Rule>) => store.getState().updateRule(rule.id, patch);
  const style = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
  };

  const menu = (
    <>
      <DropdownMenuItem
        onSelect={() => {
          const id = store.getState().duplicateRule(rule.id);
          if (id) focusRule(id);
        }}
        data-testid="rule-duplicate"
      >
        <Copy /> {t("shell.duplicate")}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setNoteOpen(true)} data-testid="rule-note">
        <StickyNote /> {t(rule.note ? "shell.editNote" : "shell.note")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          void navigator.clipboard
            ?.writeText(JSON.stringify(rule, null, 2))
            .then(() => toast.success(t("json.copied")));
        }}
        data-testid="rule-copy-json"
      >
        <Braces /> {t("shell.copyJson")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => store.getState().removeRules([rule.id])}
        data-testid="rule-delete"
      >
        <Trash2 /> {t("shell.delete")}
      </DropdownMenuItem>
    </>
  );

  const badges = (
    <>
      {rule.origin && rule.origin !== "user" && (
        <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-px text-[10px] font-medium">
          {t(`shell.origin.${rule.origin}`)}
        </span>
      )}
      {dangling && danglingCount(dangling) > 0 && (
        <span
          className="bg-destructive/10 text-destructive inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold"
          data-testid="dangling-badge"
        >
          <Unlink className="size-3" /> {t("warnings.danglingBadge")}
        </span>
      )}
    </>
  );

  return (
    <div
      ref={setRefs}
      style={style}
      className={cn("relative", sortable.isDragging && "z-10")}
      data-testid="rule-card"
      data-rule-id={rule.id}
      data-rule-type={rule.block.type}
      data-strength={rule.strength}
    >
      {isCollapsed ? (
        <CollapsedRow
          rule={rule}
          summary={summary}
          handleProps={{ ...sortable.listeners, ...sortable.attributes }}
          onExpand={() => setExpandedLocal(true)}
          onEnabled={(enabled) => update({ enabled })}
          warn={issues.some((i) => i.severity === "error") || !!dangling}
          violationCount={violationCount}
          dragging={sortable.isDragging}
        />
      ) : (
        <BlockShell
          def={def}
          strength={rule.strength}
          weight={rule.weight}
          enabled={rule.enabled}
          onStrengthChange={(strength) => update({ strength })}
          onWeightChange={(weight) => update({ weight })}
          onEnabledChange={(enabled) => update({ enabled })}
          handleProps={{ ...sortable.listeners, ...sortable.attributes }}
          menu={menu}
          violationCount={violationCount}
          badges={badges}
          highlighted={flash}
          dragging={sortable.isDragging}
          footer={
            <>
              {def.container && <LogicBody rule={rule} path={[]} block={rule.block} />}
              {(noteOpen || rule.note) && (
                <NoteEditor
                  note={rule.note}
                  editing={noteOpen}
                  onEdit={() => setNoteOpen(true)}
                  onDone={(note) => {
                    setNoteOpen(false);
                    if ((note || undefined) !== rule.note) update({ note: note || undefined });
                  }}
                />
              )}
              <IssuesFooter rule={rule} issues={issues} dangling={dangling} />
            </>
          }
        >
          {def.container !== "ifThen" && (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <BlockSentence
                  block={rule.block}
                  onChange={(b) => store.getState().setRuleBlock(rule.id, b)}
                  autoOpen={autoOpen}
                  onAutoOpened={clearPendingOpen}
                />
              </div>
              {collapsed && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground mt-1.5 rounded p-0.5"
                  onClick={() => setExpandedLocal(false)}
                  aria-label={t("stack.collapsed")}
                >
                  <ChevronRight className="size-4 -rotate-90" />
                </button>
              )}
            </div>
          )}
        </BlockShell>
      )}
    </div>
  );
}

function NoteEditor({
  note,
  editing,
  onEdit,
  onDone,
}: {
  note?: string;
  editing: boolean;
  onEdit: () => void;
  onDone: (note: string) => void;
}) {
  const { t } = useRT();
  const [draft, setDraft] = useState(note ?? "");
  if (!editing)
    return (
      <button
        type="button"
        onClick={onEdit}
        className="text-muted-foreground hover:text-foreground flex w-full items-start gap-1.5 border-t px-3 py-1.5 text-left text-xs italic"
        data-testid="rule-note-text"
      >
        <StickyNote className="mt-0.5 size-3.5 shrink-0" />
        <span className="whitespace-pre-wrap">{note}</span>
      </button>
    );
  return (
    <div className="border-t px-3 py-2">
      <Textarea
        autoFocus
        value={draft}
        placeholder={t("shell.notePlaceholder")}
        className="min-h-14 text-sm"
        data-testid="rule-note-input"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onDone(draft.trim())}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone(note ?? "");
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onDone(draft.trim());
        }}
      />
    </div>
  );
}

function CollapsedRow({
  rule,
  summary,
  handleProps,
  onExpand,
  onEnabled,
  warn,
  violationCount,
  dragging,
}: {
  rule: Rule;
  summary: string;
  handleProps: Record<string, unknown>;
  onExpand: () => void;
  onEnabled: (v: boolean) => void;
  warn: boolean;
  violationCount?: number;
  dragging: boolean;
}) {
  const { t } = useRT();
  const def = BLOCKS[rule.block.type];
  const color = CATEGORY_COLORS[def.category];
  const Icon = def.icon;
  return (
    <div
      className={cn(
        "bg-card flex items-center gap-2 rounded-lg border border-l-4 px-2 py-1.5 shadow-xs",
        !rule.enabled && "opacity-55",
        dragging && "opacity-40",
      )}
      style={{ borderLeftColor: color }}
      data-testid="rule-collapsed"
    >
      <button
        type="button"
        className="text-muted-foreground/60 cursor-grab touch-none"
        aria-label={t("shell.drag")}
        {...handleProps}
      >
        <span className="sr-only">{t("shell.drag")}</span>
        <Icon className="size-4" style={{ color }} />
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-sm"
        title={summary}
        onClick={onExpand}
        data-testid="rule-summary"
      >
        {summary}
      </button>
      {warn && <TriangleAlert className="text-destructive size-3.5 shrink-0" />}
      {violationCount !== undefined && violationCount > 0 && (
        <span className="bg-destructive rounded-full px-1.5 text-[10px] font-semibold text-white">
          {violationCount}
        </span>
      )}
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-px text-[11px] font-semibold",
          rule.strength === "hard" ? "bg-foreground text-background" : "text-white",
        )}
        style={rule.strength === "soft" ? { background: color } : undefined}
      >
        {rule.strength === "hard"
          ? t("shell.hard")
          : `${t("shell.soft")} ${"●".repeat(rule.weight)}`}
      </span>
      <input
        type="checkbox"
        className="accent-primary size-3.5"
        checked={rule.enabled}
        onChange={(e) => onEnabled(e.target.checked)}
        aria-label={t("shell.enabled")}
      />
    </div>
  );
}

/** ドラッグ中のプレビュー */
export function DragPreview({ block, label }: { block: RuleBlock; label?: string }) {
  const { t } = useRT();
  const def = BLOCKS[block.type];
  const color = CATEGORY_COLORS[def.category];
  const Icon = def.icon;
  return (
    <div
      className="bg-card flex max-w-sm items-center gap-2 rounded-xl border border-l-[5px] px-3 py-2 text-sm font-medium shadow-xl"
      style={{ borderLeftColor: color, transform: "rotate(-1.5deg)" }}
    >
      <span
        className="grid size-6 place-items-center rounded-md text-white"
        style={{ background: color }}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="truncate">{label ?? t(`${def.i18nKey}.name`)}</span>
    </div>
  );
}
