/** ミニマップ: 全部屋の縮図と現在の表示範囲。クリック / ドラッグでその位置へ移動 */
import { memo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ID, Room } from "@/domain/schema";
import { cn } from "@/lib/utils";
import { useViewState } from "./context";
import { roomsBounds } from "./geometry";
import { visibleBounds, type ViewportController } from "./viewport";

export interface MinimapProps {
  rooms: Room[];
  viewport: ViewportController;
  selectedRoomIds?: readonly ID[];
  className?: string;
  width?: number;
  height?: number;
}

export function Minimap({
  rooms,
  viewport,
  selectedRoomIds,
  className,
  width = 192,
  height = 120,
}: MinimapProps) {
  const { t } = useTranslation("rooms");
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const view = useViewState(viewport, (s) => s);
  const vb = visibleBounds(view);
  const rb = roomsBounds(rooms) ?? vb;
  const pad = Math.max(2, Math.max(rb.width, rb.height) * 0.08);
  const b = {
    x: rb.x - pad,
    y: rb.y - pad,
    width: rb.width + pad * 2,
    height: rb.height + pad * 2,
  };
  const px = Math.max(b.width / width, b.height / height);

  const go = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    viewport.centerOn(p.x, p.y, !dragging.current);
  };

  return (
    <div
      className={cn(
        "bg-popover/85 overflow-hidden rounded-lg border shadow-lg backdrop-blur",
        className,
      )}
      style={{ width, height }}
      data-testid="minimap"
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`${b.x} ${b.y} ${b.width} ${b.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="block cursor-pointer touch-none"
        role="img"
        aria-label={t("canvas.minimap")}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          go(e.clientX, e.clientY);
          dragging.current = true;
        }}
        onPointerMove={(e) => dragging.current && go(e.clientX, e.clientY)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <MiniRooms rooms={rooms} selected={selectedRoomIds} px={px} />
        <rect
          x={vb.x}
          y={vb.y}
          width={vb.width}
          height={vb.height}
          fill="var(--canvas-selection)"
          fillOpacity={0.1}
          stroke="var(--canvas-selection)"
          strokeWidth={px * 1.5}
          rx={px * 2}
        />
      </svg>
    </div>
  );
}

const MiniRooms = memo(function MiniRooms({
  rooms,
  selected,
  px,
}: {
  rooms: Room[];
  selected?: readonly ID[];
  px: number;
}) {
  return (
    <g>
      {rooms.map((r) => (
        <rect
          key={r.id}
          x={r.position.x}
          y={r.position.y}
          width={r.width}
          height={r.height}
          rx={px * 2}
          fill={r.color}
          fillOpacity={selected?.includes(r.id) ? 0.85 : 0.5}
          stroke={selected?.includes(r.id) ? "var(--canvas-selection)" : "var(--canvas-wall)"}
          strokeWidth={px}
        />
      ))}
    </g>
  );
});
