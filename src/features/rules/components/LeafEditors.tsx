/** 条件（葉）の値エディタと、個人・部屋の選択リスト */
import { Check } from "lucide-react";
import { useMemo } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { GENDERS } from "@/domain/genders";
import { compareRole, ROLE_GROUPS, ROLE_KEYS } from "@/domain/roles";
import type { SeatExpr } from "@/domain/rules";
import type { ID } from "@/domain/schema";
import { roleColor } from "@/graphics/palette";
import { cn } from "@/lib/utils";
import { useLabs, useMembers, useRooms } from "@/store/selectors";
import type { PersonLeaf, SeatLeaf } from "../exprModel";
import { useRT } from "../hooks";
import { ChipToggleGroup } from "./SlotPill";
import { MiniRoomMap } from "./MiniRoomMap";

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground py-1 text-xs">{children}</p>;
}

/** 個人の選択（複数 / 単一） */
export function MemberPicker({
  selected,
  onChange,
  single,
  className,
}: {
  selected: readonly ID[];
  onChange: (ids: ID[]) => void;
  single?: boolean;
  className?: string;
}) {
  const { t, tc } = useRT();
  const members = useMembers();
  const labs = useLabs();
  const sorted = useMemo(
    () => [...members].sort((a, b) => compareRole(a.role, b.role) || a.name.localeCompare(b.name)),
    [members],
  );
  if (!members.length) return <Empty>{t("slot.noMembers")}</Empty>;
  return (
    <Command className={cn("rounded-md border", className)} data-testid="member-picker">
      <CommandInput placeholder={t("slot.searchMembers")} />
      <CommandList className="max-h-52">
        <CommandEmpty>{t("slot.noMatch")}</CommandEmpty>
        <CommandGroup>
          {sorted.map((m) => {
            const on = selected.includes(m.id);
            const lab = labs.find((l) => l.id === m.labId);
            return (
              <CommandItem
                key={m.id}
                value={`${m.name} ${m.kana ?? ""} ${m.id}`}
                onSelect={() =>
                  onChange(
                    single ? [m.id] : on ? selected.filter((x) => x !== m.id) : [...selected, m.id],
                  )
                }
                data-testid={`member-option-${m.id}`}
              >
                <Check className={cn("size-4", on ? "opacity-100" : "opacity-0")} />
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: roleColor(m.role) }}
                />
                <span className="truncate">{m.name}</span>
                <span className="text-muted-foreground ml-auto flex items-center gap-1.5 text-xs">
                  {tc(`roles.${m.role}`)}
                  {lab && (
                    <span
                      className="rounded px-1 text-[10px] font-semibold text-white"
                      style={{ background: lab.color }}
                    >
                      {lab.shortName}
                    </span>
                  )}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/** 部屋の選択リスト */
export function RoomPicker({
  selected,
  onChange,
  single,
}: {
  selected: readonly ID[];
  onChange: (ids: ID[]) => void;
  single?: boolean;
}) {
  const { t } = useRT();
  const rooms = useRooms();
  if (!rooms.length) return <Empty>{t("slot.noRooms")}</Empty>;
  return (
    <div className="flex flex-col gap-0.5" role="listbox" aria-multiselectable={!single}>
      {rooms.map((r) => {
        const on = selected.includes(r.id);
        return (
          <button
            key={r.id}
            type="button"
            role="option"
            aria-selected={on}
            data-testid={`room-option-${r.id}`}
            onClick={() =>
              onChange(
                single ? [r.id] : on ? selected.filter((x) => x !== r.id) : [...selected, r.id],
              )
            }
            className={cn(
              "hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
              on && "bg-accent",
            )}
          >
            <Check className={cn("size-4", on ? "opacity-100" : "opacity-0")} />
            <span className="size-2.5 rounded-sm" style={{ background: r.color }} />
            <span className="flex-1 truncate">{r.name}</span>
            <span className="text-muted-foreground text-xs tabular-nums">{r.seats.length}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PersonLeafEditor({
  leaf,
  onChange,
}: {
  leaf: PersonLeaf;
  onChange: (l: PersonLeaf) => void;
}) {
  const { t, tc } = useRT();
  const labs = useLabs();
  const members = useMembers();
  const tags = useMemo(() => [...new Set(members.flatMap((m) => m.tags))].sort(), [members]);
  switch (leaf.op) {
    case "role":
      return (
        <ChipToggleGroup
          testId="leaf-role"
          options={ROLE_KEYS.map((r) => ({
            value: r,
            label: tc(`roles.${r}`),
            color: roleColor(r),
            title: tc(`rolesLong.${r}`),
          }))}
          selected={leaf.in}
          onChange={(v) => onChange({ op: "role", in: v as typeof leaf.in })}
        />
      );
    case "roleGroup":
      return (
        <ChipToggleGroup
          options={ROLE_GROUPS.map((g) => ({ value: g, label: tc(`roleGroups.${g}`) }))}
          selected={leaf.in}
          onChange={(v) => onChange({ op: "roleGroup", in: v as typeof leaf.in })}
        />
      );
    case "lab":
      if (!labs.length) return <Empty>{t("slot.noLabs")}</Empty>;
      return (
        <ChipToggleGroup
          options={labs.map((l) => ({ value: l.id, label: l.name, color: l.color }))}
          selected={leaf.in}
          onChange={(v) => onChange({ op: "lab", in: v })}
        />
      );
    case "gender":
      return (
        <ChipToggleGroup
          options={GENDERS.map((g) => ({ value: g, label: tc(`genders.${g}`) }))}
          selected={leaf.in}
          onChange={(v) => onChange({ op: "gender", in: v as typeof leaf.in })}
        />
      );
    case "tag":
      if (!tags.length) return <Empty>{t("slot.noMemberTags")}</Empty>;
      return (
        <ChipToggleGroup
          options={tags.map((x) => ({ value: x, label: x }))}
          selected={leaf.in}
          onChange={(v) => onChange({ op: "tag", in: v })}
        />
      );
    case "members":
      return (
        <MemberPicker selected={leaf.ids} onChange={(ids) => onChange({ op: "members", ids })} />
      );
    default:
      return null;
  }
}

export function DepthEditor({
  leaf,
  onChange,
}: {
  leaf: Extract<SeatExpr, { op: "depth" }>;
  onChange: (l: Extract<SeatExpr, { op: "depth" }>) => void;
}) {
  const { t } = useRT();
  const rooms = useRooms();
  const byRatio = leaf.ratio !== undefined && leaf.count === undefined;
  const amount = byRatio ? Math.round((leaf.ratio ?? 0) * 100) : (leaf.count ?? 0);
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs">
      <span className="text-muted-foreground">{t("slot.depthRoom")}</span>
      {rooms.length ? (
        <ChipToggleGroup
          options={rooms.map((r) => ({ value: r.id, label: r.name, color: r.color }))}
          selected={leaf.roomIds}
          onChange={(roomIds) => onChange({ ...leaf, roomIds })}
        />
      ) : (
        <Empty>{t("slot.noRooms")}</Empty>
      )}
      <span className="text-muted-foreground">{t("slot.depthFrom")}</span>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={leaf.from}
        onValueChange={(v) => v && onChange({ ...leaf, from: v as "back" | "front" })}
      >
        <ToggleGroupItem value="back">{t("slot.back")}</ToggleGroupItem>
        <ToggleGroupItem value="front">{t("slot.front")}</ToggleGroupItem>
      </ToggleGroup>
      <span className="text-muted-foreground">{t("slot.depthAmount")}</span>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          max={byRatio ? 100 : 999}
          value={amount}
          aria-label={t("slot.depthAmount")}
          className="h-8 w-20"
          onChange={(e) => {
            const n = Math.max(0, Number(e.target.value) || 0);
            onChange(
              byRatio
                ? {
                    op: "depth",
                    roomIds: leaf.roomIds,
                    from: leaf.from,
                    ratio: Math.min(100, n) / 100,
                  }
                : { op: "depth", roomIds: leaf.roomIds, from: leaf.from, count: n },
            );
          }}
        />
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={byRatio ? "ratio" : "count"}
          onValueChange={(v) => {
            if (!v) return;
            const base = { op: "depth" as const, roomIds: leaf.roomIds, from: leaf.from };
            onChange(v === "ratio" ? { ...base, ratio: 0.3 } : { ...base, count: 3 });
          }}
        >
          <ToggleGroupItem value="count">{t("slot.byCount")}</ToggleGroupItem>
          <ToggleGroupItem value="ratio">{t("slot.byRatio")}</ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}

export function SeatLeafEditor({
  leaf,
  onChange,
  color,
}: {
  leaf: SeatLeaf;
  onChange: (l: SeatLeaf) => void;
  color?: string;
}) {
  const { t } = useRT();
  const rooms = useRooms();
  const tags = useMemo(
    () => [...new Set(rooms.flatMap((r) => r.seats.flatMap((s) => s.tags)))].sort(),
    [rooms],
  );
  switch (leaf.op) {
    case "rooms":
      if (!rooms.length) return <Empty>{t("slot.noRooms")}</Empty>;
      return (
        <ChipToggleGroup
          options={rooms.map((r) => ({ value: r.id, label: r.name, color: r.color }))}
          selected={leaf.roomIds}
          onChange={(roomIds) => onChange({ op: "rooms", roomIds })}
        />
      );
    case "seats":
      if (!rooms.some((r) => r.seats.length)) return <Empty>{t("slot.noSeats")}</Empty>;
      return (
        <MiniRoomMap
          rooms={rooms}
          mode="multi"
          color={color}
          selected={new Set(leaf.seatIds)}
          onChange={(seatIds) => onChange({ op: "seats", seatIds })}
          maxHeight={160}
        />
      );
    case "seatTag":
      if (!tags.length) return <Empty>{t("slot.noTags")}</Empty>;
      return (
        <ChipToggleGroup
          options={tags.map((x) => ({ value: x, label: x }))}
          selected={leaf.in}
          onChange={(v) => onChange({ op: "seatTag", in: v })}
        />
      );
    case "depth":
      return <DepthEditor leaf={leaf} onChange={onChange} />;
    default:
      return null;
  }
}
