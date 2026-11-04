import { memo } from "react";
import { DEF } from "./defs";

/** パターン・グラデーション定義。FloorCanvas が 1 度だけ描画する */
export const CanvasDefs = memo(function CanvasDefs() {
  return (
    <defs>
      {/* 床: 2×2 セルのタイルカーペット（控えめな市松 + 目地） */}
      <pattern id={DEF.floor} width={2} height={2} patternUnits="userSpaceOnUse">
        <rect width={2} height={2} fill="var(--canvas-floor)" />
        <rect width={1} height={1} fill="var(--canvas-floor-pattern)" opacity={0.55} />
        <rect x={1} y={1} width={1} height={1} fill="var(--canvas-floor-pattern)" opacity={0.55} />
        <path
          d="M0 0H2M0 1H2M0 0V2M1 0V2"
          stroke="var(--canvas-floor-pattern)"
          strokeWidth={0.025}
          fill="none"
        />
      </pattern>
      {/* 障害物: 斜線ハッチ */}
      <pattern
        id={DEF.hatch}
        width={0.25}
        height={0.25}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width={0.25} height={0.25} fill="var(--canvas-obstacle)" />
        <line x1={0} y1={0} x2={0} y2={0.25} stroke="var(--sk-hatch)" strokeWidth={0.07} />
      </pattern>
      {/* 部屋の範囲内の void（L 字の欠け）: 薄い斜線 */}
      <pattern
        id={DEF.void}
        width={0.4}
        height={0.4}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(-45)"
      >
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={0.4}
          stroke="var(--canvas-grid)"
          strokeWidth={0.05}
          opacity={0.9}
        />
      </pattern>
    </defs>
  );
});
