/**
 * 入口（ドア）。セル (x, y) の side 辺に、壁の切り欠き + 扉 + 開き方向の円弧を描く。
 * 部屋ローカル座標。基準形は side = "n"（セル上辺）で、他の向きは回転させる。
 */
import { memo } from "react";
import type { Facing } from "@/domain/schema";
import { useLod } from "./context";
import { FACING_ANGLE } from "./geometry";

export interface DoorGlyphProps {
  x: number;
  y: number;
  side: Facing;
  selected?: boolean;
  /** プレビュー表示 */
  ghost?: boolean;
  invalid?: boolean;
  /** 消しゴム等で削除対象 */
  danger?: boolean;
  entranceId?: string;
}

export const DoorGlyph = memo(function DoorGlyph({
  x,
  y,
  side,
  selected,
  ghost,
  invalid,
  danger,
  entranceId,
}: DoorGlyphProps) {
  const lod = useLod();
  const color = invalid || danger ? "var(--canvas-violation)" : "var(--canvas-door)";
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${FACING_ANGLE[side]} 0.5 0.5)`}
      opacity={ghost ? 0.75 : 1}
      data-entrance-id={entranceId}
      className={ghost ? "sk-ghost" : undefined}
    >
      {selected && (
        <rect
          x={0}
          y={-0.3}
          width={1}
          height={1.15}
          rx={0.14}
          fill="var(--canvas-selection)"
          fillOpacity={0.15}
          stroke="var(--canvas-selection)"
          className="sk-px2"
        />
      )}
      {/* 壁の切り欠き */}
      <line x1={0.08} y1={0} x2={0.92} y2={0} stroke="var(--canvas-floor)" strokeWidth={0.2} />
      {/* 外側の玄関マット */}
      <rect x={0.14} y={-0.24} width={0.72} height={0.16} rx={0.04} fill={color} opacity={0.35} />
      {lod !== "far" && (
        <>
          {/* 開閉範囲 */}
          <path d="M0.12 0L0.88 0A0.76 0.76 0 0 1 0.12 0.76Z" fill={color} fillOpacity={0.12} />
          <path
            d="M0.88 0A0.76 0.76 0 0 1 0.12 0.76"
            fill="none"
            stroke={color}
            strokeWidth={0.03}
            strokeDasharray="0.06 0.05"
          />
        </>
      )}
      {/* 扉 */}
      <rect x={0.08} y={0} width={0.08} height={0.76} rx={0.02} fill={color} />
      {/* 枠（側柱） */}
      <rect x={0.02} y={-0.08} width={0.1} height={0.16} fill="var(--canvas-wall)" />
      <rect x={0.88} y={-0.08} width={0.1} height={0.16} fill="var(--canvas-wall)" />
      {danger && (
        <path
          d="M0.35 0.25L0.65 0.55M0.65 0.25L0.35 0.55"
          stroke="var(--canvas-violation)"
          strokeWidth={0.06}
          strokeLinecap="round"
        />
      )}
    </g>
  );
});
