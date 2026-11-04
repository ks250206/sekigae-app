import type { ID, Room } from "../schema";

/** 同じ部屋内の席の隣接マップ（4 近傍 / 8 近傍） */
export function computeAdjacency(rooms: Room[], mode: 4 | 8): Map<ID, Set<ID>> {
  const adj = new Map<ID, Set<ID>>();
  for (const room of rooms) {
    const byPos = new Map<string, ID>();
    for (const s of room.seats) byPos.set(`${s.x},${s.y}`, s.id);
    for (const s of room.seats) {
      const set = new Set<ID>();
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (mode === 4 && dx !== 0 && dy !== 0) continue;
          const n = byPos.get(`${s.x + dx},${s.y + dy}`);
          if (n) set.add(n);
        }
      adj.set(s.id, set);
    }
  }
  return adj;
}
