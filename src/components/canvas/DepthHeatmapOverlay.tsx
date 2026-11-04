/**
 * 奥行きヒートマップ。入口からの通路距離（roomDepth）をセルごとに色で示す。
 * 部屋・入口・席が変わると値が変わり、fill のトランジションで滑らかに再計算が見える。
 */
import { motion } from "motion/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { Room } from "@/domain/schema";
import { heatColor } from "@/graphics/palette";
import { cn } from "@/lib/utils";
import { roomDepth } from "@/store/selectors";

export interface DepthHeatmapOverlayProps {
  rooms: Room[];
  /** 席に奥行き順位（1 = 入口に最も近い）を表示 */
  showRank?: boolean;
  /** 塗りの不透明度 (0..1) */
  opacity?: number;
}

export function DepthHeatmapOverlay({ rooms, showRank, opacity = 0.5 }: DepthHeatmapOverlayProps) {
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      pointerEvents="none"
      data-testid="depth-heatmap"
    >
      {rooms.map((r) => (
        <HeatRoom key={r.id} room={r} showRank={showRank} opacity={opacity} />
      ))}
    </motion.g>
  );
}

const HeatRoom = memo(function HeatRoom({
  room,
  showRank,
  opacity,
}: {
  room: Room;
  showRank?: boolean;
  opacity: number;
}) {
  const depth = roomDepth(room);
  if (!depth.hasEntrance) return null;
  const max = Math.max(1, depth.maxDist);
  const cells: { i: number; x: number; y: number; d: number }[] = [];
  depth.cells.forEach((d, i) => {
    if (d < 0) return;
    cells.push({ i, x: i % room.width, y: Math.floor(i / room.width), d });
  });
  return (
    <g transform={`translate(${room.position.x} ${room.position.y})`}>
      {cells.map((c) => (
        <rect
          key={c.i}
          className="sk-heat-cell"
          x={c.x}
          y={c.y}
          width={1}
          height={1}
          fill={heatColor(c.d / max)}
          fillOpacity={opacity}
        />
      ))}
      {showRank &&
        room.seats.map((s) => {
          const sd = depth.seats.get(s.id);
          if (!sd) return null;
          return (
            <g key={s.id} transform={`translate(${s.x + 0.5} ${s.y + 0.5})`}>
              <circle
                r={0.24}
                fill={heatColor(sd.norm)}
                stroke="var(--canvas-floor)"
                strokeWidth={0.04}
                strokeDasharray={sd.estimated ? "0.06 0.05" : undefined}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={0.24}
                fontWeight={700}
                fill="white"
              >
                {sd.estimated ? "?" : sd.rank + 1}
              </text>
            </g>
          );
        })}
    </g>
  );
});

/** ヒートマップの凡例（HTML） */
export function HeatmapLegend({ className }: { className?: string }) {
  const { t } = useTranslation("rooms");
  const stops = [0, 0.25, 0.5, 0.75, 1].map((v) => `${heatColor(v)} ${v * 100}%`).join(",");
  return (
    <div
      className={cn(
        "bg-popover/90 text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-md backdrop-blur",
        className,
      )}
      data-testid="heatmap-legend"
    >
      <div className="mb-1 font-medium">{t("canvas.heatmap.title")}</div>
      <div className="h-2 w-40 rounded-full" style={{ background: `linear-gradient(90deg,${stops})` }} />
      <div className="text-muted-foreground mt-1 flex justify-between">
        <span>{t("canvas.heatmap.near")}</span>
        <span>{t("canvas.heatmap.far")}</span>
      </div>
    </div>
  );
}
