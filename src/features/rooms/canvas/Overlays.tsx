/** エディタのオーバーレイ: ホバープレビュー・ドラッグプレビュー・配置プレビュー */
import { useTranslation } from "react-i18next";
import { DoorGlyph, ROOM_HEADER, SeatGlyph } from "@/components/canvas";
import { cellAt } from "@/domain/geometry/room";
import type { Room } from "@/domain/schema";
import { useRooms } from "@/store/selectors";
import { placementCells } from "../actions";
import { isPaintTool, useEditor, type ToolId } from "../editorStore";
import { canPlaceSeat, roomAt } from "../lib/editing";

const TOOL_COLOR: Partial<Record<ToolId, string>> = {
  floor: "var(--canvas-ok)",
  void: "var(--canvas-wall)",
  obstacle: "var(--sk-obstacle-edge)",
  eraser: "var(--canvas-violation)",
};

function CellMark({
  x,
  y,
  w = 1,
  h = 1,
  color,
  dashed,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  color: string;
  dashed?: boolean;
}) {
  return (
    <rect
      className={`sk-ghost sk-px2 ${dashed ? "sk-marching" : ""}`}
      x={x + 0.04}
      y={y + 0.04}
      width={w - 0.08}
      height={h - 0.08}
      rx={0.1}
      fill={color}
      fillOpacity={0.18}
      stroke={color}
    />
  );
}

export function HoverPreview() {
  const hover = useEditor((s) => s.hover);
  const tool = useEditor((s) => s.tool);
  const facing = useEditor((s) => s.facing);
  const busy = useEditor((s) => s.preview !== null || s.placement !== null);
  const rooms = useRooms();
  if (!hover || busy || tool === "pan") return null;
  const room = hover.roomId ? rooms.find((r) => r.id === hover.roomId) : undefined;

  if (tool === "entrance") {
    if (!room || !hover.edge) return null;
    return (
      <g transform={`translate(${room.position.x} ${room.position.y})`} data-testid="hover-door">
        <DoorGlyph {...hover.edge} ghost danger={!!hover.entranceId} />
      </g>
    );
  }
  if (!room || hover.x === undefined || hover.y === undefined) {
    if (tool === "select") return null;
    return (
      <CellMark x={hover.cellX} y={hover.cellY} color="var(--canvas-violation)" dashed />
    );
  }
  const { x, y } = hover;
  return (
    <g transform={`translate(${room.position.x} ${room.position.y})`}>
      {isPaintTool(tool) && <CellMark x={x} y={y} color={TOOL_COLOR[tool]!} />}
      {tool === "seat" &&
        (hover.seatId ? (
          <g className="sk-ghost">
            <CellMark x={x} y={y} color="var(--canvas-violation)" />
            <path
              d={`M${x + 0.3} ${y + 0.3}L${x + 0.7} ${y + 0.7}M${x + 0.7} ${y + 0.3}L${x + 0.3} ${y + 0.7}`}
              stroke="var(--canvas-violation)"
              strokeWidth={0.07}
              strokeLinecap="round"
            />
          </g>
        ) : canPlaceSeat(room, x, y) ? (
          <g className="sk-ghost">
            <SeatGlyph x={x} y={y} facing={facing} ghost />
          </g>
        ) : (
          <CellMark x={x} y={y} color="var(--canvas-violation)" />
        ))}
      {tool === "select" && hover.seatId && (
        <rect
          className="sk-ghost sk-px1-5"
          x={x}
          y={y}
          width={1}
          height={1}
          rx={0.16}
          fill="none"
          stroke="var(--canvas-selection)"
          strokeOpacity={0.7}
        />
      )}
      {tool === "select" && hover.entranceId && (
        <EntranceHover room={room} id={hover.entranceId} />
      )}
    </g>
  );
}

function EntranceHover({ room, id }: { room: Room; id: string }) {
  const e = room.entrances.find((x) => x.id === id);
  if (!e) return null;
  return <DoorGlyph x={e.x} y={e.y} side={e.side} ghost selected />;
}

export function DragPreview() {
  const preview = useEditor((s) => s.preview);
  const tool = useEditor((s) => s.tool);
  const rooms = useRooms();
  const { t } = useTranslation("rooms");
  if (!preview) return null;
  const room = rooms.find((r) => r.id === preview.roomId);
  if (!room) return null;

  if (preview.kind === "rect") {
    const color =
      preview.mode === "marquee" ? "var(--canvas-selection)" : (TOOL_COLOR[tool] ?? "var(--canvas-ok)");
    // 部屋の範囲にクリップ
    const x0 = Math.max(0, preview.x);
    const y0 = Math.max(0, preview.y);
    const x1 = Math.min(room.width, preview.x + preview.w);
    const y1 = Math.min(room.height, preview.y + preview.h);
    if (x1 <= x0 || y1 <= y0) return null;
    return (
      <g transform={`translate(${room.position.x} ${room.position.y})`} data-testid="rect-preview">
        <CellMark x={x0} y={y0} w={x1 - x0} h={y1 - y0} color={color} dashed />
        <SizeTag x={(x0 + x1) / 2} y={y0} text={`${x1 - x0} × ${y1 - y0}`} />
      </g>
    );
  }
  if (preview.kind === "moveSeats") {
    const ids = new Set(preview.ids);
    return (
      <g transform={`translate(${room.position.x} ${room.position.y})`} className="sk-ghost">
        {room.seats
          .filter((s) => ids.has(s.id))
          .map((s) => (
            <g key={s.id}>
              <SeatGlyph x={s.x} y={s.y} facing={s.facing} label={s.label} dimmed />
              <SeatGlyph
                x={s.x + preview.dx}
                y={s.y + preview.dy}
                facing={s.facing}
                label={s.label}
                ghost
                invalid={!preview.valid}
                selected={preview.valid}
              />
            </g>
          ))}
      </g>
    );
  }
  // リサイズ
  const shrink = preview.loss > 0;
  const color = shrink ? "var(--canvas-violation)" : "var(--canvas-selection)";
  return (
    <g className="sk-ghost" data-testid="resize-preview">
      <rect
        className="sk-px2 sk-marching"
        x={preview.x}
        y={preview.y}
        width={preview.w}
        height={preview.h}
        rx={0.1}
        fill={color}
        fillOpacity={0.08}
        stroke={color}
      />
      <SizeTag
        x={preview.x + preview.w / 2}
        y={preview.y - ROOM_HEADER}
        text={`${preview.w} × ${preview.h}${shrink ? ` · ${t("canvas.willRemove", { count: preview.loss })}` : ""}`}
        danger={shrink}
      />
    </g>
  );
}

/** 画面上で一定サイズのサイズガイド（ピル） */
function SizeTag({ x, y, text, danger }: { x: number; y: number; text: string; danger?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} className="sk-ghost">
      <text
        y={-0.15}
        textAnchor="middle"
        className="sk-far-label"
        style={{ fontSize: "calc(var(--sk-u) * 12px)" }}
        fill={danger ? "var(--canvas-violation)" : "var(--canvas-selection)"}
      >
        {text}
      </text>
    </g>
  );
}

export function PlacementPreview() {
  const placement = useEditor((s) => s.placement);
  const hover = useEditor((s) => s.hover);
  const rooms = useRooms();
  if (!placement || !hover) return null;
  if (placement.kind === "room") {
    const r = placement.room;
    const x = hover.cellX - Math.floor(r.width / 2);
    const y = hover.cellY - Math.floor(r.height / 2);
    return (
      <g className="sk-ghost" opacity={0.75} data-testid="placement-preview">
        <rect
          className="sk-px2 sk-marching"
          x={x}
          y={y - ROOM_HEADER}
          width={r.width}
          height={r.height + ROOM_HEADER}
          rx={0.2}
          fill={r.color}
          fillOpacity={0.15}
          stroke={r.color}
        />
        {r.seats.map((s) => (
          <SeatGlyph key={s.id} x={x + s.x} y={y + s.y} facing={s.facing} ghost />
        ))}
      </g>
    );
  }
  const room = roomAt(rooms, hover.wx, hover.wy);
  const cells = placementCells(placement.items, hover.cellX, hover.cellY);
  return (
    <g data-testid="placement-preview">
      {cells.map((c, i) => {
        const ok =
          !!room &&
          canPlaceSeat(room, c.wx - room.position.x, c.wy - room.position.y) &&
          cellAt(room, c.wx - room.position.x, c.wy - room.position.y) === "floor";
        return (
          <SeatGlyph key={i} x={c.wx} y={c.wy} facing={c.facing} ghost invalid={!ok} />
        );
      })}
    </g>
  );
}
