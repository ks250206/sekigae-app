import type { CellKind, Facing, Room } from "../schema";

export const DIRS: Record<Facing, { dx: number; dy: number }> = {
  n: { dx: 0, dy: -1 },
  e: { dx: 1, dy: 0 },
  s: { dx: 0, dy: 1 },
  w: { dx: -1, dy: 0 },
};

export const inBounds = (room: Pick<Room, "width" | "height">, x: number, y: number) =>
  x >= 0 && y >= 0 && x < room.width && y < room.height;

export const cellIndex = (room: Pick<Room, "width">, x: number, y: number) => y * room.width + x;

export function cellAt(room: Room, x: number, y: number): CellKind {
  if (!inBounds(room, x, y)) return "void";
  return room.cells[cellIndex(room, x, y)] ?? "void";
}

/** そのセルの辺が部屋の外周（外 or void に接する）か */
export function isPerimeterSide(room: Room, x: number, y: number, side: Facing): boolean {
  if (cellAt(room, x, y) === "void") return false;
  const d = DIRS[side];
  return cellAt(room, x + d.dx, y + d.dy) === "void";
}

export function seatAt(room: Room, x: number, y: number) {
  return room.seats.find((s) => s.x === x && s.y === y);
}

/** 部屋の幅・高さを変更（左/上方向は offset で内部座標をシフト）。範囲外の席・入口は除外 */
export function resizeRoom(
  room: Room,
  width: number,
  height: number,
  offset: { dx: number; dy: number } = { dx: 0, dy: 0 },
): Room {
  const cells: CellKind[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const ox = x - offset.dx;
      const oy = y - offset.dy;
      cells.push(inBounds(room, ox, oy) ? cellAt(room, ox, oy) : "floor");
    }
  const shift = <T extends { x: number; y: number }>(p: T): T => ({
    ...p,
    x: p.x + offset.dx,
    y: p.y + offset.dy,
  });
  const inside = (p: { x: number; y: number }) =>
    p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  return {
    ...room,
    width,
    height,
    position: { x: room.position.x - offset.dx, y: room.position.y - offset.dy },
    cells,
    seats: room.seats.map(shift).filter(inside),
    entrances: room.entrances.map(shift).filter(inside),
  };
}
