/**
 * ルールエディタ用の小さな部屋図（自前の SVG）。席のクリック・範囲選択、奥行きヒートマップ表示。
 */
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ID, Room } from "@/domain/schema";
import { heatColor } from "@/graphics/palette";
import { cn } from "@/lib/utils";
import { roomDepth } from "@/store/selectors";

export interface MiniRoomMapProps {
  rooms: readonly Room[];
  /** 選択中の席 */
  selected?: ReadonlySet<ID>;
  /** プレビュー（該当席）のハイライト */
  highlight?: ReadonlySet<ID>;
  /** 奥行きヒートマップで塗る */
  heat?: boolean;
  mode?: "multi" | "single" | "view";
  onChange?: (ids: ID[]) => void;
  color?: string;
  className?: string;
  /** 表示上の最大高さ（px） */
  maxHeight?: number;
}

const PAD = 0.6;

export function MiniRoomMap({
  rooms,
  selected = new Set(),
  highlight,
  heat,
  mode = "view",
  onChange,
  color = "#0ea5e9",
  className,
  maxHeight = 240,
}: MiniRoomMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );
  const dragStart = useRef<{ x: number; y: number; additive: boolean; moved: boolean } | null>(
    null,
  );

  const box = useMemo(() => {
    if (!rooms.length) return { x: 0, y: 0, w: 1, h: 1 };
    const xs = rooms.flatMap((r) => [r.position.x, r.position.x + r.width]);
    const ys = rooms.flatMap((r) => [r.position.y - 1, r.position.y + r.height]);
    const x = Math.min(...xs) - PAD;
    const y = Math.min(...ys) - PAD;
    return { x, y, w: Math.max(...xs) - x + PAD, h: Math.max(...ys) - y + PAD };
  }, [rooms]);

  const seatCenters = useMemo(
    () =>
      rooms.flatMap((r) =>
        r.seats.map((s) => ({
          id: s.id,
          cx: r.position.x + s.x + 0.5,
          cy: r.position.y + s.y + 0.5,
        })),
      ),
    [rooms],
  );

  const toSvg = (e: PointerEvent) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM?.();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  };

  const toggle = (id: ID) => {
    if (!onChange) return;
    if (mode === "single") return onChange([id]);
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (mode !== "multi" || e.button !== 0) return;
    const p = toSvg(e);
    if (!p) return;
    dragStart.current = { ...p, additive: e.shiftKey || e.metaKey || e.ctrlKey, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const s = dragStart.current;
    if (!s) return;
    const p = toSvg(e);
    if (!p) return;
    if (!s.moved && Math.hypot(p.x - s.x, p.y - s.y) < 0.3) return;
    s.moved = true;
    setMarquee({ x0: s.x, y0: s.y, x1: p.x, y1: p.y });
  };
  const onPointerUp = () => {
    const s = dragStart.current;
    dragStart.current = null;
    if (!s?.moved || !marquee) return setMarquee(null);
    const [x0, x1] = [Math.min(marquee.x0, marquee.x1), Math.max(marquee.x0, marquee.x1)];
    const [y0, y1] = [Math.min(marquee.y0, marquee.y1), Math.max(marquee.y0, marquee.y1)];
    const hit = seatCenters
      .filter((c) => c.cx >= x0 && c.cx <= x1 && c.cy >= y0 && c.cy <= y1)
      .map((c) => c.id);
    setMarquee(null);
    if (!hit.length || !onChange) return;
    onChange(s.additive ? [...new Set([...selected, ...hit])] : [...new Set(hit)]);
  };

  const onSeatKey = (e: KeyboardEvent, id: ID) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(id);
    }
  };

  const interactive = mode !== "view";
  return (
    <svg
      ref={svgRef}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      className={cn("bg-muted/40 w-full touch-none rounded-lg border select-none", className)}
      style={{ maxHeight, aspectRatio: `${box.w} / ${box.h}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role={interactive ? "group" : "img"}
      data-testid="mini-room-map"
    >
      {rooms.map((r) => {
        const depth = heat ? roomDepth(r) : null;
        return (
          <g key={r.id} transform={`translate(${r.position.x} ${r.position.y})`}>
            <text
              x={0}
              y={-0.25}
              fontSize={0.7}
              className="fill-muted-foreground"
              style={{ fontWeight: 600 }}
            >
              {r.name}
            </text>
            {r.cells.map((c, i) =>
              c === "void" ? null : (
                <rect
                  key={i}
                  x={i % r.width}
                  y={Math.floor(i / r.width)}
                  width={1.02}
                  height={1.02}
                  className={c === "obstacle" ? "fill-muted-foreground/40" : "fill-card"}
                />
              ),
            )}
            <rect
              x={0}
              y={0}
              width={r.width}
              height={r.height}
              fill="none"
              stroke={r.color}
              strokeWidth={0.08}
              rx={0.2}
            />
            {r.entrances.map((e) => (
              <rect
                key={e.id}
                x={e.x + (e.side === "e" ? 0.85 : 0.15)}
                y={e.y + (e.side === "s" ? 0.85 : 0.15)}
                width={e.side === "n" || e.side === "s" ? 0.7 : 0.15}
                height={e.side === "n" || e.side === "s" ? 0.15 : 0.7}
                className="fill-foreground/60"
              />
            ))}
            {r.seats.map((s) => {
              const sel = selected.has(s.id);
              const hl = highlight?.has(s.id);
              const d = depth?.seats.get(s.id);
              const fill = sel
                ? color
                : heat && d
                  ? heatColor(d.norm)
                  : hl
                    ? color
                    : "var(--background)";
              return (
                <rect
                  key={s.id}
                  data-seat-id={s.id}
                  data-testid={`mini-seat-${s.id}`}
                  data-selected={sel || undefined}
                  data-highlight={hl || undefined}
                  x={s.x + 0.12}
                  y={s.y + 0.12}
                  width={0.76}
                  height={0.76}
                  rx={0.16}
                  style={{
                    fill,
                    fillOpacity: sel ? 1 : heat ? (hl === false ? 0.35 : 0.9) : hl ? 0.45 : 1,
                    stroke: sel ? "var(--foreground)" : hl ? color : "var(--muted-foreground)",
                    strokeOpacity: sel || hl ? 1 : 0.45,
                    strokeWidth: sel ? 0.1 : 0.06,
                  }}
                  tabIndex={interactive ? 0 : undefined}
                  role={interactive ? (mode === "single" ? "radio" : "checkbox") : undefined}
                  aria-checked={interactive ? sel : undefined}
                  aria-label={`${r.name} ${s.label}`}
                  className={cn(
                    interactive && "cursor-pointer outline-none focus-visible:stroke-[var(--ring)]",
                  )}
                  onClick={(e) => {
                    if (!interactive) return;
                    e.stopPropagation();
                    toggle(s.id);
                  }}
                  onKeyDown={(e) => onSeatKey(e, s.id)}
                >
                  <title>{`${r.name} ${s.label}`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}
      {marquee && (
        <rect
          x={Math.min(marquee.x0, marquee.x1)}
          y={Math.min(marquee.y0, marquee.y1)}
          width={Math.abs(marquee.x1 - marquee.x0)}
          height={Math.abs(marquee.y1 - marquee.y0)}
          fill={color}
          fillOpacity={0.12}
          stroke={color}
          strokeWidth={0.06}
          strokeDasharray="0.2 0.15"
        />
      )}
    </svg>
  );
}
