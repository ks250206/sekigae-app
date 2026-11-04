/** 部屋エディタの純関数（React 非依存） */
import { computeRoomDepth } from "@/domain/geometry/depth";
import { cellAt, DIRS, inBounds, isPerimeterSide } from "@/domain/geometry/room";
import type { Entrance, Facing, ID, Project, Room, Seat } from "@/domain/schema";
import { MAX_ROOM_SIZE } from "@/domain/schema";

export interface Pt {
  x: number;
  y: number;
}

/** 2 点間のセルを Bresenham で列挙（両端を含む） */
export function bresenham(x0: number, y0: number, x1: number, y1: number): Pt[] {
  const out: Pt[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/** 2 隅で指定される矩形内のセル */
export function rectCells(a: Pt, b: Pt): Pt[] {
  const out: Pt[] = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++)
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) out.push({ x, y });
  return out;
}

export const normRect = (a: Pt, b: Pt) => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x) + 1,
  h: Math.abs(a.y - b.y) + 1,
});

/** ワールド座標の点を含む部屋（上に描かれている = 後ろの要素を優先） */
export function roomAt(rooms: Room[], wx: number, wy: number): Room | undefined {
  for (let i = rooms.length - 1; i >= 0; i--) {
    const r = rooms[i]!;
    if (r.hidden) continue;
    if (
      wx >= r.position.x &&
      wy >= r.position.y &&
      wx < r.position.x + r.width &&
      wy < r.position.y + r.height
    )
      return r;
  }
  return undefined;
}

export const toLocal = (room: Room, wx: number, wy: number) => ({
  x: wx - room.position.x,
  y: wy - room.position.y,
});

// ---------------------------------------------------------------------------
// 席の向き・採番
// ---------------------------------------------------------------------------

const ORDER: Facing[] = ["n", "e", "s", "w"];
export const rotateFacing = (f: Facing, steps = 1): Facing =>
  ORDER[(((ORDER.indexOf(f) + steps) % 4) + 4) % 4]!;

/** 部屋名から席ラベルの接頭辞を作る。「居室A」→「A」、「Room 2」→「2」、「セミナー室」→「セ」 */
export function roomPrefix(name: string): string {
  const trimmed = name.trim();
  const tail = /([A-Za-z0-9]+)$/.exec(trimmed);
  if (tail) return tail[1]!.toUpperCase().slice(0, 3);
  const head = /^[A-Za-z]/.exec(trimmed);
  if (head) return head[0].toUpperCase();
  return Array.from(trimmed)[0] ?? "S";
}

export const formatLabel = (prefix: string, n: number) => `${prefix}-${String(n).padStart(2, "0")}`;

/** 既存ラベルと重複しない次の連番ラベル */
export function nextSeatLabels(room: Room, count: number): string[] {
  const prefix = roomPrefix(room.name);
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  let max = 0;
  const used = new Set<string>();
  for (const s of room.seats) {
    used.add(s.label);
    const m = re.exec(s.label);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const out: string[] = [];
  let n = max;
  while (out.length < count) {
    n++;
    const l = formatLabel(prefix, n);
    if (!used.has(l)) out.push(l);
  }
  return out;
}

export type NumberingOrder = "row" | "column" | "entrance";

/** 席を並べ替えて採番し直す。席 ID → 新ラベル */
export function numberSeats(room: Room, order: NumberingOrder, prefix = roomPrefix(room.name)) {
  const seats = [...room.seats];
  if (order === "row") seats.sort((a, b) => a.y - b.y || a.x - b.x);
  else if (order === "column") seats.sort((a, b) => a.x - b.x || a.y - b.y);
  else {
    const d = computeRoomDepth(room);
    seats.sort(
      (a, b) =>
        (d.seats.get(a.id)?.dist ?? 0) - (d.seats.get(b.id)?.dist ?? 0) || a.y - b.y || a.x - b.x,
    );
  }
  return new Map(seats.map((s, i) => [s.id, formatLabel(prefix, i + 1)]));
}

/** プロジェクト全体で重複しているラベル */
export function duplicateLabels(rooms: Room[]): Set<string> {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const r of rooms)
    for (const s of r.seats) {
      if (!s.label) continue;
      if (seen.has(s.label)) dup.add(s.label);
      seen.add(s.label);
    }
  return dup;
}

// ---------------------------------------------------------------------------
// 配置・衝突
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const HEADER_ROWS = 1;

export const roomBox = (r: Pick<Room, "position" | "width" | "height">): Rect => ({
  x: r.position.x,
  y: r.position.y - HEADER_ROWS,
  w: r.width,
  h: r.height + HEADER_ROWS,
});

export const rectsOverlap = (a: Rect, b: Rect, margin = 0) =>
  a.x < b.x + b.w + margin &&
  b.x < a.x + a.w + margin &&
  a.y < b.y + b.h + margin &&
  b.y < a.y + a.h + margin;

/** 他の部屋と重なっている部屋 ID（非表示の部屋は除く） */
export function overlappingRoomIds(rooms: Room[]): Set<ID> {
  const out = new Set<ID>();
  const vis = rooms.filter((r) => !r.hidden);
  for (let i = 0; i < vis.length; i++)
    for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i]!;
      const b = vis[j]!;
      if (rectsOverlap(roomBox(a), roomBox(b))) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  return out;
}

/** w×h の部屋を既存の部屋と重ならない位置に置く（右方向 → 下の段の順に探す） */
export function findFreeSpot(rooms: Room[], w: number, h: number, gap = 2): Pt {
  const boxes = rooms.filter((r) => !r.hidden).map(roomBox);
  if (!boxes.length) return { x: 0, y: 0 };
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y)) + HEADER_ROWS;
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const fits = (x: number, y: number) =>
    !boxes.some((b) => rectsOverlap({ x, y: y - HEADER_ROWS, w, h: h + HEADER_ROWS }, b, gap));
  for (let row = 0; row < 60; row++) {
    const y = minY + row;
    for (let x = minX; x <= maxX + gap; x++) if (fits(x, y)) return { x, y };
  }
  return { x: maxX + gap, y: minY };
}

/** セルに席を置けるか（床・席なし） */
export function canPlaceSeat(room: Room, x: number, y: number, ignore?: ReadonlySet<ID>): boolean {
  if (!inBounds(room, x, y) || cellAt(room, x, y) !== "floor") return false;
  return !room.seats.some((s) => s.x === x && s.y === y && !ignore?.has(s.id));
}

/** 選択席を (dx, dy) 動かせるか */
export function canMoveSeats(room: Room, ids: ReadonlySet<ID>, dx: number, dy: number): boolean {
  return room.seats
    .filter((s) => ids.has(s.id))
    .every((s) => canPlaceSeat(room, s.x + dx, s.y + dy, ids));
}

/** 点 (lx, ly)（部屋ローカル実数座標）に最も近い外周の辺 */
export function nearestPerimeterEdge(
  room: Room,
  lx: number,
  ly: number,
  maxDist = 0.6,
): { x: number; y: number; side: Facing } | null {
  const cx = Math.floor(lx);
  const cy = Math.floor(ly);
  let best: { x: number; y: number; side: Facing; d: number } | null = null;
  for (let y = cy - 1; y <= cy + 1; y++)
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (!inBounds(room, x, y) || cellAt(room, x, y) === "void") continue;
      for (const side of ORDER) {
        if (!isPerimeterSide(room, x, y, side)) continue;
        // 辺の中心からの距離（辺に沿った方向は辺の長さ内でクランプ）
        const d = DIRS[side];
        const ex = x + 0.5 + d.dx * 0.5;
        const ey = y + 0.5 + d.dy * 0.5;
        const along =
          d.dx === 0 ? Math.max(0, Math.abs(lx - ex) - 0.5) : Math.max(0, Math.abs(ly - ey) - 0.5);
        const across = d.dx === 0 ? Math.abs(ly - ey) : Math.abs(lx - ex);
        const dist = Math.hypot(along, across);
        if (dist <= maxDist && (!best || dist < best.d)) best = { x, y, side, d: dist };
      }
    }
  return best && { x: best.x, y: best.y, side: best.side };
}

export const entranceAt = (room: Room, e: { x: number; y: number; side: Facing }) =>
  room.entrances.find((x) => x.x === e.x && x.y === e.y && x.side === e.side);

/** リサイズで失われる席・入口 */
export function resizeLoss(
  room: Room,
  width: number,
  height: number,
  offset: { dx: number; dy: number },
): { seats: Seat[]; entrances: Entrance[] } {
  const out = (p: { x: number; y: number }) => {
    const x = p.x + offset.dx;
    const y = p.y + offset.dy;
    return x < 0 || y < 0 || x >= width || y >= height;
  };
  return { seats: room.seats.filter(out), entrances: room.entrances.filter(out) };
}

export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

/** ハンドルのドラッグ量から新しい矩形（ワールド座標）。サイズは 1..MAX_ROOM_SIZE */
export function resizeRect(room: Room, handle: ResizeHandle, dx: number, dy: number): Rect {
  let x0 = room.position.x;
  let y0 = room.position.y;
  let x1 = x0 + room.width;
  let y1 = y0 + room.height;
  if (handle.includes("w")) x0 = Math.min(x1 - 1, Math.max(x1 - MAX_ROOM_SIZE, x0 + dx));
  if (handle.includes("e")) x1 = Math.max(x0 + 1, Math.min(x0 + MAX_ROOM_SIZE, x1 + dx));
  if (handle.includes("n")) y0 = Math.min(y1 - 1, Math.max(y1 - MAX_ROOM_SIZE, y0 + dy));
  if (handle.includes("s")) y1 = Math.max(y0 + 1, Math.min(y0 + MAX_ROOM_SIZE, y1 + dy));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** いずれかの配置案で割り当てられている席の数 */
export function assignedSeatCount(project: Project, seatIds: Iterable<ID>): number {
  const ids = new Set(seatIds);
  const assigned = new Set<ID>();
  for (const p of project.plans)
    for (const sid of Object.keys(p.assignment)) if (ids.has(sid)) assigned.add(sid);
  return assigned.size;
}
