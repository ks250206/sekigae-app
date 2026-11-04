/** 席テンプレート（島型・壁沿い・教室型）と部屋テンプレート（小・中・大） */
import type { CellKind, Entrance, Facing, Seat } from "@/domain/schema";
import { rotateFacing } from "./editing";

export interface PlacementItem {
  dx: number;
  dy: number;
  facing: Facing;
  label?: string;
  tags?: string[];
}

export type SeatTemplateId = "island2x2" | "island2x3" | "island2x4" | "wallRow" | "classroom";

/** 向かい合う 2 列 × n 席の島 */
function island(n: number): PlacementItem[] {
  const out: PlacementItem[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ dx: i, dy: 0, facing: "s" });
    out.push({ dx: i, dy: 1, facing: "n" });
  }
  return out;
}

export const SEAT_TEMPLATES: { id: SeatTemplateId; items: PlacementItem[] }[] = [
  { id: "island2x2", items: island(2) },
  { id: "island2x3", items: island(3) },
  { id: "island2x4", items: island(4) },
  {
    id: "wallRow",
    items: Array.from({ length: 6 }, (_, i) => ({ dx: i, dy: 0, facing: "n" as const })),
  },
  {
    id: "classroom",
    items: [0, 2, 4].flatMap((dy) =>
      Array.from({ length: 5 }, (_, i) => ({ dx: i, dy, facing: "n" as const })),
    ),
  },
];

export const itemsSize = (items: { dx: number; dy: number }[]) => ({
  w: items.length ? Math.max(...items.map((i) => i.dx)) + 1 : 0,
  h: items.length ? Math.max(...items.map((i) => i.dy)) + 1 : 0,
});

/** 配置アイテムを時計回りに 90°×steps 回転し、左上を (0,0) に正規化 */
export function rotateItems<T extends PlacementItem>(items: T[], steps = 1): T[] {
  let cur = items;
  const n = (((steps % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  for (let k = 0; k < n; k++) {
    const { h } = itemsSize(cur);
    cur = cur.map((it) => ({ ...it, dx: h - 1 - it.dy, dy: it.dx, facing: rotateFacing(it.facing) }));
  }
  return cur;
}

/** 選択席からクリップボード用の相対配置を作る */
export function itemsFromSeats(seats: Seat[]): PlacementItem[] {
  if (!seats.length) return [];
  const minX = Math.min(...seats.map((s) => s.x));
  const minY = Math.min(...seats.map((s) => s.y));
  return seats.map((s) => ({
    dx: s.x - minX,
    dy: s.y - minY,
    facing: s.facing,
    label: s.label,
    tags: [...s.tags],
  }));
}

/** 配置の中心セル（カーソル位置に中心を合わせる） */
export const itemsAnchor = (items: PlacementItem[]) => {
  const { w, h } = itemsSize(items);
  return { x: Math.floor((w - 1) / 2), y: Math.floor((h - 1) / 2) };
};

// ---------------------------------------------------------------------------
// 部屋テンプレート
// ---------------------------------------------------------------------------

export type RoomTemplateId = "empty" | "small" | "medium" | "large";

export interface RoomTemplate {
  id: RoomTemplateId;
  width: number;
  height: number;
  seats: Omit<Seat, "id" | "label" | "tags">[];
  entrances: Omit<Entrance, "id">[];
  cells?: CellKind[];
}

const place = (items: PlacementItem[], ox: number, oy: number) =>
  items.map((i) => ({ x: ox + i.dx, y: oy + i.dy, facing: i.facing }));

function withObstacles(w: number, h: number, obstacles: { x: number; y: number }[]): CellKind[] {
  const cells: CellKind[] = Array.from({ length: w * h }, () => "floor");
  for (const o of obstacles) cells[o.y * w + o.x] = "obstacle";
  return cells;
}

export const ROOM_TEMPLATES: RoomTemplate[] = [
  { id: "empty", width: 8, height: 6, seats: [], entrances: [{ x: 0, y: 5, side: "s" }] },
  {
    id: "small",
    width: 6,
    height: 5,
    seats: [...place(island(2), 2, 1)],
    entrances: [{ x: 0, y: 4, side: "s" }],
  },
  {
    id: "medium",
    width: 9,
    height: 6,
    seats: [...place(island(3), 1, 1), ...place(island(3), 5, 1)],
    entrances: [{ x: 0, y: 5, side: "s" }],
  },
  {
    id: "large",
    width: 13,
    height: 8,
    seats: [
      ...place(island(3), 1, 1),
      ...place(island(3), 5, 1),
      ...place(island(3), 9, 1),
      ...place(island(3), 1, 4),
      ...place(island(3), 5, 4),
    ],
    entrances: [
      { x: 0, y: 7, side: "s" },
      { x: 12, y: 7, side: "e" },
    ],
    cells: withObstacles(13, 8, [
      { x: 10, y: 4 },
      { x: 11, y: 4 },
      { x: 10, y: 5 },
      { x: 11, y: 5 },
    ]),
  },
];
