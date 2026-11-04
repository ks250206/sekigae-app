/**
 * キャンバスのビューポート（パン / ズーム）。React 非依存の小さなストア。
 * 座標系: ワールド座標 = セル単位（1 = 1 セル）。scale = 1 セルあたりの画面 px。
 */

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewState {
  /** 画面左上に来るワールド座標（セル単位） */
  x: number;
  y: number;
  /** 1 セルあたりの px */
  scale: number;
  /** コンテナの px サイズ */
  width: number;
  height: number;
}

/** 100% 表示のときの 1 セルの px */
export const BASE_SCALE = 32;
export const MIN_SCALE = 6;
export const MAX_SCALE = 128;

export const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function screenToWorld(v: ViewState, sx: number, sy: number) {
  return { x: v.x + sx / v.scale, y: v.y + sy / v.scale };
}

export function worldToScreen(v: ViewState, wx: number, wy: number) {
  return { x: (wx - v.x) * v.scale, y: (wy - v.y) * v.scale };
}

/** 画面上の点 (sx, sy) を固定してズーム */
export function zoomAt(v: ViewState, nextScale: number, sx: number, sy: number): ViewState {
  const scale = clampScale(nextScale);
  const w = screenToWorld(v, sx, sy);
  return { ...v, scale, x: w.x - sx / scale, y: w.y - sy / scale };
}

/** bounds 全体が収まるように合わせる（padding は px） */
export function fitBounds(v: ViewState, b: Bounds, padding = 48, maxScale = 64): ViewState {
  const aw = Math.max(1, v.width - padding * 2);
  const ah = Math.max(1, v.height - padding * 2);
  const scale = clampScale(
    Math.min(maxScale, aw / Math.max(1, b.width), ah / Math.max(1, b.height)),
  );
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  return { ...v, scale, x: cx - v.width / 2 / scale, y: cy - v.height / 2 / scale };
}

export function visibleBounds(v: ViewState): Bounds {
  return { x: v.x, y: v.y, width: v.width / v.scale, height: v.height / v.scale };
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (!list.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of list) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width);
    y1 = Math.max(y1, b.y + b.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export type Lod = "far" | "mid" | "near";
/** ズーム（px / セル）に応じた詳細度 */
export const lodFor = (scale: number): Lod => (scale < 14 ? "far" : scale < 30 ? "mid" : "near");

// ---------------------------------------------------------------------------
// コントローラ
// ---------------------------------------------------------------------------

export interface ViewportController {
  getState: () => ViewState;
  subscribe: (fn: () => void) => () => void;
  set: (next: ViewState | ((v: ViewState) => ViewState)) => void;
  /** 画面中心（または anchor の画面座標）を固定して倍率を掛ける */
  zoomBy: (factor: number, anchor?: { x: number; y: number }) => void;
  zoomTo: (scale: number, anchor?: { x: number; y: number }) => void;
  panBy: (dxPx: number, dyPx: number) => void;
  /** ワールド座標を画面中心に */
  centerOn: (wx: number, wy: number, animate?: boolean) => void;
  fit: (b: Bounds | null, opts?: { animate?: boolean; padding?: number }) => void;
  /** 100% に戻す（中心を維持） */
  reset: () => void;
  /** クライアント座標 → ワールド座標（要素未接続なら null） */
  clientToWorld: (clientX: number, clientY: number) => { x: number; y: number } | null;
  /** FloorCanvas が自身の要素を登録する */
  attach: (el: HTMLElement | null) => void;
  readonly element: HTMLElement | null;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createViewport(init?: Partial<ViewState>): ViewportController {
  let state: ViewState = { x: -2, y: -2, scale: BASE_SCALE, width: 800, height: 600, ...init };
  let el: HTMLElement | null = null;
  let anim = 0;
  const subs = new Set<() => void>();

  const emit = () => subs.forEach((f) => f());
  const set: ViewportController["set"] = (next) => {
    const v = typeof next === "function" ? next(state) : next;
    if (
      v.x === state.x &&
      v.y === state.y &&
      v.scale === state.scale &&
      v.width === state.width &&
      v.height === state.height
    )
      return;
    state = v;
    emit();
  };
  const stopAnim = () => {
    if (anim) cancelAnimationFrame(anim);
    anim = 0;
  };
  const animateTo = (target: ViewState, animate: boolean) => {
    stopAnim();
    if (!animate || prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      set(target);
      return;
    }
    const from = state;
    const t0 = performance.now();
    const dur = 260;
    // 対数補間でズームを自然に
    const ls0 = Math.log(from.scale);
    const ls1 = Math.log(target.scale);
    const c0 = {
      x: from.x + from.width / 2 / from.scale,
      y: from.y + from.height / 2 / from.scale,
    };
    const c1 = {
      x: target.x + target.width / 2 / target.scale,
      y: target.y + target.height / 2 / target.scale,
    };
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - (1 - k) ** 3;
      const scale = Math.exp(ls0 + (ls1 - ls0) * e);
      const cx = c0.x + (c1.x - c0.x) * e;
      const cy = c0.y + (c1.y - c0.y) * e;
      set({
        ...state,
        scale,
        x: cx - state.width / 2 / scale,
        y: cy - state.height / 2 / scale,
      });
      anim = k < 1 ? requestAnimationFrame(step) : 0;
    };
    anim = requestAnimationFrame(step);
  };
  const center = () => ({ x: state.width / 2, y: state.height / 2 });

  return {
    getState: () => state,
    subscribe: (fn) => {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    set: (next) => {
      stopAnim();
      set(next);
    },
    zoomBy: (factor, anchor) => {
      stopAnim();
      const a = anchor ?? center();
      set(zoomAt(state, state.scale * factor, a.x, a.y));
    },
    zoomTo: (scale, anchor) => {
      const a = anchor ?? center();
      animateTo(zoomAt(state, scale, a.x, a.y), !anchor);
    },
    panBy: (dx, dy) => {
      stopAnim();
      set({ ...state, x: state.x - dx / state.scale, y: state.y - dy / state.scale });
    },
    centerOn: (wx, wy, animate = false) =>
      animateTo(
        { ...state, x: wx - state.width / 2 / state.scale, y: wy - state.height / 2 / state.scale },
        animate,
      ),
    fit: (b, opts) => {
      if (!b) return;
      animateTo(fitBounds(state, b, opts?.padding), opts?.animate ?? true);
    },
    reset: () => {
      const c = center();
      animateTo(zoomAt(state, BASE_SCALE, c.x, c.y), true);
    },
    clientToWorld: (cx, cy) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return screenToWorld(state, cx - r.left, cy - r.top);
    },
    attach: (e) => {
      el = e;
    },
    get element() {
      return el;
    },
  };
}
