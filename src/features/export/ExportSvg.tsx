/**
 * 出力プレビュー用の軽量 SVG（ライト配色固定）。サムネイル・印刷・PNG で共用。issue #129, #136
 */
import { forwardRef, useId } from "react";
import {
  cellRuns,
  ENTRANCE_COLOR,
  FLOOR_FILL,
  OBSTACLE_FILL,
  wallSegments,
  WALL_COLOR,
  type ExportModel,
  type ExportRoom,
} from "./model";
import { fitFont, nameLines } from "./text";

export type SvgDetail = "thumb" | "full";

const FONT = `"Yu Gothic", "Hiragino Sans", Meiryo, Arial, system-ui, sans-serif`;

const EDGE: Record<string, (x: number, y: number, u: number) => [number, number, number, number]> =
  {
    n: (x, y, u) => [x * u, y * u, (x + 1) * u, y * u],
    s: (x, y, u) => [x * u, (y + 1) * u, (x + 1) * u, (y + 1) * u],
    w: (x, y, u) => [x * u, y * u, x * u, (y + 1) * u],
    e: (x, y, u) => [(x + 1) * u, y * u, (x + 1) * u, (y + 1) * u],
  };

function RoomShapes({
  room,
  u,
  detail,
  hatchId,
}: {
  room: ExportRoom;
  u: number;
  detail: SvgDetail;
  hatchId: string;
}) {
  const walls = wallSegments(room)
    .map((s) => `M${s.x1 * u} ${s.y1 * u}L${s.x2 * u} ${s.y2 * u}`)
    .join("");
  const pad = u * 0.06;
  const size = u - pad * 2;
  return (
    <g>
      {cellRuns(room, (c) => c.kind !== "void").map((r) => (
        <rect
          key={`f${r.x},${r.y}`}
          x={r.x * u}
          y={r.y * u}
          width={r.w * u}
          height={r.h * u}
          fill={FLOOR_FILL}
        />
      ))}
      {cellRuns(room, (c) => c.kind === "obstacle").map((r) => (
        <rect
          key={`o${r.x},${r.y}`}
          x={r.x * u}
          y={r.y * u}
          width={r.w * u}
          height={r.h * u}
          fill={`url(#${hatchId})`}
          stroke={OBSTACLE_FILL}
        />
      ))}
      <path d={walls} stroke={WALL_COLOR} strokeWidth={Math.max(1.5, u * 0.08)} fill="none" />
      {room.entrances.map((e) => {
        const [x1, y1, x2, y2] = EDGE[e.side]!(e.x, e.y, u);
        return (
          <line
            key={e.id}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={ENTRANCE_COLOR}
            strokeWidth={Math.max(3, u * 0.16)}
          />
        );
      })}
      {room.seats.map((s) => {
        const x = s.x * u + pad;
        const y = s.y * u + pad;
        const m = s.member;
        let text: React.ReactNode = null;
        if (m && detail === "thumb") {
          const fs = fitFont(m.short, size, size * 0.6, u * 0.42, 1);
          text = (
            <text x={x + size / 2} y={y + size / 2} fontSize={fs} dominantBaseline="central">
              {m.short}
            </text>
          );
        } else if (m) {
          const nl = nameLines(m.name, size, m.subtitle ? size * 0.62 : size, u * 0.3, 4);
          const sub = m.subtitle
            ? Math.min(nl.fontSize * 0.8, fitFont(m.subtitle, size, size * 0.3, u * 0.2, 3))
            : 0;
          const total = nl.lines.length * nl.fontSize * 1.15 + (sub ? sub * 1.2 : 0);
          const top = y + size / 2 - total / 2;
          const lineH = nl.fontSize * 1.15;
          const lastY = top + nl.lines.length * lineH;
          text = (
            <text x={x + size / 2} fontSize={nl.fontSize}>
              {nl.lines.map((line, i) => (
                <tspan
                  key={i}
                  x={x + size / 2}
                  y={top + (i + 1) * lineH - nl.fontSize * 0.25}
                  fontWeight={700}
                >
                  {line}
                </tspan>
              ))}
              {sub ? (
                <tspan x={x + size / 2} y={lastY + sub * 1.05} fontSize={sub}>
                  {m.subtitle}
                </tspan>
              ) : null}
            </text>
          );
        } else if (detail === "full") {
          text = (
            <text
              x={x + size / 2}
              y={y + size / 2}
              fontSize={fitFont(s.label, size, size * 0.4, u * 0.2, 3)}
              dominantBaseline="central"
            >
              {s.label}
            </text>
          );
        }
        return (
          <g key={s.id} fill={s.text} textAnchor="middle" data-seat={s.id}>
            <rect
              x={x}
              y={y}
              width={size}
              height={size}
              rx={u * 0.1}
              fill={s.fill}
              stroke={m ? "#475569" : "#94a3b8"}
              strokeDasharray={m ? undefined : `${u * 0.06} ${u * 0.06}`}
              strokeWidth={Math.max(0.75, u * 0.02)}
            />
            {text}
          </g>
        );
      })}
    </g>
  );
}

function Hatch({ id, u }: { id: string; u: number }) {
  const s = Math.max(4, u / 4);
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={s}
      height={s}
      patternTransform="rotate(45)"
    >
      <rect width={s} height={s} fill="#e5e7eb" />
      <line x1={0} y1={0} x2={0} y2={s} stroke={OBSTACLE_FILL} strokeWidth={s / 3} />
    </pattern>
  );
}

/** 1 部屋のサムネイル / 詳細図 */
export const RoomSvg = forwardRef<
  SVGSVGElement,
  { room: ExportRoom; detail?: SvgDetail; className?: string; title?: string }
>(function RoomSvg({ room, detail = "thumb", className, title }, ref) {
  const id = useId().replace(/:/g, "");
  const u = detail === "full" ? 72 : 24;
  const m = u * 0.3;
  return (
    <svg
      ref={ref}
      viewBox={`${-m} ${-m} ${room.width * u + m * 2} ${room.height * u + m * 2}`}
      className={className}
      role="img"
      aria-label={title ?? room.name}
      fontFamily={FONT}
    >
      <defs>
        <Hatch id={`h${id}`} u={u} />
      </defs>
      <RoomShapes room={room} u={u} detail={detail} hatchId={`h${id}`} />
    </svg>
  );
});

/** 選択部屋をフロア上の実位置に並べた図（PNG 出力用）。見出しと凡例付き */
export const FloorSvg = forwardRef<SVGSVGElement, { model: ExportModel; className?: string }>(
  function FloorSvg({ model, className }, ref) {
    const id = useId().replace(/:/g, "");
    const u = 72;
    const pad = u * 0.5;
    const header = u * 1.2;
    const labelH = u * 0.5;
    const legendH = model.legend.length ? u * 0.9 : 0;
    const w = Math.max(model.floor.width * u, u * 6) + pad * 2;
    const h = header + labelH + model.floor.height * u + legendH + pad * 2;
    const legendItemW = u * 1.8;
    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${w} ${h}`}
        className={className}
        role="img"
        aria-label={model.projectName}
        fontFamily={FONT}
      >
        <defs>
          <Hatch id={`h${id}`} u={u} />
        </defs>
        <rect width={w} height={h} fill="#ffffff" />
        <text x={pad} y={pad + u * 0.45} fontSize={u * 0.45} fontWeight={700} fill="#0f172a">
          {model.projectName}
        </text>
        <text x={pad} y={pad + u * 0.95} fontSize={u * 0.24} fill="#64748b">
          {[model.strings.plan, model.strings.createdOn].join("  ·  ")}
        </text>
        <g transform={`translate(${pad} ${pad + header + labelH})`}>
          {model.rooms.map((r) => (
            <g key={r.id} transform={`translate(${r.floorX * u} ${r.floorY * u})`}>
              <text y={-u * 0.15} fontSize={u * 0.24} fontWeight={700} fill="#0f172a">
                {`${r.name} (${r.summary})`}
              </text>
              <RoomShapes room={r} u={u} detail="full" hatchId={`h${id}`} />
            </g>
          ))}
        </g>
        {model.legend.length > 0 && (
          <g transform={`translate(${pad} ${h - pad - legendH * 0.6})`}>
            {model.legend.map((l, i) => (
              <g
                key={l.label}
                transform={`translate(${(i % Math.max(1, Math.floor((w - pad * 2) / legendItemW))) * legendItemW} ${Math.floor(i / Math.max(1, Math.floor((w - pad * 2) / legendItemW))) * u * 0.4})`}
              >
                <rect width={u * 0.3} height={u * 0.3} rx={u * 0.05} fill={l.fill} />
                <text x={u * 0.4} y={u * 0.22} fontSize={u * 0.22} fill="#0f172a">
                  {l.label}
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>
    );
  },
);
