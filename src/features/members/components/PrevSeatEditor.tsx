/**
 * 昨年度の席の 2 段階コンボボックス（部屋 → 席）。#78 #79
 * - 席名で横断検索、埋まっている席は「◯◯ と入れ替え」
 * - 「部屋のみ（席不明）」とクリア
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRightLeft, Check, ChevronRight, DoorOpen, Eraser } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { ID, Room } from "@/domain/schema";
import { collator } from "@/lib/format";
import { useProjectStore } from "@/store/project";
import { memberIndex, previousPlan } from "@/store/selectors";
import { prevPlacementOf, prevSeatActions } from "../lib/prevPlan";
import { ColorDot } from "./badges";

export function PrevSeatEditor({
  memberId,
  open,
  onOpenChange,
  children,
}: {
  memberId: ID;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** アンカー（セルの中身） */
  children: ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        className="w-80 p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        data-testid="prev-seat-editor"
      >
        {open && <EditorBody memberId={memberId} onDone={() => onOpenChange(false)} />}
      </PopoverContent>
    </Popover>
  );
}

function EditorBody({ memberId, onDone }: { memberId: ID; onDone: () => void }) {
  const { t, i18n } = useTranslation(["members", "common"]);
  const project = useProjectStore((s) => s.project);
  const rooms = project.layout.rooms;
  const placement = prevPlacementOf(project, memberId);
  const [roomId, setRoomId] = useState<ID | null>(
    placement.kind === "none" ? null : placement.room.id,
  );
  const [search, setSearch] = useState("");
  const room = rooms.find((r) => r.id === roomId);
  const plan = previousPlan(project);
  const members = memberIndex(project.members);
  const occupant = (seatId: ID) => {
    const mid = plan?.assignment[seatId];
    return mid ? members.get(mid) : undefined;
  };
  const planName = t("prev.defaultPlanName");
  const coll = collator(i18n.language);

  const pickSeat = (seatId: ID) => {
    const other = occupant(seatId);
    const res = prevSeatActions.setSeat(memberId, seatId, { swap: true, planName });
    if (other && other.id !== memberId && res.displaced)
      toast.success(
        res.swappedTo
          ? t("prev.swapped", { name: other.name })
          : t("prev.displaced", { name: other.name }),
      );
    onDone();
  };
  const pickRoomOnly = (r: Room) => {
    prevSeatActions.setRoomOnly(memberId, r.key, { planName });
    onDone();
  };
  const clear = () => {
    prevSeatActions.clear([memberId]);
    onDone();
  };

  const allSeats = useMemo(
    () =>
      rooms.flatMap((r) =>
        [...r.seats]
          .sort((a, b) => coll.compare(a.label, b.label))
          .map((s) => ({ room: r, seat: s })),
      ),
    [rooms, coll],
  );

  if (rooms.length === 0)
    return (
      <div className="space-y-2 p-4 text-sm">
        <p className="text-muted-foreground">{t("prev.noRooms")}</p>
        <Link to="/rooms" className="text-primary text-sm underline-offset-4 hover:underline">
          {t("prev.goRooms")}
        </Link>
      </div>
    );

  const seatItem = (r: Room, seatId: ID, label: string, showRoom: boolean) => {
    const occ = occupant(seatId);
    const mine = occ?.id === memberId;
    return (
      <CommandItem
        key={seatId}
        value={`${r.name} ${label} ${seatId}`}
        onSelect={() => (mine ? onDone() : pickSeat(seatId))}
        data-testid={`prev-seat-option-${label}`}
      >
        {showRoom && <ColorDot color={r.color} />}
        <span className="font-medium tabular-nums">{label || "?"}</span>
        {showRoom && <span className="text-muted-foreground text-xs">{r.name}</span>}
        <span className="ml-auto flex items-center gap-1 text-xs">
          {mine ? (
            <Check className="text-primary size-4" />
          ) : occ ? (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <ArrowRightLeft className="size-3" />
              {t("prev.swapWith", { name: occ.name })}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("prev.empty")}</span>
          )}
        </span>
      </CommandItem>
    );
  };

  return (
    <Command
      loop
      onKeyDown={(e) => {
        if (e.key === "Backspace" && !search && room) {
          e.preventDefault();
          setRoomId(null);
        }
      }}
    >
      {room && (
        <button
          type="button"
          className="hover:bg-accent flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm"
          onClick={() => {
            setRoomId(null);
            setSearch("");
          }}
          data-testid="prev-seat-back"
        >
          <ArrowLeft className="size-4" />
          <ColorDot color={room.color} />
          <span className="font-medium">{room.name}</span>
          <span className="text-muted-foreground ml-auto text-xs">{t("prev.backToRooms")}</span>
        </button>
      )}
      <CommandInput
        autoFocus
        value={search}
        onValueChange={setSearch}
        placeholder={room ? t("prev.searchSeat") : t("prev.searchRoom")}
        data-testid="prev-seat-search"
      />
      <CommandList className="max-h-72">
        <CommandEmpty>{t("prev.noMatch")}</CommandEmpty>
        {room ? (
          <>
            <CommandGroup>
              <CommandItem
                value={`__roomonly ${room.name}`}
                onSelect={() => pickRoomOnly(room)}
                data-testid="prev-room-only"
              >
                <DoorOpen />
                {t("prev.roomOnlyOption", { room: room.name })}
                {placement.kind === "room" && placement.room.id === room.id && (
                  <Check className="text-primary ml-auto size-4" />
                )}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading={t("prev.seats")}>
              {[...room.seats]
                .sort((a, b) => coll.compare(a.label, b.label))
                .map((s) => seatItem(room, s.id, s.label, false))}
            </CommandGroup>
          </>
        ) : (
          <>
            <CommandGroup heading={t("prev.rooms")}>
              {rooms.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`${r.name} ${r.id}`}
                  onSelect={() => {
                    setRoomId(r.id);
                    setSearch("");
                  }}
                  data-testid={`prev-room-option-${r.name}`}
                >
                  <ColorDot color={r.color} />
                  {r.name}
                  <span className="text-muted-foreground ml-auto inline-flex items-center gap-1 text-xs">
                    {t("prev.seatCount", { count: r.seats.length })}
                    <ChevronRight className="size-3.5" />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            {search.trim() && (
              <CommandGroup heading={t("prev.seats")}>
                {allSeats.map(({ room: r, seat }) => seatItem(r, seat.id, seat.label, true))}
              </CommandGroup>
            )}
          </>
        )}
        {placement.kind !== "none" && (
          <>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem value="__clear" onSelect={clear} data-testid="prev-seat-clear">
                <Eraser />
                {t("prev.clear")}
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}
