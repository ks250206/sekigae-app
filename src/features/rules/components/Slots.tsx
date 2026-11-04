/**
 * スロット（ピル + ポップオーバー）。#89 人 / #90 席 / #91 部屋・数値・演算子・列挙
 */
import { Minus, Plus, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { resolvePeople, resolveSeats } from "@/domain/expr";
import { roleRank } from "@/domain/roles";
import type { PersonExpr, RuleBlock, SeatExpr } from "@/domain/rules";
import type { ID } from "@/domain/schema";
import { roleColor } from "@/graphics/palette";
import { cn } from "@/lib/utils";
import { useMembers, useProject, useRooms } from "@/store/selectors";
import { danglingCount, findDangling } from "../analysis";
import { defaultSeatLeaf, sameExpr } from "../exprModel";
import { useRT, useSummaryCtx } from "../hooks";
import {
  getPath,
  isSlotUnset,
  isUnsetPeople,
  setPath,
  slotValue,
  UNSET_PEOPLE,
  type SlotDef,
} from "../registry";
import { QUICK_PICKS } from "../quickPicks";
import { summarizeSlot } from "../summary";
import { ConditionBuilder } from "./ConditionBuilder";
import { DepthEditor, MemberPicker, RoomPicker, SeatLeafEditor } from "./LeafEditors";
import { MiniRoomMap } from "./MiniRoomMap";
import { SlotPill } from "./SlotPill";

export interface SlotEditorProps {
  block: RuleBlock;
  slot: SlotDef;
  onChange: (b: RuleBlock) => void;
  color: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 種類に応じたスロットエディタ */
export function SlotEditor(props: SlotEditorProps) {
  switch (props.slot.kind) {
    case "people":
      return <PeopleSlot {...props} />;
    case "member":
      return <MemberSlot {...props} />;
    case "seats":
      return <SeatsSlot {...props} />;
    case "seat":
      return <SeatSlot {...props} />;
    case "target":
      return <TargetSlot {...props} />;
    case "rooms":
      return <RoomsSlot {...props} />;
    case "number":
      return <NumberSlot {...props} />;
    case "enum":
      return <EnumSlot {...props} />;
  }
}

function useSlotPill({ block, slot }: SlotEditorProps) {
  const ctx = useSummaryCtx();
  const project = useProject();
  const unset = isSlotUnset(block, slot);
  const danger = useMemo(() => {
    if (slot.kind === "number" || slot.kind === "enum") return false;
    const probe = setPath({ type: block.type } as RuleBlock, slot.path, slotValue(block, slot));
    return danglingCount(findDangling(probe, project)) > 0;
  }, [block, slot, project]);
  const { t } = useRT();
  const label = unset
    ? t(`placeholders.${slot.kind === "enum" ? slot.name : slot.kind}`)
    : summarizeSlot(ctx, block, slot);
  return { unset, danger, label };
}

function PopoverSlot({
  props,
  count,
  children,
  className,
  label,
}: {
  props: SlotEditorProps;
  count?: number;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const pill = useSlotPill(props);
  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverTrigger asChild>
        <SlotPill
          unset={pill.unset}
          danger={pill.danger}
          count={pill.unset ? undefined : count}
          color={props.color}
          data-testid={`slot-${props.slot.name}`}
          data-slot-name={props.slot.name}
          title={pill.label}
        >
          {label ?? pill.label}
        </SlotPill>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-3 p-3", className)}
        data-testid={`slot-popover-${props.slot.name}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) props.onOpenChange(false);
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

function DoneRow({ onDone, onClear }: { onDone: () => void; onClear?: () => void }) {
  const { t } = useRT();
  return (
    <div className="flex justify-end gap-2 border-t pt-2">
      {onClear && (
        <Button size="sm" variant="ghost" onClick={onClear}>
          {t("slot.clear")}
        </Button>
      )}
      <Button size="sm" onClick={onDone} data-testid="slot-done">
        {t("slot.done")}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 人集合（#89）
// ---------------------------------------------------------------------------

function PeoplePreview({ ids }: { ids: ID[] }) {
  const { t } = useRT();
  const members = useMembers();
  const list = useMemo(() => {
    const set = new Set(ids);
    return members.filter((m) => set.has(m.id)).sort((a, b) => roleRank(b.role) - roleRank(a.role));
  }, [members, ids]);
  const MAX = 14;
  if (!members.length)
    return <p className="text-muted-foreground text-xs">{t("slot.noMembers")}</p>;
  return (
    <div className="flex flex-col gap-1.5" data-testid="people-preview">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{t("slot.preview")}</span>
        <span
          className={cn(
            "rounded-full px-2 font-semibold tabular-nums",
            list.length ? "bg-muted" : "bg-warning/30",
          )}
        >
          {list.length ? t("slot.matchCount", { n: list.length }) : t("slot.zeroMatch")}
        </span>
      </div>
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {list.slice(0, MAX).map((m) => (
            <span
              key={m.id}
              className="bg-background inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px]"
            >
              <span className="size-1.5 rounded-full" style={{ background: roleColor(m.role) }} />
              {m.name}
            </span>
          ))}
          {list.length > MAX && (
            <span className="text-muted-foreground px-1 text-[11px]">
              {t("slot.previewMore", { n: list.length - MAX })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PeopleSlot(props: SlotEditorProps) {
  const { t } = useRT();
  const members = useMembers();
  const value = slotValue(props.block, props.slot) as PersonExpr;
  const ids = useMemo(() => resolvePeople(value, members), [value, members]);
  const set = (e: PersonExpr) => props.onChange(setPath(props.block, props.slot.path, e));
  const [tab, setTab] = useState(
    value.op === "members" && value.ids.length ? "individuals" : "conditions",
  );
  return (
    <PopoverSlot props={props} count={ids.length} className="w-[min(32rem,calc(100vw-2rem))]">
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">{t("quickPicks.label")}</span>
        <div className="flex flex-wrap gap-1" data-testid="quick-picks">
          {QUICK_PICKS.map((q) => {
            const on = sameExpr(q.expr, value);
            return (
              <button
                key={q.key}
                type="button"
                aria-pressed={on}
                data-testid={`quick-${q.key}`}
                onClick={() => set(q.expr)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  on ? "text-white" : "bg-background hover:bg-accent",
                )}
                style={on ? { background: props.color, borderColor: props.color } : undefined}
              >
                {t(`quickPicks.${q.key}`)}
              </button>
            );
          })}
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="conditions" data-testid="tab-conditions">
            {t("slot.conditions")}
          </TabsTrigger>
          <TabsTrigger value="individuals" data-testid="tab-individuals">
            {t("slot.individuals")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="conditions" className="max-h-[45vh] overflow-y-auto pr-1">
          <ConditionBuilder kind="person" value={value} onChange={set} color={props.color} />
        </TabsContent>
        <TabsContent value="individuals">
          <MemberPicker
            selected={value.op === "members" ? value.ids : []}
            onChange={(ids) => set({ op: "members", ids })}
          />
        </TabsContent>
      </Tabs>
      <PeoplePreview ids={ids} />
      <DoneRow
        onDone={() => props.onOpenChange(false)}
        onClear={isUnsetPeople(value) ? undefined : () => set(UNSET_PEOPLE)}
      />
    </PopoverSlot>
  );
}

function MemberSlot(props: SlotEditorProps) {
  const value = slotValue(props.block, props.slot) as ID | null;
  return (
    <PopoverSlot props={props}>
      <MemberPicker
        single
        selected={value ? [value] : []}
        onChange={(ids) => {
          props.onChange(setPath(props.block, props.slot.path, ids[0] ?? null));
          props.onOpenChange(false);
        }}
      />
    </PopoverSlot>
  );
}

// ---------------------------------------------------------------------------
// 席集合（#90）
// ---------------------------------------------------------------------------

type SeatTab = "rooms" | "pick" | "tags" | "depth" | "build";

const tabOf = (e: SeatExpr): SeatTab =>
  e.op === "rooms"
    ? "rooms"
    : e.op === "seats"
      ? "pick"
      : e.op === "seatTag"
        ? "tags"
        : e.op === "depth"
          ? "depth"
          : "build";

function SeatsSlot(props: SlotEditorProps) {
  const { t } = useRT();
  const rooms = useRooms();
  const value = slotValue(props.block, props.slot) as SeatExpr;
  const ids = useMemo(() => resolveSeats(value, rooms), [value, rooms]);
  const set = (e: SeatExpr) => props.onChange(setPath(props.block, props.slot.path, e));
  const [tab, setTab] = useState<SeatTab>(() => tabOf(value));
  const leafFor = (tb: SeatTab): SeatExpr =>
    tabOf(value) === tb
      ? value
      : tb === "rooms"
        ? defaultSeatLeaf("rooms")
        : tb === "pick"
          ? defaultSeatLeaf("seats")
          : tb === "tags"
            ? defaultSeatLeaf("seatTag")
            : defaultSeatLeaf("depth");
  const highlight = useMemo(() => new Set(ids), [ids]);
  return (
    <PopoverSlot props={props} count={ids.length} className="w-[min(36rem,calc(100vw-2rem))]">
      {!rooms.length ? (
        <p className="text-muted-foreground text-sm">{t("slot.noRooms")}</p>
      ) : (
        <>
          <Tabs value={tab} onValueChange={(v) => setTab(v as SeatTab)}>
            <TabsList className="w-full">
              {(["rooms", "pick", "tags", "depth", "build"] as const).map((tb) => (
                <TabsTrigger key={tb} value={tb} className="text-xs" data-testid={`seat-tab-${tb}`}>
                  {t(
                    {
                      rooms: "slot.tabRooms",
                      pick: "slot.tabPick",
                      tags: "slot.tabTags",
                      depth: "slot.tabDepth",
                      build: "slot.tabBuild",
                    }[tb],
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="rooms">
              <RoomPicker
                selected={value.op === "rooms" ? value.roomIds : []}
                onChange={(roomIds) => set({ op: "rooms", roomIds })}
              />
            </TabsContent>
            <TabsContent value="pick" className="flex flex-col gap-1.5">
              <div className="text-muted-foreground flex items-center justify-between text-xs">
                <span>{t("slot.pickHint")}</span>
                {value.op === "seats" && value.seatIds.length > 0 && (
                  <button
                    type="button"
                    className="hover:text-foreground underline-offset-2 hover:underline"
                    onClick={() => set({ op: "seats", seatIds: [] })}
                  >
                    {t("slot.clearSeats")}
                  </button>
                )}
              </div>
              <SeatLeafEditor
                leaf={leafFor("pick") as Extract<SeatExpr, { op: "seats" }>}
                color={props.color}
                onChange={set}
              />
              {value.op === "seats" && (
                <span className="text-muted-foreground text-xs">
                  {t("slot.selectedSeats", { n: value.seatIds.length })}
                </span>
              )}
            </TabsContent>
            <TabsContent value="tags">
              <SeatLeafEditor
                leaf={leafFor("tags") as Extract<SeatExpr, { op: "seatTag" }>}
                onChange={set}
              />
            </TabsContent>
            <TabsContent value="depth">
              <DepthEditor
                leaf={leafFor("depth") as Extract<SeatExpr, { op: "depth" }>}
                onChange={set}
              />
            </TabsContent>
            <TabsContent value="build" className="max-h-[40vh] overflow-y-auto pr-1">
              <ConditionBuilder kind="seat" value={value} onChange={set} color={props.color} />
            </TabsContent>
          </Tabs>
          {tab !== "pick" && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground flex justify-between text-xs">
                <span>{t("slot.preview")}</span>
                <span className="tabular-nums">
                  {ids.length ? t("slot.seatCount", { n: ids.length }) : t("slot.zeroSeats")}
                </span>
              </span>
              <MiniRoomMap
                rooms={rooms}
                highlight={highlight}
                heat={tab === "depth"}
                color={props.color}
                maxHeight={180}
              />
            </div>
          )}
        </>
      )}
      <DoneRow onDone={() => props.onOpenChange(false)} />
    </PopoverSlot>
  );
}

function SeatSlot(props: SlotEditorProps) {
  const { t } = useRT();
  const rooms = useRooms();
  const value = slotValue(props.block, props.slot) as ID | null;
  return (
    <PopoverSlot props={props} className="w-[min(36rem,calc(100vw-2rem))]">
      {rooms.some((r) => r.seats.length) ? (
        <MiniRoomMap
          rooms={rooms}
          mode="single"
          color={props.color}
          selected={new Set(value ? [value] : [])}
          onChange={(ids) => {
            props.onChange(setPath(props.block, props.slot.path, ids[0] ?? null));
            props.onOpenChange(false);
          }}
        />
      ) : (
        <p className="text-muted-foreground text-sm">{t("slot.noSeats")}</p>
      )}
    </PopoverSlot>
  );
}

type Target = { kind: "seat"; seatId: ID } | { kind: "room"; roomId: ID } | null;

function TargetSlot(props: SlotEditorProps) {
  const { t } = useRT();
  const rooms = useRooms();
  const value = slotValue(props.block, props.slot) as Target;
  const [tab, setTab] = useState(value?.kind ?? "seat");
  const set = (v: Target) => {
    props.onChange(setPath(props.block, props.slot.path, v));
    props.onOpenChange(false);
  };
  return (
    <PopoverSlot props={props} className="w-[min(36rem,calc(100vw-2rem))]">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "seat" | "room")}>
        <TabsList className="w-full">
          <TabsTrigger value="seat" data-testid="target-tab-seat">
            {t("slot.targetSeat")}
          </TabsTrigger>
          <TabsTrigger value="room" data-testid="target-tab-room">
            {t("slot.targetRoom")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="seat">
          {rooms.some((r) => r.seats.length) ? (
            <MiniRoomMap
              rooms={rooms}
              mode="single"
              color={props.color}
              selected={new Set(value?.kind === "seat" ? [value.seatId] : [])}
              onChange={(ids) => ids[0] && set({ kind: "seat", seatId: ids[0] })}
            />
          ) : (
            <p className="text-muted-foreground text-sm">{t("slot.noSeats")}</p>
          )}
        </TabsContent>
        <TabsContent value="room">
          <RoomPicker
            single
            selected={value?.kind === "room" ? [value.roomId] : []}
            onChange={(ids) => ids[0] && set({ kind: "room", roomId: ids[0] })}
          />
        </TabsContent>
      </Tabs>
    </PopoverSlot>
  );
}

// ---------------------------------------------------------------------------
// 部屋・数値・列挙（#91）
// ---------------------------------------------------------------------------

function RoomsSlot(props: SlotEditorProps) {
  const { t } = useRT();
  const value = slotValue(props.block, props.slot) as ID[];
  const set = (ids: ID[]) => props.onChange(setPath(props.block, props.slot.path, ids));
  return (
    <PopoverSlot props={props} className="w-72">
      <p className="text-muted-foreground text-xs">{t("slot.allRoomsHint")}</p>
      <RoomPicker selected={value} onChange={set} />
      <DoneRow
        onDone={() => props.onOpenChange(false)}
        onClear={value.length ? () => set([]) : undefined}
      />
    </PopoverSlot>
  );
}

function NumberSlot(props: SlotEditorProps) {
  const { t } = useRT();
  const { block, slot } = props;
  const value = slotValue(block, slot) as number;
  const unit = slot.unitPath ? (getPath(block, slot.unitPath) as "count" | "percent") : undefined;
  const max = unit === "percent" ? 100 : (slot.max ?? 999);
  const min = slot.min ?? 0;
  const set = (n: number) =>
    props.onChange(setPath(block, slot.path, Math.max(min, Math.min(max, Math.round(n)))));
  return (
    <PopoverSlot props={props} className="w-64">
      <div className="flex items-center gap-1.5">
        <Button
          size="icon"
          variant="outline"
          className="size-8"
          aria-label="-"
          onClick={() => set(value - (unit === "percent" ? 5 : 1))}
        >
          <Minus />
        </Button>
        <Input
          type="number"
          min={min}
          max={max}
          value={value}
          autoFocus
          className="h-8 w-20 text-center tabular-nums"
          data-testid="number-input"
          aria-label={slot.name}
          onChange={(e) => set(Number(e.target.value) || 0)}
          onKeyDown={(e) => e.key === "Enter" && props.onOpenChange(false)}
        />
        <Button
          size="icon"
          variant="outline"
          className="size-8"
          aria-label="+"
          onClick={() => set(value + (unit === "percent" ? 5 : 1))}
        >
          <Plus />
        </Button>
        {unit && (
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={unit}
            className="ml-auto"
            onValueChange={(u) => {
              if (!u || !slot.unitPath) return;
              let b = setPath(block, slot.unitPath, u);
              if (u === "percent" && value > 100) b = setPath(b, slot.path, 100);
              props.onChange(b);
            }}
          >
            <ToggleGroupItem value="count" aria-label={t("slot.count")} data-testid="unit-count">
              {t("units.countShort")}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="percent"
              aria-label={t("slot.percent")}
              data-testid="unit-percent"
            >
              {t("units.percentShort")}
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
    </PopoverSlot>
  );
}

function EnumSlot(props: SlotEditorProps) {
  const { t } = useRT();
  const { block, slot } = props;
  const value = slotValue(block, slot) as string | undefined;
  const pill = useSlotPill(props);
  const set = (v: string | undefined) => props.onChange(setPath(block, slot.path, v));
  return (
    <DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
      <DropdownMenuTrigger asChild>
        <SlotPill
          unset={slot.optional && value === undefined}
          color={props.color}
          className={cn(slot.optional && value === undefined && "px-1.5 text-xs opacity-70")}
          data-testid={`slot-${slot.name}`}
          data-slot-name={slot.name}
        >
          {value === undefined && slot.optional ? t(`placeholders.${slot.name}`) : pill.label}
        </SlotPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={value ?? "__none"}
          onValueChange={(v) => set(v === "__none" ? undefined : v)}
        >
          {slot.options?.map((o) => (
            <DropdownMenuRadioItem key={o} value={o} data-testid={`option-${o}`}>
              {t(`values.${slot.valueSet}.${o}`)}
            </DropdownMenuRadioItem>
          ))}
          {slot.optional && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuRadioItem value="__none" data-testid="option-none">
                <X className="size-3.5" /> {t("values.unset")}
              </DropdownMenuRadioItem>
            </>
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
