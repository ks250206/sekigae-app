/**
 * フロアキャンバス共通部品（部屋エディタ・席配置画面・昨年度モードで共用）。
 *
 * 使い方:
 * ```tsx
 * const viewport = useViewport();
 * <FloorCanvas
 *   viewport={viewport}
 *   initialFit={roomsBounds(rooms)}
 *   readOnly                      // 編集しない画面では左ドラッグでパン
 *   overlay={<DepthHeatmapOverlay rooms={rooms} />}
 *   chrome={<ZoomControls viewport={viewport} onFitAll={...} />}
 *   onPointerDown={(e) => e.cellX / e.cellY / e.x / e.y / e.native}
 * >
 *   {rooms.map((r) => (
 *     <RoomShape key={r.id} room={r} renderSeat={(seat, state) => <SeatGlyph ... />} />
 *   ))}
 * </FloorCanvas>
 * ```
 *
 * - FloorCanvas: 無限グリッド・パン/ズーム・レイヤー（underlay / children / overlay / chrome）。
 *   ポインタイベントはワールド座標（セル単位）付きで渡す。ズームに応じた LOD を context で配る。
 * - RoomShape: 床・壁・障害物・入口・席・名前タブ。seatStates / seatAccents / renderSeat で席の見た目を差し替え。
 *   名前タブは `data-room-header={roomId}`、席は `data-seat-id`、入口は `data-entrance-id` を持つ。
 * - SeatGlyph: 机 + 椅子（facing で回転）。occupied / locked / violation / selected / highlighted / dimmed。
 *   children で上にチップ等を重ねられる（セル左上原点、回転しない）。
 * - DoorGlyph: 入口（外周の辺に扉 + 開き方向の円弧）。
 * - Minimap / ZoomControls: 同じ viewport コントローラを渡す。
 * - DepthHeatmapOverlay / HeatmapLegend: 奥行きヒートマップと凡例。
 * - CSS 変数 --sk-u（= 1 / scale）を使うと、ズームに依らない画面 px 単位の線幅・文字サイズが書ける。
 */
export { FloorCanvas, type CanvasPointerEvent, type FloorCanvasProps } from "./FloorCanvas";
export { RoomShape, type RoomShapeProps } from "./RoomShape";
export { SeatGlyph, type SeatGlyphProps, type SeatVisualState } from "./SeatGlyph";
export { DoorGlyph, type DoorGlyphProps } from "./DoorGlyph";
export { Minimap, type MinimapProps } from "./Minimap";
export { ZoomControls, type ZoomControlsProps } from "./ZoomControls";
export {
  DepthHeatmapOverlay,
  HeatmapLegend,
  type DepthHeatmapOverlayProps,
} from "./DepthHeatmapOverlay";
export { CanvasDefs, DEF, defUrl } from "./CanvasDefs";
export {
  useCanvasViewport,
  useLod,
  useLodOf,
  useViewport,
  useViewState,
  LodContext,
  ViewportContext,
} from "./context";
export {
  DESK_CENTER,
  FACING_ANGLE,
  ROOM_HEADER,
  cellsPath,
  fitText,
  floorPath,
  roomBounds,
  roomRect,
  roomsBounds,
  textWidth,
  wallPath,
} from "./geometry";
export {
  BASE_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  createViewport,
  fitBounds,
  lodFor,
  screenToWorld,
  unionBounds,
  visibleBounds,
  worldToScreen,
  zoomAt,
  type Bounds,
  type Lod,
  type ViewState,
  type ViewportController,
} from "./viewport";
