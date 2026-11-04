/**
 * 奥行き (depth): 入口から通路（席のない floor セル）を BFS した距離。docs/DESIGN.md §3.2
 * 席セルは通過不可。席の距離 = 隣接する通路セルの最小距離 + 1。
 */
import type { ID, Room } from "../schema";
import { cellAt, DIRS, inBounds } from "./room";

export interface SeatDepth {
  /** 入口からの距離（ステップ数） */
  dist: number;
  /** 部屋内で 0（入口側）..1（最奥）に正規化 */
  norm: number;
  /** 0 = 最も入口に近い（同距離は同順位） */
  rank: number;
  /** 通路で到達できず推定値を使った */
  estimated: boolean;
}

export interface RoomDepth {
  seats: Map<ID, SeatDepth>;
  /** セルごとの距離（row-major、到達不能は -1）。ヒートマップ用 */
  cells: Int32Array;
  maxDist: number;
  hasEntrance: boolean;
}

export function computeRoomDepth(room: Room): RoomDepth {
  const { width: w, height: h } = room;
  const dist = new Int32Array(w * h).fill(-1);
  const seatCells = new Set(room.seats.map((s) => s.y * w + s.x));
  const walkable = (x: number, y: number) =>
    inBounds(room, x, y) && cellAt(room, x, y) === "floor" && !seatCells.has(y * w + x);

  const queue: number[] = [];
  for (const e of room.entrances) {
    if (!inBounds(room, e.x, e.y)) continue;
    const i = e.y * w + e.x;
    if (dist[i] === -1) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi]!;
    const x = i % w;
    const y = (i - x) / w;
    // 入口セル自体が席の場合も、そこから展開する
    if (!walkable(x, y) && dist[i] !== 0) continue;
    for (const d of Object.values(DIRS)) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (!inBounds(room, nx, ny)) continue;
      const ni = ny * w + nx;
      if (dist[ni] !== -1) continue;
      if (seatCells.has(ni) && cellAt(room, nx, ny) === "floor") {
        dist[ni] = dist[i]! + 1; // 席には入れるが、そこからは展開しない
        continue;
      }
      if (!walkable(nx, ny)) continue;
      dist[ni] = dist[i]! + 1;
      queue.push(ni);
    }
  }

  const hasEntrance = room.entrances.length > 0;
  const raw = new Map<ID, { dist: number; estimated: boolean }>();
  for (const s of room.seats) {
    const d = dist[s.y * w + s.x]!;
    if (d >= 0) raw.set(s.id, { dist: d, estimated: false });
    else {
      // フォールバック: 最寄り入口へのマンハッタン距離（入口なしなら上端からの距離）
      const est = hasEntrance
        ? Math.min(...room.entrances.map((e) => Math.abs(e.x - s.x) + Math.abs(e.y - s.y))) + 1
        : s.y + 1;
      raw.set(s.id, { dist: est, estimated: true });
    }
  }

  const values = [...raw.values()].map((v) => v.dist);
  const minD = values.length ? Math.min(...values) : 0;
  const maxD = values.length ? Math.max(...values) : 0;
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  const seats = new Map<ID, SeatDepth>();
  for (const [id, v] of raw) {
    seats.set(id, {
      dist: v.dist,
      norm: maxD === minD ? 0.5 : (v.dist - minD) / (maxD - minD),
      rank: distinct.indexOf(v.dist),
      estimated: v.estimated,
    });
  }
  let maxDist = 0;
  for (const d of dist) if (d > maxDist) maxDist = d;
  return { seats, cells: dist, maxDist, hasEntrance };
}
