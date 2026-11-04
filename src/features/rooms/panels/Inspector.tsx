/** 右パネル: 選択対象（部屋 / 席 / 複数席 / 入口）のプロパティとプロジェクト設定 */
import {
  ArrowUp,
  Copy,
  DoorOpen,
  ListOrdered,
  MousePointerClick,
  Trash,
  TriangleExclamationPoint,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FACING_ANGLE } from "@/components/canvas";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Facing, ID, Room, Seat } from "@/domain/schema";
import { cn } from "@/lib/utils";
import { batch, useProjectStore } from "@/store/project";
import { seatIndex, useRooms } from "@/store/selectors";
import { useUiStore } from "@/store/ui";
import {
  deleteRoom,
  deleteSelection,
  duplicateRoomAuto,
  renumberRoom,
  resizeWithConfirm,
  selectRoom,
  setSeatsFacing,
} from "../actions";
import { useEditor } from "../editorStore";
import { duplicateLabels, overlappingRoomIds, type NumberingOrder } from "../lib/editing";
import { ColorSwatches } from "./ColorSwatches";
import { CommitInput, CommitTextarea, Field, TagEditor } from "./fields";

const FACINGS: Facing[] = ["n", "e", "s", "w"];
const PRESET_TAGS = ["window", "aisle", "entranceSide", "wall", "quiet"] as const;

export function Inspector() {
  const { t } = useTranslation("rooms");
  const rooms = useRooms();
  const selection = useUiStore((s) => s.selection);
  const idx = seatIndex(rooms);
  const seats = selection.seatIds.map((id) => idx.get(id)).filter((x) => x !== undefined);
  const room = rooms.find((r) => r.id === selection.roomIds[0]);

  let body: ReactNode;
  let key: string;
  if (seats.length === 1) {
    key = `seat-${seats[0]!.seat.id}`;
    body = <SeatInspector room={seats[0]!.room} seat={seats[0]!.seat} />;
  } else if (seats.length > 1) {
    key = "multi";
    body = <MultiSeatInspector refs={seats} />;
  } else if (selection.entranceIds.length && room) {
    key = "entrance";
    body = <EntranceInspector room={room} ids={selection.entranceIds} />;
  } else if (room) {
    key = `room-${room.id}`;
    body = <RoomInspector room={room} />;
  } else {
    key = "none";
    body = <Overview />;
  }

  return (
    <aside
      className="bg-sidebar flex min-h-0 w-72 shrink-0 flex-col border-l"
      aria-label={t("inspector.title")}
      data-tour="room-inspector"
      data-testid="inspector"
    >
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={key}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.14 }}
            className="space-y-4 p-3"
          >
            {body}
          </motion.div>
        </AnimatePresence>
        <div className="border-t p-3">
          <ProjectSettings />
        </div>
      </div>
    </aside>
  );
}

function Section({
  title,
  icon,
  children,
  actions,
}: {
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          {icon}
          {title}
        </h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Warning({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      className="border-warning/40 bg-warning/10 flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-xs"
      data-testid={testId}
    >
      <TriangleExclamationPoint className="text-warning mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-background rounded-lg border px-2 py-1.5">
      <div className="text-muted-foreground text-[11px]">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RoomInspector({ room }: { room: Room }) {
  const { t } = useTranslation("rooms");
  const rooms = useRooms();
  const updateRoom = useProjectStore((s) => s.updateRoom);
  const numbering = useEditor((s) => s.numbering);
  const setNumbering = useEditor((s) => s.setNumbering);
  const overlaps = useMemo(() => overlappingRoomIds(rooms), [rooms]);
  const obstacles = room.cells.filter((c) => c === "obstacle").length;

  return (
    <Section
      title={t("inspector.room")}
      icon={<span className="size-3 rounded-full" style={{ backgroundColor: room.color }} />}
      actions={
        <div className="flex">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("list.duplicate")}
            onClick={() => duplicateRoomAuto(room.id)}
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hover:text-destructive size-7"
            aria-label={t("list.delete")}
            onClick={() => void deleteRoom(room.id)}
          >
            <Trash className="size-3.5" />
          </Button>
        </div>
      }
    >
      <Field label={t("inspector.name")} htmlFor="room-name">
        <CommitInput
          id="room-name"
          value={room.name}
          data-testid="inspector-room-name"
          onCommit={(v) => v.trim() && updateRoom(room.id, { name: v.trim() })}
        />
      </Field>
      <Field label={t("list.color")}>
        <ColorSwatches value={room.color} onChange={(color) => updateRoom(room.id, { color })} />
      </Field>
      <div className="flex items-end gap-2">
        <Field label={t("add.width")} htmlFor="room-w" className="flex-1">
          <CommitInput
            id="room-w"
            type="number"
            min={1}
            max={40}
            value={String(room.width)}
            data-testid="inspector-room-width"
            onCommit={(v) => void resizeWithConfirm(room.id, Number(v) || room.width, room.height)}
          />
        </Field>
        <span className="text-muted-foreground pb-1.5">×</span>
        <Field label={t("add.height")} htmlFor="room-h" className="flex-1">
          <CommitInput
            id="room-h"
            type="number"
            min={1}
            max={40}
            value={String(room.height)}
            data-testid="inspector-room-height"
            onCommit={(v) => void resizeWithConfirm(room.id, room.width, Number(v) || room.height)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Stat
          label={t("inspector.seats")}
          value={<span data-testid="inspector-seat-count">{room.seats.length}</span>}
        />
        <Stat label={t("inspector.entrances")} value={room.entrances.length} />
        <Stat label={t("inspector.obstacles")} value={obstacles} />
      </div>
      {room.entrances.length === 0 && (
        <Warning testId="warning-no-entrance">{t("warnings.noEntrance")}</Warning>
      )}
      {overlaps.has(room.id) && <Warning>{t("warnings.overlap")}</Warning>}
      <Field label={t("inspector.numbering")}>
        <div className="flex gap-1.5">
          <Select value={numbering} onValueChange={(v) => setNumbering(v as NumberingOrder)}>
            <SelectTrigger size="sm" className="h-8 flex-1" data-testid="numbering-order">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["row", "column", "entrance"] as const).map((o) => (
                <SelectItem key={o} value={o}>
                  {t(`numbering.${o}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="secondary"
            className="h-8"
            disabled={!room.seats.length}
            onClick={() => renumberRoom(room.id, numbering)}
            data-testid="renumber"
          >
            <ListOrdered className="size-3.5" />
            {t("inspector.renumber")}
          </Button>
        </div>
      </Field>
      <Field label={t("inspector.note")} htmlFor="room-note">
        <CommitTextarea
          id="room-note"
          value={room.note ?? ""}
          placeholder={t("inspector.notePlaceholder")}
          onCommit={(v) => updateRoom(room.id, { note: v || undefined })}
        />
      </Field>
      <p className="text-muted-foreground text-xs">
        {t("inspector.position", { x: room.position.x, y: room.position.y })}
      </p>
    </Section>
  );
}

function useTagSuggestions() {
  const { t } = useTranslation("rooms");
  const rooms = useRooms();
  return useMemo(() => {
    const set = new Set<string>(PRESET_TAGS.map((k) => t(`tags.${k}`)));
    for (const r of rooms) for (const s of r.seats) for (const tag of s.tags) set.add(tag);
    return [...set];
  }, [rooms, t]);
}

function FacingPicker({
  value,
  onChange,
}: {
  value: Facing | null;
  onChange: (f: Facing) => void;
}) {
  const { t } = useTranslation("rooms");
  return (
    <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label={t("inspector.facing")}>
      {FACINGS.map((f) => (
        <button
          key={f}
          type="button"
          role="radio"
          aria-checked={value === f}
          aria-label={t(`facing.${f}`)}
          data-testid={`facing-${f}`}
          onClick={() => onChange(f)}
          className={cn(
            "flex h-8 items-center justify-center gap-1 rounded-md border text-xs transition-colors",
            value === f ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent",
          )}
        >
          <ArrowUp className="size-3.5" style={{ transform: `rotate(${FACING_ANGLE[f]}deg)` }} />
          {t(`facing.short.${f}`)}
        </button>
      ))}
    </div>
  );
}

function SeatInspector({ room, seat }: { room: Room; seat: Seat }) {
  const { t } = useTranslation("rooms");
  const rooms = useRooms();
  const updateSeats = useProjectStore((s) => s.updateSeats);
  const suggestions = useTagSuggestions();
  const dup = useMemo(() => duplicateLabels(rooms), [rooms]);
  return (
    <Section
      title={t("inspector.seat")}
      actions={
        <Button
          variant="ghost"
          size="icon"
          className="hover:text-destructive size-7"
          aria-label={t("inspector.deleteSeats")}
          onClick={() => void deleteSelection()}
        >
          <Trash className="size-3.5" />
        </Button>
      }
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs"
        onClick={() => selectRoom(room.id)}
      >
        <span className="size-2.5 rounded-full" style={{ backgroundColor: room.color }} />
        {room.name} · ({seat.x + 1}, {seat.y + 1})
      </button>
      <Field
        label={t("inspector.label")}
        htmlFor="seat-label"
        hint={
          dup.has(seat.label) && (
            <Warning testId="warning-dup-label">{t("warnings.duplicateLabel")}</Warning>
          )
        }
      >
        <CommitInput
          id="seat-label"
          value={seat.label}
          invalid={dup.has(seat.label)}
          data-testid="inspector-seat-label"
          onCommit={(label) => updateSeats(room.id, [seat.id], { label: label.trim() })}
        />
      </Field>
      <Field label={t("inspector.facing")}>
        <FacingPicker
          value={seat.facing}
          onChange={(facing) => updateSeats(room.id, [seat.id], { facing })}
        />
      </Field>
      <Field label={t("inspector.tags")}>
        <TagEditor
          tags={seat.tags}
          suggestions={suggestions}
          onAdd={(tag) =>
            !seat.tags.includes(tag) &&
            updateSeats(room.id, [seat.id], { tags: [...seat.tags, tag] })
          }
          onRemove={(tag) =>
            updateSeats(room.id, [seat.id], { tags: seat.tags.filter((x) => x !== tag) })
          }
        />
      </Field>
    </Section>
  );
}

function MultiSeatInspector({ refs }: { refs: { room: Room; seat: Seat }[] }) {
  const { t } = useTranslation("rooms");
  const updateSeats = useProjectStore((s) => s.updateSeats);
  const suggestions = useTagSuggestions();
  const facings = new Set(refs.map((r) => r.seat.facing));
  const common =
    refs.reduce<string[] | null>(
      (acc, r) => (acc === null ? [...r.seat.tags] : acc.filter((x) => r.seat.tags.includes(x))),
      null,
    ) ?? [];
  const partial = [...new Set(refs.flatMap((r) => r.seat.tags))].filter((x) => !common.includes(x));
  const rooms = new Set(refs.map((r) => r.room.id));

  const editTags = (fn: (tags: string[]) => string[]) =>
    batch(() => {
      for (const { room, seat } of refs) updateSeats(room.id, [seat.id], { tags: fn(seat.tags) });
    });

  return (
    <Section
      title={t("inspector.multi", { count: refs.length })}
      icon={<MousePointerClick className="size-4" />}
      actions={
        <Button
          variant="ghost"
          size="icon"
          className="hover:text-destructive size-7"
          aria-label={t("inspector.deleteSeats")}
          onClick={() => void deleteSelection()}
        >
          <Trash className="size-3.5" />
        </Button>
      }
    >
      {rooms.size > 1 && (
        <p className="text-muted-foreground text-xs">
          {t("inspector.multiRooms", { count: rooms.size })}
        </p>
      )}
      <Field label={t("inspector.facing")}>
        <FacingPicker
          value={facings.size === 1 ? [...facings][0]! : null}
          onChange={setSeatsFacing}
        />
      </Field>
      <Field label={t("inspector.tags")}>
        <TagEditor
          tags={common}
          partial={partial}
          suggestions={suggestions}
          onAdd={(tag) => editTags((tags) => (tags.includes(tag) ? tags : [...tags, tag]))}
          onRemove={(tag) => editTags((tags) => tags.filter((x) => x !== tag))}
        />
      </Field>
      <p className="text-muted-foreground text-xs">{t("inspector.multiHint")}</p>
    </Section>
  );
}

function EntranceInspector({ room, ids }: { room: Room; ids: ID[] }) {
  const { t } = useTranslation("rooms");
  const ents = room.entrances.filter((e) => ids.includes(e.id));
  return (
    <Section
      title={t("inspector.entrance", { count: ents.length })}
      icon={<DoorOpen className="size-4" />}
      actions={
        <Button
          variant="ghost"
          size="icon"
          className="hover:text-destructive size-7"
          aria-label={t("inspector.deleteEntrance")}
          onClick={() => void deleteSelection()}
        >
          <Trash className="size-3.5" />
        </Button>
      }
    >
      <ul className="space-y-1 text-xs">
        {ents.map((e) => (
          <li key={e.id} className="bg-background rounded-md border px-2 py-1">
            {room.name} · ({e.x + 1}, {e.y + 1}) · {t(`facing.${e.side}`)}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">{t("inspector.entranceHint")}</p>
    </Section>
  );
}

function Overview() {
  const { t } = useTranslation("rooms");
  const rooms = useRooms();
  const overlaps = useMemo(() => overlappingRoomIds(rooms), [rooms]);
  const dup = useMemo(() => duplicateLabels(rooms), [rooms]);
  const noEntrance = rooms.filter((r) => r.entrances.length === 0);
  return (
    <Section title={t("inspector.overview")}>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label={t("inspector.rooms")} value={rooms.length} />
        <Stat label={t("inspector.seats")} value={rooms.reduce((n, r) => n + r.seats.length, 0)} />
      </div>
      {noEntrance.map((r) => (
        <button
          key={r.id}
          type="button"
          className="block w-full text-left"
          onClick={() => selectRoom(r.id)}
        >
          <Warning testId="overview-no-entrance">
            {t("warnings.noEntranceRoom", { name: r.name })}
          </Warning>
        </button>
      ))}
      {overlaps.size > 0 && (
        <Warning>{t("warnings.overlapCount", { count: overlaps.size })}</Warning>
      )}
      {dup.size > 0 && (
        <Warning>
          {t("warnings.duplicateLabels", { labels: [...dup].slice(0, 5).join(", ") })}
        </Warning>
      )}
      <p className="text-muted-foreground text-xs">{t("inspector.nothingSelected")}</p>
    </Section>
  );
}

function ProjectSettings() {
  const { t } = useTranslation("rooms");
  const adjacency = useProjectStore((s) => s.project.settings.adjacency);
  const setAdjacency = useProjectStore((s) => s.setAdjacency);
  return (
    <Section title={t("settings.title")}>
      <Field
        label={t("settings.adjacency")}
        hint={<p className="text-muted-foreground text-[11px]">{t("settings.adjacencyHint")}</p>}
      >
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={String(adjacency)}
          onValueChange={(v) => v && setAdjacency(Number(v) as 4 | 8)}
          className="w-full"
          data-testid="adjacency"
        >
          <ToggleGroupItem value="4" className="flex-1 text-xs">
            {t("settings.adj4")}
          </ToggleGroupItem>
          <ToggleGroupItem value="8" className="flex-1 text-xs">
            {t("settings.adj8")}
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>
    </Section>
  );
}
