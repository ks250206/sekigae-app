/** 部屋エディタの一時状態（Undo・永続化の対象外） */
import { create } from "zustand";
import type { Facing, ID, Room } from "@/domain/schema";
import type { NumberingOrder, ResizeHandle } from "./lib/editing";
import type { PlacementItem } from "./lib/templates";

export type ToolId =
  | "select"
  | "floor"
  | "void"
  | "obstacle"
  | "seat"
  | "entrance"
  | "eraser"
  | "pan";

export const PAINT_TOOLS = ["floor", "void", "obstacle", "eraser"] as const;
export type PaintTool = (typeof PAINT_TOOLS)[number];
export const isPaintTool = (t: ToolId): t is PaintTool =>
  (PAINT_TOOLS as readonly string[]).includes(t);

/** カーソルに追従して配置するもの（貼り付け・テンプレート・部屋の複製） */
export type Placement =
  | { kind: "seats"; items: PlacementItem[]; source: "paste" | "template" }
  | { kind: "room"; room: Room };

export type Clipboard = { kind: "seats"; items: PlacementItem[] } | { kind: "room"; room: Room };

export interface Hover {
  /** ワールド座標 */
  wx: number;
  wy: number;
  cellX: number;
  cellY: number;
  roomId?: ID;
  /** 部屋ローカルのセル */
  x?: number;
  y?: number;
  seatId?: ID;
  entranceId?: ID;
  /** 入口ツール: 最寄りの外周辺 */
  edge?: { x: number; y: number; side: Facing };
}

export type DragPreview =
  | {
      kind: "rect";
      roomId: ID;
      x: number;
      y: number;
      w: number;
      h: number;
      mode: "paint" | "marquee";
    }
  | { kind: "moveSeats"; roomId: ID; ids: ID[]; dx: number; dy: number; valid: boolean }
  | {
      kind: "resize";
      roomId: ID;
      handle: ResizeHandle;
      x: number;
      y: number;
      w: number;
      h: number;
      loss: number;
    };

export interface EditorState {
  tool: ToolId;
  /** 新しい席の向き（R で回転） */
  facing: Facing;
  numbering: NumberingOrder;
  hover: Hover | null;
  preview: DragPreview | null;
  placement: Placement | null;
  clipboard: Clipboard | null;
  /** ヒートマップに奥行き順位を表示 */
  showRanks: boolean;
  /** インライン名前変更中の部屋 */
  renamingRoomId: ID | null;
  setTool: (tool: ToolId) => void;
  setFacing: (f: Facing) => void;
  setNumbering: (o: NumberingOrder) => void;
  setHover: (h: Hover | null) => void;
  setPreview: (p: DragPreview | null) => void;
  setPlacement: (p: Placement | null) => void;
  setClipboard: (c: Clipboard | null) => void;
  setShowRanks: (v: boolean) => void;
  setRenamingRoomId: (id: ID | null) => void;
}

const sameHover = (a: Hover | null, b: Hover | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.cellX === b.cellX &&
    a.cellY === b.cellY &&
    a.roomId === b.roomId &&
    a.seatId === b.seatId &&
    a.entranceId === b.entranceId &&
    a.edge?.x === b.edge?.x &&
    a.edge?.y === b.edge?.y &&
    a.edge?.side === b.edge?.side);

export const useEditor = create<EditorState>()((set) => ({
  tool: "select",
  facing: "n",
  numbering: "row",
  hover: null,
  preview: null,
  placement: null,
  clipboard: null,
  showRanks: false,
  renamingRoomId: null,
  setTool: (tool) => set({ tool, placement: null, preview: null }),
  setFacing: (facing) => set({ facing }),
  setNumbering: (numbering) => set({ numbering }),
  setHover: (hover) => set((s) => (sameHover(s.hover, hover) ? s : { hover })),
  setPreview: (preview) => set({ preview }),
  setPlacement: (placement) => set({ placement }),
  setClipboard: (clipboard) => set({ clipboard }),
  setShowRanks: (showRanks) => set({ showRanks }),
  setRenamingRoomId: (renamingRoomId) => set({ renamingRoomId }),
}));
