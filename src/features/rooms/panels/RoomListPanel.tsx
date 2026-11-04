/** 左パネル: 部屋リスト（追加・並べ替え・表示切替・名前変更・色・複製・削除） */
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Trash,
  TriangleExclamationPoint,
} from "lucide-react";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Room } from "@/domain/schema";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/project";
import { totalSeats, useRooms } from "@/store/selectors";
import { useUiStore } from "@/store/ui";
import { deleteRoom, duplicateRoomAuto, selectRoom } from "../actions";
import { useEditor } from "../editorStore";
import { AddRoomForm } from "./AddRoomForm";
import { ColorSwatches } from "./ColorSwatches";

export function RoomListPanel() {
  const { t } = useTranslation("rooms");
  const rooms = useRooms();
  const reorderRooms = useProjectStore((s) => s.reorderRooms);
  const [addOpen, setAddOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = rooms.map((r) => r.id);
    reorderRooms(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <aside
      className="bg-sidebar flex min-h-0 w-64 shrink-0 flex-col border-r"
      aria-label={t("list.title")}
      data-tour="room-list"
      data-testid="room-list"
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <div>
          <h2 className="text-sm font-semibold">{t("list.title")}</h2>
          <p className="text-muted-foreground text-xs" data-testid="room-list-summary">
            {t("list.summary", { rooms: rooms.length, seats: totalSeats(rooms) })}
          </p>
        </div>
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" data-testid="add-room" data-tour="add-room">
              <Plus className="size-4" />
              {t("list.add")}
            </Button>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-80">
            <AddRoomForm onDone={() => setAddOpen(false)} />
          </PopoverContent>
        </Popover>
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rooms.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1 px-2 pb-3" role="listbox" aria-label={t("list.title")}>
              {rooms.map((r) => (
                <RoomRow key={r.id} room={r} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {rooms.length === 0 && (
          <p className="text-muted-foreground px-4 py-6 text-center text-xs">{t("list.empty")}</p>
        )}
      </div>
    </aside>
  );
}

const RoomRow = memo(function RoomRow({ room }: { room: Room }) {
  const { t } = useTranslation("rooms");
  const selected = useUiStore((s) => s.selection.roomIds.includes(room.id));
  const updateRoom = useProjectStore((s) => s.updateRoom);
  const renaming = useEditor((s) => s.renamingRoomId === room.id);
  const setRenaming = useEditor((s) => s.setRenamingRoomId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: room.id,
  });
  const noEntrance = room.entrances.length === 0;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      role="option"
      aria-selected={selected}
      data-testid="room-row"
      data-room-id={room.id}
      className={cn(
        "group relative flex items-center gap-1.5 rounded-lg border border-transparent px-1.5 py-1.5 text-sm transition-colors",
        selected
          ? "bg-sidebar-accent border-sidebar-border shadow-sm"
          : "hover:bg-sidebar-accent/60",
        isDragging && "z-10 opacity-80 shadow-lg",
        room.hidden && "opacity-60",
      )}
      onClick={() => selectRoom(room.id)}
      onDoubleClick={() => setRenaming(room.id)}
    >
      <button
        type="button"
        className="text-muted-foreground/60 hover:text-foreground cursor-grab touch-none rounded p-0.5 active:cursor-grabbing"
        aria-label={t("list.reorder")}
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="size-3.5" />
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="ring-offset-background size-4 shrink-0 rounded-full shadow-inner ring-1 ring-black/10 transition-transform hover:scale-125"
            style={{ backgroundColor: room.color }}
            aria-label={t("list.color")}
            data-testid="room-color"
            onClick={(e) => e.stopPropagation()}
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" onClick={(e) => e.stopPropagation()}>
          <ColorSwatches value={room.color} onChange={(color) => updateRoom(room.id, { color })} />
        </PopoverContent>
      </Popover>
      <div className="min-w-0 flex-1">
        {renaming ? (
          <InlineRename
            value={room.name}
            onCommit={(name) => {
              if (name.trim()) updateRoom(room.id, { name: name.trim() });
              setRenaming(null);
            }}
            onCancel={() => setRenaming(null)}
          />
        ) : (
          <div
            className="truncate font-medium"
            data-testid="room-name"
            title={t("list.renameHint")}
          >
            {room.name}
          </div>
        )}
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <span data-testid="room-seat-count">
            {t("canvas.seatBadge", { count: room.seats.length })}
          </span>
          <span>·</span>
          <span>
            {room.width}×{room.height}
          </span>
          {noEntrance && (
            <Tooltip>
              <TooltipTrigger asChild>
                <TriangleExclamationPoint
                  className="text-warning size-3.5"
                  aria-label={t("warnings.noEntrance")}
                  data-testid="room-warning"
                />
              </TooltipTrigger>
              <TooltipContent>{t("warnings.noEntrance")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <div className="flex items-center opacity-70 transition-opacity group-hover:opacity-100">
        <IconAction
          label={room.hidden ? t("list.show") : t("list.hide")}
          testId="room-visibility"
          onClick={() => updateRoom(room.id, { hidden: !room.hidden })}
        >
          {room.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </IconAction>
        <IconAction
          label={t("list.duplicate")}
          testId="room-duplicate"
          className="hidden group-hover:grid"
          onClick={() => duplicateRoomAuto(room.id)}
        >
          <Copy className="size-3.5" />
        </IconAction>
        <IconAction
          label={t("list.delete")}
          testId="room-delete"
          className="hover:text-destructive hidden group-hover:grid"
          onClick={() => void deleteRoom(room.id)}
        >
          <Trash className="size-3.5" />
        </IconAction>
      </div>
    </li>
  );
});

function IconAction({
  label,
  onClick,
  children,
  className,
  testId,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-testid={testId}
          className={cn(
            "text-muted-foreground hover:text-foreground hover:bg-background grid size-6 place-items-center rounded-md transition-colors",
            className,
          )}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function InlineRename({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(value);
  return (
    <input
      autoFocus
      className="bg-background focus:ring-ring/50 w-full rounded border px-1 py-0.5 text-sm font-medium outline-none focus:ring-2"
      value={v}
      data-testid="room-rename-input"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(v);
        else if (e.key === "Escape") onCancel();
        e.stopPropagation();
      }}
    />
  );
}
