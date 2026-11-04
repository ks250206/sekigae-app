import { createRoom } from "@/domain/factory";
import { resizeRoom as resizeRoomGeom } from "@/domain/geometry/room";
import type { CellKind, Entrance, ID, Room, Seat } from "@/domain/schema";
import { newId } from "@/lib/id";
import { clone, type Get, type Update } from "./types";

export interface LayoutSlice {
  addRoom: (init: Partial<Room> & { name: string }) => ID;
  updateRoom: (
    roomId: ID,
    patch: Partial<Omit<Room, "id" | "seats" | "entrances" | "cells">>,
  ) => void;
  removeRoom: (roomId: ID) => void;
  duplicateRoom: (roomId: ID, name: string, position?: { x: number; y: number }) => ID | null;
  reorderRooms: (orderedIds: ID[]) => void;
  moveRoom: (roomId: ID, position: { x: number; y: number }) => void;
  resizeRoom: (
    roomId: ID,
    width: number,
    height: number,
    offset?: { dx: number; dy: number },
  ) => void;
  paintCells: (roomId: ID, cells: { x: number; y: number }[], kind: CellKind) => void;
  addSeats: (roomId: ID, seats: (Partial<Seat> & { x: number; y: number })[]) => ID[];
  updateSeats: (roomId: ID, seatIds: ID[], patch: Partial<Omit<Seat, "id">>) => void;
  /** 席の位置を移動（同じ部屋内）。衝突チェックは呼び出し側 */
  moveSeats: (roomId: ID, moves: { id: ID; x: number; y: number }[]) => void;
  removeSeats: (roomId: ID, seatIds: ID[]) => void;
  addEntrance: (roomId: ID, e: Omit<Entrance, "id">) => ID;
  removeEntrances: (roomId: ID, ids: ID[]) => void;
}

export function createLayoutSlice(update: Update, _get: Get): LayoutSlice {
  const withRoom = (roomId: ID, fn: (r: Room) => void) =>
    update((d) => {
      const r = d.layout.rooms.find((x) => x.id === roomId);
      if (r) fn(r as Room);
    });

  /** 削除された席の割当・ロックを全配置案から除去 */
  const cleanupSeats = (
    d: { plans: { assignment: Record<ID, ID>; locks: ID[] }[] },
    ids: Set<ID>,
  ) => {
    for (const p of d.plans) {
      for (const sid of Object.keys(p.assignment)) if (ids.has(sid)) delete p.assignment[sid];
      p.locks = p.locks.filter((l) => !ids.has(l));
    }
  };

  return {
    addRoom: (init) => {
      const room = createRoom(init);
      update((d) => void d.layout.rooms.push(room));
      return room.id;
    },
    updateRoom: (roomId, patch) => withRoom(roomId, (r) => Object.assign(r, patch)),
    removeRoom: (roomId) =>
      update((d) => {
        const room = d.layout.rooms.find((r) => r.id === roomId);
        if (!room) return;
        cleanupSeats(d, new Set(room.seats.map((s) => s.id)));
        for (const p of d.plans)
          for (const [mid, key] of Object.entries(p.roomOnly))
            if (key === room.key && !d.layout.rooms.some((r) => r.id !== roomId && r.key === key))
              delete p.roomOnly[mid];
        d.layout.rooms = d.layout.rooms.filter((r) => r.id !== roomId);
      }),
    duplicateRoom: (roomId, name, position) => {
      let newRoomId: ID | null = null;
      update((d) => {
        const src = d.layout.rooms.find((r) => r.id === roomId);
        if (!src) return;
        const copy = createRoom({
          ...clone(src),
          id: undefined,
          key: undefined,
          name,
          position: position ?? { x: src.position.x + src.width + 2, y: src.position.y },
        });
        copy.seats = copy.seats.map((s) => ({ ...s, id: newId("seat_") }));
        copy.entrances = copy.entrances.map((e) => ({ ...e, id: newId("ent_") }));
        newRoomId = copy.id;
        d.layout.rooms.push(copy);
      });
      return newRoomId;
    },
    reorderRooms: (orderedIds) =>
      update((d) => {
        const byId = new Map(d.layout.rooms.map((r) => [r.id, r]));
        const next = orderedIds.map((id) => byId.get(id)).filter((r) => r !== undefined);
        const rest = d.layout.rooms.filter((r) => !orderedIds.includes(r.id));
        d.layout.rooms = [...next, ...rest];
      }),
    moveRoom: (roomId, position) => withRoom(roomId, (r) => void (r.position = position)),
    resizeRoom: (roomId, width, height, offset) =>
      update((d) => {
        const i = d.layout.rooms.findIndex((r) => r.id === roomId);
        if (i < 0) return;
        const before = d.layout.rooms[i] as Room;
        const after = resizeRoomGeom(before, width, height, offset);
        const kept = new Set(after.seats.map((s) => s.id));
        cleanupSeats(d, new Set(before.seats.map((s) => s.id).filter((id) => !kept.has(id))));
        d.layout.rooms[i] = after;
      }),
    paintCells: (roomId, cells, kind) =>
      update((d) => {
        const r = d.layout.rooms.find((x) => x.id === roomId);
        if (!r) return;
        const removed = new Set<ID>();
        for (const { x, y } of cells) {
          if (x < 0 || y < 0 || x >= r.width || y >= r.height) continue;
          r.cells[y * r.width + x] = kind;
          if (kind !== "floor") {
            for (const s of r.seats) if (s.x === x && s.y === y) removed.add(s.id);
          }
          if (kind === "void") r.entrances = r.entrances.filter((e) => !(e.x === x && e.y === y));
        }
        if (removed.size) {
          r.seats = r.seats.filter((s) => !removed.has(s.id));
          cleanupSeats(d, removed);
        }
      }),
    addSeats: (roomId, seats) => {
      const ids: ID[] = [];
      withRoom(roomId, (r) => {
        for (const s of seats) {
          if (r.seats.some((x) => x.x === s.x && x.y === s.y)) continue;
          if (r.cells[s.y * r.width + s.x] !== "floor") continue;
          const seat: Seat = {
            id: s.id ?? newId("seat_"),
            x: s.x,
            y: s.y,
            facing: s.facing ?? "n",
            label: s.label ?? "",
            tags: s.tags ?? [],
          };
          r.seats.push(seat);
          ids.push(seat.id);
        }
      });
      return ids;
    },
    updateSeats: (roomId, seatIds, patch) =>
      withRoom(roomId, (r) => {
        const set = new Set(seatIds);
        for (const s of r.seats) if (set.has(s.id)) Object.assign(s, patch);
      }),
    moveSeats: (roomId, moves) =>
      withRoom(roomId, (r) => {
        const m = new Map(moves.map((x) => [x.id, x]));
        for (const s of r.seats) {
          const to = m.get(s.id);
          if (to) {
            s.x = to.x;
            s.y = to.y;
          }
        }
      }),
    removeSeats: (roomId, seatIds) =>
      update((d) => {
        const r = d.layout.rooms.find((x) => x.id === roomId);
        if (!r) return;
        const set = new Set(seatIds);
        r.seats = r.seats.filter((s) => !set.has(s.id));
        cleanupSeats(d, set);
      }),
    addEntrance: (roomId, e) => {
      const id = newId("ent_");
      withRoom(roomId, (r) => {
        if (r.entrances.some((x) => x.x === e.x && x.y === e.y && x.side === e.side)) return;
        r.entrances.push({ id, ...e });
      });
      return id;
    },
    removeEntrances: (roomId, ids) =>
      withRoom(roomId, (r) => {
        const set = new Set(ids);
        r.entrances = r.entrances.filter((e) => !set.has(e.id));
      }),
  };
}
