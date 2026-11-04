/** エディタ用の部屋レイヤー: 選択状態・重なり警告・リサイズハンドル付きの RoomShape */
import { memo, useMemo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { RoomShape, type SeatVisualState } from "@/components/canvas";
import type { ID, Room } from "@/domain/schema";
import { useRooms } from "@/store/selectors";
import { useUiStore } from "@/store/ui";
import { useEditor } from "../editorStore";
import { duplicateLabels, overlappingRoomIds, type ResizeHandle } from "../lib/editing";

export function EditorRooms() {
  const rooms = useRooms();
  const selection = useUiStore((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const moving = useEditor((s) => (s.preview?.kind === "moveSeats" ? s.preview : null));
  const resizing = useEditor((s) => (s.preview?.kind === "resize" ? s.preview.roomId : null));
  const dup = useMemo(() => duplicateLabels(rooms), [rooms]);
  const overlaps = useMemo(() => overlappingRoomIds(rooms), [rooms]);
  const selSeats = useMemo(() => new Set(selection.seatIds), [selection.seatIds]);
  const selEnts = useMemo(() => new Set(selection.entranceIds), [selection.entranceIds]);

  return (
    <>
      {rooms.map((room) => {
        if (room.hidden) return null;
        // 部屋ごとに文字列キー化して memo を効かせる
        const seatKey = room.seats
          .filter((s) => selSeats.has(s.id))
          .map((s) => s.id)
          .join(",");
        const entKey = room.entrances
          .filter((e) => selEnts.has(e.id))
          .map((e) => e.id)
          .join(",");
        const dupKey = room.seats
          .filter((s) => dup.has(s.label))
          .map((s) => s.id)
          .join(",");
        const selected = selection.roomIds.includes(room.id) && !seatKey && !entKey;
        return (
          <EditorRoom
            key={room.id}
            room={room}
            selected={selected || selection.roomIds.includes(room.id)}
            strong={selected}
            seatKey={seatKey}
            entKey={entKey}
            dupKey={dupKey}
            overlap={overlaps.has(room.id)}
            handles={tool === "select" && selected && resizing !== room.id}
            hiddenKey={moving?.roomId === room.id ? moving.ids.join(",") : ""}
          />
        );
      })}
    </>
  );
}

const EditorRoom = memo(function EditorRoom({
  room,
  selected,
  strong,
  seatKey,
  entKey,
  dupKey,
  overlap,
  handles,
  hiddenKey,
}: {
  room: Room;
  selected: boolean;
  strong: boolean;
  seatKey: string;
  entKey: string;
  dupKey: string;
  overlap: boolean;
  handles: boolean;
  hiddenKey: string;
}) {
  const { t } = useTranslation("rooms");
  const seatStates = useMemo(() => {
    const m = new Map<ID, SeatVisualState>();
    for (const id of seatKey ? seatKey.split(",") : []) m.set(id, { selected: true });
    for (const id of dupKey ? dupKey.split(",") : []) m.set(id, { ...m.get(id), violation: true });
    return m;
  }, [seatKey, dupKey]);
  const ents = useMemo(() => new Set(entKey ? entKey.split(",") : []), [entKey]);
  const hidden = useMemo(() => (hiddenKey ? hiddenKey.split(",") : undefined), [hiddenKey]);
  return (
    <RoomShape
      room={room}
      selected={strong || (selected && !seatKey && !entKey)}
      warning={overlap}
      showBounds
      badge={t("canvas.seatBadge", { count: room.seats.length })}
      alert={room.entrances.length === 0}
      seatStates={seatStates}
      selectedEntranceIds={ents}
      hideSeats={hidden}
    >
      {handles && <ResizeHandles room={room} />}
    </RoomShape>
  );
});

const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

function ResizeHandles({ room }: { room: Room }) {
  const { t } = useTranslation("rooms");
  const w = room.width;
  const h = room.height;
  const pts: [ResizeHandle, number, number][] = [
    ["nw", 0, 0],
    ["n", w / 2, 0],
    ["ne", w, 0],
    ["e", w, h / 2],
    ["se", w, h],
    ["s", w / 2, h],
    ["sw", 0, h],
    ["w", 0, h / 2],
  ];
  return (
    <g data-testid="resize-handles">
      {pts.map(([dir, x, y]) => (
        <circle
          key={dir}
          cx={x}
          cy={y}
          data-resize={dir}
          data-room-id={room.id}
          aria-label={t("canvas.resizeHandle", { dir })}
          fill="var(--canvas-floor)"
          stroke="var(--canvas-selection)"
          className="sk-px2"
          style={{ r: "calc(var(--sk-u) * 5.5px)", cursor: HANDLE_CURSOR[dir] } as CSSProperties}
        />
      ))}
    </g>
  );
}
