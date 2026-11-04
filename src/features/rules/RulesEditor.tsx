/**
 * ルールエディタ本体: パレット + スタック（DnD）+ 絞り込み + 警告 + 実行可能性。docs/DESIGN.md §4 / §7.4
 */
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Download, Eye, EyeOff, ListCollapse, ListTree, Puzzle, Upload } from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RuleBlock } from "@/domain/rules";
import type { ID } from "@/domain/schema";
import { cn } from "@/lib/utils";
import { batch, useProjectStore } from "@/store/project";
import { useProject, useRules } from "@/store/selectors";
import { Palette } from "./components/Palette";
import { DragPreview, RuleCard } from "./components/RuleCard";
import { RuleFilters } from "./components/RuleFilters";
import { WarningsBanner } from "./components/WarningsBanner";
import {
  FeasibilityIndicator,
  type FeasibilityIndicatorProps,
} from "./components/FeasibilityIndicator";
import { draggedBlock, dropInGap, dropOnStack, type DragData, type DropData } from "./dnd";
import { exportRulesJson, filterRules, parseRulesJson } from "./filtering";
import { useRT, useRulesAnalysis, useSummaryCtx } from "./hooks";
import { useRulesUi } from "./rulesUi";
import { summarizeBlock } from "./summary";

const STACK_ID = "rule-stack";

/**
 * 当たり判定: 論理ブロックの隙間（gap）を最優先。
 * 新規（パレット）・子ルールはポインタ直下のルール → スタック内なら最寄りのルール。
 * 既存ルールの並べ替えは dnd-kit 標準の closestCenter。
 */
const collision: CollisionDetection = (args) => {
  const ruleContainers = args.droppableContainers.filter(
    (c) => (c.data.current as DropData | undefined)?.target === "rule",
  );
  const sorting = (args.active.data.current as DragData | undefined)?.source === "rule";
  const within = args.pointerCoordinates ? pointerWithin(args) : [];
  const gaps = within.filter((c) => String(c.id).startsWith("gap|"));
  if (gaps.length) return gaps;
  if (args.pointerCoordinates && !sorting) {
    const rules = within.filter((c) => !String(c.id).startsWith("gap|") && c.id !== STACK_ID);
    if (rules.length) return rules;
    if (!within.some((c) => c.id === STACK_ID)) return [];
  }
  const cc = closestCenter({ ...args, droppableContainers: ruleContainers });
  return cc.length ? cc : within.filter((c) => c.id === STACK_ID);
};

export interface RulesEditorProps {
  /** ルール ID → 違反数（席配置・エンジン側から渡す） */
  violationCounts?: Record<ID, number>;
  /** 実行可能性インジケータ（エンジン側の useFeasibility の結果） */
  feasibility?: FeasibilityIndicatorProps;
}

function StackDropArea({ children, empty }: { children: React.ReactNode; empty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: STACK_ID, data: { target: "stackEnd" } });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[50vh] flex-col gap-3 rounded-2xl pb-24 transition-colors",
        empty && isOver && "bg-primary/5",
      )}
      data-testid="rule-stack"
      data-tour="rules-stack"
    >
      {children}
    </div>
  );
}

function InsertIndicator() {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scaleX: 0.6 }}
      animate={{ opacity: 1, scaleX: 1 }}
      className="bg-primary relative -my-1.5 h-1 rounded-full shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_25%,transparent)]"
      data-testid="insert-indicator"
    >
      <span className="bg-primary absolute -top-1 -left-1 size-3 rounded-full" />
    </motion.div>
  );
}

export function RulesEditor({ violationCounts, feasibility }: RulesEditorProps) {
  const { t } = useRT();
  const ctx = useSummaryCtx();
  const project = useProject();
  const rules = useRules();
  const analysis = useRulesAnalysis();
  const view = useRulesUi((s) => s.view);
  const setView = useRulesUi((s) => s.setView);
  const filters = useRulesUi((s) => s.filters);
  const visible = useMemo(
    () => filterRules(rules, filters, project, violationCounts),
    [rules, filters, project, violationCounts],
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const [active, setActive] = useState<{ data: DragData; block: RuleBlock | null } | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DragData | undefined;
    if (!data) return;
    setActive({ data, block: draggedBlock(data) });
  };

  const onDragMove = (e: DragMoveEvent) => {
    const data = e.active.data.current as DragData | undefined;
    if (!data || data.source === "rule") return setInsertIndex(null);
    const od = e.over?.data.current as DropData | undefined;
    if (!e.over || !od || od.target === "gap") return setInsertIndex(null);
    if (od.target === "stackEnd") return setInsertIndex(rules.length);
    let idx = rules.findIndex((r) => r.id === od.ruleId);
    const r = e.active.rect.current.translated;
    const mid = r ? r.top + r.height / 2 : 0;
    if (mid > e.over.rect.top + e.over.rect.height / 2) idx += 1;
    setInsertIndex(idx);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const data = e.active.data.current as DragData | undefined;
    const od = e.over?.data.current as DropData | undefined;
    const idx = insertIndex;
    setActive(null);
    setInsertIndex(null);
    if (!data || !od) return;
    if (od.target === "gap") {
      dropInGap(data, od);
      return;
    }
    if (data.source === "rule") {
      if (od.target === "rule" && e.over!.id !== e.active.id) {
        const to = rules.findIndex((r) => r.id === od.ruleId);
        if (to >= 0) useProjectStore.getState().moveRule(data.ruleId, to);
      }
      return;
    }
    if (idx !== null) dropOnStack(data, idx);
  };

  const setAllEnabled = (enabled: boolean) =>
    useProjectStore.getState().setRulesEnabled(
      visible.map((r) => r.id),
      enabled,
    );

  const exportJson = () => {
    const blob = new Blob([exportRulesJson(rules)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name || "rules"}-rules.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importJson = async (file: File) => {
    const parsed = parseRulesJson(await file.text());
    if (!parsed) return void toast.error(t("stack.importFailed"));
    batch(() => {
      for (const r of parsed) {
        const { id: _id, block, ...rest } = r;
        useProjectStore.getState().addRule(block, rest);
      }
    });
    toast.success(t("stack.imported", { n: parsed.length }));
  };

  const activeLabel =
    active?.data.source === "rule" && active.block ? summarizeBlock(ctx, active.block) : undefined;

  return (
    <MotionConfig reducedMotion="user">
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        measuring={{
          droppable: {
            // 並べ替え中は開始時の位置で判定（dnd-kit 標準）、新規ドラッグは自動スクロールに追従
            strategy:
              active?.data.source === "rule"
                ? MeasuringStrategy.WhileDragging
                : MeasuringStrategy.Always,
          },
        }}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragOver={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActive(null);
          setInsertIndex(null);
        }}
      >
        <div className="flex h-full min-h-0">
          <Palette className="hidden w-72 shrink-0 md:flex" />
          <div className="flex min-w-0 flex-1 flex-col">
            <PageHeader
              title={t("title")}
              description={t("description")}
              actions={
                <>
                  <FeasibilityIndicator {...feasibility} />
                  <ToggleGroup
                    type="single"
                    size="sm"
                    variant="outline"
                    value={view}
                    onValueChange={(v) => v && setView(v as "expanded" | "collapsed")}
                  >
                    <ToggleGroupItem
                      value="expanded"
                      aria-label={t("stack.expanded")}
                      title={t("stack.expanded")}
                      data-testid="view-expanded"
                    >
                      <ListTree />
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="collapsed"
                      aria-label={t("stack.collapsed")}
                      title={t("stack.collapsed")}
                      data-testid="view-collapsed"
                    >
                      <ListCollapse />
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAllEnabled(true)}
                    disabled={!rules.length}
                    data-testid="enable-all"
                  >
                    <Eye /> {t("stack.enableAll")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAllEnabled(false)}
                    disabled={!rules.length}
                    data-testid="disable-all"
                  >
                    <EyeOff /> {t("stack.disableAll")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={exportJson}
                    disabled={!rules.length}
                    title={t("stack.export")}
                  >
                    <Download /> <span className="hidden lg:inline">{t("stack.export")}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    title={t("stack.import")}
                  >
                    <Upload /> <span className="hidden lg:inline">{t("stack.import")}</span>
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void importJson(f);
                      e.target.value = "";
                    }}
                  />
                </>
              }
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4 md:px-6">
                <WarningsBanner analysis={analysis} />
                {rules.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <RuleFilters showViolations={!!violationCounts} />
                    <span
                      className="text-muted-foreground text-xs tabular-nums"
                      data-testid="rule-count"
                    >
                      {visible.length === rules.length
                        ? t("stack.count", { n: rules.length })
                        : t("stack.shown", { shown: visible.length, total: rules.length })}
                    </span>
                  </div>
                )}
                <SortableContext
                  items={visible.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <StackDropArea empty={!rules.length}>
                    {!rules.length && (
                      <div
                        className="text-muted-foreground flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center"
                        data-testid="rules-empty"
                      >
                        <span className="bg-muted grid size-14 place-items-center rounded-2xl">
                          <Puzzle className="size-7" />
                        </span>
                        <p className="text-foreground font-semibold">{t("stack.empty")}</p>
                        <p className="max-w-sm text-sm">{t("stack.emptyHint")}</p>
                      </div>
                    )}
                    {rules.length > 0 && !visible.length && (
                      <p className="text-muted-foreground py-10 text-center text-sm">
                        {t("stack.noFilterResults")}
                      </p>
                    )}
                    <AnimatePresence initial={false}>
                      {visible.map((rule) => {
                        const fullIdx = rules.indexOf(rule);
                        return (
                          <motion.div
                            key={rule.id}
                            initial={{ opacity: 0, y: -8, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                            transition={{ type: "spring", stiffness: 500, damping: 36 }}
                            className="flex flex-col gap-3"
                          >
                            {insertIndex === fullIdx && <InsertIndicator />}
                            <RuleCard
                              rule={rule}
                              violationCount={violationCounts?.[rule.id]}
                              dangling={analysis.dangling.get(rule.id)}
                              collapsed={view === "collapsed"}
                            />
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                    {insertIndex !== null &&
                      (insertIndex >= rules.length || !visible.includes(rules[insertIndex]!)) && (
                        <InsertIndicator />
                      )}
                  </StackDropArea>
                </SortableContext>
              </div>
            </div>
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {active?.block ? <DragPreview block={active.block} label={activeLabel} /> : null}
        </DragOverlay>
      </DndContext>
    </MotionConfig>
  );
}
