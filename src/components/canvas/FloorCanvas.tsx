/**
 * 無限グリッドのフロアキャンバス（SVG）。ワールド座標 = セル単位。
 *
 * レイヤー構造（下から）:
 *   grid → underlay → children（部屋レイヤー）→ overlay（ヒートマップ・プレビュー等）
 *   + chrome（HTML。ツールパレット・ミニマップ・ズーム操作など、キャンバス上に重ねる）
 *
 * パン: スペース+ドラッグ / 中ボタンドラッグ / panMode 時の左ドラッグ / 2 本指
 * ズーム: ホイール（カーソル位置基準）/ トラックパッドのピンチ（ctrl+wheel）/ タッチのピンチ
 * それ以外のポインタ操作はワールド座標付きで onPointerDown/Move/Up に渡す（ツールの処理は利用側）。
 */
import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { cn } from "@/lib/utils";
import { isEditableTarget } from "@/lib/keyboard";
import { CanvasDefs } from "./CanvasDefs";
import { LodContext, useViewState, ViewportContext } from "./context";
import { lodFor, type Bounds, type ViewportController, type ViewState } from "./viewport";
import "./canvas.css";

export interface CanvasPointerEvent<E = ReactPointerEvent<SVGSVGElement>> {
  /** ワールド座標（セル単位の実数） */
  x: number;
  y: number;
  /** その点を含むセル（整数） */
  cellX: number;
  cellY: number;
  native: E;
}

export interface FloorCanvasProps {
  viewport: ViewportController;
  /** 部屋レイヤー（ワールド座標で描く） */
  children?: ReactNode;
  /** 部屋の下に描く */
  underlay?: ReactNode;
  /** 部屋の上に描く（ヒートマップ・ホバー・選択枠など） */
  overlay?: ReactNode;
  /** キャンバスに重ねる HTML（absolute 配置） */
  chrome?: ReactNode;
  showGrid?: boolean;
  /** 編集不可。左ドラッグでパンする（クリック系のコールバックは届く） */
  readOnly?: boolean;
  /** 左ドラッグでパン（手のひらツール） */
  panMode?: boolean;
  /** 通常時のカーソル */
  cursor?: string;
  /** 初回サイズ確定時にこの範囲へフィット */
  initialFit?: Bounds | null;
  onPointerDown?: (e: CanvasPointerEvent) => void;
  onPointerMove?: (e: CanvasPointerEvent) => void;
  onPointerUp?: (e: CanvasPointerEvent) => void;
  onPointerLeave?: () => void;
  onDoubleClick?: (e: CanvasPointerEvent<ReactMouseEvent<SVGSVGElement>>) => void;
  className?: string;
  "aria-label"?: string;
  "data-testid"?: string;
}

const isTrackpadPan = (e: WheelEvent) => {
  if (e.ctrlKey || e.metaKey) return false; // ピンチ（ctrl+wheel）はズーム
  if (e.deltaMode !== 0) return false; // 行単位 = マウスホイール
  if (e.deltaX !== 0) return true;
  // マウスホイールは大きい整数ステップになりがち
  return !(Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
};

export function FloorCanvas({
  viewport,
  children,
  underlay,
  overlay,
  chrome,
  showGrid = true,
  readOnly = false,
  panMode = false,
  cursor,
  initialFit,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onDoubleClick,
  className,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: FloorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const view = useViewState(viewport, (s) => s);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const hoverRef = useRef(false);
  const fittedRef = useRef(false);
  // 初回だけ使う
  const [firstFit] = useState(initialFit);

  // ポインタ状態（再描画不要なので ref）
  const pan = useRef<{ id: number; x: number; y: number; moved: boolean; pending: boolean } | null>(
    null,
  );
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mx: number; my: number } | null>(null);

  // コンテナサイズ追従
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    viewport.attach(el);
    const apply = () => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      viewport.set((v) => {
        // サイズ変更時は中心を維持
        const cx = v.x + v.width / 2 / v.scale;
        const cy = v.y + v.height / 2 / v.scale;
        return {
          ...v,
          width: r.width,
          height: r.height,
          x: cx - r.width / 2 / v.scale,
          y: cy - r.height / 2 / v.scale,
        };
      });
      if (!fittedRef.current) {
        fittedRef.current = true;
        if (firstFit) viewport.fit(firstFit, { animate: false });
      }
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      viewport.attach(null);
    };
  }, [viewport, firstFit]);

  // ホイール（passive: false が必要なので addEventListener）
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const anchor = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (isTrackpadPan(e)) {
        viewport.panBy(-e.deltaX, -e.deltaY);
        return;
      }
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018));
      viewport.zoomBy(factor, anchor);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [viewport]);

  // スペース押下でパン
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key !== " " || e.repeat || isEditableTarget(e.target)) return;
      const t = e.target as HTMLElement | null;
      const onCanvas = hoverRef.current || (t && containerRef.current?.contains(t));
      if (!onCanvas && t && t !== document.body) return;
      e.preventDefault();
      setSpaceHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const toEvent = <E extends ReactMouseEvent<SVGSVGElement>>(e: E): CanvasPointerEvent<E> => {
    const r = e.currentTarget.getBoundingClientRect();
    const v = viewport.getState();
    const x = v.x + (e.clientX - r.left) / v.scale;
    const y = v.y + (e.clientY - r.top) / v.scale;
    return { x, y, cellX: Math.floor(x), cellY: Math.floor(y), native: e };
  };

  const handleDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch") {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        const [a, b] = [...touches.current.values()] as [
          { x: number; y: number },
          { x: number; y: number },
        ];
        pinch.current = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          mx: (a.x + b.x) / 2,
          my: (a.y + b.y) / 2,
        };
        pan.current = null;
        return;
      }
    }
    const wantsPan = e.button === 1 || (e.button === 0 && (spaceHeld || panMode));
    if (wantsPan || (readOnly && e.button === 0)) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      pan.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        moved: false,
        pending: !wantsPan,
      };
      if (wantsPan) setPanning(true);
      if (!wantsPan) onPointerDown?.(toEvent(e));
      return;
    }
    if (e.button !== 0) return;
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    onPointerDown?.(toEvent(e));
  };

  const handleMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch" && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current && touches.current.size === 2) {
        const [a, b] = [...touches.current.values()] as [
          { x: number; y: number },
          { x: number; y: number },
        ];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const r = e.currentTarget.getBoundingClientRect();
        viewport.panBy(mx - pinch.current.mx, my - pinch.current.my);
        viewport.zoomBy(dist / (pinch.current.dist || dist), { x: mx - r.left, y: my - r.top });
        pinch.current = { dist, mx, my };
        return;
      }
    }
    const p = pan.current;
    if (p && p.id === e.pointerId) {
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (p.pending && Math.hypot(dx, dy) < 4) return;
      if (p.pending) {
        p.pending = false;
        setPanning(true);
      }
      p.moved = true;
      viewport.panBy(dx, dy);
      p.x = e.clientX;
      p.y = e.clientY;
      return;
    }
    onPointerMove?.(toEvent(e));
  };

  const handleUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    const p = pan.current;
    if (p && p.id === e.pointerId) {
      pan.current = null;
      setPanning(false);
      // 読み取り専用でドラッグしなかった = クリック
      if (p.pending && !p.moved) onPointerUp?.(toEvent(e));
      return;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    onPointerUp?.(toEvent(e));
  };

  const lod = lodFor(view.scale);
  const vw = view.width / view.scale;
  const vh = view.height / view.scale;
  const effectiveCursor = panning
    ? "grabbing"
    : spaceHeld || panMode
      ? "grab"
      : (cursor ?? "default");

  return (
    <div
      ref={containerRef}
      className={cn("sk-canvas relative size-full overflow-hidden", className)}
      data-lod={lod}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`${view.x} ${view.y} ${vw} ${vh}`}
        preserveAspectRatio="xMinYMin meet"
        role="application"
        aria-label={ariaLabel}
        aria-roledescription="canvas"
        tabIndex={0}
        data-testid={testId}
        style={{ cursor: effectiveCursor, ["--sk-u" as string]: 1 / view.scale }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onPointerEnter={() => (hoverRef.current = true)}
        onPointerLeave={() => {
          hoverRef.current = false;
          onPointerLeave?.();
        }}
        onDoubleClick={onDoubleClick ? (e) => onDoubleClick(toEvent(e)) : undefined}
        onContextMenu={(e) => e.button === 1 && e.preventDefault()}
      >
        <CanvasDefs />
        {showGrid && <Grid view={view} />}
        <ViewportContext.Provider value={viewport}>
          <LodContext.Provider value={lod}>
            {underlay && <g data-layer="underlay">{underlay}</g>}
            <g data-layer="rooms">{children}</g>
            {overlay && <g data-layer="overlay">{overlay}</g>}
          </LodContext.Provider>
        </ViewportContext.Provider>
      </svg>
      {chrome && (
        <ViewportContext.Provider value={viewport}>
          <LodContext.Provider value={lod}>{chrome}</LodContext.Provider>
        </ViewportContext.Provider>
      )}
    </div>
  );
}

/** 無限グリッド（表示範囲だけ塗るパターン）。1 セルの細線 + 5 セルごとの太線 */
const Grid = memo(function Grid({ view }: { view: ViewState }) {
  const id = useId().replace(/:/g, "");
  const px = 1 / view.scale;
  const minor = view.scale >= 12;
  const x = Math.floor(view.x / 5) * 5 - 5;
  const y = Math.floor(view.y / 5) * 5 - 5;
  const w = view.width / view.scale + 10;
  const h = view.height / view.scale + 10;
  return (
    <g aria-hidden pointerEvents="none">
      <defs>
        <pattern id={`${id}-g`} width={5} height={5} patternUnits="userSpaceOnUse">
          {minor && (
            <path
              d="M1 0V5M2 0V5M3 0V5M4 0V5M0 1H5M0 2H5M0 3H5M0 4H5"
              stroke="var(--canvas-grid)"
              strokeWidth={px}
              opacity={Math.min(1, (view.scale - 12) / 10) * 0.7}
              fill="none"
            />
          )}
          <path d="M0 0V5M0 0H5" stroke="var(--canvas-grid)" strokeWidth={px * 1.4} fill="none" />
        </pattern>
      </defs>
      <rect x={x} y={y} width={w} height={h} fill={`url(#${id}-g)`} />
    </g>
  );
});
