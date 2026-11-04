/**
 * 左のパレット（#92）。カテゴリ別（部屋 / 席 / 人 / 全体 / 論理）+ テンプレートタブ（#156）。
 * クリックで末尾に追加、ドラッグでスタックの好きな位置・論理ブロックの中へ挿入。
 */
import { useDraggable } from "@dnd-kit/core";
import { ChevronDown, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { addRuleOfType, addTemplateRule } from "../actions";
import type { DragData } from "../dnd";
import { useRT } from "../hooks";
import {
  BLOCKS,
  BLOCKS_BY_CATEGORY,
  CATEGORIES,
  CATEGORY_COLORS,
  type BlockDefinition,
  type SlotKind,
} from "../registry";
import { fillTemplate } from "../summary";
import { RULE_TEMPLATES, type RuleTemplate } from "../templates";

const KIND_HINT: Record<SlotKind, string> = {
  rooms: "categories.room",
  people: "categories.person",
  member: "categories.person",
  seats: "categories.seat",
  seat: "categories.seat",
  target: "categories.seat",
  number: "",
  enum: "",
};

function MiniSentence({ def }: { def: BlockDefinition }) {
  const { t } = useTranslation("rules");
  const rt = t as unknown as (k: string) => string;
  const components = Object.fromEntries(
    def.slots.map((s) => [
      s.name,
      <span
        key={s.name}
        className={cn(
          "mx-0.5 inline-block rounded-full border bg-background/80 px-1.5 text-[10px] leading-4",
          s.kind === "enum" && s.optional && "hidden",
        )}
      >
        {s.kind === "number" ? "n" : s.kind === "enum" ? "▾" : rt(KIND_HINT[s.kind])}
      </span>,
    ]),
  );
  return (
    <span className="text-muted-foreground line-clamp-2 text-[11px] leading-5">
      <Trans t={t} i18nKey={`${def.i18nKey}.template` as never} components={components} />
    </span>
  );
}

function PaletteBlock({ def }: { def: BlockDefinition }) {
  const { t } = useRT();
  const color = CATEGORY_COLORS[def.category];
  const data: DragData = { source: "palette", type: def.type };
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `palette|${def.type}`,
    data,
  });
  const Icon = def.icon;
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => addRuleOfType(def.type)}
      data-testid={`palette-block-${def.type}`}
      title={t("palette.clickToAdd")}
      className={cn(
        "group/pb bg-card relative flex w-full touch-none flex-col gap-0.5 rounded-lg border border-l-4 px-2 py-1.5 text-left shadow-xs transition-all",
        "hover:-translate-y-px hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-(--cat)/40 focus-visible:outline-none",
        isDragging && "opacity-40",
      )}
      style={{ borderLeftColor: color, ["--cat" as string]: color }}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        <Icon className="size-3.5" style={{ color }} />
        {t(`${def.i18nKey}.name`)}
        {!def.hardAllowed && (
          <span className="text-muted-foreground ml-auto text-[10px] font-normal">
            {t("shell.soft")}
          </span>
        )}
      </span>
      {def.slots.length > 0 && <MiniSentence def={def} />}
      {def.container && (
        <span
          className="mt-0.5 ml-2 h-2.5 w-10 rounded-sm border-l-4 border-b-2"
          style={{ borderColor: color }}
        />
      )}
    </button>
  );
}

function TemplateItem({ tpl }: { tpl: RuleTemplate }) {
  const { t } = useRT();
  const block = useMemo(() => tpl.create(), [tpl]);
  const def = BLOCKS[block.type];
  const color = CATEGORY_COLORS[def.category];
  const data: DragData = { source: "template", templateId: tpl.id };
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `template|${tpl.id}`,
    data,
  });
  const Icon = def.icon;
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => addTemplateRule(tpl)}
      data-testid={`palette-template-${tpl.id}`}
      className={cn(
        "bg-card flex w-full touch-none items-start gap-2 rounded-lg border px-2.5 py-2 text-left shadow-xs transition-all hover:-translate-y-px hover:shadow-md",
        isDragging && "opacity-40",
      )}
    >
      <span
        className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md text-white"
        style={{ background: color }}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-semibold">{t(`${tpl.i18nKey}.name`)}</span>
        <span className="text-muted-foreground text-[11px] leading-4">
          {t(`${tpl.i18nKey}.description`)}
        </span>
        <span
          className="w-fit rounded-full px-1.5 text-[10px] font-semibold"
          style={{ background: `color-mix(in oklab, ${color} 15%, transparent)` }}
        >
          {t(tpl.strength === "hard" ? "shell.hard" : "shell.soft")}
        </span>
      </span>
    </button>
  );
}

export function Palette({ className }: { className?: string }) {
  const { t } = useRT();
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();
  const match = (def: BlockDefinition) =>
    !q ||
    t(`${def.i18nKey}.name`).toLowerCase().includes(q) ||
    fillTemplate(t(`${def.i18nKey}.template`), {})
      .toLowerCase()
      .includes(q) ||
    def.type.includes(q);
  const tplMatch = (tpl: RuleTemplate) =>
    !q ||
    t(`${tpl.i18nKey}.name`).toLowerCase().includes(q) ||
    t(`${tpl.i18nKey}.description`).toLowerCase().includes(q);
  const templates = RULE_TEMPLATES.filter(tplMatch);
  const anyBlock = CATEGORIES.some((c) => BLOCKS_BY_CATEGORY[c].some(match));

  return (
    <aside
      className={cn("bg-sidebar flex min-h-0 flex-col border-r", className)}
      data-testid="rule-palette"
      data-tour="rules-palette"
    >
      <div className="p-3 pb-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("palette.search")}
            className="h-8 pl-8 text-sm"
            data-testid="palette-search"
          />
        </div>
      </div>
      <Tabs defaultValue="blocks" className="min-h-0 flex-1 gap-0">
        <TabsList className="mx-3 w-[calc(100%-1.5rem)]">
          <TabsTrigger value="blocks" data-testid="palette-tab-blocks">
            {t("palette.blocks")}
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="palette-tab-templates">
            <Sparkles /> {t("palette.templates")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="blocks" className="min-h-0">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-3 p-3">
              {!anyBlock && (
                <p className="text-muted-foreground text-center text-sm">
                  {t("palette.noResults")}
                </p>
              )}
              {CATEGORIES.map((c) => {
                const defs = BLOCKS_BY_CATEGORY[c].filter(match);
                if (!defs.length) return null;
                const isClosed = closed.has(c) && !q;
                return (
                  <section
                    key={c}
                    className="flex flex-col gap-1.5"
                    data-testid={`palette-cat-${c}`}
                  >
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-xs font-bold tracking-wider uppercase"
                      aria-expanded={!isClosed}
                      onClick={() =>
                        setClosed((s) => {
                          const n = new Set(s);
                          if (n.has(c)) n.delete(c);
                          else n.add(c);
                          return n;
                        })
                      }
                    >
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: CATEGORY_COLORS[c] }}
                      />
                      {t(`categories.${c}`)}
                      <span className="font-normal tabular-nums">{defs.length}</span>
                      <ChevronDown
                        className={cn(
                          "ml-auto size-3.5 transition-transform",
                          isClosed && "-rotate-90",
                        )}
                      />
                    </button>
                    {!isClosed && defs.map((d) => <PaletteBlock key={d.type} def={d} />)}
                  </section>
                );
              })}
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="templates" className="min-h-0">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-2 p-3">
              {templates.map((tpl) => (
                <TemplateItem key={tpl.id} tpl={tpl} />
              ))}
              {!templates.length && (
                <p className="text-muted-foreground text-center text-sm">
                  {t("palette.noResults")}
                </p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
      <p className="text-muted-foreground border-t px-3 py-2 text-[11px]">
        {t("palette.clickToAdd")}
      </p>
    </aside>
  );
}
