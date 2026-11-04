import { createContext, useContext, useState, useSyncExternalStore } from "react";
import {
  createViewport,
  lodFor,
  type Lod,
  type ViewportController,
  type ViewState,
} from "./viewport";

export const ViewportContext = createContext<ViewportController | null>(null);
export const LodContext = createContext<Lod>("mid");

/** FloorCanvas 配下で現在のビューポートを得る */
export function useCanvasViewport(): ViewportController {
  const v = useContext(ViewportContext);
  if (!v) throw new Error("useCanvasViewport must be used inside <FloorCanvas>");
  return v;
}

/** 現在の詳細度（far / mid / near）。閾値をまたいだときだけ再描画される */
export const useLod = () => useContext(LodContext);

/** ビューポートコントローラを 1 つ作る（FloorCanvas / Minimap / ZoomControls で共有） */
export function useViewport(init?: Partial<ViewState>): ViewportController {
  const [v] = useState(() => createViewport(init));
  return v;
}

/** ビューポート状態の購読（selector の戻り値が変わったときだけ再描画） */
export function useViewState<T>(v: ViewportController, selector: (s: ViewState) => T): T {
  return useSyncExternalStore(
    v.subscribe,
    () => selector(v.getState()),
    () => selector(v.getState()),
  );
}

export const useLodOf = (v: ViewportController) => useViewState(v, (s) => lodFor(s.scale));
