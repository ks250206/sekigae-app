import { describe, expect, it } from "vite-plus/test";
import { createRoom } from "../factory";
import type { Room, Seat } from "../schema";
import { computeAdjacency } from "./adjacency";
import { computeRoomDepth } from "./depth";
import { resizeRoom } from "./room";

const seat = (id: string, x: number, y: number): Seat => ({
  id,
  x,
  y,
  facing: "n",
  label: id,
  tags: [],
});

describe("depth", () => {
  it("increases with distance from the entrance", () => {
    const room: Room = createRoom({
      name: "A",
      width: 5,
      height: 5,
      seats: [seat("near", 1, 3), seat("far", 3, 0)],
      entrances: [{ id: "e", x: 0, y: 4, side: "s" }],
    });
    const d = computeRoomDepth(room);
    expect(d.seats.get("near")!.dist).toBeLessThan(d.seats.get("far")!.dist);
    expect(d.seats.get("far")!.norm).toBe(1);
    expect(d.seats.get("near")!.norm).toBe(0);
    expect(d.hasEntrance).toBe(true);
  });

  it("handles L-shaped rooms via void cells", () => {
    const room = createRoom({ name: "L", width: 4, height: 4 });
    // 右上 2x2 を void にする
    for (const [x, y] of [
      [2, 0],
      [3, 0],
      [2, 1],
      [3, 1],
    ] as const)
      room.cells[y * 4 + x] = "void";
    room.entrances = [{ id: "e", x: 3, y: 3, side: "s" }];
    room.seats = [seat("a", 0, 0), seat("b", 3, 2)];
    const d = computeRoomDepth(room);
    expect(d.seats.get("a")!.dist).toBeGreaterThan(d.seats.get("b")!.dist);
  });

  it("estimates unreachable seats and rooms without entrances", () => {
    const room = createRoom({ name: "N", width: 3, height: 3, seats: [seat("a", 1, 1)] });
    const d = computeRoomDepth(room);
    expect(d.hasEntrance).toBe(false);
    expect(d.seats.get("a")!.estimated).toBe(true);
  });
});

describe("adjacency", () => {
  it("supports 4 and 8 neighbourhoods", () => {
    const room = createRoom({
      name: "A",
      width: 3,
      height: 3,
      seats: [seat("a", 0, 0), seat("b", 1, 0), seat("c", 1, 1)],
    });
    const a4 = computeAdjacency([room], 4);
    expect([...a4.get("a")!]).toEqual(["b"]);
    const a8 = computeAdjacency([room], 8);
    expect([...a8.get("a")!].sort()).toEqual(["b", "c"]);
  });
});

describe("resizeRoom", () => {
  it("shifts contents when growing to the left/top and drops out-of-bounds", () => {
    const room = createRoom({ name: "A", width: 3, height: 3, seats: [seat("a", 2, 2)] });
    const grown = resizeRoom(room, 4, 4, { dx: 1, dy: 1 });
    expect(grown.seats[0]).toMatchObject({ x: 3, y: 3 });
    expect(grown.position).toEqual({ x: -1, y: -1 });
    const shrunk = resizeRoom(room, 2, 2);
    expect(shrunk.seats).toHaveLength(0);
    expect(shrunk.cells).toHaveLength(4);
  });
});
